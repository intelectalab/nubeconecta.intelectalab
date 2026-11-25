<?php

declare(strict_types=1);

namespace App\Modules\WebConnector\Http\Controllers;

use App\Modules\Settings\Services\SettingsResolver;
use App\Modules\Support\Models\Complaint;
use App\Modules\Support\Services\ComplaintRegistrar;
use App\Modules\WebConnector\Contracts\CaptchaVerifier;
use App\Modules\WebConnector\Models\WpSite;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Settings\SettingsReader;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\Rule;

/**
 * Libro de Reclamaciones público del sitio comercial (bloque `libro-reclamaciones`
 * del widget embebible, o reenvío del plugin). El token del sitio fija marca y
 * organización en el servidor; el consumidor es anónimo (sin cuenta).
 *
 * `store` registra la hoja (reclamo o queja) reutilizando ComplaintRegistrar y
 * devuelve la constancia (código + plazo), sin reflejar datos personales.
 * `status` permite al consumidor consultar el estado de su hoja por el código de
 * la constancia: solo estado y fechas, nunca datos personales.
 */
final class WpComplaintController
{
    public function __construct(
        private readonly ComplaintRegistrar $registrar,
        private readonly SettingsReader $settings,
        private readonly SettingsResolver $resolver,
        private readonly CaptchaVerifier $captcha,
    ) {}

    public function store(Request $request): JsonResponse
    {
        /** @var WpSite $site */
        $site = $request->attributes->get('wp_site');
        $brand = $site->brand ?? throw ProblemException::notFound();

        $ip = $this->visitorIp($request);
        $ipHash = hash_hmac('sha256', $ip, (string) config('app.key'));
        $limiterKey = 'wcn-complaint:'.$site->organization_id.':'.$ipHash;
        $siteKey = 'wcn-complaint-site:'.$site->organization_id;
        $max = max(1, $this->settings->int('web_connector.forms.submissions_per_ip_per_hour', 10));
        // X-Hub-Visitor-Ip es falsificable; un tope por sitio (10×) acota el abuso aunque se rote la IP.
        if (RateLimiter::tooManyAttempts($limiterKey, $max) || RateLimiter::tooManyAttempts($siteKey, $max * 10)) {
            $retry = max(RateLimiter::availableIn($limiterKey), RateLimiter::availableIn($siteKey));
            throw new ProblemException(429, 'rate_limited', 'Demasiados envíos desde esta conexión. Intenta de nuevo más tarde.', ['retry_after' => $retry], ['Retry-After' => (string) $retry]);
        }

        $data = $request->validate([
            'complaint_type' => ['required', Rule::in(['claim', 'grievance'])],
            'consumer_name' => ['required', 'string', 'min:2', 'max:255'],
            'consumer_document_type' => ['required', Rule::in(['dni', 'ce', 'passport', 'ruc'])],
            'consumer_document_number' => ['required', 'string', 'max:40'],
            'consumer_address' => ['required', 'string', 'max:1000'],
            'consumer_email' => ['required', 'string', 'email:rfc', 'max:255'],
            'consumer_phone' => ['nullable', 'string', 'max:50'],
            'is_minor' => ['sometimes', 'boolean'],
            'guardian_name' => ['required_if:is_minor,true', 'nullable', 'string', 'max:255'],
            'service_description' => ['required', 'string', 'max:1000'],
            'amount_minor' => ['nullable', 'integer', 'min:0'],
            'currency' => ['required_with:amount_minor', 'prohibited_without:amount_minor', 'nullable', Rule::in(['PEN', 'USD'])],
            'detail' => ['required', 'string', 'min:1', 'max:5000'],
            'consumer_request' => ['required', 'string', 'min:1', 'max:5000'],
            'website' => ['nullable', 'string', 'max:200'],
            'captcha_token' => ['nullable', 'string', 'max:4000'],
        ], [], [
            'complaint_type' => 'tipo', 'consumer_name' => 'nombre', 'consumer_document_type' => 'tipo de documento',
            'consumer_document_number' => 'número de documento', 'consumer_address' => 'dirección', 'consumer_email' => 'correo electrónico',
            'consumer_phone' => 'teléfono', 'guardian_name' => 'nombre del apoderado', 'service_description' => 'servicio contratado',
            'detail' => 'detalle', 'consumer_request' => 'pedido',
        ]);

        // Campo trampa: un bot lo rellena, una persona no (está oculto). No se revela.
        if (trim((string) ($data['website'] ?? '')) !== '') {
            throw ProblemException::validation(['detail' => ['No pudimos procesar la solicitud. Vuelve a intentarlo.']]);
        }

        // Captcha: gancho sin proveedor mientras D-24 siga abierta (enabled() = false → no bloquea).
        if ($this->captcha->enabled() && ! $this->captcha->verify($data['captcha_token'] ?? null, $ip)) {
            throw ProblemException::validation(['captcha_token' => ['No pudimos verificar que no eres un robot.']]);
        }

        // Idempotencia opcional por cabecera: un reenvío con la misma clave no abre otra hoja.
        $idempotency = trim((string) $request->header('Idempotency-Key', ''));
        if ($idempotency !== '' && ! preg_match('/^[A-Za-z0-9_.:-]{8,200}$/', $idempotency)) {
            throw ProblemException::validation(['Idempotency-Key' => ['Clave de idempotencia no válida.']]);
        }
        $cacheKey = $idempotency !== '' ? 'complaint-idem:'.$site->organization_id.':'.hash('sha256', $idempotency) : null;
        if ($cacheKey !== null && is_array($cached = Cache::get($cacheKey))) {
            return response()->json(['data' => $cached], 201);
        }

        RateLimiter::hit($limiterKey, 3600);
        RateLimiter::hit($siteKey, 3600);

        $attributes = [
            'wp_site_id' => $site->id,
            'complaint_type' => $data['complaint_type'],
            'consumer_name' => trim($data['consumer_name']),
            'consumer_document_type' => $data['consumer_document_type'],
            'consumer_document_number' => trim($data['consumer_document_number']),
            'consumer_address' => trim($data['consumer_address']),
            'consumer_email' => strtolower(trim($data['consumer_email'])),
            'consumer_phone' => $data['consumer_phone'] ?? null,
            'is_minor' => (bool) ($data['is_minor'] ?? false),
            'guardian_name' => $data['guardian_name'] ?? null,
            'customer_id' => null,
            'service_id' => null,
            'service_description' => trim($data['service_description']),
            'amount_minor' => $data['amount_minor'] ?? null,
            'currency' => $data['currency'] ?? null,
            'detail' => trim($data['detail']),
            'consumer_request' => trim($data['consumer_request']),
            'ip_hash' => $ipHash,
            'is_test' => false,
        ];

        $complaint = $this->registrar->register($brand, $attributes, $this->responseDays($site));

        // Constancia: solo lo que el consumidor necesita, sin reflejar sus datos personales.
        $payload = [
            'code' => $complaint->code,
            'number' => $complaint->number,
            'status' => $complaint->status,
            'received_at' => $complaint->received_at,
            'due_at' => $complaint->due_at,
            'message' => 'Hemos recibido tu '.($complaint->complaint_type === 'claim' ? 'reclamo' : 'queja')
                .'. Tu número de constancia es '.$complaint->code.'. Te responderemos dentro del plazo legal.',
        ];
        if ($cacheKey !== null) {
            Cache::put($cacheKey, $payload, now()->addDay());
        }

        return response()->json(['data' => $payload], 201);
    }

    /** Consulta pública del estado de una hoja por el código de la constancia (sin datos personales). */
    public function status(Request $request, string $code): JsonResponse
    {
        /** @var WpSite $site */
        $site = $request->attributes->get('wp_site');
        $complaint = Complaint::query()
            ->where('brand_id', $site->brand_id)
            ->where('code', strtoupper($code))
            ->first() ?? throw ProblemException::notFound();

        return response()->json(['data' => [
            'code' => $complaint->code,
            'status' => $complaint->status,
            'received_at' => $complaint->received_at,
            'due_at' => $complaint->due_at,
            'answered_at' => $complaint->answered_at,
        ]]);
    }

    /** Plazo de respuesta configurado para la marca; por defecto 15 (Ley 31435). */
    private function responseDays(WpSite $site): int
    {
        $configured = $this->resolver->get('complaints.response_days', ['brand' => $site->brand_id]);

        return is_numeric($configured) && (int) $configured > 0 && (int) $configured <= 365 ? (int) $configured : 15;
    }

    /** IP del visitante que reenvía el plugin; si no viene o no es válida, la del servidor. */
    private function visitorIp(Request $request): string
    {
        $header = trim((string) $request->header('X-Hub-Visitor-Ip', ''));

        return filter_var($header, FILTER_VALIDATE_IP) !== false ? $header : (string) $request->ip();
    }
}
