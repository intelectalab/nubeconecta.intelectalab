<?php

declare(strict_types=1);

namespace App\Shared\Settings;

use App\Shared\Organization\CurrentOrganization;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Lectura mínima de ajustes globales (tabla `settings`, scope_type = global) con
 * el valor por defecto de database/seeds/settings.json. El módulo Settings (M-CFG)
 * resolverá la herencia por marca, producto, cliente y contrato; hasta entonces
 * esta clase cubre los ajustes de nivel global (p. ej. security.*).
 */
final class SettingsReader
{
    /** @var array<string, mixed>|null */
    private static ?array $defaults = null;

    /** @var array<string, mixed> */
    private array $memo = [];

    public function __construct(private readonly CurrentOrganization $organization) {}

    public function get(string $key, mixed $fallback = null): mixed
    {
        if (array_key_exists($key, $this->memo)) {
            return $this->memo[$key];
        }

        $stored = DB::table('settings')
            ->where('organization_id', $this->organization->id())
            ->where('key', $key)
            ->where('scope_type', 'global')
            ->value('value');

        $value = $stored !== null ? json_decode((string) $stored, true) : (self::defaults()[$key] ?? $fallback);

        return $this->memo[$key] = $value;
    }

    public function int(string $key, int $fallback = 0): int
    {
        return (int) $this->get($key, $fallback);
    }

    public function bool(string $key, bool $fallback = false): bool
    {
        return (bool) $this->get($key, $fallback);
    }

    /** @return array<string, mixed> */
    private static function defaults(): array
    {
        if (self::$defaults !== null) {
            return self::$defaults;
        }

        $path = rtrim((string) config('hub.seeds_path'), '/\\').'/settings.json';
        if (! is_file($path)) {
            throw new RuntimeException("No se encontró {$path} (HUB_SEEDS_PATH).");
        }

        $data = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        $out = [];
        foreach ($data['settings'] as $setting) {
            $out[$setting['key']] = $setting['default'] ?? null;
        }

        return self::$defaults = $out;
    }
}
