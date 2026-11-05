<?php

declare(strict_types=1);

namespace App\Modules\Monitoring\Services;

use App\Modules\Monitoring\Models\Incident;
use App\Shared\Audit\AuditLogger;
use App\Shared\Concurrency\VersionGuard;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

final class IncidentService
{
    public const TRANSITIONS = ['open' => ['monitoring', 'resolved'], 'monitoring' => ['resolved'], 'resolved' => ['monitoring']];
    public function __construct(private readonly AuditLogger $audit, private readonly CurrentOrganization $organization) {}
    public function rules(): array { return $this->editableRules(false); }
    public function updateRules(): array { return ['version' => ['required', 'integer']] + $this->editableRules(true); }

    private function editableRules(bool $updating): array
    {
        $org = $this->organization->id();
        return [
            'title' => [$updating ? 'sometimes' : 'required', 'string', 'max:500'],
            'kind' => ['sometimes', Rule::in(Incident::KINDS)],
            'severity' => [$updating ? 'sometimes' : 'required', Rule::in(Incident::SEVERITIES)],
            'started_at' => [$updating ? 'sometimes' : 'required', 'date'],
            'is_public' => ['sometimes', 'boolean'], 'public_summary' => ['sometimes', 'nullable', 'string'],
            'root_cause' => ['sometimes', 'nullable', 'string'],
            'owner_id' => ['sometimes', 'nullable', 'uuid', Rule::exists('users', 'id')->where('organization_id', $org)->whereNull('deleted_at')],
            'notes_internal' => ['sometimes', 'nullable', 'string'],
        ];
    }

    public function create(array $data): Incident
    {
        return DB::transaction(function () use ($data): Incident {
            $incident = new Incident; $incident->forceFill($this->editableData($data) + ['number' => $this->nextNumber(), 'status' => 'open'])->save();
            $this->audit->record('incident.created', 'incident', $incident->id, null, $incident->refresh()->attributesToArray()); return $incident;
        });
    }

    public function update(Incident $incident, array $data): Incident
    {
        return DB::transaction(function () use ($incident, $data): Incident {
            $incident = Incident::query()->lockForUpdate()->findOrFail($incident->id); VersionGuard::check($incident, $data['version']);
            $before = $incident->attributesToArray(); $incident->forceFill($this->editableData($data))->save();
            $this->audit->record('incident.updated', 'incident', $incident->id, $before, $incident->refresh()->attributesToArray()); return $incident;
        });
    }

    public function changeStatus(Incident $incident, string $next, int $version): Incident
    {
        return DB::transaction(function () use ($incident, $next, $version): Incident {
            $incident = Incident::query()->lockForUpdate()->findOrFail($incident->id); VersionGuard::check($incident, $version);
            if (! in_array($next, self::TRANSITIONS[$incident->status] ?? [], true)) throw ProblemException::validation(['status' => ["No se permite la transición {$incident->status} → {$next}."]]);
            $before = $incident->attributesToArray();
            $incident->forceFill(['status' => $next, 'resolved_at' => $next === 'resolved' ? now() : null])->save();
            $this->audit->record('incident.status_changed', 'incident', $incident->id, $before, $incident->refresh()->attributesToArray()); return $incident;
        });
    }

    public function delete(Incident $incident, int $version): void
    {
        DB::transaction(function () use ($incident, $version): void {
            $incident = Incident::query()->lockForUpdate()->findOrFail($incident->id); VersionGuard::check($incident, $version);
            $before = $incident->attributesToArray(); $incident->delete(); $this->audit->record('incident.deleted', 'incident', $incident->id, $before, ['deleted' => true]);
        });
    }

    private function nextNumber(): string
    {
        $org = $this->organization->id();
        DB::table('code_sequences')->insertOrIgnore(['organization_id' => $org, 'entity' => 'incident', 'prefix' => 'INC', 'padding' => 6, 'next_value' => 1]);
        return (string) DB::selectOne('select hub_next_code(?, ?) as code', [$org, 'incident'])->code;
    }

    private function editableData(array $data): array { return array_intersect_key($data, array_flip(['title', 'kind', 'severity', 'started_at', 'is_public', 'public_summary', 'root_cause', 'owner_id', 'notes_internal'])); }
}
