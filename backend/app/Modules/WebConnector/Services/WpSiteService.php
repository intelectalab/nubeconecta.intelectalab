<?php

declare(strict_types=1);

namespace App\Modules\WebConnector\Services;

use App\Modules\WebConnector\Events\WpSiteActivated;
use App\Modules\WebConnector\Events\WpSiteDisabled;
use App\Modules\WebConnector\Events\WpSiteTokenCreated;
use App\Modules\WebConnector\Events\WpSiteTokenRevoked;
use App\Modules\WebConnector\Models\WpCacheInvalidation;
use App\Modules\WebConnector\Models\WpSite;
use App\Modules\WebConnector\Models\WpSiteToken;
use App\Shared\Audit\AuditLogger;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Settings\SettingsReader;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Reglas de sitios y tokens (RN-WCN-002, RN-WCN-003, RN-WCN-016). */
final class WpSiteService
{
    public function __construct(
        private readonly AuditLogger $audit,
        private readonly SecretStore $secrets,
        private readonly SettingsReader $settings,
        private readonly CacheInvalidator $invalidator,
    ) {}

    /**
     * Genera o rota el secreto de firma. El anterior queda en la bóveda con
     * expires_at = ahora + web_connector.webhook.secret_overlap_minutes.
     *
     * @return array{secret: string, previous_valid_until: ?string}
     */
    public function rotateSecret(WpSite $site): array
    {
        $plain = bin2hex(random_bytes(32));

        return DB::transaction(function () use ($site, $plain): array {
            $previous = $site->webhook_secret_id;
            $until = null;
            if ($previous !== null) {
                $until = now()->addMinutes(max(0, $this->settings->int('web_connector.webhook.secret_overlap_minutes', 60)));
                $this->secrets->expire($previous, $until);
            }
            $id = $this->secrets->put($site->organization_id, 'wp_site', $site->id, 'other', 'Firma de webhook: '.$site->name, $plain, ['purpose' => 'wp_webhook_signature']);
            $site->forceFill(['webhook_secret_id' => $id])->save();
            $this->audit->record('wp_site.webhook_secret_rotated', 'wp_site', $site->id, null, null, [
                'secret_id' => $id,
                'previous_secret_id' => $previous,
                'previous_valid_until' => $until?->toIso8601ZuluString(),
            ]);

            return ['secret' => $plain, 'previous_valid_until' => $until?->toIso8601ZuluString()];
        });
    }

    /** @return array{token: WpSiteToken, plain: string} */
    public function createToken(WpSite $site, string $name, ?string $scope = null): array
    {
        $scope ??= $site->kind === 'embed' ? 'embed' : 'read';
        if (($site->kind === 'embed' && $scope !== 'embed') || ($site->kind !== 'embed' && $scope !== 'read')) {
            throw ProblemException::validation(['scope' => ['El alcance del token no corresponde al tipo de sitio.']]);
        }
        $plain = 'hubwp_'.Str::random(48);
        $days = $this->settings->int('web_connector.token_expiry_days', 365);

        $token = DB::transaction(function () use ($site, $name, $plain, $days, $scope): WpSiteToken {
            $token = new WpSiteToken(['name' => $name]);
            $token->forceFill([
                'organization_id' => $site->organization_id,
                'wp_site_id' => $site->id,
                'scope' => $scope,
                'token_hash' => hash('sha256', $plain),
                'token_last_four' => substr($plain, -4),
                'expires_at' => $days > 0 ? now()->addDays($days) : null,
            ])->save();
            $this->audit->record('wp_site_token.created', 'wp_site_token', $token->id, null, $token->refresh()->attributesToArray(), ['wp_site_id' => $site->id]);
            WpSiteTokenCreated::dispatch($token->organization_id, $token->id);

            return $token;
        });

        return ['token' => $token, 'plain' => $plain];
    }

    public function revokeToken(WpSiteToken $token, string $reason): void
    {
        if ($token->revoked_at !== null) {
            return;
        }
        $before = $token->attributesToArray();
        $token->forceFill(['revoked_at' => now(), 'revoked_by' => Auth::id(), 'revoke_reason' => $reason])->save();
        $this->audit->record('wp_site_token.revoked', 'wp_site_token', $token->id, $before, $token->refresh()->attributesToArray(), ['wp_site_id' => $token->wp_site_id]);
        WpSiteTokenRevoked::dispatch($token->organization_id, $token->id);
    }

    /** "Probar webhook": aviso `all` firmado, un solo intento y respuesta inmediata. */
    public function testWebhook(WpSite $site): WpCacheInvalidation
    {
        if ($site->webhook_url === null || $site->webhook_secret_id === null) {
            throw ProblemException::validation(['webhook_url' => ['El sitio necesita la ruta del plugin y el secreto de firma antes de probar el webhook.']]);
        }
        $invalidation = $this->invalidator->forSite($site, 'all', [], WpCacheInvalidation::TEST_TRIGGER, Auth::id(), queue: false);
        $this->invalidator->deliver($invalidation, finalOnFailure: true);
        $invalidation->refresh();
        $this->audit->record('wp_site.webhook_tested', 'wp_site', $site->id, null, null, [
            'invalidation_id' => $invalidation->id,
            'status' => $invalidation->status,
            'response_status' => $invalidation->response_status,
        ]);

        return $invalidation;
    }

    public function activate(WpSite $site): WpSite
    {
        $errors = [];
        if ($site->kind === 'embed') {
            if (count((array) $site->allowed_origins) < 1) {
                $errors['allowed_origins'][] = 'El sitio embed necesita por lo menos un origen permitido.';
            }
            if (! WpSiteToken::query()->where('wp_site_id', $site->id)->where('scope', 'embed')->usable()->exists()) {
                $errors['tokens'][] = 'El sitio necesita un token embed vigente.';
            }
            if ($errors !== []) {
                throw ProblemException::validation($errors);
            }

            return $this->changeStatus($site, 'active', null, 'wp_site.activated');
        }
        if ($site->webhook_url === null) {
            $errors['webhook_url'][] = 'Falta la ruta del plugin.';
        }
        if ($site->webhook_secret_id === null) {
            $errors['webhook_secret'][] = 'Falta generar el secreto de firma.';
        }
        if (! WpSiteToken::query()->where('wp_site_id', $site->id)->where('scope', 'read')->usable()->exists()) {
            $errors['tokens'][] = 'El sitio necesita un token vigente.';
        }
        $secretCreated = $site->webhook_secret_id ? DB::table('secrets')->where('id', $site->webhook_secret_id)->value('last_rotated_at') : null;
        $tested = WpCacheInvalidation::query()->where('wp_site_id', $site->id)
            ->where('trigger_event', WpCacheInvalidation::TEST_TRIGGER)->where('status', 'delivered')
            ->when($secretCreated, fn ($q) => $q->where('created_at', '>=', $secretCreated))->exists();
        if (! $tested) {
            $errors['webhook_test'][] = 'Falta una prueba de webhook entregada con el secreto vigente.';
        }
        if ($errors !== []) {
            throw ProblemException::validation($errors);
        }

        return $this->changeStatus($site, 'active', null, 'wp_site.activated');
    }

    public function disable(WpSite $site, string $reason): WpSite
    {
        $site = $this->changeStatus($site, 'disabled', $reason, 'wp_site.disabled');
        $this->cancelPending($site, 'Sitio desactivado.');

        return $site;
    }

    /** Baja lógica: revoca tokens y cancela avisos pendientes (M-WCN §4.11). */
    public function retire(WpSite $site): void
    {
        WpSiteToken::query()->where('wp_site_id', $site->id)->whereNull('revoked_at')->get()
            ->each(fn (WpSiteToken $t) => $this->revokeToken($t, 'Sitio dado de baja.'));
        $this->cancelPending($site, 'Sitio dado de baja.');
        WpSiteDisabled::dispatch($site->organization_id, $site->id);
    }

    private function changeStatus(WpSite $site, string $status, ?string $reason, string $action): WpSite
    {
        return DB::transaction(function () use ($site, $status, $reason, $action): WpSite {
            $before = $site->attributesToArray();
            $site->forceFill(['status' => $status, 'disabled_reason' => $reason])->save();
            $this->audit->record($action, 'wp_site', $site->id, $before, $site->refresh()->attributesToArray(), $reason ? ['reason' => $reason] : []);
            $status === 'active'
                ? WpSiteActivated::dispatch($site->organization_id, $site->id)
                : WpSiteDisabled::dispatch($site->organization_id, $site->id);

            return $site;
        });
    }

    private function cancelPending(WpSite $site, string $reason): void
    {
        WpCacheInvalidation::query()->where('wp_site_id', $site->id)->where('status', 'pending')
            ->update(['status' => 'failed', 'last_error' => $reason, 'next_retry_at' => null, 'updated_at' => now(), 'version' => DB::raw('version + 1')]);
    }
}
