<?php

declare(strict_types=1);

namespace App\Modules\WebConnector\Casts;

use Illuminate\Contracts\Database\Eloquent\CastsAttributes;
use Illuminate\Database\Eloquent\Model;

/** Columna `text[]` de PostgreSQL como lista de cadenas de PHP. */
final class PgTextArray implements CastsAttributes
{
    /** @return list<string> */
    public function get(Model $model, string $key, mixed $value, array $attributes): array
    {
        return self::parse($value);
    }

    public function set(Model $model, string $key, mixed $value, array $attributes): string
    {
        return self::literal((array) ($value ?? []));
    }

    /** @return list<string> */
    public static function parse(mixed $value): array
    {
        if (! is_string($value) || $value === '' || $value === '{}') {
            return [];
        }

        return array_values(array_map('strval', str_getcsv(substr($value, 1, -1), ',', '"', '\\')));
    }

    /** @param array<int, mixed> $values */
    public static function literal(array $values): string
    {
        return '{'.implode(',', array_map(static fn ($v): string => '"'.str_replace(['\\', '"'], ['\\\\', '\\"'], (string) $v).'"', array_values($values))).'}';
    }
}
