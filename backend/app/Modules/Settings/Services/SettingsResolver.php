<?php

declare(strict_types=1);

namespace App\Modules\Settings\Services;

use App\Shared\Organization\CurrentOrganization;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

/**
 * Resuelve el valor vigente de un ajuste para un contexto (M-CFG §4.8):
 * recorre contrato → cliente → producto → marca → global (scope_order de
 * settings.json), solo por los niveles que la clave admite, y gana el más
 * específico. Sin fila guardada devuelve el valor por defecto del catálogo
 * (origen `default`) o, si la clave está pendiente de definición y no tiene
 * valor, null con origen `undefined`.
 *
 * Uso: app(SettingsResolver::class)->get('billing.invoice_generation_days', ['customer' => $id]).
 */
final class SettingsResolver
{
    public function __construct(
        private readonly SettingsCatalog $catalog,
        private readonly CurrentOrganization $organization,
    ) {}

    /** @param array<string, string|null> $context brand|product|customer|contract => uuid */
    public function get(string $key, array $context = []): mixed
    {
        return $this->resolve($key, $context)['value'];
    }

    /**
     * @param  array<string, string|null>  $context
     * @return array{key: string, value: mixed, source: string, scope_id: ?string, setting_id: ?string, version: ?int, requires_definition: bool}
     */
    public function resolve(string $key, array $context = []): array
    {
        $definition = $this->catalog->find($key) ?? throw new InvalidArgumentException("Ajuste desconocido: {$key}");
        $levels = array_values(array_filter($this->catalog->scopeOrder(), fn (string $scope): bool => in_array($scope, $definition['levels'], true)));

        $rows = DB::table('settings')
            ->where('organization_id', $this->organization->id())
            ->where('key', $key)
            ->where(function ($q) use ($levels, $context): void {
                foreach ($levels as $scope) {
                    if ($scope === 'global') {
                        $q->orWhere('scope_type', 'global');
                    } elseif (! empty($context[$scope])) {
                        $q->orWhere(fn ($w) => $w->where('scope_type', $scope)->where('scope_id', $context[$scope]));
                    }
                }
            })
            ->get(['id', 'scope_type', 'scope_id', 'value', 'version'])
            ->keyBy('scope_type');

        foreach ($levels as $scope) {
            if ($row = $rows->get($scope)) {
                return [
                    'key' => $key,
                    'value' => json_decode((string) $row->value, true),
                    'source' => $scope,
                    'scope_id' => $row->scope_id,
                    'setting_id' => $row->id,
                    'version' => (int) $row->version,
                    'requires_definition' => (bool) $definition['requires_definition'],
                ];
            }
        }

        $default = $definition['default'] ?? null;

        return [
            'key' => $key,
            'value' => $default,
            'source' => $default === null && $definition['requires_definition'] ? 'undefined' : 'default',
            'scope_id' => null,
            'setting_id' => null,
            'version' => null,
            'requires_definition' => (bool) $definition['requires_definition'],
        ];
    }

    /**
     * Valores globales vigentes de todo el catálogo en una sola consulta.
     *
     * @return array<string, array{value: mixed, source: string, version: ?int}>
     */
    public function globals(): array
    {
        $stored = DB::table('settings')
            ->where('organization_id', $this->organization->id())
            ->where('scope_type', 'global')
            ->get(['key', 'value', 'version'])
            ->keyBy('key');

        $out = [];
        foreach ($this->catalog->all() as $key => $definition) {
            $row = $stored->get($key);
            $default = $definition['default'] ?? null;
            $out[$key] = $row !== null
                ? ['value' => json_decode((string) $row->value, true), 'source' => 'global', 'version' => (int) $row->version]
                : ['value' => $default, 'source' => $default === null && $definition['requires_definition'] ? 'undefined' : 'default', 'version' => null];
        }

        return $out;
    }
}
