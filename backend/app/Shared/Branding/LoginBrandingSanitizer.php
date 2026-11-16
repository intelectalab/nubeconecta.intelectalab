<?php

declare(strict_types=1);

namespace App\Shared\Branding;

/**
 * Normaliza y sanea el branding del login del portal antes de exponerlo en el
 * endpoint público pre-login (sin autenticación → superficie XSS alta).
 *
 * Es el único límite de confianza: el valor se guarda como ajuste global
 * `portal.login_branding` (editable por staff con settings.setting.update), pero
 * cualquier texto se entrega SIN etiquetas HTML, los colores solo si son #rrggbb
 * y el logo solo si es una URL http(s). Lo inválido cae al valor por defecto.
 */
final class LoginBrandingSanitizer
{
    /** Íconos válidos del set @hub/ui (cualquier otro cae a 'shield'). */
    private const ICONS = [
        'activity', 'archive', 'bell', 'browser', 'building', 'card', 'chart', 'check',
        'clock', 'cloud', 'contract', 'database', 'file', 'funnel', 'globe', 'home',
        'key', 'lock', 'mail', 'receipt', 'refresh', 'restore', 'search', 'server',
        'shield', 'sliders', 'user', 'users', 'wallet',
    ];

    /** Contenido por defecto (espejo del `default` de portal.login_branding en settings.json). */
    public const DEFAULTS = [
        'brand_name' => 'NubeConecta',
        'logo_url' => null,
        'hero_title' => 'Tu infraestructura en la nube, dominios y finanzas bajo control',
        'hero_subtitle' => 'Portal seguro para clientes corporativos de NubeConecta. Supervisa tus servidores, renueva dominios, paga facturas con comprobantes SUNAT y contacta a la guardia técnica 24/7.',
        'bullets' => [
            ['icon' => 'shield', 'title' => 'Doble factor (TOTP)', 'text' => 'Recomendado: compatible con Google y Microsoft Authenticator.'],
            ['icon' => 'card', 'title' => 'Pasarela de Pagos Cifrada', 'text' => 'Cancela en soles (PEN) o dólares (USD) con tarjeta, PayPal o transferencia BCP/BBVA.'],
            ['icon' => 'restore', 'title' => 'Respaldos Diarios Automatizados', 'text' => 'Historial de 14 a 30 días con restauración asistida sin recargo adicional.'],
        ],
        'footer_line1' => 'NubeConecta · GRUPO DE SOLUCIONES CREATIVAS · RUC 20607431117',
        'footer_line2' => 'Soporte NOC: guardia@nubeconecta.pe',
        'colors' => ['bg_from' => null, 'bg_mid' => null, 'bg_to' => null, 'accent' => null],
    ];

    /**
     * @param  mixed  $raw  valor crudo del ajuste (array esperado; cualquier otra cosa → defaults)
     * @return array<string, mixed>
     */
    public function sanitize(mixed $raw): array
    {
        $in = is_array($raw) ? $raw : [];
        $d = self::DEFAULTS;

        return [
            'brand_name' => $this->text($in['brand_name'] ?? null, 60) ?? $d['brand_name'],
            'logo_url' => $this->url($in['logo_url'] ?? null),
            'hero_title' => $this->text($in['hero_title'] ?? null, 120) ?? $d['hero_title'],
            'hero_subtitle' => $this->text($in['hero_subtitle'] ?? null, 400) ?? $d['hero_subtitle'],
            'bullets' => $this->bullets($in['bullets'] ?? null) ?? $d['bullets'],
            'footer_line1' => $this->text($in['footer_line1'] ?? null, 160) ?? $d['footer_line1'],
            'footer_line2' => $this->text($in['footer_line2'] ?? null, 160) ?? $d['footer_line2'],
            'colors' => [
                'bg_from' => $this->color($in['colors']['bg_from'] ?? null),
                'bg_mid' => $this->color($in['colors']['bg_mid'] ?? null),
                'bg_to' => $this->color($in['colors']['bg_to'] ?? null),
                'accent' => $this->color($in['colors']['accent'] ?? null),
            ],
        ];
    }

    /** Texto plano sin etiquetas; null si queda vacío (el llamador decide el fallback). */
    private function text(mixed $value, int $max): ?string
    {
        if (! is_string($value)) {
            return null;
        }
        // Acota el input ANTES de la regex: evita trabajo O(n²) sobre un valor enorme
        // guardado a propósito (la salida se recorta igual al final con mb_substr).
        $value = mb_substr($value, 0, 4096);
        // strip_tags conserva el texto interno de las etiquetas: elimina primero los
        // bloques con contenido ejecutable (script/style/…) antes de quitar el resto.
        $value = preg_replace('#<(script|style|iframe|object|embed|template)\b[^>]*>.*?</\1>#is', '', $value) ?? '';
        $clean = trim(preg_replace('/\s+/', ' ', strip_tags($value)) ?? '');

        return $clean === '' ? null : mb_substr($clean, 0, $max);
    }

    /** Solo URL absoluta http(s); cualquier otro esquema (javascript:, data:…) → null. */
    private function url(mixed $value): ?string
    {
        if (! is_string($value) || mb_strlen($value) > 500) {
            return null;
        }
        $value = trim($value);
        $scheme = strtolower((string) parse_url($value, PHP_URL_SCHEME));

        return in_array($scheme, ['http', 'https'], true) && filter_var($value, FILTER_VALIDATE_URL) !== false ? $value : null;
    }

    /** Color hex #rrggbb (normalizado a minúsculas); cualquier otra cosa → null. */
    private function color(mixed $value): ?string
    {
        return is_string($value) && preg_match('/^#[0-9a-fA-F]{6}$/', $value) === 1 ? strtolower($value) : null;
    }

    /**
     * @return list<array{icon: string, title: string, text: string}>|null
     */
    private function bullets(mixed $value): ?array
    {
        if (! is_array($value)) {
            return null;
        }
        $out = [];
        foreach (array_slice(array_values($value), 0, 4) as $item) {
            if (! is_array($item)) {
                continue;
            }
            $title = $this->text($item['title'] ?? null, 60);
            if ($title === null) {
                continue;
            }
            $icon = is_string($item['icon'] ?? null) && in_array($item['icon'], self::ICONS, true) ? $item['icon'] : 'shield';
            $out[] = ['icon' => $icon, 'title' => $title, 'text' => $this->text($item['text'] ?? null, 200) ?? ''];
        }

        return $out === [] ? null : $out;
    }
}
