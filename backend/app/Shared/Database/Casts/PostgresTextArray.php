<?php

declare(strict_types=1);

namespace App\Shared\Database\Casts;

use Illuminate\Contracts\Database\Eloquent\CastsAttributes;
use Illuminate\Database\Eloquent\Model;
use InvalidArgumentException;

/** Convierte arreglos PHP al formato nativo de `text[]` de PostgreSQL. */
final class PostgresTextArray implements CastsAttributes
{
    public function get(Model $model, string $key, mixed $value, array $attributes): array
    {
        if ($value === null || $value === '{}') {
            return [];
        }

        // PostgreSQL devuelve el literal `{...}` al leer una columna text[].
        if (! is_string($value) || ! str_starts_with($value, '{') || ! str_ends_with($value, '}')) {
            return is_array($value) ? $value : [];
        }

        $body = substr($value, 1, -1);
        if ($body === '') {
            return [];
        }

        $items = [];
        $item = '';
        $quoted = false;
        $escaped = false;
        $wasQuoted = false;

        for ($i = 0, $length = strlen($body); $i < $length; $i++) {
            $char = $body[$i];
            if ($escaped) {
                $item .= $char;
                $escaped = false;
            } elseif ($char === '\\') {
                $escaped = true;
            } elseif ($char === '"') {
                $quoted = ! $quoted;
                $wasQuoted = true;
            } elseif ($char === ',' && ! $quoted) {
                $items[] = $wasQuoted ? $item : trim($item);
                $item = '';
                $wasQuoted = false;
            } else {
                $item .= $char;
            }
        }
        $items[] = $wasQuoted ? $item : trim($item);

        return $items;
    }

    public function set(Model $model, string $key, mixed $value, array $attributes): string
    {
        if (! is_array($value)) {
            throw new InvalidArgumentException("El atributo {$key} debe ser un arreglo.");
        }

        $items = array_map(static function (mixed $item): string {
            if (! is_string($item)) {
                throw new InvalidArgumentException('Los elementos de text[] deben ser cadenas.');
            }

            return '"'.str_replace(['\\', '"'], ['\\\\', '\\"'], $item).'"';
        }, array_values($value));

        return '{'.implode(',', $items).'}';
    }
}
