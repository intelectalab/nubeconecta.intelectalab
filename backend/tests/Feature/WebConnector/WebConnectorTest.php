<?php

declare(strict_types=1);

namespace Tests\Feature\WebConnector;

use App\Models\User;
use App\Shared\Http\OutboundUrlGuard;
use App\Modules\WebConnector\Events\WebFormSubmitted;
use App\Modules\WebConnector\Events\WpCacheInvalidationFailed;
use App\Modules\WebConnector\Jobs\SendWpCacheInvalidations;
use App\Modules\WebConnector\Models\WpCacheInvalidation;
use App\Modules\WebConnector\Services\WebhookSigner;
use App\Shared\Contracts\AccessControl;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\Feature\Identity\IdentityTestCase;

final class WebConnectorTest extends IdentityTestCase
{
    protected string $seeder = DatabaseSeeder::class;

    private const HOOK = 'https://www.marca-a.test/wp-json/hub-connector/v1/invalidate';

    private User $admin;

    private int $hookStatus = 200;

    private string $entity;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = $this->makeUser(['admin'], mfa: true);
        // MFA reciente simulado: web_connector.site_token.create es sensible y la rotación del secreto la exige.
        $this->app->extend(AccessControl::class, fn (AccessControl $inner) => new class($inner) implements AccessControl
        {
            public function __construct(private readonly AccessControl $inner) {}

            public function allows(Authenticatable $user, string $permission): bool
            {
                return $this->inner->allows($user, $permission);
            }

            public function mustEnrollMfa(Authenticatable $user): bool
            {
                return $this->inner->mustEnrollMfa($user);
            }

            public function mustChangePassword(Authenticatable $user): bool
            {
                return $this->inner->mustChangePassword($user);
            }

            public function isSensitive(string $permission): bool
            {
                return $this->inner->isSensitive($permission);
            }

            public function hasRecentMfa(Authenticatable $user, Request $request): bool
            {
                return true;
            }
        });
        // Respuesta simulada del plugin, configurable en cada paso.
        Http::fake(fn () => Http::response($this->hookStatus < 300 ? ['ok' => true] : 'error del plugin', $this->hookStatus));
        // Los hosts *.test no existen: se resuelven a una IP pública ficticia (guarda SSRF activa).
        $this->resolveHostsTo(['93.184.216.34']);
        $this->actingAs($this->admin);
        $this->entity = $this->postJson('/api/v1/admin/legal-entities', ['legal_name' => 'Entidad de Prueba SAC', 'tax_id' => '20000000001'])->assertCreated()->json('data.id');
    }

    private function brand(string $code): string
    {
        return $this->postJson('/api/v1/admin/brands', ['code' => $code, 'name' => strtoupper($code), 'portal_domain' => "portal.{$code}.test", 'default_legal_entity_id' => $this->entity])->assertCreated()->json('data.id');
    }

    /** @return array{site: string, secret: string, token: string} */
    private function activeSite(string $brandId, string $host = 'www.marca-a.test'): array
    {
        $site = $this->postJson('/api/v1/admin/web-connector/sites', ['brand_id' => $brandId, 'name' => 'Web', 'base_url' => "https://{$host}/", 'webhook_url' => "https://{$host}/wp-json/hub-connector/v1/invalidate"])->assertCreated()->json('data.id');
        $secret = $this->postJson("/api/v1/admin/web-connector/sites/{$site}/webhook-secret")->assertCreated()->json('data.webhook_secret');
        $token = $this->postJson("/api/v1/admin/web-connector/sites/{$site}/tokens", ['name' => 'Plugin'])->assertCreated()->json('data.token');
        $this->hookStatus = 200;
        $this->postJson("/api/v1/admin/web-connector/sites/{$site}/test-webhook")->assertOk()->assertJsonPath('data.status', 'delivered');
        $this->postJson("/api/v1/admin/web-connector/sites/{$site}/activate", ['version' => DB::table('wp_sites')->where('id', $site)->value('version')])->assertOk()->assertJsonPath('data.status', 'active');

        return ['site' => $site, 'secret' => $secret, 'token' => $token];
    }

    /** @param array<string, string> $headers */
    private function plugin(string $uri, ?string $token, array $headers = []): \Illuminate\Testing\TestResponse
    {
        $this->app['auth']->forgetGuards();
        // Las solicitudes del plugin representan tráfico servidor a servidor, sin Origin.
        $this->flushHeaders();

        return $this->getJson($uri, array_filter($headers + ['Authorization' => $token ? "Bearer {$token}" : null, 'X-Hub-Plugin-Version' => '1.2.0'], fn ($v) => $v !== null && $v !== ''));
    }

    public function test_site_admin_secret_rotation_tokens_permissions_and_activation(): void
    {
        $brand = $this->brand('marca-a');
        $site = $this->postJson('/api/v1/admin/web-connector/sites', ['brand_id' => $brand, 'name' => 'Web A', 'base_url' => 'https://www.marca-a.test/', 'allowed_origins' => ['https://www.marca-a.test']])
            ->assertCreated()->assertJsonPath('data.status', 'pending')->assertJsonPath('data.base_url', 'https://www.marca-a.test')
            ->assertJsonPath('data.allowed_origins', ['https://www.marca-a.test'])->assertJsonPath('data.has_webhook_secret', false)->json('data.id');
        $this->assertProblem($this->postJson('/api/v1/admin/web-connector/sites', ['brand_id' => $brand, 'name' => 'Sin TLS', 'base_url' => 'http://x.test']), 422, 'validation_failed');

        // Secreto: visible una vez, cifrado en la bóveda, nunca en el detalle.
        $first = $this->postJson("/api/v1/admin/web-connector/sites/{$site}/webhook-secret")->assertCreated()->assertHeader('Cache-Control', 'no-store, private')->json('data.webhook_secret');
        $this->assertMatchesRegularExpression('/^[a-f0-9]{64}$/', $first);
        $detail = $this->getJson("/api/v1/admin/web-connector/sites/{$site}")->assertOk()->assertJsonPath('data.has_webhook_secret', true);
        $this->assertStringNotContainsString($first, $detail->getContent());
        $this->assertArrayNotHasKey('webhook_secret_id', $detail->json('data'));
        $stored = DB::table('secrets')->where('owner_type', 'wp_site')->where('owner_id', $site)->selectRaw("encode(ciphertext, 'escape') as c")->value('c');
        $this->assertStringNotContainsString($first, (string) $stored);

        $rotated = $this->postJson("/api/v1/admin/web-connector/sites/{$site}/webhook-secret")->assertCreated();
        $this->assertNotSame($first, $rotated->json('data.webhook_secret'));
        $this->assertNotNull($rotated->json('data.previous_secret_valid_until'));
        $this->assertSame(1, DB::table('secrets')->where('owner_id', $site)->whereNotNull('expires_at')->count());

        // Tokens: valor plano solo al crear; sales no los ve ni los crea (RN-WCN-016).
        $token = $this->postJson("/api/v1/admin/web-connector/sites/{$site}/tokens", ['name' => 'Plugin'])->assertCreated()->json('data');
        $this->assertStringStartsWith('hubwp_', $token['token']);
        $this->assertSame(substr($token['token'], -4), $token['token_last_four']);
        $list = $this->getJson("/api/v1/admin/web-connector/sites/{$site}/tokens")->assertOk()->assertJsonCount(1, 'data');
        $this->assertStringNotContainsString($token['token'], $list->getContent());
        $this->assertArrayNotHasKey('token_hash', $list->json('data.0'));

        $sales = $this->makeUser(['sales'], mfa: true);
        $this->actingAs($sales);
        $this->getJson("/api/v1/admin/web-connector/sites/{$site}")->assertOk();
        $this->assertProblem($this->getJson("/api/v1/admin/web-connector/sites/{$site}/tokens"), 403, 'forbidden');
        $this->assertProblem($this->postJson("/api/v1/admin/web-connector/sites/{$site}/tokens", ['name' => 'X']), 403, 'forbidden');
        $this->assertProblem($this->postJson('/api/v1/admin/web-connector/sites', ['brand_id' => $brand, 'name' => 'X', 'base_url' => 'https://x.test']), 403, 'forbidden');
        $this->assertProblem($this->deleteJson("/api/v1/admin/web-connector/sites/{$site}"), 403, 'forbidden');
        $this->actingAs($this->admin);

        // Activar exige ruta, prueba entregada con el secreto vigente y token vigente.
        $this->assertProblem($this->postJson("/api/v1/admin/web-connector/sites/{$site}/activate", ['version' => DB::table('wp_sites')->where('id', $site)->value('version')]), 422, 'validation_failed');
        $this->assertProblem($this->postJson("/api/v1/admin/web-connector/sites/{$site}/test-webhook"), 422, 'validation_failed');
        $version = DB::table('wp_sites')->where('id', $site)->value('version');
        $this->patchJson("/api/v1/admin/web-connector/sites/{$site}", ['version' => $version, 'webhook_url' => self::HOOK])->assertOk();

        $this->hookStatus = 401;
        $this->postJson("/api/v1/admin/web-connector/sites/{$site}/test-webhook")->assertOk()->assertJsonPath('data.status', 'failed')->assertJsonPath('data.response_status', 401);
        $this->assertProblem($this->postJson("/api/v1/admin/web-connector/sites/{$site}/activate", ['version' => $version + 1]), 422, 'validation_failed');

        $this->hookStatus = 200;
        $this->postJson("/api/v1/admin/web-connector/sites/{$site}/test-webhook")->assertOk()->assertJsonPath('data.status', 'delivered')->assertJsonPath('data.scope', 'all');
        $this->assertProblem($this->postJson("/api/v1/admin/web-connector/sites/{$site}/activate", ['version' => 1]), 409, 'version_conflict');
        $this->postJson("/api/v1/admin/web-connector/sites/{$site}/activate", ['version' => $version + 1])->assertOk()->assertJsonPath('data.status', 'active');
        $this->assertProblem($this->postJson("/api/v1/admin/web-connector/sites/{$site}/disable", ['version' => $version + 2]), 422, 'validation_failed');
        $this->postJson("/api/v1/admin/web-connector/sites/{$site}/disable", ['version' => $version + 2, 'reason' => 'Mantenimiento'])->assertOk()->assertJsonPath('data.status', 'disabled');

        // Baja: revoca tokens.
        $this->deleteJson("/api/v1/admin/web-connector/sites/{$site}")->assertNoContent();
        $this->assertNotNull(DB::table('wp_site_tokens')->where('id', $token['id'])->value('revoked_at'));

        $actions = DB::table('audit_events')->where('entity_type', 'like', 'wp_site%')->pluck('action')->all();
        foreach (['wp_site.created', 'wp_site.updated', 'wp_site.webhook_secret_rotated', 'wp_site_token.created', 'wp_site.webhook_tested', 'wp_site.activated', 'wp_site.disabled', 'wp_site.deleted', 'wp_site_token.revoked'] as $action) {
            $this->assertContains($action, $actions);
        }
        $audit = DB::table('audit_events')->where('action', 'wp_site.webhook_secret_rotated')->get(['before', 'after', 'metadata'])->toJson();
        $this->assertStringNotContainsString($first, $audit);
        $this->assertStringNotContainsString($token['token'], DB::table('audit_events')->get(['after', 'metadata'])->toJson());
        $this->assertNull($this->app->make(\App\Shared\Audit\AuditLogger::class)->verify());
    }

    public function test_outgoing_webhook_signature_is_compatible_with_the_plugin(): void
    {
        $brand = $this->brand('marca-a');
        ['site' => $site, 'secret' => $secret] = $this->activeSite($brand);

        $this->hookStatus = 200;
        $this->postJson('/api/v1/admin/web-connector/cache-invalidations', ['wp_site_id' => $site, 'scope' => 'plan', 'keys' => ['hosting-basico']])->assertStatus(202);

        Http::assertSent(function (HttpRequest $request) use ($secret): bool {
            $header = $request->header('X-Hub-Signature')[0] ?? '';
            $body = json_decode($request->body(), true);
            if ($request->url() !== self::HOOK || ($body['scope'] ?? null) !== 'plan') {
                return false;
            }
            $signer = new WebhookSigner;
            preg_match('/^t=(\d+),v1=([a-f0-9]{64})$/', $header, $m);
            // Mismo cálculo que plugins/hub-connector: HMAC-SHA256 de "t.raw".
            $this->assertSame(hash_hmac('sha256', $m[1].'.'.$request->body(), $secret), $m[2]);
            $this->assertTrue($signer->verify($header, $request->body(), $secret));
            $this->assertFalse($signer->verify($header, $request->body(), str_repeat('0', 64)), 'secreto incorrecto');
            $this->assertFalse($signer->verify($header, $request->body().' ', $secret), 'cuerpo alterado');
            $this->assertFalse($signer->verify($signer->sign($request->body(), $secret, time() - 301), $request->body(), $secret), 'marca de tiempo vencida');
            $this->assertSame(['event_id', 'scope', 'keys', 'brand', 'sent_at'], array_keys($body));
            $this->assertSame('marca-a', $body['brand']);
            $this->assertSame(['hosting-basico'], $body['keys']);
            $this->assertTrue(Str::isUuid($body['event_id']));
            $this->assertSame($body['event_id'], $request->header('X-Hub-Event-Id')[0] ?? null);

            return true;
        });
        $this->assertSame('delivered', DB::table('wp_cache_invalidations')->where('wp_site_id', $site)->where('scope', 'plan')->value('status'));
        $this->assertNotNull(DB::table('wp_sites')->where('id', $site)->value('last_invalidation_at'));
    }

    public function test_brand_change_queues_invalidation_with_retries_and_manual_retry(): void
    {
        $brand = $this->brand('marca-a');
        $other = $this->brand('marca-b');
        ['site' => $site] = $this->activeSite($brand);
        $this->activeSite($other, 'www.marca-b.test');
        $this->setSetting('web_connector.webhook.max_attempts', 2);
        Event::fake([WpCacheInvalidationFailed::class]);

        $this->hookStatus = 500;
        $version = DB::table('brands')->where('id', $brand)->value('version');
        $this->patchJson("/api/v1/admin/brands/{$brand}", ['version' => $version, 'support_email' => 'soporte@marca-a.test'])->assertOk();

        $rows = WpCacheInvalidation::query()->where('trigger_event', 'BrandUpdated')->get();
        $this->assertCount(1, $rows, 'solo los sitios activos de la marca cambiada');
        $row = $rows->first();
        $this->assertSame($site, $row->wp_site_id);
        $this->assertSame(['pending', 1, 500], [$row->status, $row->attempts, $row->response_status]);
        $this->assertNotNull($row->next_retry_at);

        // Segundo intento (el worker lo libera con espera creciente): agota el máximo y alerta.
        (new SendWpCacheInvalidations($row->id))->handle($this->app->make(\App\Modules\WebConnector\Services\CacheInvalidator::class));
        $row->refresh();
        $this->assertSame(['failed', 2], [$row->status, $row->attempts]);
        $this->assertStringContainsString('HTTP 500', (string) $row->last_error);
        Event::assertDispatched(WpCacheInvalidationFailed::class);

        // Reintento manual: mismo event_id (el plugin descarta repetidos).
        $this->hookStatus = 200;
        $this->postJson("/api/v1/admin/web-connector/cache-invalidations/{$row->id}/retry")->assertStatus(202);
        $this->assertSame('delivered', $row->refresh()->status);
        Http::assertSent(fn (HttpRequest $r) => (json_decode($r->body(), true)['event_id'] ?? null) === $row->event_id);
        $this->assertProblem($this->postJson("/api/v1/admin/web-connector/cache-invalidations/{$row->id}/retry"), 409, 'conflict');
        $this->getJson('/api/v1/admin/web-connector/cache-invalidations?filter[wp_site_id]='.$site)->assertOk();
    }

    public function test_plugin_api_token_version_brand_isolation_cache_and_throttle(): void
    {
        $brandA = $this->brand('marca-a');
        $brandB = $this->brand('marca-b');
        ['site' => $site, 'token' => $token] = $this->activeSite($brandA);
        $planA = $this->catalogPlan($brandA, 'hosting-a', 1990);
        $planB = $this->catalogPlan($brandB, 'hosting-b', 2990);
        DB::table('brand_contact_points')->insert([
            ['id' => Str::uuid(), 'organization_id' => DB::table('organizations')->value('id'), 'brand_id' => $brandA, 'kind' => 'phone', 'value' => '+51999999999', 'is_primary' => true, 'is_public' => true],
            ['id' => Str::uuid(), 'organization_id' => DB::table('organizations')->value('id'), 'brand_id' => $brandA, 'kind' => 'email', 'value' => 'interno@marca-a.test', 'is_primary' => false, 'is_public' => false],
            ['id' => Str::uuid(), 'organization_id' => DB::table('organizations')->value('id'), 'brand_id' => $brandB, 'kind' => 'phone', 'value' => '+51888888888', 'is_primary' => true, 'is_public' => true],
        ]);

        $this->assertProblem($this->plugin('/api/v1/public/wp/site', null), 401, 'unauthenticated');
        $this->assertProblem($this->plugin('/api/v1/public/wp/site', 'hubwp_'.str_repeat('x', 48)), 401, 'unauthenticated');
        $this->assertProblem($this->plugin('/api/v1/public/wp/site', $token, ['X-Hub-Plugin-Version' => '0.9.0']), 426, 'plugin_upgrade_required');

        $siteResponse = $this->plugin('/api/v1/public/wp/site', $token)->assertOk()
            ->assertJsonPath('data.brand.code', 'marca-a')->assertJsonPath('data.cache_ttl_seconds', 600)->assertHeader('ETag');
        $this->assertStringContainsString('max-age=600', (string) $siteResponse->headers->get('Cache-Control'));
        $this->assertSame(304, $this->plugin('/api/v1/public/wp/site', $token, ['If-None-Match' => $siteResponse->headers->get('ETag')])->status());
        $this->assertSame('1.2.0', DB::table('wp_sites')->where('id', $site)->value('plugin_version'));
        $this->assertNotNull(DB::table('wp_site_tokens')->whereNull('revoked_at')->where('wp_site_id', $site)->value('last_used_at'));

        $plans = $this->plugin('/api/v1/public/wp/catalog/plans?type=hosting&currency=PEN', $token)->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $planA)->assertJsonPath('data.0.price.amount_minor', 1990)->assertJsonPath('data.0.name', 'Hosting A');
        foreach (['cost', 'cost_minor', 'cost_currency', 'provider', 'whm_package'] as $forbidden) {
            $this->assertStringNotContainsString($forbidden, $plans->getContent());
        }
        $this->plugin('/api/v1/public/wp/catalog/plans?currency=USD', $token)->assertOk()->assertJsonCount(0, 'data');
        $this->plugin("/api/v1/public/wp/catalog/plans/{$planA}", $token)->assertOk()->assertJsonPath('data.code', 'hosting-a');
        $this->assertProblem($this->plugin("/api/v1/public/wp/catalog/plans/{$planB}", $token), 404, 'not_found');
        $this->plugin('/api/v1/public/wp/catalog/categories', $token)->assertOk()->assertJsonPath('data.0.shortcode_type', 'hosting');
        $this->plugin('/api/v1/public/wp/contact', $token)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.value', '+51999999999');

        // Límite por token.
        config(['hub.web_connector.requests_per_minute' => 1]);
        $this->assertProblem($this->plugin('/api/v1/public/wp/contact', $token), 429, 'rate_limited');
        config(['hub.web_connector.requests_per_minute' => 120]);

        // Vencido y revocado → 401 sin reactivación.
        $tokenId = DB::table('wp_site_tokens')->where('token_hash', hash('sha256', $token))->value('id');
        DB::table('wp_site_tokens')->where('id', $tokenId)->update(['created_at' => now()->subDays(3), 'expires_at' => now()->subDay()]);
        $this->assertProblem($this->plugin('/api/v1/public/wp/site', $token), 401, 'unauthenticated');
        DB::table('wp_site_tokens')->where('id', $tokenId)->update(['expires_at' => now()->addDay()]);
        $this->actingAs($this->admin);
        $this->deleteJson("/api/v1/admin/web-connector/sites/{$site}/tokens/{$tokenId}", ['reason' => 'Filtrado'])->assertNoContent();
        $this->assertProblem($this->plugin('/api/v1/public/wp/site', $token), 401, 'unauthenticated');
    }

    private function catalogPlan(string $brandId, string $code, int $priceMinor): string
    {
        $org = DB::table('organizations')->value('id');
        $category = DB::table('product_categories')->where('shortcode_type', 'hosting')->value('id');
        if ($category === null) {
            $category = (string) Str::uuid();
            DB::table('product_categories')->insert(['id' => $category, 'organization_id' => $org, 'code' => 'hosting', 'name' => 'Hosting', 'kind' => 'shared_hosting', 'shortcode_type' => 'hosting']);
        }
        $product = (string) Str::uuid();
        DB::table('products')->insert(['id' => $product, 'organization_id' => $org, 'code' => "prod-{$code}", 'category_id' => $category, 'brand_id' => $brandId, 'name' => $code, 'billing_type' => 'recurring', 'sellable_online' => true]);
        $plan = (string) Str::uuid();
        DB::table('plans')->insert(['id' => $plan, 'organization_id' => $org, 'product_id' => $product, 'code' => $code, 'name' => $code, 'cycle' => 'annual', 'cost_minor' => 500, 'cost_currency' => 'PEN']);
        DB::table('plan_prices')->insert(['id' => Str::uuid(), 'organization_id' => $org, 'plan_id' => $plan, 'currency' => 'PEN', 'price_minor' => $priceMinor, 'effective_from' => now()->subDay()->toDateString()]);
        DB::table('product_listings')->insert(['id' => Str::uuid(), 'organization_id' => $org, 'product_id' => $product, 'brand_id' => $brandId, 'display_name' => json_encode(['es' => ucwords(str_replace('-', ' ', $code))]), 'sellable_online' => true]);

        return $plan;
    }

    /** @param list<string> $ips */
    private function resolveHostsTo(array $ips): void
    {
        $this->app->instance(OutboundUrlGuard::class, new OutboundUrlGuard(fn (string $host): array => $ips));
    }

    public function test_webhook_url_rejects_private_targets_on_save_and_on_send(): void
    {
        $brand = $this->brand('marca-a');
        $site = fn (string $url) => $this->postJson('/api/v1/admin/web-connector/sites', ['brand_id' => $brand, 'name' => 'Web', 'base_url' => 'https://www.marca-a.test', 'webhook_url' => $url]);

        foreach (['https://127.0.0.1/hook', 'https://169.254.169.254/latest/meta-data', 'https://10.0.0.5/hook', 'https://192.168.1.10/hook', 'https://0.0.0.0/hook', 'https://100.64.0.1/hook'] as $url) {
            $response = $site($url);
            $this->assertProblem($response, 422, 'validation_failed');
            $this->assertArrayHasKey('webhook_url', $response->json('errors'), $url);
        }
        foreach (['::1', 'fe80::1', 'fd00:ec2::254', '::ffff:127.0.0.1', '::ffff:10.1.2.3', '::ffff:7f00:1', '64:ff9b::7f00:1', '64:ff9b::a9fe:a9fe', '64:ff9b:1::c0a8:101'] as $ip) {
            $this->assertFalse(OutboundUrlGuard::isPublicIp($ip), $ip);
        }
        $this->assertTrue(OutboundUrlGuard::isPublicIp('93.184.216.34'));

        // Nombre que resuelve a una red privada (o no resuelve): rechazado al guardar.
        $this->resolveHostsTo(['10.20.30.40']);
        $this->assertProblem($site('https://interno.marca-a.test/hook'), 422, 'validation_failed');
        $this->resolveHostsTo([]);
        $this->assertProblem($site('https://nxdomain.marca-a.test/hook'), 422, 'validation_failed');

        // Guardado con DNS público; luego el DNS cambia a loopback (rebinding): el envío se bloquea.
        $this->resolveHostsTo(['93.184.216.34']);
        ['site' => $id] = $this->activeSite($brand);
        $this->resolveHostsTo(['127.0.0.1']);
        Http::fake(fn () => Http::response(['ok' => true], 200));
        $invalidation = $this->postJson("/api/v1/admin/web-connector/sites/{$id}/test-webhook")->assertOk()->assertJsonPath('data.status', 'failed');
        $this->assertStringContainsString('privada', (string) DB::table('wp_cache_invalidations')->where('id', $invalidation->json('data.id'))->value('last_error'));
        Http::assertNothingSent();

        // El flag de desarrollo solo vale en local/testing.
        config(['hub.outbound.allow_private_targets' => true]);
        $this->assertNull((new OutboundUrlGuard(fn () => ['127.0.0.1']))->error('https://localhost/hook'));
        $this->app['env'] = 'production';
        $this->assertNotNull((new OutboundUrlGuard(fn () => ['127.0.0.1']))->error('https://localhost/hook'));
        $this->app['env'] = 'testing';
    }

    public function test_catalog_plan_and_price_changes_invalidate_brand_sites(): void
    {
        $brand = $this->brand('marca-a');
        $other = $this->brand('marca-b');
        ['site' => $site] = $this->activeSite($brand);
        ['site' => $otherSite] = $this->activeSite($other, 'www.marca-b.test');
        $category = $this->postJson('/api/v1/admin/product-categories', ['code' => 'hosting', 'name' => 'Hosting', 'kind' => 'shared_hosting'])->assertCreated()->json('data.id');
        $product = $this->postJson('/api/v1/admin/products', ['code' => 'HOST', 'category_id' => $category, 'brand_id' => $brand, 'name' => 'Hosting', 'billing_type' => 'recurring'])->assertCreated()->json('data.id');
        $plan = $this->postJson('/api/v1/admin/plans', ['product_id' => $product, 'code' => 'hosting-basico', 'name' => 'Básico', 'cycle' => 'monthly'])->assertCreated()->json('data');
        $this->postJson('/api/v1/admin/plan-prices', ['plan_id' => $plan['id'], 'currency' => 'PEN', 'price_minor' => 1990])->assertCreated();
        $this->patchJson("/api/v1/admin/plans/{$plan['id']}", ['version' => DB::table('plans')->where('id', $plan['id'])->value('version'), 'name' => 'Básico plus'])->assertOk();

        $rows = DB::table('wp_cache_invalidations')->where('wp_site_id', $site)->where('scope', 'plan')->get();
        $this->assertSame(['PlanChanged', 'PlanChanged', 'PlanPriceChanged'], $rows->pluck('trigger_event')->sort()->values()->all());
        $this->assertSame(['{hosting-basico}'], $rows->pluck('keys')->unique()->values()->all());
        $this->assertSame(['delivered'], $rows->pluck('status')->unique()->values()->all());
        // Solo la marca del producto: la otra web no recibe aviso.
        $this->assertFalse(DB::table('wp_cache_invalidations')->where('wp_site_id', $otherSite)->where('scope', 'plan')->exists());

        // Producto sin marca (se vende en todas): avisa a las webs de cada marca.
        $shared = $this->postJson('/api/v1/admin/products', ['code' => 'DOM', 'category_id' => $category, 'name' => 'Dominio', 'billing_type' => 'recurring'])->assertCreated()->json('data.id');
        $this->postJson('/api/v1/admin/plans', ['product_id' => $shared, 'code' => 'dominio-pe', 'name' => '.pe', 'cycle' => 'annual'])->assertCreated();
        $this->assertTrue(DB::table('wp_cache_invalidations')->where('wp_site_id', $otherSite)->where('scope', 'plan')->where('trigger_event', 'PlanChanged')->exists());
    }

    /**
     * @param  array<string, mixed>  $body
     * @param  array<string, string>  $headers
     */
    private function pluginPost(string $uri, ?string $token, array $body, array $headers = []): \Illuminate\Testing\TestResponse
    {
        $this->app['auth']->forgetGuards();
        // El plugin reenvía el envío servidor a servidor, sin Origin (igual que plugin()).
        $this->flushHeaders();

        return $this->postJson($uri, $body, array_filter($headers + ['Authorization' => $token ? "Bearer {$token}" : null, 'X-Hub-Plugin-Version' => '1.3.0'], fn ($v) => $v !== null && $v !== ''));
    }

    public function test_plugin_api_compare_domain_prices_and_legal_documents_by_brand(): void
    {
        $brandA = $this->brand('marca-a');
        $brandB = $this->brand('marca-b');
        ['token' => $token] = $this->activeSite($brandA);
        $org = DB::table('organizations')->value('id');
        $basic = $this->catalogPlan($brandA, 'hosting-basico', 1990);
        $pro = $this->catalogPlan($brandA, 'hosting-pro', 3990);
        $this->catalogPlan($brandB, 'plan-marca-b', 2990);
        DB::table('plans')->where('id', $basic)->update(['limits' => json_encode(['disk_gb' => 10, 'websites' => 1])]);
        DB::table('plans')->where('id', $pro)->update(['limits' => json_encode(['disk_gb' => 50, 'ssl' => true])]);

        // Comparador: solo planes de la marca del token y características en orden de aparición.
        $compare = $this->plugin('/api/v1/public/wp/catalog/compare?type=hosting&currency=PEN', $token)->assertOk()->assertHeader('ETag')
            ->assertJsonCount(2, 'data.plans')->assertJsonPath('data.features', ['disk_gb', 'websites', 'ssl']);
        $this->assertStringNotContainsString('plan-marca-b', $compare->getContent());
        $this->assertStringNotContainsString('cost_minor', $compare->getContent());
        $this->plugin('/api/v1/public/wp/catalog/compare?type=hosting&features=disk_gb', $token)->assertOk()->assertJsonPath('data.features', ['disk_gb']);
        $this->assertProblem($this->plugin('/api/v1/public/wp/catalog/compare', $token), 422, 'validation_failed');
        $this->assertProblem($this->plugin('/api/v1/public/wp/catalog/compare?type=hosting&features=a;b', $token), 422, 'validation_failed');

        // Precios de dominios: vendibles en línea, registrador por defecto, nunca costos.
        $registrar = (string) Str::uuid();
        $other = (string) Str::uuid();
        DB::table('providers')->insert([['id' => $registrar, 'organization_id' => $org, 'code' => 'reg', 'name' => 'Registrador X', 'type' => 'registrar'], ['id' => $other, 'organization_id' => $org, 'code' => 'reg2', 'name' => 'Otro', 'type' => 'registrar']]);
        foreach ([['com.pe', true, true], ['com', true, false], ['cl', false, true]] as $i => [$tld, $online, $transfer]) {
            DB::table('domain_extensions')->insert(['id' => Str::uuid(), 'organization_id' => $org, 'tld' => $tld, 'default_registrar_id' => $registrar, 'sellable_online' => $online, 'allows_transfer_in' => $transfer, 'sort_order' => $i]);
            foreach (['register' => 11900, 'renew' => 12900, 'transfer' => 9900] as $op => $price) {
                DB::table('domain_tld_prices')->insert(['id' => Str::uuid(), 'organization_id' => $org, 'tld' => $tld, 'provider_id' => $registrar, 'operation' => $op, 'cost_minor' => 4321, 'cost_currency' => 'USD', 'price_minor' => $price, 'currency' => 'PEN', 'effective_from' => now()->subMonth()->toDateString()]);
            }
        }
        DB::table('domain_tld_prices')->insert(['id' => Str::uuid(), 'organization_id' => $org, 'tld' => 'com.pe', 'provider_id' => $other, 'operation' => 'register', 'cost_minor' => 1, 'cost_currency' => 'USD', 'price_minor' => 1, 'currency' => 'PEN', 'effective_from' => now()->toDateString()]);
        $domains = $this->plugin('/api/v1/public/wp/catalog/domain-prices?currency=PEN', $token)->assertOk()->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.name', '.com.pe')->assertJsonPath('data.0.register_minor', 11900)->assertJsonPath('data.0.renew_minor', 12900)
            ->assertJsonPath('data.0.transfer_minor', 9900)->assertJsonPath('data.1.tld', 'com')->assertJsonPath('data.1.transfer_minor', null);
        foreach (['cost', '4321', 'Registrador', $registrar] as $forbidden) {
            $this->assertStringNotContainsString($forbidden, $domains->getContent());
        }
        $this->plugin('/api/v1/public/wp/catalog/domain-prices?tlds=.com,cl&currency=PEN', $token)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.tld', 'com');
        $this->plugin('/api/v1/public/wp/catalog/domain-prices?currency=USD', $token)->assertOk()->assertJsonCount(0, 'data');
        $this->assertProblem($this->plugin('/api/v1/public/wp/catalog/domain-prices?tlds=<x>', $token), 422, 'validation_failed');

        // Documentos legales: solo la versión publicada de la marca del token.
        $legal = function (string $brand, string $slug, string $kind, string $body, bool $published) use ($org): void {
            $doc = (string) Str::uuid();
            DB::table('legal_documents')->insert(['id' => $doc, 'organization_id' => $org, 'brand_id' => $brand, 'kind' => $kind, 'title' => "Doc {$slug}", 'slug' => $slug]);
            $version = (string) Str::uuid();
            DB::table('legal_document_versions')->insert(['id' => $version, 'organization_id' => $org, 'legal_document_id' => $doc, 'version_number' => 1, 'version_label' => '2026-10', 'body' => $body]
                + ($published ? ['status' => 'published', 'legal_reviewed_by' => 'Asesoría', 'legal_reviewed_at' => now(), 'effective_at' => now(), 'published_at' => now(), 'published_by' => $this->admin->id] : []));
            if ($published) {
                DB::table('legal_documents')->where('id', $doc)->update(['published_version_id' => $version]);
            }
        };
        $legal($brandA, 'politica-de-privacidad', 'privacy', '<p>Privacidad A</p>', true);
        $legal($brandB, 'politica-de-privacidad', 'privacy', '<p>Privacidad B</p>', true);
        $legal($brandA, 'terminos', 'terms', '<p>Borrador</p>', false);
        $doc = $this->plugin('/api/v1/public/wp/legal-documents/politica-de-privacidad', $token)->assertOk()
            ->assertJsonPath('data.body', '<p>Privacidad A</p>')->assertJsonPath('data.version_label', '2026-10')->assertJsonPath('data.kind', 'privacy');
        $this->assertStringNotContainsString('Asesor', $doc->getContent());
        $this->plugin('/api/v1/public/wp/legal-documents/privacy', $token)->assertOk()->assertJsonPath('data.slug', 'politica-de-privacidad');
        $this->assertProblem($this->plugin('/api/v1/public/wp/legal-documents/terminos', $token), 404, 'not_found');
        $this->assertProblem($this->plugin('/api/v1/public/wp/legal-documents/no-existe', $token), 404, 'not_found');
        $this->assertProblem($this->plugin('/api/v1/public/wp/legal-documents/politica-de-privacidad', null), 401, 'unauthenticated');
    }

    public function test_plugin_form_definition_submission_validation_idempotency_spam_and_ip_limit(): void
    {
        Event::fake([WebFormSubmitted::class]);
        $brandA = $this->brand('marca-a');
        $brandB = $this->brand('marca-b');
        ['site' => $site, 'token' => $token] = $this->activeSite($brandA);
        $org = DB::table('organizations')->value('id');
        $form = function (string $brand, string $code) use ($org): string {
            $id = (string) Str::uuid();
            DB::table('web_forms')->insert(['id' => $id, 'organization_id' => $org, 'brand_id' => $brand, 'code' => $code, 'name' => $code, 'status' => 'active', 'destination' => 'email',
                'notify_email' => 'ventas@marca.test', 'consent_required' => true, 'consent_purpose' => 'privacy', 'consent_text' => json_encode(['es' => 'Acepto la política']),
                'captcha_required' => true, 'success_message' => json_encode(['es' => '¡Gracias!'])]);

            return $id;
        };
        $contact = $form($brandA, 'contacto');
        $form($brandB, 'solo-b');

        $this->plugin('/api/v1/public/wp/forms/contacto', $token)->assertOk()->assertJsonPath('data.code', 'contacto')
            ->assertJsonPath('data.consent.required', true)->assertJsonPath('data.consent.text', 'Acepto la política')
            ->assertJsonPath('data.success_message', '¡Gracias!')->assertJsonPath('data.captcha.provider', null);
        $this->assertProblem($this->plugin('/api/v1/public/wp/forms/solo-b', $token), 404, 'not_found');

        $valid = ['name' => 'Ana Pérez', 'email' => 'ana@cliente.pe', 'phone' => '+51 999 888 777', 'company' => 'ACME SAC', 'message' => 'Necesito una cotización de hosting.', 'source' => 'cotizacion', 'consent' => true, 'page_url' => 'https://www.marca-a.test/contacto/', 'utm' => ['source' => 'google']];
        $ip = ['X-Hub-Visitor-Ip' => '203.0.113.10', 'Idempotency-Key' => 'k-0001-abcdef'];
        $first = $this->pluginPost('/api/v1/public/wp/forms/contacto/submissions', $token, $valid, $ip)->assertStatus(202)
            ->assertJsonPath('data.status', 'received')->assertJsonPath('data.message', '¡Gracias!');
        $row = DB::table('web_form_submissions')->where('id', $first->json('data.id'))->first();
        $this->assertSame('received', $row->status);
        $this->assertSame($contact, $row->web_form_id);
        $this->assertSame($site, $row->wp_site_id);
        $this->assertTrue((bool) $row->consent_given);
        $this->assertSame('Acepto la política', $row->consent_text);
        $this->assertNull($row->captcha_verified_at);
        $this->assertSame(hash_hmac('sha256', '203.0.113.10', (string) config('app.key')), $row->ip_hash);
        $this->assertSame('ACME SAC', json_decode((string) $row->payload, true)['company']);
        Event::assertDispatched(WebFormSubmitted::class, fn (WebFormSubmitted $e) => $e->id === $row->id && $e->brandId === $brandA);

        // Doble clic: misma clave → mismo envío.
        $this->pluginPost('/api/v1/public/wp/forms/contacto/submissions', $token, $valid, $ip)->assertStatus(202)->assertJsonPath('data.id', $row->id);
        $this->assertSame(1, DB::table('web_form_submissions')->count());

        // Validación: consentimiento, correo, mensaje corto y origen.
        $this->assertProblem($this->pluginPost('/api/v1/public/wp/forms/contacto/submissions', $token, ['consent' => false] + $valid, $ip), 422, 'validation_failed');
        $bad = $this->pluginPost('/api/v1/public/wp/forms/contacto/submissions', $token, ['email' => 'no-es-correo', 'message' => 'corto', 'source' => 'A B'] + $valid, $ip);
        $this->assertProblem($bad, 422, 'validation_failed');
        $this->assertEqualsCanonicalizing(['email', 'message', 'source'], array_keys((array) $bad->json('errors')));

        // Campo trampa: misma respuesta, guardado como spam y sin evento.
        $spam = $this->pluginPost('/api/v1/public/wp/forms/contacto/submissions', $token, ['website' => 'http://spam.test'] + $valid, ['X-Hub-Visitor-Ip' => '203.0.113.10'])->assertStatus(202)->assertJsonPath('data.status', 'received');
        $this->assertSame('spam', DB::table('web_form_submissions')->where('id', $spam->json('data.id'))->value('status'));
        Event::assertDispatchedTimes(WebFormSubmitted::class, 1);

        // Aislamiento por marca y token.
        $this->assertProblem($this->pluginPost('/api/v1/public/wp/forms/solo-b/submissions', $token, $valid), 404, 'not_found');
        $this->assertProblem($this->pluginPost('/api/v1/public/wp/forms/contacto/submissions', null, $valid), 401, 'unauthenticated');
        $this->assertProblem($this->pluginPost('/api/v1/public/wp/forms/contacto/submissions', 'hubwp_'.str_repeat('y', 48), $valid), 401, 'unauthenticated');

        // Límite por IP del visitante (web_connector.forms.submissions_per_ip_per_hour = 10).
        for ($i = 0; $i < 10; $i++) {
            $this->pluginPost('/api/v1/public/wp/forms/contacto/submissions', $token, ['email' => 'x'] + $valid, ['X-Hub-Visitor-Ip' => '198.51.100.7'])->assertStatus(422);
        }
        $limited = $this->pluginPost('/api/v1/public/wp/forms/contacto/submissions', $token, $valid, ['X-Hub-Visitor-Ip' => '198.51.100.7']);
        $this->assertProblem($limited, 429, 'rate_limited');
        $this->assertNotNull($limited->headers->get('Retry-After'));
        $this->pluginPost('/api/v1/public/wp/forms/contacto/submissions', $token, $valid, ['X-Hub-Visitor-Ip' => '198.51.100.8'])->assertStatus(202);
    }

    public function test_admin_inbox_lists_filters_shows_and_changes_status_of_web_submissions(): void
    {
        Event::fake([WebFormSubmitted::class]);
        $brand = $this->brand('marca-a');
        ['token' => $token] = $this->activeSite($brand);
        $org = DB::table('organizations')->value('id');
        foreach (['contacto', 'cotizacion'] as $code) {
            DB::table('web_forms')->insert(['id' => (string) Str::uuid(), 'organization_id' => $org, 'brand_id' => $brand, 'code' => $code, 'name' => ucfirst($code), 'status' => 'active', 'destination' => 'email',
                'notify_email' => 'ventas@marca.test', 'consent_required' => true, 'consent_purpose' => 'privacy', 'consent_text' => json_encode(['es' => 'Acepto la política']),
                'captcha_required' => false, 'success_message' => json_encode(['es' => '¡Gracias!'])]);
        }
        $base = ['phone' => '+51 999 888 777', 'message' => 'Necesito información de sus planes.', 'consent' => true, 'page_url' => 'https://www.marca-a.test/contacto/'];
        $ana = $this->pluginPost('/api/v1/public/wp/forms/contacto/submissions', $token, ['name' => 'Ana Pérez', 'email' => 'ana@cliente.pe', 'company' => 'ACME SAC', 'utm' => ['source' => 'google', 'campaign' => 'hosting']] + $base, ['X-Hub-Visitor-Ip' => '203.0.113.10'])->assertStatus(202)->json('data.id');
        $luis = $this->pluginPost('/api/v1/public/wp/forms/cotizacion/submissions', $token, ['name' => 'Luis Rojas', 'email' => 'luis@empresa.pe', 'source' => 'cotizacion'] + $base, ['X-Hub-Visitor-Ip' => '203.0.113.11'])->assertStatus(202)->json('data.id');
        $spam = $this->pluginPost('/api/v1/public/wp/forms/contacto/submissions', $token, ['name' => 'Bot', 'email' => 'bot@spam.test', 'website' => 'http://spam.test'] + $base, ['X-Hub-Visitor-Ip' => '203.0.113.12'])->assertStatus(202)->json('data.id');
        // now() es el de la transacción del test: se separan las horas para fijar el orden.
        foreach ([$ana => 30, $luis => 20, $spam => 10] as $id => $minutes) {
            DB::table('web_form_submissions')->where('id', $id)->update(['created_at' => now()->subMinutes($minutes)]);
        }
        $this->app['auth']->forgetGuards();
        $this->actingAs($this->admin);
        $uri = '/api/v1/admin/web-connector/form-submissions';

        // Por defecto sin spam, más recientes primero, con formulario y marca; sin ip_hash ni clave de idempotencia.
        $list = $this->getJson($uri)->assertOk()->assertJsonCount(2, 'data')->assertJsonPath('meta.has_more', false);
        $this->assertSame([$luis, $ana], array_column($list->json('data'), 'id'));
        $this->assertSame('cotizacion', $list->json('data.0.form_code'));
        $this->assertSame('MARCA-A', $list->json('data.0.brand_name'));
        $this->assertArrayNotHasKey('ip_hash', $list->json('data.0'));
        $this->assertArrayNotHasKey('idempotency_key', $list->json('data.0'));
        $this->getJson("{$uri}?filter[status]=spam")->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $spam);
        $this->getJson("{$uri}?filter[status]=received,spam")->assertOk()->assertJsonCount(3, 'data');
        $this->getJson("{$uri}?filter[form_code]=contacto")->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $ana);
        $this->getJson("{$uri}?q=LUIS@")->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $luis);
        $this->getJson("{$uri}?q=acme")->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $ana);
        $this->getJson("{$uri}?page[size]=1")->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('meta.has_more', true);
        $this->assertProblem($this->getJson("{$uri}?filter[status]=atendida"), 422, 'validation_failed');
        $this->getJson("{$uri}/summary")->assertOk()->assertExactJson(['data' => ['received' => 2, 'routed' => 0, 'failed' => 0, 'spam' => 1]]);

        // Detalle: mensaje, página, UTM y consentimiento.
        $detail = $this->getJson("{$uri}/{$ana}")->assertOk()->assertJsonPath('data.payload.name', 'Ana Pérez')->assertJsonPath('data.payload.company', 'ACME SAC')
            ->assertJsonPath('data.page_url', 'https://www.marca-a.test/contacto/')->assertJsonPath('data.attribution.campaign', 'hosting')
            ->assertJsonPath('data.consent_given', true)->assertJsonPath('data.consent_text', 'Acepto la política')->assertJsonPath('data.form_name', 'Contacto');
        $version = $detail->json('data.version');
        $this->assertProblem($this->getJson("{$uri}/".Str::uuid()), 404, 'not_found');

        // Cambio de estado con versión: spam, conflicto con versión vieja, restaurar; derivar exige vínculo.
        $this->patchJson("{$uri}/{$ana}", ['status' => 'spam', 'version' => $version])->assertOk()->assertJsonPath('data.status', 'spam')->assertJsonPath('data.version', $version + 1)->assertJsonPath('data.form_code', 'contacto');
        $this->assertProblem($this->patchJson("{$uri}/{$ana}", ['status' => 'received', 'version' => $version]), 409, 'version_conflict');
        $this->patchJson("{$uri}/{$ana}", ['status' => 'received', 'version' => $version + 1])->assertOk()->assertJsonPath('data.status', 'received');
        $this->assertProblem($this->patchJson("{$uri}/{$ana}", ['status' => 'routed', 'version' => $version + 2]), 422, 'validation_failed');
        $this->assertProblem($this->patchJson("{$uri}/{$ana}", ['status' => 'failed', 'version' => $version + 2]), 422, 'validation_failed');
        $audit = DB::table('audit_events')->where('entity_type', 'web_form_submission')->where('entity_id', $ana)->orderBy('chain_seq')->get();
        $this->assertSame(['web_form_submission.marked_spam', 'web_form_submission.restored'], $audit->pluck('action')->all());
        $this->assertSame('spam', json_decode((string) $audit[0]->after, true)['status']);
        $this->assertStringNotContainsString('ana@cliente.pe', (string) $audit[0]->after.$audit[0]->before.$audit[0]->metadata);

        // Soporte ve la bandeja pero no cambia estados; finanzas no la ve.
        $this->actingAs($this->makeUser(['support'], mfa: true));
        $this->getJson($uri)->assertOk();
        $this->assertProblem($this->patchJson("{$uri}/{$luis}", ['status' => 'spam', 'version' => 1]), 403, 'forbidden');
        $this->actingAs($this->makeUser(['finance'], mfa: true));
        $this->assertProblem($this->getJson($uri), 403, 'forbidden');
    }

    public function test_demo_web_content_and_domain_extensions(): void
    {
        $this->artisan('hub:demo:catalog')->assertSuccessful();
        $this->artisan('hub:demo:web')->assertSuccessful();
        $this->artisan('hub:demo:web')->assertSuccessful();
        $brand = (string) DB::table('brands')->where('code', 'alojamientoplus')->value('id');
        ['token' => $token] = $this->activeSite($brand, 'www.alojamientoplus.test');
        $this->assertSame(2, DB::table('web_forms')->where('brand_id', $brand)->where('status', 'active')->count());
        $this->assertSame(1, DB::table('legal_document_versions as v')->join('legal_documents as d', 'd.id', '=', 'v.legal_document_id')->where('d.slug', 'politica-de-privacidad')->count());
        $this->assertStringContainsString('[Texto pendiente de asesoría legal]', (string) $this->plugin('/api/v1/public/wp/legal-documents/politica-de-privacidad', $token)->assertOk()->json('data.body'));
        $this->plugin('/api/v1/public/wp/forms/cotizacion', $token)->assertOk();
        $prices = $this->plugin('/api/v1/public/wp/catalog/domain-prices?currency=USD', $token)->assertOk()->json('data');
        $this->assertContains('com.pe', array_column($prices, 'tld'));
        $this->assertNotContains('cl', array_column($prices, 'tld')); // .cl no se vende en línea en el prototipo
        $this->assertSame(1900, collect($prices)->firstWhere('tld', 'com')['register_minor']);
        $this->assertGreaterThanOrEqual(7, DB::table('domain_extensions')->count());
    }

    public function test_domain_availability_with_public_rdap_and_whois(): void
    {
        $brand = $this->brand('marca-a');
        ['token' => $token] = $this->activeSite($brand);
        $org = DB::table('organizations')->value('id');
        $registrar = (string) Str::uuid();
        DB::table('providers')->insert(['id' => $registrar, 'organization_id' => $org, 'code' => 'reg', 'name' => 'Registrador X', 'type' => 'registrar']);
        foreach (['pe', 'com.pe', 'com', 'net', 'io', 'cl'] as $i => $tld) {
            DB::table('domain_extensions')->insert(['id' => Str::uuid(), 'organization_id' => $org, 'tld' => $tld, 'default_registrar_id' => $registrar, 'sellable_online' => $tld !== 'cl', 'allows_transfer_in' => true, 'sort_order' => $i]);
            DB::table('domain_tld_prices')->insert(['id' => Str::uuid(), 'organization_id' => $org, 'tld' => $tld, 'provider_id' => $registrar, 'operation' => 'register', 'cost_minor' => 100, 'cost_currency' => 'USD', 'price_minor' => 11900, 'currency' => 'PEN', 'effective_from' => now()->subMonth()->toDateString()]);
        }

        // Sin red real: WHOIS falso inyectado y RDAP por Http::fake.
        $whois = new class implements \App\Modules\WebConnector\Contracts\WhoisClient
        {
            /** @var list<string> */
            public array $queried = [];

            public function query(string $host, string $domain): ?string
            {
                $this->queried[] = $host.' '.$domain;
                if (str_starts_with($domain, 'falla.')) {
                    return null;
                }

                if (str_starts_with($domain, 'libre-')) {
                    return match (strtok($domain, '.')) {
                        'libre-notfound' => "NOT FOUND\n",
                        'libre-nodata' => "No Data Found for this query\n",
                        'libre-free' => "Status: free\n",
                        'libre-available' => "Status: AVAILABLE\n",
                        'libre-registration' => "The domain is available for registration\n",
                        default => "Domain Status: No Object Found\n",
                    };
                }
                if (str_starts_with($domain, 'ambiguo.')) {
                    return "WHOIS server ready\nPlease contact the registry\n";
                }
                if (str_starts_with($domain, 'registrado-')) {
                    return match (strtok($domain, '.')) {
                        'registrado-id' => "Registry Domain ID: 12345\n",
                        'registrado-date' => "Creation Date: 2020-01-01T00:00:00Z\n",
                        'registrado-status' => "Domain Status: clientTransferProhibited\n",
                        default => "Domain Name: {$domain}\nSponsoring Registrar: X\n",
                    };
                }

                return str_starts_with($domain, 'libre.') ? "Domain Status: No Object Found\n" : "Domain Name: {$domain}\nSponsoring Registrar: X\n";
            }
        };
        $this->app->instance(\App\Modules\WebConnector\Contracts\WhoisClient::class, $whois);
        Http::swap(new \Illuminate\Http\Client\Factory);
        Http::fake([
            'data.iana.org/*' => Http::response(['services' => [[['com', 'net'], ['http://insegura.test/', 'https://rdap.verisign.com/com/v1/']]]]),
            'rdap.verisign.com/*' => fn (HttpRequest $r) => str_contains($r->url(), 'libre.') ? Http::response('', 404) : (str_contains($r->url(), 'falla.') ? Http::response('', 500) : Http::response(['ldhName' => 'x'])),
        ]);
        $uri = '/api/v1/public/wp/domains/availability';
        $ip = ['X-Hub-Visitor-Ip' => '203.0.113.50'];

        // Libre en .pe/.com/.net, solo extensiones del catálogo en línea (.cl y .xyz se ignoran); .io sin RDAP = unknown.
        $free = $this->plugin("{$uri}?name=Libre&tlds=pe,com.pe,com,net,io,cl,xyz", $token, $ip)->assertOk()->assertHeaderMissing('ETag')
            ->assertJsonPath('data.name', 'libre')->assertJsonCount(5, 'data.results');
        $byTld = collect($free->json('data.results'))->keyBy('tld');
        $this->assertSame(['pe' => 'available', 'com.pe' => 'available', 'com' => 'available', 'net' => 'available', 'io' => 'unknown'], $byTld->map->status->all());
        $this->assertSame('libre.com.pe', $byTld['com.pe']['domain']);
        $this->assertSame(11900, $byTld['com']['register_minor']);
        $this->assertSame('PEN', $byTld['com']['currency']);
        $this->assertContains('whois.nic.pe libre.com.pe', $whois->queried);

        // Variantes habituales de disponibilidad, datos registrales y respuestas ambiguas.
        foreach (['libre-notfound', 'libre-nodata', 'libre-free', 'libre-available', 'libre-registration'] as $name) {
            $this->assertSame('available', $this->plugin("{$uri}?name={$name}&tlds=pe", $token, $ip)->assertOk()->json('data.results.0.status'));
        }
        foreach (['registrado-id', 'registrado-date', 'registrado-status'] as $name) {
            $this->assertSame('registered', $this->plugin("{$uri}?name={$name}&tlds=pe", $token, $ip)->assertOk()->json('data.results.0.status'));
        }
        $this->assertSame('unknown', $this->plugin("{$uri}?name=ambiguo&tlds=pe", $token, $ip)->assertOk()->json('data.results.0.status'));

        // Registrado, y la IP del visitante no cuenta contra otra.
        $taken = $this->plugin("{$uri}?name=google&tlds=.pe,.com", $token, $ip)->assertOk()->json('data.results');
        $this->assertSame(['registered', 'registered'], array_column($taken, 'status'));

        // Errores nunca se muestran como libres: WHOIS caído y RDAP 500 = unknown (y no se cachean).
        $err = $this->plugin("{$uri}?name=falla&tlds=pe,com", $token, $ip)->assertOk()->json('data.results');
        $this->assertSame(['unknown', 'unknown'], array_column($err, 'status'));
        $before = count($whois->queried);
        $this->plugin("{$uri}?name=falla&tlds=pe", $token, $ip)->assertOk();
        $this->assertCount($before + 1, $whois->queried);

        // Solo https para RDAP: el servidor http del bootstrap nunca se consulta.
        Http::assertNotSent(fn (HttpRequest $r) => str_starts_with($r->url(), 'http://'));
        // Un resultado libre o registrado se reutiliza de la caché corta.
        $count = count($whois->queried);
        $this->plugin("{$uri}?name=libre&tlds=pe", $token, $ip)->assertOk();
        $this->assertCount($count, $whois->queried);

        // Validación.
        foreach (['', 'mi_empresa', '-abc', 'abc-', 'a.b', 'ñandu', str_repeat('a', 64)] as $bad) {
            $this->assertProblem($this->plugin($uri.'?name='.urlencode($bad), $token, $ip), 422, 'validation_failed');
        }
        $this->assertProblem($this->plugin("{$uri}?name=abc&tlds=a1,a2,a3,a4,a5,a6,a7,a8,a9", $token, $ip), 422, 'validation_failed');
        $this->assertProblem($this->plugin("{$uri}?name=abc&tlds=%3Cx%3E", $token, $ip), 422, 'validation_failed');
        $this->assertProblem($this->plugin("{$uri}?name=abc", null), 401, 'unauthenticated');

        // Límite por IP del visitante.
        config(['hub.domain_availability.requests_per_ip_per_10min' => 2]);
        $other = ['X-Hub-Visitor-Ip' => '198.51.100.9'];
        $this->plugin("{$uri}?name=abc&tlds=pe", $token, $other)->assertOk();
        $this->plugin("{$uri}?name=abc&tlds=pe", $token, $other)->assertOk();
        $limited = $this->plugin("{$uri}?name=abc&tlds=pe", $token, $other);
        $this->assertProblem($limited, 429, 'rate_limited');
        $limited->assertHeader('Retry-After');
        $this->plugin("{$uri}?name=abc&tlds=pe", $token, ['X-Hub-Visitor-Ip' => '198.51.100.10'])->assertOk();

        // Una cabecera inválida usa la IP real de conexión y no crea una identidad nueva.
        config(['hub.domain_availability.requests_per_ip_per_10min' => 2]);
        $badHeader = ['X-Hub-Visitor-Ip' => 'no-es-una-ip'];
        $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.11']);
        $this->plugin("{$uri}?name=abc&tlds=pe", $token, $badHeader)->assertOk();
        $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.11']);
        $this->plugin("{$uri}?name=abd&tlds=pe", $token, $badHeader)->assertOk();
        $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.11']);
        $this->assertProblem($this->plugin("{$uri}?name=abe&tlds=pe", $token, $badHeader), 429, 'rate_limited');
        $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.12']);
        $this->plugin("{$uri}?name=abf&tlds=pe", $token, $badHeader)->assertOk();
    }

    public function test_embed_site_origin_scope_and_browser_security(): void
    {
        $brand = $this->brand('embed-test');
        $uri = '/api/v1/admin/web-connector/sites';
        $base = ['brand_id' => $brand, 'name' => 'Widget', 'base_url' => 'https://www.embed-test.test'];

        $this->assertProblem($this->postJson($uri, $base + ['kind' => 'embed', 'allowed_origins' => []]), 422, 'validation_failed');
        $tooMany = array_map(fn (int $n) => "https://web{$n}.embed-test.test", range(1, 6));
        $this->assertProblem($this->postJson($uri, $base + ['kind' => 'embed', 'allowed_origins' => $tooMany]), 422, 'validation_failed');
        $this->assertProblem($this->postJson($uri, $base + ['kind' => 'embed', 'allowed_origins' => ['https://shop.embed-test.test'], 'webhook_url' => 'https://www.embed-test.test/hook']), 422, 'validation_failed');

        $origin = 'https://shop.embed-test.test';
        $site = $this->postJson($uri, $base + ['kind' => 'embed', 'allowed_origins' => [$origin]])
            ->assertCreated()->assertJsonPath('data.kind', 'embed')->assertJsonPath('data.status', 'active')->json('data.id');
        $tokenUrl = "{$uri}/{$site}/tokens";
        $this->assertProblem($this->postJson($tokenUrl, ['name' => 'Plugin equivocado', 'scope' => 'read']), 422, 'validation_failed');
        $token = $this->postJson($tokenUrl, ['name' => 'Clave publicable', 'scope' => 'embed'])->assertCreated()->json('data.token');

        $this->options('/api/v1/public/wp/catalog/plans', [], [
            'Origin' => $origin,
            'Access-Control-Request-Method' => 'GET',
            'Access-Control-Request-Headers' => 'authorization,content-type',
        ])->assertNoContent()->assertHeader('Access-Control-Allow-Origin', $origin)->assertHeader('Access-Control-Allow-Methods', 'GET, POST');
        $this->getJson('/api/v1/public/wp/catalog/plans', ['Authorization' => "Bearer {$token}", 'Origin' => $origin])
            ->assertOk()->assertHeader('Access-Control-Allow-Origin', $origin)->assertHeader('Vary', 'Origin');
        $this->getJson('/api/v1/public/wp/catalog/plans', ['Authorization' => "Bearer {$token}", 'Origin' => 'https://otro.test'])
            ->assertStatus(403)->assertJsonPath('code', 'origin_not_allowed');
        $this->flushHeaders();
        $this->getJson('/api/v1/public/wp/catalog/plans', ['Authorization' => "Bearer {$token}"])
            ->assertStatus(403)->assertJsonPath('code', 'origin_not_allowed');
        $this->postJson('/api/v1/admin/web-connector/sites', [], ['Authorization' => "Bearer {$token}", 'Origin' => $origin])
            ->assertStatus(403);
        $this->getJson('/api/v1/portal/auth/password-policy', ['Authorization' => "Bearer {$token}", 'Origin' => $origin])
            ->assertStatus(403);
        $this->postJson('/api/v1/public/communication-unsubscribes', [], ['Authorization' => "Bearer {$token}", 'Origin' => $origin])
            ->assertStatus(403);
        $this->assertSame(2, DB::table('audit_events')->where('entity_type', 'wp_site')->where('entity_id', $site)->where('action', 'wp_site.embed_origin_denied')->count());
    }

    public function test_read_token_is_rejected_when_sent_by_a_browser(): void
    {
        $brand = $this->brand('wordpress-origin');
        ['token' => $token] = $this->activeSite($brand);
        $this->getJson('/api/v1/public/wp/catalog/plans', [
            'Authorization' => "Bearer {$token}",
            'Origin' => 'https://www.marca-a.test',
            'X-Hub-Plugin-Version' => '1.2.0',
        ])->assertStatus(403);
    }
}
