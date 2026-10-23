<?php

declare(strict_types=1);

namespace App\Modules\Customers\Support;

/**
 * Validación del documento según tipo y país (M-CUS §2 y §5).
 *
 * - `ruc` (Perú): 11 dígitos, prefijo 10/15/16/17/20 y dígito verificador
 *   módulo 11 con pesos 5,4,3,2,7,6,5,4,3,2 (resto 10 → 0, 11 → 1).
 * - `dni` (Perú): 8 dígitos.  `ce`: carné de extranjería, 9 a 12 alfanuméricos.
 * - `passport`: 6 a 12 alfanuméricos.
 * - `foreign_tax_id`: NIF de España y RFC de México con su formato; otros
 *   países, 3 a 30 caracteres [A-Z0-9-].  `other`: 1 a 30 caracteres.
 *
 * RUC y DNI exigen país PE (regla mínima elegida: la doc no la detalla).
 */
final class TaxIdValidator
{
    public const TYPES = ['ruc', 'dni', 'ce', 'passport', 'foreign_tax_id', 'other'];

    /** Normaliza: mayúsculas, sin espacios, puntos ni guiones (salvo `foreign_tax_id`/`other`, que conservan guiones). */
    public static function normalize(string $type, string $value): string
    {
        $value = strtoupper(trim($value));

        return in_array($type, ['foreign_tax_id', 'other'], true)
            ? (string) preg_replace('/[\s.]+/', '', $value)
            : (string) preg_replace('/[\s.\-]+/', '', $value);
    }

    /** Mensaje de error en español o null si es válido. */
    public static function error(string $type, string $value, ?string $country): ?string
    {
        $country = strtoupper((string) $country);
        if (in_array($type, ['ruc', 'dni'], true) && $country !== '' && $country !== 'PE') {
            return 'El RUC y el DNI solo aplican a clientes de Perú.';
        }

        return match ($type) {
            'ruc' => self::isValidRuc($value) ? null : 'El RUC no es válido (11 dígitos y dígito verificador).',
            'dni' => preg_match('/^\d{8}$/', $value) === 1 ? null : 'El DNI debe tener 8 dígitos.',
            'ce' => preg_match('/^[A-Z0-9]{9,12}$/', $value) === 1 ? null : 'El carné de extranjería debe tener de 9 a 12 caracteres alfanuméricos.',
            'passport' => preg_match('/^[A-Z0-9]{6,12}$/', $value) === 1 ? null : 'El pasaporte debe tener de 6 a 12 caracteres alfanuméricos.',
            'foreign_tax_id' => self::foreignError($value, $country),
            'other' => preg_match('/^[A-Z0-9\-\/]{1,30}$/', $value) === 1 ? null : 'Documento inválido.',
            default => 'Tipo de documento desconocido.',
        };
    }

    public static function isValidRuc(string $ruc): bool
    {
        if (preg_match('/^(10|15|16|17|20)\d{9}$/', $ruc) !== 1) {
            return false;
        }
        $weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
        $sum = 0;
        foreach ($weights as $i => $w) {
            $sum += ((int) $ruc[$i]) * $w;
        }
        $check = 11 - ($sum % 11);
        $check = $check === 10 ? 0 : ($check === 11 ? 1 : $check);

        return $check === (int) $ruc[10];
    }

    private static function foreignError(string $value, string $country): ?string
    {
        return match ($country) {
            'ES' => preg_match('/^([0-9]{8}[A-Z]|[XYZ][0-9]{7}[A-Z]|[A-HJNP-SUVW][0-9]{7}[0-9A-J])$/', $value) === 1 ? null : 'El NIF no tiene un formato válido.',
            'MX' => preg_match('/^[A-Z&Ñ]{3,4}[0-9]{6}[A-Z0-9]{3}$/u', $value) === 1 ? null : 'El RFC no tiene un formato válido.',
            default => preg_match('/^[A-Z0-9\-]{3,30}$/', $value) === 1 ? null : 'El identificador fiscal extranjero debe tener de 3 a 30 caracteres.',
        };
    }
}
