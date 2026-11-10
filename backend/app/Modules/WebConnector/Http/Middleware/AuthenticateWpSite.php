<?php

declare(strict_types=1);

namespace App\Modules\WebConnector\Http\Middleware;

use App\Modules\WebConnector\Models\WpSite;
use App\Modules\WebConnector\Models\WpSiteToken;
use App\Shared\Audit\AuditLogger;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Organization\CurrentOrganization;
use App\Shared\Settings\SettingsReader;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Autenticación de los tokens del conector y política de la clave publicable. */
final class AuthenticateWpSite
{
    /** Rutas de datos públicos que puede consumir el widget embebible. */
    private const EMBED_ROUTES = [
        '#^/api/v1/public/wp/catalog/plans$#',
        '#^/api/v1/public/wp/catalog/plans/[0-9a-f-]{36}$#i',
        '#^/api/v1/public/wp/catalog/compare$#',
        '#^/api/v1/public/wp/catalog/bundles/[0-9a-f-]{36}$#i',
        '#^/api/v1/public/wp/catalog/domain-prices$#',
        '#^/api/v1/public/wp/public/domain-availability$#',
        '#^/api/v1/public/wp/domain-availability$#',
        '#^/api/v1/public/wp/domains/availability$#',
        '#^/api/v1/public/wp/whois$#',
        '#^/api/v1/public/wp/servers$#',
        '#^/api/v1/public/wp/promotions/[0-9a-f-]{36}$#i',
        '#^/api/v1/public/wp/legal-documents/[a-z0-9_-]+$#',
        '#^/api/v1/public/wp/service-status$#',
        '#^/api/v1/public/wp/forms/[a-z0-9-]+$#',
        '#^/api/v1/public/wp/complaint-form$#',
        '#^/api/v1/public/wp/web-forms/[a-z0-9-]+$#',
        '#^/api/v1/public/wp/wp/whois$#',
        '#^/api/v1/public/wp/wp/servers$#',
        '#^/api/v1/public/wp/wp/promotions/[0-9a-f-]{36}$#i',
        '#^/api/v1/public/wp/wp/contact$#',
        '#^/api/v1/public/wp/contact$#',
        '#^/api/v1/public/wp/wp/legal-documents/[a-z0-9_-]+$#',
        '#^/api/v1/public/wp/wp/service-status$#',
        '#^/api/v1/public/wp/wp/forms/[a-z0-9-]+$#',
        '#^/api/v1/public/wp/wp/complaint-form$#',
    ];

    public function __construct(private readonly CurrentOrganization $organization) {}

    public function handle(Request $request, Closure $next): Response
    {
        $path = '/'.ltrim($request->path(), '/');
        if ($request->isMethod('OPTIONS')) {
            if (! $request->headers->has('Origin') || ! $request->headers->has('Access-Control-Request-Method')) {
                return $next($request);
            }
            return $this->preflight($request, $path, $next);
        }

        $plain = (string) $request->bearerToken();
        $isConnectorToken = str_starts_with($plain, 'hubwp_');
        // Las rutas públicas del conector exigen auth del conector aunque no llegue token
        // (un token ausente o ajeno responde 401, no pasa de largo al controlador).
        $requiresWpAuth = str_starts_with($path, '/api/v1/public/wp/');
        if (! $isConnectorToken && ! $requiresWpAuth) {
            return $next($request);
        }
        if ($request->attributes->has('wp_site') && $request->attributes->has('wp_site_token_scope')) {
            return $next($request);
        }

        $token = WpSiteToken::withoutGlobalScope('organization')->where('token_hash', hash('sha256', $plain))->usable()->first();
        if ($token !== null) {
            $this->organization->set($token->organization_id);
        }
        $site = $token ? WpSite::query()->with('brand')->find($token->wp_site_id) : null;
        if ($token === null || $site === null || $site->status === 'disabled' || $site->brand === null) {
            throw new ProblemException(401, 'unauthenticated', 'Token del sitio inválido, vencido, revocado o inactivo.', [], ['WWW-Authenticate' => 'Bearer']);
        }
        if (($token->scope === 'embed' && $site->kind !== 'embed') || ($token->scope === 'read' && $site->kind !== 'wordpress')) {
            throw ProblemException::forbidden('El alcance del token no corresponde al tipo de sitio.');
        }
        if ($token->scope === 'embed' && $site->status !== 'active') {
            throw new ProblemException(401, 'unauthenticated', 'El sitio embebible no está activo.', [], ['WWW-Authenticate' => 'Bearer']);
        }

        if ($token->scope === 'read') {
            if ($request->headers->has('Origin')) {
                throw new ProblemException(403, 'forbidden', 'Los tokens del plugin no se aceptan desde el navegador.');
            }
            // /public/wp conserva la validación de versión y la actividad actual.
            if (! str_starts_with($path, '/api/v1/public/wp/')) {
                return $next($request);
            }
            $this->assertPluginVersion($request);
            $this->setIdentity($request, $site, $token);

            return $next($request);
        }

        if ($token->scope !== 'embed' || $site->kind !== 'embed') {
            throw ProblemException::forbidden('El alcance del token no corresponde al tipo de sitio.');
        }
        $origin = trim((string) $request->header('Origin', ''));
        if ($origin === '' || ! in_array($origin, (array) $site->allowed_origins, true)) {
            app(AuditLogger::class)->record('wp_site.embed_origin_denied', 'wp_site', $site->id, null, null, [
                'origin' => $origin === '' ? null : $origin,
                'path' => $path,
                'method' => $request->method(),
                'result' => 'origin_not_allowed',
            ], organizationId: $site->organization_id);
            throw new ProblemException(403, 'origin_not_allowed', 'El origen no está permitido para este sitio.');
        }
        if (! $this->isEmbedRoute($path, $request->method())) {
            throw ProblemException::forbidden('Esta operación no está disponible para el widget embebible.');
        }

        $this->setIdentity($request, $site, $token);
        try {
            $response = $next($request);
        } catch (\Throwable $exception) {
            $response = app(\App\Shared\Http\Problem\ProblemRenderer::class)->render($exception, $request);
            if ($response === null) {
                throw $exception;
            }
            if ($response->getStatusCode() >= 500) {
                report($exception);
            }
        }
        $this->addCors($response, $origin);

        return $response;
    }

    private function assertPluginVersion(Request $request): void
    {
        $version = (string) $request->header('X-Hub-Plugin-Version', '');
        $minimum = (string) app(SettingsReader::class)->get('web_connector.min_plugin_version', '1.0.0');
        if (! preg_match('/^\d+\.\d+\.\d+([-+][0-9A-Za-z.-]+)?$/', $version) || version_compare($version, $minimum, '<')) {
            throw new ProblemException(426, 'plugin_upgrade_required', "El plugin debe ser la versión {$minimum} o superior.", ['min_plugin_version' => $minimum]);
        }
    }

    private function setIdentity(Request $request, WpSite $site, WpSiteToken $token): void
    {
        $request->attributes->set('wp_site', $site);
        $request->attributes->set('wp_site_token_id', $token->id);
        $request->attributes->set('wp_site_token_scope', $token->scope);
        if ($token->last_used_at === null || $token->last_used_at->lt(now()->subMinute())) {
            WpSiteToken::withoutGlobalScope('organization')->whereKey($token->id)->update([
                'last_used_at' => now(),
                'last_used_ip_hash' => hash_hmac('sha256', (string) $request->ip(), (string) config('app.key')),
            ]);
            $siteActivity = ['last_seen_at' => now()];
            if ($token->scope === 'read') {
                $siteActivity['plugin_version'] = substr((string) $request->header('X-Hub-Plugin-Version', ''), 0, 40);
            }
            WpSite::withoutGlobalScope('organization')->whereKey($site->id)->update($siteActivity);
        }
    }

    private function isEmbedRoute(string $path, string $method): bool
    {
        if ($method === 'POST') {
            return preg_match('#^/api/v1/public/wp/(?:web-forms|forms)/[a-z0-9-]+/submissions$#', $path) === 1;
        }
        if ($method !== 'GET') {
            return false;
        }
        foreach (self::EMBED_ROUTES as $pattern) {
            if (preg_match($pattern, $path) === 1) {
                return true;
            }
        }

        return false;
    }

    private function preflight(Request $request, string $path, Closure $next): Response
    {
        $origin = trim((string) $request->header('Origin', ''));
        $requestedMethod = strtoupper((string) $request->header('Access-Control-Request-Method', ''));
        if (! $this->isEmbedRoute($path, 'GET') && ! $this->isEmbedRoute($path, 'POST')) {
            return $next($request);
        }
        if ($origin === '' || ! $this->isEmbedRoute($path, $requestedMethod)) {
            return response()->noContent(204);
        }
        // Se aprueba el preflight reflejando el origen; la pertenencia a
        // allowed_origins se exige en la petición real (403 origin_not_allowed),
        // que es el límite de seguridad: el preflight no entrega datos.
        $response = response()->noContent(204);
        $this->addCors($response, $origin);

        return $response;
    }

    private function addCors(Response $response, string $origin): void
    {
        $response->headers->set('Access-Control-Allow-Origin', $origin);
        $response->headers->set('Vary', 'Origin');
        $response->headers->set('Access-Control-Allow-Methods', 'GET, POST');
        $response->headers->set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    }
}
