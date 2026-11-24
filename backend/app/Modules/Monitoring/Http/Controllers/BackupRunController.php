<?php

declare(strict_types=1);

namespace App\Modules\Monitoring\Http\Controllers;

use App\Modules\Monitoring\Http\Resources\BackupRunResource;
use App\Modules\Monitoring\Models\BackupPolicy;
use App\Modules\Monitoring\Models\BackupRun;
use App\Shared\Audit\AuditLogger;
use App\Shared\Organization\CurrentOrganization;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * /api/v1/admin/backup-runs (monitoring.backup_run.*): corridas de respaldo de
 * cada política. En modo manual se registran a mano (éxito/fallo/parcial, tamaño);
 * con API de la herramienta del nodo se leerían automáticamente (fase posterior).
 */
final class BackupRunController
{
    public function __construct(private readonly AuditLogger $audit) {}

    public function index(Request $request): JsonResponse
    {
        $query = BackupRun::query()->with('policy:id,name');
        if (is_string($p = $request->input('filter.backup_policy_id')) && $p !== '') {
            $query->where('backup_policy_id', $p);
        }
        if (is_string($s = $request->input('filter.status')) && $s !== '') {
            $query->where('status', $s);
        }

        return CursorPagination::respond($query, $request, ['started_at', 'status', 'created_at'], BackupRunResource::class, '-started_at');
    }

    public function store(Request $request): JsonResponse
    {
        $org = app(CurrentOrganization::class)->id();
        $data = $request->validate([
            'backup_policy_id' => ['required', 'uuid', Rule::exists('backup_policies', 'id')->where('organization_id', $org)],
            'status' => ['required', Rule::in(BackupRun::STATUSES)],
            'started_at' => ['required', 'date'],
            'finished_at' => ['nullable', 'date', 'after_or_equal:started_at'],
            'size_bytes' => ['nullable', 'integer', 'min:0'],
            'location' => ['nullable', 'string', 'max:255'],
            'error' => ['nullable', 'string', 'max:2000'],
        ]);
        // Reglas de negocio: una corrida terminada necesita fin; una fallida/parcial, el detalle del error.
        if ($data['status'] !== 'running' && empty($data['finished_at'])) {
            throw ValidationException::withMessages(['finished_at' => ['Una corrida terminada necesita la hora de fin.']]);
        }
        if (in_array($data['status'], ['failed', 'partial'], true) && empty($data['error'])) {
            throw ValidationException::withMessages(['error' => ['Indica el detalle del fallo.']]);
        }

        $run = DB::transaction(function () use ($data): BackupRun {
            $run = new BackupRun;
            $run->forceFill($data)->save();
            $this->audit->record('backup_run.created', 'backup_run', $run->id, null, $run->attributesToArray(), ['status' => $run->status]);

            return $run;
        });

        return (new BackupRunResource($run->load('policy:id,name')))->response()->setStatusCode(201);
    }
}
