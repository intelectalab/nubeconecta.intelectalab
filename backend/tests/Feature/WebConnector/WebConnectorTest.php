<?php

declare(strict_types=1);

namespace Tests\Feature\WebConnector;

use App\Models\User;
use App\Shared\Http\OutboundUrlGuard;
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
        foreach (['::1', 'fe80::1', 'fd00:ec2::254', '::ffff:127.0.0.1', '::ffff:10.1.2.3'] as $ip) {
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
}
