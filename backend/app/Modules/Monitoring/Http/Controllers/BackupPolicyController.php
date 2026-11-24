<?php

declare(strict_types=1);

namespace App\Modules\Monitoring\Http\Controllers;

use App\Modules\Monitoring\Models\BackupPolicy;
use App\Shared\Http\Controllers\ResourceController;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * /api/v1/admin/backup-policies (monitoring.backup_policy.*): políticas de respaldo
 * por recurso/servicio (frecuencia, retención, RPO/RTO, responsable). Modo manual.
 */
final class BackupPolicyController extends ResourceController
{
    protected function model(): string
    {
        return BackupPolicy::class;
    }

    protected function entity(): string
    {
        return 'backup_policy';
    }

    protected function rules(Request $request, ?Model $model): array
    {
        $required = $model === null ? 'required' : 'sometimes';
        $org = app(CurrentOrganization::class)->id();

        return [
            'resource_id' => [$required, 'uuid', Rule::exists('resources', 'id')->where('organization_id', $org)],
            'service_id' => ['nullable', 'uuid', Rule::exists('services', 'id')->where('organization_id', $org)->whereNull('deleted_at')],
            'name' => [$required, 'string', 'max:160'],
            'responsibility' => ['sometimes', Rule::in(BackupPolicy::RESPONSIBILITIES)],
            'frequency' => [$required, Rule::in(BackupPolicy::FREQUENCIES)],
            'retention_days' => [$required, 'integer', 'min:1', 'max:3650'],
            'rpo_minutes' => ['nullable', 'integer', 'min:1'],
            'rto_minutes' => ['nullable', 'integer', 'min:1'],
            'encrypted' => ['sometimes', 'boolean'],
            'destination' => ['nullable', 'string', 'max:255'],
            'is_active' => ['sometimes', 'boolean'],
            'responsible_user_id' => ['nullable', 'uuid', Rule::exists('users', 'id')->where('organization_id', $org)->whereNull('deleted_at')],
        ];
    }

    protected function with(): array
    {
        return ['resource:id,name,type', 'service:id,label,code'];
    }

    protected function sortable(): array
    {
        return ['name', 'frequency', 'retention_days', 'created_at'];
    }

    protected function defaultSort(): string
    {
        return 'name';
    }

    protected function filters(): array
    {
        return ['resource_id', 'service_id', 'is_active', 'frequency', 'responsibility'];
    }

    protected function beforeDelete(Model $model): void
    {
        if ($model->runs()->exists()) {
            throw new ProblemException(409, 'has_dependents', 'La política tiene corridas registradas; desactívala en vez de eliminarla.');
        }
    }
}
