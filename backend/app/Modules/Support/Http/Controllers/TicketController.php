<?php

declare(strict_types=1);

namespace App\Modules\Support\Http\Controllers;

use App\Modules\Support\Http\Resources\TicketMessageResource;
use App\Modules\Support\Http\Resources\TicketResource;
use App\Modules\Support\Models\Ticket;
use App\Modules\Support\Models\TicketMessage;
use App\Modules\Customers\Models\Contact;
use App\Modules\Notifications\Services\NotificationService;
use App\Shared\Audit\AuditLogger;
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

final class TicketController
{
    private const STATUSES = ['new', 'open', 'in_progress', 'waiting_customer', 'waiting_provider', 'escalated', 'resolved', 'closed', 'reopened'];
    private const TYPES = ['incident', 'request', 'question', 'billing', 'complaint', 'security'];
    private const PRIORITIES = ['critical', 'high', 'medium', 'low'];
    private const CHANNELS = ['email', 'portal', 'whatsapp', 'phone', 'internal', 'monitoring', 'assistant', 'web_form'];

    public function __construct(private readonly AuditLogger $audit) {}

    public function index(Request $request): JsonResponse
    {
        $query = Ticket::query()->whereNull('deleted_at');
        foreach (['status', 'priority', 'assignee_id'] as $field) {
            if ($request->query($field) !== null && $request->query($field) !== '') $query->where($field, $request->query($field));
        }
        return CursorPagination::respond($query, $request, ['number', 'created_at', 'updated_at'], TicketResource::class, '-created_at');
    }

    public function show(string $id): TicketResource { return new TicketResource(Ticket::query()->whereNull('deleted_at')->with(['messages.authorUser:id,name', 'messages.authorContact:id,name', 'attachments'])->findOrFail($id)); }

    public function store(Request $request): JsonResponse
    {
        $org = app(CurrentOrganization::class)->id();
        $data = $request->validate([
            'customer_id' => ['nullable', 'uuid', Rule::exists('customers', 'id')->where('organization_id', $org)], 'contact_id' => ['nullable', 'uuid', Rule::exists('contacts', 'id')->where('organization_id', $org)],
            'brand_id' => ['nullable', 'uuid', Rule::exists('brands', 'id')->where('organization_id', $org)], 'type' => ['sometimes', Rule::in(self::TYPES)],
            'priority' => ['sometimes', Rule::in(self::PRIORITIES)], 'channel' => ['required', Rule::in(self::CHANNELS)], 'subject' => ['required', 'string', 'max:500'],
            'assignee_id' => ['nullable', 'uuid', Rule::exists('users', 'id')->where('organization_id', $org)], 'department' => ['nullable', 'string', 'max:120'], 'category' => ['nullable', 'string', 'max:120'], 'level' => ['sometimes', 'integer', 'between:1,3'],
            'custom' => ['sometimes', 'array'], 'resolution_due_at' => ['nullable', 'date'],
        ]);
        try {
            $ticket = DB::transaction(function () use ($data, $org): Ticket {
                DB::table('code_sequences')->insertOrIgnore(['organization_id' => $org, 'entity' => 'ticket', 'prefix' => 'TIC', 'padding' => 6, 'next_value' => 1]);
                $ticket = Ticket::query()->create($data + ['number' => DB::selectOne('select hub_next_code(?, ?) as code', [$org, 'ticket'])->code]);
                $this->audit->record('ticket.created', 'ticket', $ticket->id, null, $ticket->refresh()->attributesToArray());
                return $ticket;
            });
        } catch (QueryException $exception) { $this->translateDatabaseException($exception); throw $exception; }
        return (new TicketResource($ticket))->response()->setStatusCode(201);
    }

    public function update(Request $request, string $id): TicketResource
    {
        $ticket = Ticket::query()->whereNull('deleted_at')->findOrFail($id);
        $org = app(CurrentOrganization::class)->id();
        $data = $request->validate(['version' => ['required', 'integer', 'min:1'], 'type' => ['sometimes', Rule::in(self::TYPES)], 'status' => ['sometimes', Rule::in(self::STATUSES)], 'priority' => ['sometimes', Rule::in(self::PRIORITIES)], 'subject' => ['sometimes', 'string', 'max:500'], 'assignee_id' => ['sometimes', 'nullable', 'uuid', Rule::exists('users', 'id')->where('organization_id', $org)], 'customer_id' => ['sometimes', 'nullable', 'uuid', Rule::exists('customers', 'id')->where('organization_id', $org)], 'contact_id' => ['sometimes', 'nullable', 'uuid', Rule::exists('contacts', 'id')->where('organization_id', $org)], 'brand_id' => ['sometimes', 'nullable', 'uuid', Rule::exists('brands', 'id')->where('organization_id', $org)], 'department' => ['sometimes', 'nullable', 'string', 'max:120'], 'category' => ['sometimes', 'nullable', 'string', 'max:120'], 'level' => ['sometimes', 'integer', 'between:1,3'], 'custom' => ['sometimes', 'array'], 'resolution_due_at' => ['sometimes', 'nullable', 'date']]);
        try {
            DB::transaction(function () use ($ticket, $data): void {
                VersionGuard::check($ticket, $data['version']);
                $before = $ticket->attributesToArray();
                if (isset($data['status']) && $data['status'] !== $ticket->status) {
                    $allowed = ['new' => ['open', 'in_progress'], 'open' => ['in_progress', 'waiting_customer', 'waiting_provider', 'escalated', 'resolved'], 'in_progress' => ['waiting_customer', 'waiting_provider', 'escalated', 'resolved'], 'waiting_customer' => ['in_progress', 'resolved'], 'waiting_provider' => ['in_progress', 'resolved'], 'escalated' => ['in_progress', 'resolved'], 'resolved' => ['closed', 'reopened'], 'closed' => ['reopened'], 'reopened' => ['open', 'in_progress']];
                    if (! in_array($data['status'], $allowed[$ticket->status] ?? [], true)) throw ProblemException::validation(['status' => ['Transición de estado no permitida.']]);
                    if ($data['status'] === 'resolved' || $data['status'] === 'closed') $ticket->resolved_at ??= now();
                    if ($data['status'] === 'closed') $ticket->closed_at = now();
                    if ($data['status'] === 'reopened') { $ticket->reopened_count++; $ticket->closed_at = null; }
                }
                $ticket->fill(array_diff_key($data, ['version' => true]));
                $ticket->save();
                $this->audit->record('ticket.updated', 'ticket', $ticket->id, $before, $ticket->refresh()->attributesToArray());
            });
        } catch (QueryException $exception) { $this->translateDatabaseException($exception); throw $exception; }
        return new TicketResource($ticket);
    }

    public function destroy(string $id): Response
    {
        $ticket = Ticket::query()->whereNull('deleted_at')->findOrFail($id);
        $before = $ticket->attributesToArray();
        $ticket->delete();
        $this->audit->record('ticket.deleted', 'ticket', $ticket->id, $before, null);
        return response()->noContent();
    }

    public function addMessage(Request $request, string $id): JsonResponse
    {
        $ticket = Ticket::query()->whereNull('deleted_at')->findOrFail($id);
        $data = $request->validate(['author_type' => ['sometimes', Rule::in(['staff'])], 'channel' => ['required', Rule::in(['email', 'portal', 'whatsapp', 'phone', 'internal'])], 'body' => ['required', 'string', 'min:1'], 'is_internal' => ['sometimes', 'boolean'], 'in_reply_to' => ['nullable', 'string', 'max:500']]);
        if (($data['is_internal'] ?? false) && $data['channel'] !== 'internal') throw ProblemException::validation(['channel' => ['Las notas internas requieren el canal internal.']]);
        $message = DB::transaction(function () use ($ticket, $data): TicketMessage {
            $message = TicketMessage::query()->create($data + ['ticket_id' => $ticket->id, 'author_type' => 'staff', 'author_user_id' => auth()->id()]);
            $ticket->first_responded_at ??= now(); $ticket->save();
            $this->audit->record('ticket.message.created', 'ticket', $ticket->id, null, ['message_id' => $message->id]);
            return $message;
        });
        if (! $message->is_internal && in_array($message->channel, ['email', 'portal'], true)) {
            try {
                $contact = $ticket->contact_id ? Contact::query()->where('customer_id', $ticket->customer_id)->find($ticket->contact_id) : null;
                if (! $contact || ! $contact->email) {
                    $contact = Contact::query()->where('customer_id', $ticket->customer_id)->where('is_primary', true)->whereNotNull('email')->first();
                }
                if (! $contact || ! $contact->email) {
                    Log::warning('notify destinatario sin email', ['event' => 'ticket.customer_reply', 'ticket_id' => $ticket->id]);
                } else {
                    app(NotificationService::class)->send([
                        'event' => 'ticket.customer_reply',
                        'template_code' => 'ticket.customer_reply',
                        'recipient_address' => $contact->email,
                        'customer_id' => $ticket->customer_id,
                        'recipient_contact_id' => $ticket->contact_id,
                        'brand_id' => $ticket->brand_id,
                        'entity_type' => 'ticket',
                        'entity_id' => $ticket->id,
                        'dedupe_key' => 'ticket_message:'.$message->id,
                        'variables' => ['numero' => $ticket->number, 'cliente' => $contact->name, 'mensaje' => $message->body, 'asunto' => $ticket->subject],
                    ]);
                }
            } catch (\Throwable $e) {
                Log::warning('notify falló', ['event' => 'ticket.customer_reply', 'error' => $e->getMessage()]);
            }
        }
        $message->setRelation('authorUser', auth()->user());
        return (new TicketMessageResource($message))->response()->setStatusCode(201);
    }

    private function translateDatabaseException(QueryException $exception): void
    {
        $state = (string) ($exception->errorInfo[0] ?? $exception->getCode());
        if ($state === '23503') throw ProblemException::validation(['reference' => ['La referencia indicada no existe.']]);
        if ($state === '23505') throw ProblemException::validation(['number' => ['El correlativo ya está en uso.']]);
    }
}
