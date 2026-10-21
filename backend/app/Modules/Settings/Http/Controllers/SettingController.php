<?php

declare(strict_types=1);

namespace App\Modules\Settings\Http\Controllers;

use App\Modules\Settings\Models\Setting;
use App\Modules\Settings\Services\SettingsCatalog;
use App\Modules\Settings\Services\SettingsResolver;
use App\Modules\Settings\Services\SettingsWriter;
use App\Shared\Http\Resources\ModelResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * /api/v1/admin/settings: catálogo con el valor general vigente, detalle con
 * sobrescrituras, resolución para un contexto (resolveSetting) y escritura por
 * nivel (putSetting / deleteSetting). Lectura: settings.setting.view; la escritura
 * exige el permiso de edición de la clave (settings.setting.update o settings.dunning.update).
 */
final class SettingController
{
    public function __construct(
        private readonly SettingsCatalog $catalog,
        private readonly SettingsResolver $resolver,
        private readonly SettingsWriter $writer,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $group = $request->input('filter.group');
        $prefix = $request->input('filter.key');
        $pending = $request->input('filter.requires_definition');
        $globals = $this->resolver->globals();

        $data = [];
        foreach ($this->catalog->all() as $key => $definition) {
            if (($group !== null && $definition['group'] !== $group)
                || (is_string($prefix) && $prefix !== '' && ! str_starts_with($key, $prefix))
                || ($pending !== null && filter_var($pending, FILTER_VALIDATE_BOOL) !== (bool) $definition['requires_definition'])) {
                continue;
            }
            $data[] = $this->present($definition) + ['effective' => $globals[$key]];
        }

        return response()->json(['data' => $data, 'meta' => ['total' => count($data)]]);
    }

    public function show(string $key): JsonResponse
    {
        $definition = $this->writer->definition($key);
        $overrides = Setting::query()->where('key', $key)->orderByRaw("array_position(array['global','brand','product','customer','contract'], scope_type)")->orderBy('created_at')->get();

        return response()->json(['data' => $this->present($definition) + [
            'effective' => $this->resolver->resolve($key),
            'values' => ModelResource::collection($overrides)->resolve(),
        ]]);
    }

    public function resolve(Request $request, string $key): JsonResponse
    {
        $this->writer->definition($key);
        $context = $request->validate([
            'brand_id' => ['sometimes', 'uuid'],
            'product_id' => ['sometimes', 'uuid'],
            'customer_id' => ['sometimes', 'uuid'],
            'contract_id' => ['sometimes', 'uuid'],
        ]);
        $scopes = [];
        foreach ($context as $field => $id) {
            $scopes[substr($field, 0, -3)] = $id;
        }

        return response()->json(['data' => $this->resolver->resolve($key, $scopes)]);
    }

    public function put(Request $request, string $key): JsonResponse
    {
        $this->writer->authorize($request, $key);
        $data = $request->validate([
            'scope_type' => ['required', Rule::in(SettingsCatalog::SCOPES)],
            'scope_id' => ['nullable', 'string'],
            'value' => ['present'],
            'version' => ['nullable', 'integer'],
            'reason' => ['nullable', 'string', 'max:2000'],
        ]);
        $change = $this->writer->put($key, $data['scope_type'], $data['scope_id'] ?? null, $request->json('value'), $data['version'] ?? null, $data['reason'] ?? null);

        return response()->json(['data' => $this->resolver->resolve($key, $data['scope_type'] === 'global' ? [] : [$data['scope_type'] => $data['scope_id']]) + ['change_id' => $change->id]]);
    }

    public function destroy(Request $request, string $key): JsonResponse
    {
        $this->writer->authorize($request, $key);
        $data = $request->validate([
            'scope_type' => ['required', Rule::in(SettingsCatalog::SCOPES)],
            'scope_id' => ['nullable', 'string'],
            'version' => ['required', 'integer'],
            'reason' => ['nullable', 'string', 'max:2000'],
        ]);
        $change = $this->writer->remove($key, $data['scope_type'], $data['scope_id'] ?? null, (int) $data['version'], $data['reason'] ?? null);

        return response()->json(['data' => ['change_id' => $change->id]]);
    }

    /** @param array<string, mixed> $definition */
    private function present(array $definition): array
    {
        return [
            'key' => $definition['key'],
            'group' => $definition['group'],
            'description' => $definition['description'],
            'type' => $definition['type'],
            'unit' => $definition['unit'] ?? null,
            'enum_values' => $definition['enum_values'] ?? null,
            'default' => $definition['default'] ?? null,
            'requires_definition' => (bool) $definition['requires_definition'],
            'levels' => $definition['levels'],
            'edit_permission' => $definition['edit_permission'],
            'notes' => $definition['notes'] ?? null,
        ];
    }
}
