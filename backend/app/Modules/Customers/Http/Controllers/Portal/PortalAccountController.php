<?php

declare(strict_types=1);

namespace App\Modules\Customers\Http\Controllers\Portal;

use App\Modules\Customers\Events\ContactRemoved;
use App\Modules\Customers\Http\Requests\ContactRules;
use App\Modules\Customers\Http\Resources\ContactResource;
use App\Modules\Customers\Http\Resources\PortalCustomerResource;
use App\Modules\Customers\Models\CommunicationConsent;
use App\Modules\Customers\Models\Contact;
use App\Modules\Customers\Models\Customer;
use App\Modules\Customers\Services\ConsentService;
use App\Modules\Customers\Services\CustomerService;
use App\Modules\Customers\Support\TaxIdValidator;
use App\Shared\Audit\AuditLogger;
use App\Shared\Concurrency\VersionGuard;
use App\Shared\Http\Problem\ProblemException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * /api/v1/portal/account, /portal/contacts y /portal/communication-consents:
 * el cliente ve y edita solo sus propios datos. El cliente se toma de la
 * sesión (contacto enlazado al usuario), nunca de la petición.
 */
final class PortalAccountController
{
    /** Campos que el portal puede cambiar (sin moneda, marca, tratamiento tributario ni responsable). */
    private const EDITABLE = ['legal_name', 'trade_name', 'tax_id_type', 'tax_id', 'address', 'email', 'phone', 'locale', 'timezone'];

    public function __construct(private readonly AuditLogger $audit) {}

    public function show(Request $request): PortalCustomerResource
    {
        return $this->resource($this->customer($request));
    }

    public function update(Request $request, CustomerService $customers): PortalCustomerResource
    {
        $customer = $this->customer($request);
        $rules = Arr::only($customers->rules($customer), self::EDITABLE);
        $data = $request->validate(['version' => ['required', 'integer']] + $rules);
        // El portal no confirma posibles duplicados: solo el documento ya registrado bloquea.
        $customers->update($customer, $data + ['confirm_duplicates' => true], 'portal');

        return $this->resource($customer->refresh());
    }

    public function contacts(Request $request): JsonResponse
    {
        $customer = $this->customer($request);
        $contacts = Contact::query()->where('customer_id', $customer->id)->orderBy('name')->orderBy('id')->limit(200)->get();

        return response()->json(['data' => $contacts->map(fn (Contact $c) => (new ContactResource($c, true))->resolve($request))->all()]);
    }

    public function storeContact(Request $request): JsonResponse
    {
        $customer = $this->customer($request);
        $data = $request->validate(ContactRules::rules(true));
        $contact = DB::transaction(function () use ($customer, $data): Contact {
            $contact = new Contact;
            $contact->forceFill(['customer_id' => $customer->id] + Arr::only($data, $contact->getFillable()))->save();
            $this->audit->record('contact.created', 'contact', $contact->id, null, $contact->refresh()->attributesToArray(), ['origin' => 'portal'], $customer->id);

            return $contact;
        });

        return (new ContactResource($contact->refresh(), true))->response()->setStatusCode(201);
    }

    public function updateContact(Request $request, string $id): ContactResource
    {
        $contact = $this->ownContact($request, $id);
        $data = $request->validate(['version' => ['required', 'integer']] + ContactRules::rules(false));
        DB::transaction(function () use ($contact, $data): void {
            VersionGuard::check($contact, (int) $data['version']);
            $before = $contact->attributesToArray();
            $contact->forceFill(Arr::only($data, $contact->getFillable()))->save();
            $this->audit->record('contact.updated', 'contact', $contact->id, $before, $contact->refresh()->attributesToArray(), ['origin' => 'portal'], $contact->customer_id);
        });

        return new ContactResource($contact->refresh(), true);
    }

    public function destroyContact(Request $request, string $id): Response
    {
        $contact = $this->ownContact($request, $id);
        if ($contact->user_id === $request->user()->getAuthIdentifier()) {
            throw new ProblemException(409, 'conflict', 'No puede eliminar su propio contacto.');
        }
        if ($contact->user_id !== null) {
            throw new ProblemException(409, 'conflict', 'El contacto tiene acceso al portal; quíteselo primero desde la gestión de usuarios.');
        }
        DB::transaction(function () use ($contact): void {
            $contact->delete();
            $this->audit->record('contact.deleted', 'contact', $contact->id, null, null, ['origin' => 'portal'], $contact->customer_id);
            ContactRemoved::dispatch($contact->organization_id, $contact->id);
        });

        return response()->noContent();
    }

    /** GET …/portal/communication-consents: estado del propio contacto. */
    public function consents(Request $request, ConsentService $consents): JsonResponse
    {
        return response()->json(['data' => $consents->summary($this->selfContact($request))]);
    }

    /** POST …/portal/communication-consents (portal.consent.update): alta o baja del propio contacto. */
    public function recordConsent(Request $request, ConsentService $consents): JsonResponse
    {
        $data = $request->validate(['channel' => ['required', Rule::in(CommunicationConsent::CHANNELS)], 'granted' => ['required', 'boolean']]);
        $contact = $this->selfContact($request);
        $consents->record($contact, $data['channel'], (bool) $data['granted'], 'portal', ['ip' => $request->ip(), 'user_agent' => substr((string) $request->userAgent(), 0, 300)]);

        return response()->json(['data' => $consents->summary($contact)], 201);
    }

    private function selfContact(Request $request): Contact
    {
        return Contact::query()->where('user_id', $request->user()->getAuthIdentifier())->first()
            ?? throw ProblemException::forbidden('Su usuario no está vinculado a un cliente.');
    }

    private function customer(Request $request): Customer
    {
        return Customer::query()->find($this->selfContact($request)->customer_id)
            ?? throw ProblemException::forbidden('Su usuario no está vinculado a un cliente.');
    }

    private function ownContact(Request $request, string $id): Contact
    {
        return Contact::query()->where('customer_id', $this->customer($request)->id)->findOrFail($id);
    }

    private function resource(Customer $customer): PortalCustomerResource
    {
        $visible = DB::table('custom_field_definitions')->where('organization_id', $customer->organization_id)
            ->where('entity_type', Customer::MORPH)->where('visible_to_customer', true)->pluck('key')->all();

        return new PortalCustomerResource($customer, $visible);
    }
}
