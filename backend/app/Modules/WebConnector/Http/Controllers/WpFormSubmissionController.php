<?php

declare(strict_types=1);

namespace App\Modules\WebConnector\Http\Controllers;

use App\Modules\WebConnector\Contracts\CaptchaVerifier;
use App\Modules\WebConnector\Events\WebFormSubmitted;
use App\Modules\WebConnector\Models\WpSite;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Settings\SettingsReader;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;

/**
 * Envío de los formularios de contacto y cotización de la web en modo reenvío
 * (docs/13 §9, `relay`): el plugin lo reenvía desde el servidor de WordPress
 * con el token del sitio, la IP del visitante en X-Hub-Visitor-Ip y la
 * Idempotency-Key del navegador; WordPress no guarda nada.
 *
 * Valida, limita por IP (web_connector.forms.submissions_per_ip_per_hour),
 * guarda en web_form_submissions (received, o spam si el campo trampa
 * `website` viene lleno) y emite WebFormSubmitted. Captcha: gancho
 * CaptchaVerifier sin proveedor mientras D-24 siga abierta.
 */
final class WpFormSubmissionController
{
    public function __construct(private readonly SettingsReader $settings, private readonly CaptchaVerifier $captcha) {}

    public function store(Request $request, string $code): JsonResponse
    {
        /** @var WpSite $site */
        $site = $request->attributes->get('wp_site');
        $form = DB::table('web_forms')->where('organization_id', $site->organization_id)->where('brand_id', $site->brand_id)
            ->where('code', $code)->where('status', 'active')->whereNull('deleted_at')->first() ?? throw ProblemException::notFound();

        $ip = $this->visitorIp($request);
        $ipHash = hash_hmac('sha256', $ip, (string) config('app.key'));
        $limiterKey = 'wcn-form:'.$site->organization_id.':'.$ipHash;
        $max = max(1, $this->settings->int('web_connector.forms.submissions_per_ip_per_hour', 10));
        // X-Hub-Visitor-Ip lo reenvía el plugin y es falsificable: un tope por sitio (10×)
        // acota el abuso aunque se rote la IP del visitante para burlar el límite por IP.
        $siteKey = 'wcn-form-site:'.$site->organization_id;
        if (RateLimiter::tooManyAttempts($limiterKey, $max) || RateLimiter::tooManyAttempts($siteKey, $max * 10)) {
            $retry = max(RateLimiter::availableIn($limiterKey), RateLimiter::availableIn($siteKey));
            throw new ProblemException(429, 'rate_limited', 'Demasiados envíos desde esta conexión. Intenta de nuevo más tarde.', ['retry_after' => $retry], ['Retry-After' => (string) $retry]);
        }
        RateLimiter::hit($limiterKey, 3600);
        RateLimiter::hit($siteKey, 3600);

        $data = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'email' => ['required', 'string', 'email:rfc', 'max:190'],
            'phone' => ['nullable', 'string', 'max:30', 'regex:/^[0-9+()\s.-]{6,30}$/'],
            'company' => ['nullable', 'string', 'max:160'],
            'message' => ['required', 'string', 'min:10', 'max:5000'],
            'source' => ['nullable', 'string', 'max:60', 'regex:/^[a-z0-9_-]+$/'],
            'consent' => $form->consent_required ? ['accepted'] : ['sometimes', 'boolean'],
            'website' => ['nullable', 'string', 'max:200'],
            'page_url' => ['nullable', 'string', 'max:2000', 'url:http,https'],
            'utm' => ['sometimes', 'array:source,medium,campaign,term,content'],
            'utm.*' => ['nullable', 'string', 'max:120'],
            'captcha_token' => ['nullable', 'string', 'max:4000'],
        ], [], [
            'name' => 'nombre', 'email' => 'correo electrónico', 'phone' => 'teléfono', 'company' => 'empresa',
            'message' => 'mensaje', 'source' => 'origen', 'consent' => 'consentimiento', 'page_url' => 'página',
        ]);

        $captchaAt = null;
        if ($this->captcha->enabled() && $form->captcha_required) {
            if (! $this->captcha->verify($data['captcha_token'] ?? null, $ip)) {
                throw ProblemException::validation(['captcha_token' => ['No pudimos verificar que no eres un robot.']]);
            }
            $captchaAt = now();
        }

        $idempotency = (string) $request->header('Idempotency-Key', '');
        if ($idempotency !== '' && ! preg_match('/^[A-Za-z0-9_.:-]{8,200}$/', $idempotency)) {
            throw ProblemException::validation(['Idempotency-Key' => ['Clave de idempotencia no válida.']]);
        }
        $idempotency = $idempotency !== '' ? $idempotency : (string) Str::uuid();

        $existing = DB::table('web_form_submissions')->where('organization_id', $site->organization_id)
            ->where('web_form_id', $form->id)->where('idempotency_key', $idempotency)->value('id');
        if ($existing === null) {
            $spam = trim((string) ($data['website'] ?? '')) !== '';
            $consentText = json_decode((string) $form->consent_text, true);
            $existing = (string) Str::uuid();
            DB::table('web_form_submissions')->insert([
                'id' => $existing,
                'organization_id' => $site->organization_id,
                'web_form_id' => $form->id,
                'brand_id' => $site->brand_id,
                'wp_site_id' => $site->id,
                'idempotency_key' => $idempotency,
                'payload' => json_encode(array_filter([
                    'name' => trim($data['name']), 'email' => strtolower(trim($data['email'])),
                    'phone' => $data['phone'] ?? null, 'company' => $data['company'] ?? null,
                    'message' => trim($data['message']), 'source' => $data['source'] ?? null,
                ], fn ($v) => $v !== null && $v !== ''), JSON_UNESCAPED_UNICODE),
                'consent_given' => (bool) ($data['consent'] ?? false),
                'consent_text' => ($data['consent'] ?? false) && is_array($consentText) ? ($consentText['es'] ?? (reset($consentText) ?: null)) : null,
                'captcha_verified_at' => $captchaAt,
                'page_url' => $data['page_url'] ?? null,
                'attribution' => json_encode((object) array_filter($data['utm'] ?? [], fn ($v) => $v !== null && $v !== '')),
                'status' => $spam ? 'spam' : 'received',
                'ip_hash' => $ipHash,
            ]);
            if (! $spam) {
                WebFormSubmitted::dispatch($site->organization_id, $existing, (string) $form->id, $site->brand_id, $site->id);
            }
        }

        $messages = json_decode((string) $form->success_message, true) ?: [];

        // El visitante ve lo mismo con o sin spam: no se revela el campo trampa.
        return response()->json(['data' => [
            'id' => $existing,
            'status' => 'received',
            'message' => is_array($messages) ? ($messages['es'] ?? (reset($messages) ?: null)) : null,
            'redirect_url' => $form->redirect_url,
        ]], 202);
    }

    /** IP del visitante que reenvía el plugin; si no viene o no es válida, la del servidor de WordPress. */
    private function visitorIp(Request $request): string
    {
        $header = trim((string) $request->header('X-Hub-Visitor-Ip', ''));

        return filter_var($header, FILTER_VALIDATE_IP) !== false ? $header : (string) $request->ip();
    }
}
