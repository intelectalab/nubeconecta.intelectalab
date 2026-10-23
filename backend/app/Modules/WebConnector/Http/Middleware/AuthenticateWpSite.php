<?php

declare(strict_types=1);

namespace App\Modules\WebConnector\Http\Middleware;

use App\Modules\WebConnector\Models\WpSite;
use App\Modules\WebConnector\Models\WpSiteToken;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Organization\CurrentOrganization;
use App\Shared\Settings\SettingsReader;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Esquema `wpSiteToken` de /public/wp/* (docs/06, M-WCN §7): token bearer de
 * solo lectura del sitio (solo hash en wp_site_tokens). Revocado, vencido,
 * desconocido o de un sitio dado de baja/desactivado → 401. La marca, el sitio
 * y la organización salen del token. `X-Hub-Plugin-Version` ausente o menor que
 * web_connector.min_plugin_version → 426.
 */
final class AuthenticateWpSite
{
    public function __construct(private readonly CurrentOrganization $organization) {}

    public function handle(Request $request, Closure $next): Response
    {
        $plain = (string) $request->bearerToken();
        $token = $plain === '' ? null : WpSiteToken::withoutGlobalScope('organization')
            ->where('token_hash', hash('sha256', $plain))->usable()->first();
        if ($token !== null) {
            $this->organization->set($token->organization_id);
        }
        $site = $token ? WpSite::query()->with('brand')->find($token->wp_site_id) : null;
        if ($token === null || $site === null || $site->status === 'disabled' || $site->brand === null) {
            throw new ProblemException(401, 'unauthenticated', 'Token del sitio inválido, vencido o revocado.', [], ['WWW-Authenticate' => 'Bearer']);
        }
        $version = (string) $request->header('X-Hub-Plugin-Version', '');
        $minimum = (string) app(SettingsReader::class)->get('web_connector.min_plugin_version', '1.0.0');
        if (! preg_match('/^\d+\.\d+\.\d+([-+][0-9A-Za-z.-]+)?$/', $version) || version_compare($version, $minimum, '<')) {
            throw new ProblemException(426, 'plugin_upgrade_required', "El plugin debe ser la versión {$minimum} o superior.", ['min_plugin_version' => $minimum]);
        }

        // Última actividad: como mucho una escritura por minuto y token.
        if ($token->last_used_at === null || $token->last_used_at->lt(now()->subMinute())) {
            WpSiteToken::withoutGlobalScope('organization')->whereKey($token->id)->update([
                'last_used_at' => now(),
                'last_used_ip_hash' => hash_hmac('sha256', (string) $request->ip(), (string) config('app.key')),
            ]);
            WpSite::withoutGlobalScope('organization')->whereKey($site->id)->update(['last_seen_at' => now(), 'plugin_version' => substr($version, 0, 40)]);
        }

        $request->attributes->set('wp_site', $site);
        $request->attributes->set('wp_site_token_id', $token->id);

        return $next($request);
    }
}
