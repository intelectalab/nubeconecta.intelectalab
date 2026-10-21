<?php

declare(strict_types=1);

namespace App\Modules\Settings\Services;

use RuntimeException;

/**
 * Catálogo de ajustes administrables: database/seeds/settings.json (docs/09).
 * Define por clave el tipo, el valor por defecto, los niveles admitidos y el
 * permiso de edición. Se carga una vez por proceso.
 */
final class SettingsCatalog
{
    public const SCOPES = ['global', 'brand', 'product', 'customer', 'contract'];

    /** @var array{scope_order: list<string>, settings: array<string, array<string, mixed>>}|null */
    private static ?array $data = null;

    /** @return array<string, array<string, mixed>> */
    public function all(): array
    {
        return self::load()['settings'];
    }

    /** @return array<string, mixed>|null */
    public function find(string $key): ?array
    {
        return self::load()['settings'][$key] ?? null;
    }

    /** Orden de resolución, del más específico al general (contract → … → global). @return list<string> */
    public function scopeOrder(): array
    {
        return self::load()['scope_order'];
    }

    public static function flush(): void
    {
        self::$data = null;
    }

    /** @return array{scope_order: list<string>, settings: array<string, array<string, mixed>>} */
    private static function load(): array
    {
        if (self::$data !== null) {
            return self::$data;
        }

        $path = rtrim((string) config('hub.seeds_path'), '/\\').'/settings.json';
        if (! is_file($path)) {
            throw new RuntimeException("No se encontró {$path} (HUB_SEEDS_PATH).");
        }
        $raw = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);

        $settings = [];
        foreach ($raw['settings'] as $definition) {
            $settings[$definition['key']] = $definition;
        }
        $order = $raw['scope_order'] ?? ['contract', 'customer', 'product', 'brand', 'global'];
        if (array_diff($order, self::SCOPES) !== [] || end($order) !== 'global') {
            throw new RuntimeException('settings.json: scope_order inválido.');
        }

        return self::$data = ['scope_order' => array_values($order), 'settings' => $settings];
    }
}
