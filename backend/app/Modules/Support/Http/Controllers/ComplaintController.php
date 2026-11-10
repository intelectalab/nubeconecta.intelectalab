<?php

declare(strict_types=1);

namespace App\Modules\Support\Http\Controllers;

use App\Modules\Settings\Services\BusinessCalendar;
use App\Modules\Support\Http\Resources\ComplaintResource;
use App\Modules\Support\Http\Resources\ComplaintResponseResource;
use App\Modules\Support\Models\Complaint;
use App\Modules\Support\Models\ComplaintResponse;
use App\Modules\Support\Models\Ticket;
use App\Modules\Notifications\Services\NotificationService;
use App\Shared\Audit\AuditLogger;
use Carbon\CarbonInterface;
use App\Shared\Concurrency\VersionGuard;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Organization\CurrentOrganization;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;

final class ComplaintController
{
    public function __construct(private readonly AuditLogger $audit) {}

    public function index(Request $request): JsonResponse
    {
        $query = Complaint::query()->with('responses');
        foreach (['status', 'brand_id'] as $field) if ($request->query($field) !== null && $request->query($field) !== '') $query->where($field, $request->query($field));
        return CursorPagination::respond($query, $request, ['number', 'received_at', 'due_at'], ComplaintResource::class, '-received_at');
    }

    public function show(string $id): ComplaintResource { return new ComplaintResource(Complaint::query()->with('responses')->findOrFail($id)); }

    public function store(Request $request): JsonResponse
    {
        $org = app(CurrentOrganization::class)->id();
        $data = $request->validate([
            'brand_id' => ['required', 'uuid', Rule::exists('brands', 'id')->where('organization_id', $org)], 'wp_site_id' => ['nullable', 'uuid', Rule::exists('wp_sites', 'id')->where('organization_id', $org)],
            'complaint_type' => ['required', Rule::in(['claim', 'grievance'])], 'consumer_name' => ['required', 'string', 'max:255'], 'consumer_document_type' => ['required', Rule::in(['dni', 'ce', 'passport', 'ruc'])],
            'consumer_document_number' => ['required', 'string', 'max:40'], 'consumer_address' => ['required', 'string', 'max:1000'], 'consumer_email' => ['required', 'email', 'max:255'], 'consumer_phone' => ['nullable', 'string', 'max:50'],
            'is_minor' => ['sometimes', 'boolean'], 'guardian_name' => ['required_if:is_minor,true', 'nullable', 'string', 'max:255'], 'customer_id' => ['nullable', 'uuid', Rule::exists('customers', 'id')->where('organization_id', $org)],
            'service_id' => ['nullable', 'uuid', Rule::exists('services', 'id')->where('organization_id', $org)], 'service_description' => ['required', 'string'], 'amount_minor' => ['nullable', 'integer', 'min:0'], 'currency' => ['required_with:amount_minor', 'nullable', Rule::in(['PEN', 'USD'])],
            'detail' => ['required', 'string'], 'consumer_request' => ['required', 'string'], 'response_days' => ['required', 'integer', 'min:1', 'max:365'], 'is_test' => ['sometimes', 'boolean'], 'test_reason' => ['required_if:is_test,true', 'nullable', 'string', 'max:1000'],
        ]);
        try { $complaint = DB::transaction(function () use ($data, $org): Complaint {
            DB::table('brands')->where('id', $data['brand_id'])->lockForUpdate()->firstOrFail();
            $brand = DB::table('brands')->where('id', $data['brand_id'])->firstOrFail();
            $number = (int) Complaint::query()->where('brand_id', $data['brand_id'])->max('number') + 1;
            $number = max($number, (int) DB::table('complaint_deletions')->where('brand_id', $data['brand_id'])->max('number') + 1);
            $received = now();
            $due = $this->dueDate($received, (int) $data['response_days']);
            DB::table('code_sequences')->insertOrIgnore(['organization_id' => $org, 'entity' => 'ticket', 'prefix' => 'TIC', 'padding' => 6, 'next_value' => 1]);
            $ticket = Ticket::query()->create(['number' => DB::selectOne('select hub_next_code(?, ?) as code', [$org, 'ticket'])->code, 'brand_id' => $data['brand_id'], 'customer_id' => $data['customer_id'] ?? null, 'type' => 'complaint', 'status' => 'open', 'priority' => 'high', 'channel' => 'web_form', 'subject' => 'Libro de Reclamaciones: '.$data['complaint_type'].' #'.$number, 'resolution_due_at' => $due]);
            $testMark = ($data['is_test'] ?? false) ? ['test_marked_at' => now(), 'test_marked_by' => auth()->id()] : [];
            $record = Complaint::query()->create($data + ['number' => $number, 'code' => strtoupper($brand->code).'-'.str_pad((string) $number, 6, '0', STR_PAD_LEFT), 'received_at' => $received, 'due_at' => $due, 'ticket_id' => $ticket->id] + $testMark);
            $this->audit->record('complaint.created', 'complaint', $record->id, null, $record->refresh()->attributesToArray());
            return $record;
        }); } catch (QueryException $exception) { $state = (string) ($exception->errorInfo[0] ?? $exception->getCode()); if ($state === '23503') throw ProblemException::validation(['reference' => ['La referencia indicada no existe.']]); throw $exception; }
        try {
            app(NotificationService::class)->send([
                'event' => 'complaint.received',
                'template_code' => 'complaint.received',
                'recipient_address' => $complaint->consumer_email,
                'customer_id' => $complaint->customer_id,
                'brand_id' => $complaint->brand_id,
                'entity_type' => 'complaint',
                'entity_id' => $complaint->id,
                'dedupe_key' => 'complaint:'.$complaint->id,
                'variables' => ['numero' => $complaint->number, 'codigo' => $complaint->code ?? '', 'nombre' => $complaint->consumer_name],
            ]);
        } catch (\Throwable $e) {
            // Best-effort: ni el fallo de notificación ni su registro deben tumbar la hoja (ya guardada).
            try { Log::warning('notify falló', ['event' => 'complaint.received', 'error' => $e->getMessage()]); } catch (\Throwable) { /* logging no disponible */ }
        }
        return (new ComplaintResource($complaint))->response()->setStatusCode(201);
    }

    /**
     * Vencimiento legal del reclamo (Ley 31435: 15 dias habiles). Usa el
     * calendario de dias habiles del negocio (fines de semana y feriados) si
     * esta configurado; si no, cae a dias calendario para no bloquear el registro.
     */
    private function dueDate(CarbonInterface $from, int $days): CarbonInterface
    {
        try {
            return app(BusinessCalendar::class)->addBusinessDays($from, $days);
        } catch (\RuntimeException) {
            return $from->copy()->addDays($days);
        }
    }

    public function update(Request $request, string $id): ComplaintResource
    {
        $complaint = Complaint::query()->findOrFail($id);
        $data = $request->validate(['version' => ['required', 'integer', 'min:1'], 'status' => ['sometimes', Rule::in(['received', 'in_progress', 'answered', 'closed'])], 'is_test' => ['sometimes', 'boolean'], 'test_reason' => ['required_with:is_test', 'nullable', 'string', 'max:1000']]);
        if (($data['status'] ?? null) === 'answered') throw ProblemException::validation(['status' => ['Use el flujo de respuesta oficial para marcar la hoja como respondida.']]);
        if (isset($data['status']) && $data['status'] !== $complaint->status) {
            $allowed = ['received' => ['in_progress'], 'in_progress' => [], 'answered' => ['closed'], 'closed' => []];
            if (! in_array($data['status'], $allowed[$complaint->status] ?? [], true)) throw ProblemException::validation(['status' => ['Transición de estado no permitida.']]);
        }
        DB::transaction(function () use ($complaint, $data): void {
            VersionGuard::check($complaint, $data['version']);
            $before = $complaint->attributesToArray();
            if (($data['is_test'] ?? false) && ! $complaint->is_test) { $complaint->test_marked_at = now(); $complaint->test_marked_by = auth()->id(); }
            if (array_key_exists('is_test', $data) && ! $data['is_test']) throw ProblemException::validation(['is_test' => ['Una hoja marcada como prueba no puede volver a ser real.']]);
            if (($data['status'] ?? null) === 'closed') {
                if (! $complaint->answered_at) throw ProblemException::validation(['status' => ['Solo se puede cerrar un reclamo ya respondido.']]);
                $complaint->closed_at = now();
            }
            $complaint->fill(array_intersect_key($data, ['status' => true, 'is_test' => true, 'test_reason' => true]));
            $complaint->save();
            $this->audit->record('complaint.updated', 'complaint', $complaint->id, $before, $complaint->refresh()->attributesToArray());
        });
        return new ComplaintResource($complaint->load('responses'));
    }

    public function destroy(Request $request, string $id): Response
    {
        $complaint = Complaint::query()->findOrFail($id);
        $data = $request->validate(['version' => ['required', 'integer', 'min:1']]);
        if (! $complaint->is_test) throw new ProblemException(409, 'complaint_cannot_be_deleted', 'Las hojas reales del Libro de Reclamaciones se conservan.');
        DB::transaction(function () use ($complaint, $data): void {
            VersionGuard::check($complaint, $data['version']);
            $before = $complaint->attributesToArray();
            ComplaintResponse::query()->where('complaint_id', $complaint->id)->delete();
            $complaint->delete(); // El trigger crea complaint_deletions con la copia de auditoría.
            $this->audit->record('complaint.test_deleted', 'complaint', $complaint->id, $before, null);
        });
        return response()->noContent();
    }

    public function addResponse(Request $request, string $id): JsonResponse
    {
        $complaint = Complaint::query()->findOrFail($id);
        if (in_array($complaint->status, ['answered', 'closed'], true)) throw ProblemException::validation(['status' => ['El reclamo ya tiene respuesta oficial.']]);
        $data = $request->validate(['body' => ['required', 'string', 'min:1'], 'body_html' => ['required', 'string', 'min:1'], 'previewed_at' => ['required', 'date', 'before_or_equal:now'], 'template_id' => ['nullable', 'uuid', Rule::exists('notification_templates', 'id')], 'file_id' => ['nullable', 'uuid', Rule::exists('files', 'id')], 'is_final' => ['sometimes', 'boolean']]);
        if (preg_match('/<\s*(script|iframe|object|embed|style)|javascript:|\son[a-z]+\s*=/i', $data['body_html'])) throw ProblemException::validation(['body_html' => ['El HTML contiene contenido no permitido.']]);
        $response = DB::transaction(function () use ($complaint, $data): ComplaintResponse {
            $html = $data['body_html'];
            $response = ComplaintResponse::query()->create($data + ['complaint_id' => $complaint->id, 'preview_sha256' => hash('sha256', $html), 'responded_by' => auth()->id(), 'sent_to_email' => $complaint->consumer_email, 'sent_at' => now()]);
            $before = $complaint->attributesToArray();
            $complaint->status = 'answered'; $complaint->answered_at = $response->sent_at; $complaint->save();
            $this->audit->record('complaint.responded', 'complaint', $complaint->id, $before, $complaint->refresh()->attributesToArray(), ['response_id' => $response->id]);
            return $response;
        });
        return (new ComplaintResponseResource($response))->response()->setStatusCode(201);
    }
}
