<?php

declare(strict_types=1);

namespace App\Modules\Sales\Http\Controllers;

use App\Modules\Sales\Models\Lead;
use App\Modules\Sales\Models\LeadActivity;
use App\Modules\Sales\Models\LeadChannel;
use App\Modules\Sales\Models\PipelineStage;
use App\Modules\Sales\Services\LeadService;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Http\Resources\ModelResource;
use App\Shared\Organization\CurrentOrganization;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Exists;

/**
 * /api/v1/admin/leads (sales.lead.*): lista, tablero, detalle, alta, edición,
 * cambio de etapa, pérdida y conversión a cliente (M-SAL P-SAL-01 a P-SAL-03).
 */
final class LeadController
{
    public function __construct(private readonly LeadService $leads, private readonly CurrentOrganization $organization) {}

    public function index(Request $request): JsonResponse
    {
        $query = Lead::query()->withInfo();
        if (($status = $request->input('filter.status')) !== null && $status !== '') {
            $list = array_values(array_filter(array_map('trim', explode(',', (string) $status))));
            if (array_diff($list, Lead::STATUSES) !== []) {
                throw ProblemException::validation(['filter.status' => ['Estado no válido.']]);
            }
            $query->whereIn('leads.status', $list);
        }
        foreach (['stage_id' => 'pipeline_stage_id', 'owner_id' => 'owner_id', 'channel_id' => 'lead_channel_id', 'brand_id' => 'brand_id', 'customer_id' => 'customer_id'] as $filter => $column) {
            $value = $request->input("filter.{$filter}");
            if ($value === null || $value === '') {
                continue;
            }
            if ($filter === 'owner_id' && $value === 'none') {
                $query->whereNull('leads.owner_id');

                continue;
            }
            if (! is_string($value) || ! Str::isUuid($value)) {
                throw ProblemException::validation(["filter.{$filter}" => ['Identificador no válido.']]);
            }
            $query->where("leads.{$column}", $value);
        }
        $q = trim((string) $request->input('q', ''));
        if ($q !== '') {
            $like = '%'.addcslashes(mb_strtolower($q), '%_\\').'%';
            $query->where(function ($w) use ($like): void {
                $w->whereRaw('lower(leads.name) LIKE ?', [$like])->orWhereRaw('lower(leads.email) LIKE ?', [$like])
                    ->orWhereRaw('lower(leads.company_name) LIKE ?', [$like])->orWhereRaw('lower(leads.code) LIKE ?', [$like]);
            });
        }

        return CursorPagination::respond($query, $request, ['created_at', 'updated_at', 'name'], ModelResource::class);
    }

    /** Tablero Kanban: una columna por etapa activa con sus prospectos abiertos (ganado y perdido van vacías) y el valor estimado por moneda. */
    public function board(Request $request): JsonResponse
    {
        $this->leads->ensureDefaults();
        $stages = PipelineStage::query()->where('is_active', true)->orderBy('sort_order')->get();
        $leadsQuery = Lead::query()->withInfo()->where('leads.status', 'open')->orderByDesc('leads.updated_at')->limit(500);
        if (is_string($owner = $request->input('filter.owner_id')) && Str::isUuid($owner)) {
            $leadsQuery->where('leads.owner_id', $owner);
        }
        $q = trim((string) $request->input('q', ''));
        if ($q !== '') {
            $like = '%'.addcslashes($q, '\\%_').'%';
            $leadsQuery->where(fn ($w) => $w->where('leads.name', 'ilike', $like)->orWhere('leads.email', 'ilike', $like)
                ->orWhere('leads.company_name', 'ilike', $like)->orWhere('leads.code', 'ilike', $like));
        }
        $byStage = $leadsQuery->get()->groupBy('pipeline_stage_id');

        return response()->json(['data' => $stages->map(function (PipelineStage $stage) use ($byStage): array {
            $items = $byStage->get($stage->id, collect());
            $totals = $items->whereNotNull('currency')->groupBy('currency')->map(fn ($g) => (int) $g->sum('estimated_amount_minor'));

            return $stage->toArray() + ['leads' => $items->values()->toArray(), 'totals' => (object) $totals->all()];
        })->values()]);
    }

    /** Listas para los selectores del panel: etapas, canales, marcas y responsables posibles. */
    public function options(): JsonResponse
    {
        $this->leads->ensureDefaults();
        $org = $this->organization->id();

        return response()->json(['data' => [
            'stages' => PipelineStage::query()->where('is_active', true)->orderBy('sort_order')->get(['id', 'code', 'name', 'outcome', 'sort_order', 'probability'])->toArray(),
            'channels' => LeadChannel::query()->where('is_active', true)->orderBy('name')->get(['id', 'code', 'name', 'kind'])->toArray(),
            'brands' => DB::table('brands')->where('organization_id', $org)->whereNull('deleted_at')->orderBy('name')->get(['id', 'name'])->all(),
            'owners' => DB::table('users')->where('organization_id', $org)->where('type', 'staff')->whereNull('deleted_at')->orderBy('name')->get(['id', 'name'])->all(),
        ]]);
    }

    public function show(string $id): JsonResponse
    {
        return response()->json(['data' => $this->detail($id)]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate(['marketing_consent' => ['sometimes', 'boolean'], 'pipeline_stage_id' => ['sometimes', 'nullable', 'uuid', $this->stageRule()]] + $this->rules(true), [], $this->labels());
        $lead = $this->leads->create($data);

        return response()->json(['data' => $this->detail($lead->id)], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $data = $request->validate(['version' => ['required', 'integer'], 'clear_amount' => ['sometimes', 'boolean']] + $this->rules(false), [], $this->labels());
        $this->leads->update(Lead::query()->findOrFail($id), $data);

        return response()->json(['data' => $this->detail($id)]);
    }

    public function move(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'version' => ['required', 'integer'], 'stage_id' => ['required', 'uuid'],
            'source' => ['sometimes', Rule::in(['board_drag', 'form'])], 'note' => ['sometimes', 'nullable', 'string', 'max:500'],
        ]);
        $this->leads->move(Lead::query()->findOrFail($id), $data['stage_id'], (int) $data['version'], $data['source'] ?? 'form', $data['note'] ?? null);

        return response()->json(['data' => $this->detail($id)]);
    }

    public function lose(Request $request, string $id): JsonResponse
    {
        $data = $request->validate(['version' => ['required', 'integer'], 'reason' => ['required', 'string', 'max:1000'], 'source' => ['sometimes', Rule::in(['board_drag', 'form'])]], [], ['reason' => 'motivo']);
        $this->leads->lose(Lead::query()->findOrFail($id), (int) $data['version'], $data['reason'], $data['source'] ?? 'form');

        return response()->json(['data' => $this->detail($id)]);
    }

    public function convert(Request $request, string $id): JsonResponse
    {
        $org = $this->organization->id();
        $data = $request->validate([
            'version' => ['required', 'integer'],
            'customer_id' => ['sometimes', 'nullable', 'uuid', Rule::exists('customers', 'id')->where('organization_id', $org)->whereNull('deleted_at')],
            'type' => ['sometimes', Rule::in(['company', 'individual'])],
            'legal_name' => ['sometimes', 'string', 'min:2', 'max:300'],
            'tax_id_type' => ['sometimes', 'nullable', 'required_with:tax_id', 'string', 'max:30'],
            'tax_id' => ['sometimes', 'nullable', 'required_with:tax_id_type', 'string', 'max:30'],
        ], [], ['legal_name' => 'razón social']);
        $result = $this->leads->convert(Lead::query()->findOrFail($id), (int) $data['version'], $data);

        return response()->json(['data' => $this->detail($id) + ['customer_created' => $result['created']]], $result['created'] ? 201 : 200);
    }

    public function storeActivity(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'type' => ['required', Rule::in(LeadActivity::TYPES)],
            'subject' => ['sometimes', 'nullable', 'string', 'max:200'],
            'notes' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'due_at' => ['nullable', 'date', 'required_if:type,follow_up'],
            'assigned_to' => ['sometimes', 'nullable', 'uuid', $this->staffRule()],
        ], [], ['type' => 'tipo', 'notes' => 'notas', 'due_at' => 'fecha']);
        $lead = Lead::query()->findOrFail($id);
        if (empty($data['notes']) && empty($data['subject'])) {
            throw ProblemException::validation(['notes' => ['Escribe una nota o un asunto.']]);
        }
        $this->leads->addActivity($lead, $data);

        return response()->json(['data' => $this->detail($id)], 201);
    }

    public function updateActivity(Request $request, string $id): JsonResponse
    {
        $data = $request->validate(['version' => ['required', 'integer'], 'completed' => ['required', 'boolean']]);
        $activity = $this->leads->completeActivity(LeadActivity::query()->findOrFail($id), (int) $data['version'], (bool) $data['completed']);

        return response()->json(['data' => $this->detail($activity->lead_id)]);
    }

    /** @return array<string, mixed> */
    private function detail(string $id): array
    {
        $lead = Lead::query()->withInfo()->findOrFail($id);

        return $lead->toArray() + [
            'activities' => LeadActivity::query()->where('lead_id', $id)->orderByDesc('created_at')->get()->toArray(),
            'stage_changes' => DB::table('lead_stage_changes as c')->where('c.lead_id', $id)->orderBy('c.created_at')
                ->leftJoin('pipeline_stages as f', 'f.id', '=', 'c.from_stage_id')->join('pipeline_stages as t', 't.id', '=', 'c.to_stage_id')
                ->leftJoin('users as u', 'u.id', '=', 'c.changed_by')
                ->get(['c.id', 'c.source', 'c.note', 'c.created_at', 'f.name as from_stage', 't.name as to_stage', 'u.name as changed_by_name'])->all(),
        ];
    }

    /** @return array<string, mixed> */
    private function rules(bool $creating): array
    {
        $req = $creating ? 'required' : 'sometimes';
        $org = $this->organization->id();

        return [
            'name' => [$req, 'string', 'min:2', 'max:200'],
            'company_name' => ['sometimes', 'nullable', 'string', 'max:200'],
            'email' => ['sometimes', 'nullable', 'email', 'max:255'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:50'],
            'brand_id' => [$req, 'uuid', Rule::exists('brands', 'id')->where('organization_id', $org)->whereNull('deleted_at')],
            'lead_channel_id' => ['sometimes', 'nullable', 'uuid', Rule::exists('lead_channels', 'id')->where('organization_id', $org)],
            'owner_id' => ['sometimes', 'nullable', 'uuid', $this->staffRule()],
            'estimated_amount_minor' => ['nullable', 'integer', 'min:0', 'required_with:currency'],
            'currency' => ['nullable', Rule::in(['PEN', 'USD']), 'required_with:estimated_amount_minor'],
            'next_follow_up_at' => ['sometimes', 'nullable', 'date'],
        ];
    }

    private function staffRule(): Exists
    {
        return Rule::exists('users', 'id')->where('organization_id', $this->organization->id())->where('type', 'staff')->whereNull('deleted_at');
    }

    private function stageRule(): Exists
    {
        return Rule::exists('pipeline_stages', 'id')->where('organization_id', $this->organization->id())->where('outcome', 'open')->where('is_active', true);
    }

    /** @return array<string, string> */
    private function labels(): array
    {
        return ['name' => 'nombre', 'brand_id' => 'marca', 'lead_channel_id' => 'canal', 'owner_id' => 'responsable', 'estimated_amount_minor' => 'monto estimado', 'currency' => 'moneda', 'company_name' => 'empresa'];
    }
}
