<?php

declare(strict_types=1);

namespace App\Modules\Customers\Http\Controllers\Admin;

use App\Modules\Customers\Events\ContactRemoved;
use App\Modules\Customers\Http\Requests\ContactRules;
use App\Modules\Customers\Http\Resources\ContactResource;
use App\Modules\Customers\Models\CommunicationConsent;
use App\Modules\Customers\Models\Contact;
use App\Modules\Customers\Models\Customer;
use App\Modules\Customers\Services\ConsentService;
use App\Modules\Customers\Services\PortalAccessService;
use App\Shared\Audit\AuditLogger;
use App\Shared\Concurrency\VersionGuard;
use App\Shared\Http\Resources\ModelResource;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Contactos del cliente y su acceso al portal (P-CUS-04, customers.contact.*),
 * más sus consentimientos (customers.communication_consent.*).
 */
final class ContactController
{
    public function __construct(
        private readonly AuditLogger $audit,
        private readonly PortalAccessService $portal,
        private readonly ConsentService $consents,
    ) {}

    public function index(Request $request, string $customerId): JsonResponse
    {
        $customer = Customer::query()->findOrFail($customerId);
        $query = Contact::query()->where('customer_id', $customer->id);
        if (is_string($role = $request->input('filter.role')) && in_array($role, Contact::ROLES, true)) {
            $query->whereRaw('? = ANY(roles)', [$role]);
        }
        if (($portal = $request->input('filter.has_portal_access')) !== null) {
            filter_var($portal, FILTER_VALIDATE_BOOLEAN) ? $query->whereNotNull('user_id') : $query->whereNull('user_id');
        }

        $response = CursorPagination::respond($query, $request, ['name', 'created_at'], ContactResource::class, 'name');
        $payload = $response->getData(true);
        $payload['meta']['billing_contact_missing'] = ! Contact::query()->where('customer_id', $customer->id)->whereRaw("'billing' = ANY(roles)")->exists();

        return response()->json($payload);
    }

    public function store(Request $request, string $customerId): JsonResponse
    {
        $customer = Customer::query()->findOrFail($customerId);
        $data = $request->validate(ContactRules::rules(true) + [
            'portal_role' => ['sometimes', 'nullable', Rule::in(PortalAccessService::ROLES)],
        ]);
        $contact = DB::transaction(function () use ($customer, $data): Contact {
            $contact = new Contact;
            $contact->forceFill(['customer_id' => $customer->id] + Arr::only($data, $contact->getFillable()))->save();
            $this->primary($contact);
            $this->audit->record('contact.created', 'contact', $contact->id, null, $contact->refresh()->attributesToArray(), [], $customer->id);
            if (! empty($data['portal_role'])) {
                $this->portal->grant($contact, $data['portal_role']);
            }

            return $contact;
        });

        return (new ContactResource($contact->refresh()))->response()->setStatusCode(201);
    }

    public function show(string $id): ContactResource
    {
        return new ContactResource(Contact::query()->findOrFail($id));
    }

    public function update(Request $request, string $id): ContactResource
    {
        $contact = Contact::query()->findOrFail($id);
        $data = $request->validate(['version' => ['required', 'integer']] + ContactRules::rules(false));
        DB::transaction(function () use ($contact, $data): void {
            VersionGuard::check($contact, (int) $data['version']);
            $before = $contact->attributesToArray();
            $contact->forceFill(Arr::only($data, $contact->getFillable()))->save();
            $this->primary($contact);
            $this->audit->record('contact.updated', 'contact', $contact->id, $before, $contact->refresh()->attributesToArray(), [], $contact->customer_id);
        });

        return new ContactResource($contact->refresh());
    }

    public function destroy(string $id): Response
    {
        $contact = Contact::query()->findOrFail($id);
        DB::transaction(function () use ($contact): void {
            if ($contact->user_id !== null) {
                $this->portal->revoke($contact);
            }
            $before = $contact->attributesToArray();
            $contact->delete();
            $this->audit->record('contact.deleted', 'contact', $contact->id, $before, null, [], $contact->customer_id);
            ContactRemoved::dispatch($contact->organization_id, $contact->id);
        });

        return response()->noContent();
    }

    /** POST …/contacts/{id}/portal-access {role}: dar o cambiar el rol del portal. */
    public function grantPortal(Request $request, string $id): ContactResource
    {
        $data = $request->validate(['role' => ['required', Rule::in(PortalAccessService::ROLES)]]);

        return new ContactResource($this->portal->grant(Contact::query()->findOrFail($id), $data['role']));
    }

    public function revokePortal(string $id): ContactResource
    {
        return new ContactResource($this->portal->revoke(Contact::query()->findOrFail($id)));
    }

    public function resendInvitation(string $id): Response
    {
        $this->portal->resendInvitation(Contact::query()->findOrFail($id));

        return response()->noContent();
    }

    public function consents(Request $request, string $id): JsonResponse
    {
        $contact = Contact::query()->findOrFail($id);
        $response = CursorPagination::respond(CommunicationConsent::query()->where('contact_id', $contact->id), $request, ['recorded_at'], ModelResource::class, '-recorded_at');
        $payload = $response->getData(true);
        $payload['meta']['summary'] = $this->consents->summary($contact);

        return response()->json($payload);
    }

    /** POST …/contacts/{id}/communication-consents: agrega una fila (alta o baja). */
    public function recordConsent(Request $request, string $id): JsonResponse
    {
        $contact = Contact::query()->findOrFail($id);
        $data = $request->validate([
            'channel' => ['required', Rule::in(CommunicationConsent::CHANNELS)],
            'granted' => ['required', 'boolean'],
            'source' => ['sometimes', Rule::in(CommunicationConsent::SOURCES)],
            'evidence' => ['sometimes', 'array'],
        ]);
        $row = $this->consents->record($contact, $data['channel'], (bool) $data['granted'], $data['source'] ?? 'manual', ($data['evidence'] ?? []) + ['recorded_by' => $request->user()?->getAuthIdentifier()]);

        return (new ModelResource($row))->response()->setStatusCode(201);
    }

    /** Un solo contacto principal por cliente. */
    private function primary(Contact $contact): void
    {
        if ($contact->is_primary) {
            Contact::query()->where('customer_id', $contact->customer_id)->whereKeyNot($contact->id)->where('is_primary', true)->get()
                ->each(fn (Contact $other) => $other->forceFill(['is_primary' => false])->save());
        }
    }
}
