<?php

declare(strict_types=1);

namespace App\Modules\Support\Http\Controllers\Portal;

use App\Modules\Customers\Models\Contact;
use App\Modules\Customers\Models\Customer;
use App\Modules\Customers\Support\PortalCustomer;
use App\Modules\Support\Http\Resources\Portal\PortalTicketMessageResource;
use App\Modules\Support\Http\Resources\Portal\PortalTicketResource;
use App\Modules\Support\Models\Ticket;
use App\Modules\Support\Models\TicketMessage;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Organization\CurrentOrganization;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

final class PortalTicketController
{
    private const STATUSES = ['new', 'open', 'in_progress', 'waiting_customer', 'waiting_provider', 'escalated', 'resolved', 'closed', 'reopened'];

    public function index(Request $request): JsonResponse
    {
        $customer = $this->customer($request);
        $request->validate(['status' => ['sometimes', Rule::in(self::STATUSES)]]);
        $query = Ticket::query()->where('customer_id', $customer->id)->whereNull('deleted_at');
        if ($request->query('status') !== null && $request->query('status') !== '') {
            $query->where('status', $request->query('status'));
        }

        return CursorPagination::respond($query, $request, ['number', 'created_at', 'updated_at'], PortalTicketResource::class, '-created_at');
    }

    public function show(Request $request, string $id): PortalTicketResource
    {
        $customer = $this->customer($request);
        $ticket = Ticket::query()->where('customer_id', $customer->id)->whereNull('deleted_at')
            ->with([
                'messages' => fn ($query) => $query->where('is_internal', false)->orderBy('created_at'),
                'attachments' => fn ($query) => $query->where('visibility', 'customer'),
            ])
            ->findOrFail($id);

        return new PortalTicketResource($ticket);
    }

    public function store(Request $request): JsonResponse
    {
        $customer = $this->customer($request);
        $contact = $this->contact($request, $customer);
        $data = $request->validate([
            'subject' => ['required', 'string', 'max:500'],
            'type' => ['sometimes', Rule::in(['incident', 'request', 'question', 'billing'])],
            'priority' => ['sometimes', Rule::in(['critical', 'high', 'medium', 'low'])],
            'body' => ['sometimes', 'string', 'min:1'],
        ]);
        $org = app(CurrentOrganization::class)->id();

        try {
            $ticket = DB::transaction(function () use ($customer, $contact, $data, $org): Ticket {
                DB::table('code_sequences')->insertOrIgnore(['organization_id' => $org, 'entity' => 'ticket', 'prefix' => 'TIC', 'padding' => 6, 'next_value' => 1]);
                $ticket = (new Ticket)->fill([
                    'number' => DB::selectOne('select hub_next_code(?, ?) as code', [$org, 'ticket'])->code,
                    'customer_id' => $customer->id,
                    'contact_id' => $contact->id,
                    'channel' => 'portal',
                    'status' => 'new',
                    'priority' => $data['priority'] ?? 'medium',
                    'type' => $data['type'] ?? 'request',
                    'subject' => $data['subject'],
                ]);
                $ticket->save();

                if (isset($data['body'])) {
                    $ticket->messages()->create(['author_type' => 'customer', 'author_contact_id' => $contact->id, 'is_internal' => false, 'channel' => 'portal', 'body' => $data['body']]);
                }

                return $ticket->refresh()->load(['messages' => fn ($query) => $query->where('is_internal', false)->orderBy('created_at')]);
            });
        } catch (QueryException $exception) {
            $this->translateDatabaseException($exception);
            throw $exception;
        }

        return (new PortalTicketResource($ticket))->response()->setStatusCode(201);
    }

    public function addMessage(Request $request, string $id): JsonResponse
    {
        $customer = $this->customer($request);
        $contact = $this->contact($request, $customer);
        $data = $request->validate(['body' => ['required', 'string', 'min:1']]);
        $ticket = Ticket::query()->where('customer_id', $customer->id)->whereNull('deleted_at')->findOrFail($id);

        $message = DB::transaction(function () use ($ticket, $contact, $data): TicketMessage {
            $message = $ticket->messages()->create(['author_type' => 'customer', 'author_contact_id' => $contact->id, 'is_internal' => false, 'channel' => 'portal', 'body' => $data['body']]);
            $ticket->last_customer_activity_at = now();
            $ticket->save();

            return $message;
        });

        return (new PortalTicketMessageResource($message))->response()->setStatusCode(201);
    }

    private function customer(Request $request): Customer
    {
        // Igual que PortalAccountController: PortalCustomer resuelve desde el contacto enlazado a la sesión.
        return Customer::query()->find(PortalCustomer::id($request))
            ?? throw ProblemException::forbidden('Su usuario no está vinculado a un cliente.');
    }

    private function contact(Request $request, Customer $customer): Contact
    {
        return Contact::query()->where('customer_id', $customer->id)->where('user_id', $request->user()->getAuthIdentifier())->first()
            ?? throw ProblemException::forbidden('Su usuario no está vinculado a un contacto.');
    }

    private function translateDatabaseException(QueryException $exception): void
    {
        $state = (string) ($exception->errorInfo[0] ?? $exception->getCode());
        if ($state === '23503') throw ProblemException::validation(['reference' => ['La referencia indicada no existe.']]);
        if ($state === '23505') throw ProblemException::validation(['number' => ['El correlativo ya está en uso.']]);
    }
}
