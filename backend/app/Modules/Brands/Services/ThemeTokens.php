<?php

declare(strict_types=1);

namespace App\Modules\Brands\Services;

use App\Modules\Settings\Services\SettingsResolver;
use App\Shared\Http\Problem\ProblemException;

/**
 * Tokens de diseño de un tema (RN-BRD-001 a 005): son declarativos. Se rechaza
 * (422) cualquier valor con CSS o URLs (`url(`, `expression(`, `@import`,
 * `javascript:`, `;`, llaves o `<>`), colores que no sean hex y tipografías
 * fuera de `brands.theme.allowed_fonts`. También mide el contraste WCAG 2.1
 * de los pares texto/fondo de config('hub.brands.theme.contrast_pairs').
 */
final class ThemeTokens
{
    private const FORBIDDEN = '/url\s*\(|expression\s*\(|@import|javascript:|[;{}<>\\\\]/i';

    private const HEX = '/^#([0-9a-f]{3}|[0-9a-f]{6})$/i';

    public function __construct(private readonly SettingsResolver $settings) {}

    /** @param mixed $tokens */
    public function validate(mixed $tokens): void
    {
        if (! is_array($tokens) || ($tokens !== [] && array_is_list($tokens))) {
            throw ProblemException::validation(['tokens' => [__('brands.tokens_object')]]);
        }
        $errors = [];
        $fonts = (array) $this->settings->get('brands.theme.allowed_fonts');
        $this->walk($tokens, 'tokens', 1, $fonts, $errors);
        if ($errors !== []) {
            throw ProblemException::validation($errors);
        }
    }

    /**
     * @param  array<string, mixed>  $tokens
     * @return array{report: list<array<string, mixed>>, lowest: ?float, min: float, missing: list<string>}
     */
    public function contrast(array $tokens): array
    {
        $config = config('hub.brands.theme');
        $report = [];
        $missing = [];
        foreach ($config['modes'] as $mode) {
            $colors = $tokens['colors'][$mode] ?? [];
            foreach ($config['contrast_pairs'] as [$fg, $bg]) {
                if (! isset($colors[$fg], $colors[$bg])) {
                    if (in_array([$fg, $bg], $config['required_pairs'], true)) {
                        $missing[] = "tokens.colors.{$mode}.{$fg}/{$bg}";
                    }

                    continue;
                }
                $report[] = [
                    'mode' => $mode,
                    'foreground' => $fg,
                    'background' => $bg,
                    'foreground_color' => $colors[$fg],
                    'background_color' => $colors[$bg],
                    'ratio' => self::floor2(self::ratio((string) $colors[$fg], (string) $colors[$bg])),
                ];
            }
        }
        $min = (float) $this->settings->get('brands.theme.min_contrast_ratio');
        foreach ($report as &$pair) {
            $pair['passes'] = $pair['ratio'] >= $min;
        }
        unset($pair);
        $lowest = $missing === [] && $report !== [] ? min(array_column($report, 'ratio')) : null;

        return ['report' => $report, 'lowest' => $lowest, 'min' => $min, 'missing' => $missing];
    }

    /** Relación de contraste WCAG 2.1 entre dos colores hex. */
    public static function ratio(string $a, string $b): float
    {
        [$l1, $l2] = [self::luminance($a), self::luminance($b)];

        return (max($l1, $l2) + 0.05) / (min($l1, $l2) + 0.05);
    }

    private static function luminance(string $hex): float
    {
        $hex = ltrim($hex, '#');
        if (strlen($hex) === 3) {
            $hex = $hex[0].$hex[0].$hex[1].$hex[1].$hex[2].$hex[2];
        }
        $channels = array_map(static function (string $pair): float {
            $c = hexdec($pair) / 255;

            return $c <= 0.04045 ? $c / 12.92 : (($c + 0.055) / 1.055) ** 2.4;
        }, str_split($hex, 2));

        return 0.2126 * $channels[0] + 0.7152 * $channels[1] + 0.0722 * $channels[2];
    }

    /** Redondeo hacia abajo a 2 decimales: nunca se aprueba un par que no llega al mínimo. */
    private static function floor2(float $value): float
    {
        return floor($value * 100) / 100;
    }

    /**
     * @param  array<mixed>  $node
     * @param  list<string>  $fonts
     * @param  array<string, list<string>>  $errors
     */
    private function walk(array $node, string $path, int $depth, array $fonts, array &$errors): void
    {
        if ($depth > (int) config('hub.brands.theme.max_depth')) {
            $errors[$path][] = __('brands.tokens_too_deep');

            return;
        }
        foreach ($node as $key => $value) {
            $here = "{$path}.{$key}";
            if (! is_string($key) || ! preg_match('/^[a-z][a-z0-9_]{0,63}$/', $key)) {
                $errors[$here][] = __('brands.token_name');

                continue;
            }
            if (is_array($value)) {
                $this->walk($value, $here, $depth + 1, $fonts, $errors);

                continue;
            }
            if (! is_string($value) && ! is_int($value) && ! is_float($value) && ! is_bool($value)) {
                $errors[$here][] = __('brands.token_scalar');

                continue;
            }
            if (is_string($value) && preg_match(self::FORBIDDEN, $value)) {
                $errors[$here][] = __('brands.token_forbidden');
            } elseif (str_starts_with($path, 'tokens.colors.') && ! (is_string($value) && preg_match(self::HEX, $value))) {
                $errors[$here][] = __('brands.token_color');
            } elseif (preg_match('/(^|_)font(_family)?$/', $key) && ! in_array($value, $fonts, true)) {
                $errors[$here][] = __('brands.token_font', ['fonts' => implode(', ', $fonts)]);
            }
        }
    }
}
