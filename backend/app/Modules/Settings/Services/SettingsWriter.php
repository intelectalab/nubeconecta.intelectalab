<?php

declare(strict_types=1);

namespace App\Modules\Settings\Services;

use App\Modules\Settings\Events\SettingChanged;
use App\Modules\Settings\Models\Setting;
use App\Modules\Settings\Models\SettingChange;
use App\Shared\Audit\AuditLogger;
use App\Shared\Authorization\PermissionGate;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Escritura de ajustes por nivel (M-CFG §4.2-4.3, §5): valida que la clave
 * admita el nivel (422), el tipo del valor (422) y el permiso de edición de
 * la clave (`edit_permission`: settings.setting.update o settings.dunning.update,
 * 403). Cada cambio deja una fila en setting_changes, un evento de auditoría
 * y emite SettingChanged al confirmar la transacción.
 */
final class SettingsWriter
{
    /** Tabla de la entidad de cada nivel no global. */
    private const SCOPE_TABLES = ['brand' => 'brands', 'product' => 'products', 'customer' => 'customers', 'contract' => 'contracts'];

    public function __construct(
        private readonly SettingsCatalog $catalog,
        private readonly AuditLogger $audit,
        private readonly PermissionGate $gate,
        private readonly CurrentOrganization $organization,
    ) {}

    /** @return array<string, mixed> */
    public function definition(string $key): array
    {
        return $this->catalog->find($key) ?? throw ProblemException::notFound();
    }

    public function authorize(Request $request, string $key): void
    {
        // Mismo chequeo que el middleware: MFA obligatorio, permiso y MFA reciente si es sensible.
        $this->gate->check($request, (string) $this->definition($key)['edit_permission']);
    }

    /** Fija el valor de la clave en un nivel. Si ya hay valor en ese nivel exige `version`. */
    public function put(string $key, string $scopeType, ?string $scopeId, mixed $value, mixed $version = null, ?string $reason = null, ?string $revertsChangeId = null): SettingChange
    {
        $definition = $this->definition($key);
        $this->assertScope($definition, $scopeType, $scopeId);
        $this->assertValue($definition, $value);

        return DB::transaction(function () use ($key, $scopeType, $scopeId, $value, $version, $reason, $revertsChangeId): SettingChange {
            $setting = $this->locate($key, $scopeType, $scopeId);
            $old = null;
            if ($setting !== null) {
                $this->assertVersion($setting, $version);
                $old = $setting->value;
                $setting->value = $value;
                $setting->save();
            } else {
                $setting = Setting::query()->create(['key' => $key, 'scope_type' => $scopeType, 'scope_id' => $scopeId, 'value' => $value]);
            }

            return $this->record($setting->id, $key, $scopeType, $scopeId, $old, $value, $reason, $revertsChangeId);
        });
    }

    /** Quita el valor de un nivel: vuelve a heredar del siguiente (o del valor por defecto si es global). */
    public function remove(string $key, string $scopeType, ?string $scopeId, mixed $version, ?string $reason = null, ?string $revertsChangeId = null): SettingChange
    {
        $definition = $this->definition($key);
        $this->assertScope($definition, $scopeType, $scopeId, checkEntity: false);

        return DB::transaction(function () use ($key, $scopeType, $scopeId, $version, $reason, $revertsChangeId): SettingChange {
            $setting = $this->locate($key, $scopeType, $scopeId) ?? throw ProblemException::notFound();
            $this->assertVersion($setting, $version);
            $old = $setting->value;
            $setting->delete();

            return $this->record(null, $key, $scopeType, $scopeId, $old, null, $reason, $revertsChangeId);
        });
    }

    /** Revierte un cambio: deja el valor anterior de ese cambio y crea un cambio nuevo que lo referencia. */
    public function revert(SettingChange $change, ?string $reason = null): SettingChange
    {
        return DB::transaction(function () use ($change, $reason): SettingChange {
            $current = $this->locate($change->key, $change->scope_type, $change->scope_id);
            if ($change->old_value === null) {
                if ($current === null) {
                    throw new ProblemException(409, 'conflict', 'El nivel ya no tiene valor propio; no hay nada que revertir.');
                }

                return $this->remove($change->key, $change->scope_type, $change->scope_id, $current->version, $reason, $change->id);
            }

            return $this->put($change->key, $change->scope_type, $change->scope_id, $change->old_value, $current?->version, $reason, $change->id);
        });
    }

    private function locate(string $key, string $scopeType, ?string $scopeId): ?Setting
    {
        $query = Setting::query()->where('key', $key)->where('scope_type', $scopeType);
        $scopeId === null ? $query->whereNull('scope_id') : $query->where('scope_id', $scopeId);

        return $query->lockForUpdate()->first();
    }

    private function assertVersion(Setting $setting, mixed $version): void
    {
        if (! is_int($version) && ! (is_string($version) && ctype_digit($version))) {
            throw ProblemException::validation(['version' => [__('validation.required', ['attribute' => 'version'])]]);
        }
        if ((int) $version !== $setting->version) {
            throw ProblemException::versionConflict($setting->version);
        }
    }

    private function record(?string $settingId, string $key, string $scopeType, ?string $scopeId, mixed $old, mixed $new, ?string $reason, ?string $revertsChangeId): SettingChange
    {
        $change = new SettingChange;
        $change->forceFill([
            'id' => (string) Str::uuid7(),
            'setting_id' => $settingId,
            'key' => $key,
            'scope_type' => $scopeType,
            'scope_id' => $scopeId,
            'old_value' => $old,
            'new_value' => $new,
            'reason' => $reason,
            'reverts_change_id' => $revertsChangeId,
            'created_by' => auth()->id(),
        ])->save();

        $this->audit->record(
            $revertsChangeId === null ? 'setting.changed' : 'setting.reverted',
            'setting',
            $settingId,
            ['key' => $key, 'scope_type' => $scopeType, 'scope_id' => $scopeId, 'value' => $old],
            ['key' => $key, 'scope_type' => $scopeType, 'scope_id' => $scopeId, 'value' => $new],
            ['setting_change_id' => $change->id, 'reason' => $reason, 'reverts_change_id' => $revertsChangeId],
        );
        SettingChanged::dispatch($this->organization->id(), $key, $scopeType, $scopeId, $old, $new, $change->id);

        return $change;
    }

    /** @param array<string, mixed> $definition */
    private function assertScope(array $definition, string $scopeType, ?string $scopeId, bool $checkEntity = true): void
    {
        if (! in_array($scopeType, $definition['levels'], true)) {
            throw ProblemException::validation(['scope_type' => [__('settings.level_not_allowed', ['levels' => implode(', ', $definition['levels'])])]]);
        }
        if ($scopeType === 'global') {
            if ($scopeId !== null) {
                throw ProblemException::validation(['scope_id' => [__('validation.prohibited', ['attribute' => 'scope_id'])]]);
            }

            return;
        }
        if ($scopeId === null || ! Str::isUuid($scopeId)) {
            throw ProblemException::validation(['scope_id' => [__('validation.uuid', ['attribute' => 'scope_id'])]]);
        }
        if ($checkEntity && ! DB::table(self::SCOPE_TABLES[$scopeType])->where('organization_id', $this->organization->id())->where('id', $scopeId)->exists()) {
            throw ProblemException::validation(['scope_id' => [__('validation.exists', ['attribute' => 'scope_id'])]]);
        }
    }

    /** @param array<string, mixed> $definition */
    private function assertValue(array $definition, mixed $value): void
    {
        $ok = match ($definition['type']) {
            'integer' => is_int($value),
            'decimal' => is_int($value) || is_float($value),
            'boolean' => is_bool($value),
            'string' => is_string($value),
            'enum' => is_string($value) && in_array($value, $definition['enum_values'] ?? [], true),
            'list' => is_array($value) && array_is_list($value),
            'json' => is_array($value),
            default => false,
        };
        if (! $ok) {
            throw ProblemException::validation(['value' => [__('settings.invalid_value', ['type' => $definition['type']])]]);
        }
    }
}
