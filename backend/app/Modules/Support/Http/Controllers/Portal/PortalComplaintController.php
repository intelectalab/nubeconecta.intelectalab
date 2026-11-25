<?php

declare(strict_types=1);

namespace App\Modules\Support\Http\Controllers\Portal;

use App\Modules\Customers\Models\Customer;
use App\Modules\Customers\Support\PortalCustomer;
use App\Modules\Services\Models\Service;
use App\Modules\Settings\Services\SettingsResolver;
use App\Modules\Support\Http\Resources\Portal\PortalComplaintResource;
use App\Modules\Support\Models\Complaint;
use App\Modules\Support\Services\ComplaintRegistrar;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Organization\CurrentOrganization;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

final class PortalComplaintController
{
    private const DOCUMENT_TYPES = ['dni', 'ce', 'passport', 'ruc'];

    public function __construct(private readonly ComplaintRegistrar $registrar) {}

    public function index(Request $request): JsonResponse
    {
        $customer = $this->customer($request);
        $query = Complaint::query()->where('customer_id', $customer->id)->with('responses');

        return CursorPagination::respond($query, $request, ['number', 'received_at', 'due_at'], PortalComplaintResource::class, '-received_at');
    }

    public function show(Request $request, string $id): PortalComplaintResource
    {
        $customer = $this->customer($request);
        $complaint = Complaint::query()->where('customer_id', $customer->id)->with('responses')->findOrFail($id);

        return new PortalComplaintResource($complaint);
    }

    public function store(Request $request): JsonResponse
    {
        $customer = $this->customer($request);
        $documentType = strtolower((string) $customer->tax_id_type);
        if (! in_array($documentType, self::DOCUMENT_TYPES, true)) {
            throw ProblemException::validation(['consumer_document_type' => ['Actualice el tipo de documento de su cuenta antes de registrar un reclamo.']]);
        }
        if (! $customer->legal_name || ! $customer->tax_id || ! $customer->address || ! $customer->email || ! $customer->origin_brand_id) {
            throw ProblemException::validation(['consumer' => ['Complete los datos legales, dirección, correo y marca de origen de su cuenta antes de registrar un reclamo.']]);
        }

        $org = app(CurrentOrganization::class)->id();
        $data = $request->validate([
            'complaint_type' => ['required', Rule::in(['claim', 'grievance'])],
            'service_id' => ['nullable', 'uuid', Rule::exists('services', 'id')->where(fn ($query) => $query->where('organization_id', $org)->where('customer_id', $customer->id)->whereNull('deleted_at'))],
            'service_description' => ['required_without:service_id', 'nullable', 'string', 'max:1000'],
            'amount_minor' => ['nullable', 'integer', 'min:0'],
            'currency' => ['required_with:amount_minor', 'prohibited_without:amount_minor', 'nullable', Rule::in(['PEN', 'USD'])],
            'detail' => ['required', 'string', 'min:1'],
            'consumer_request' => ['required', 'string', 'min:1'],
        ]);

        $brand = DB::table('brands')->where('id', $customer->origin_brand_id)->where('organization_id', $org)->first();
        if ($brand === null) {
            throw ProblemException::validation(['consumer' => ['La marca de origen de su cuenta no está disponible para registrar el reclamo.']]);
        }
        $service = isset($data['service_id']) ? Service::query()->where('customer_id', $customer->id)->findOrFail($data['service_id']) : null;
        $serviceDescription = $data['service_description'] ?? $service?->label;
        if (! is_string($serviceDescription) || trim($serviceDescription) === '') {
            throw ProblemException::validation(['service_description' => ['Describa el servicio contratado.']]);
        }

        $responseDays = $this->responseDays($customer->id);

        $attributes = [
            'wp_site_id' => null,
            'complaint_type' => $data['complaint_type'],
            'consumer_name' => $customer->legal_name,
            'consumer_document_type' => strtolower((string) $customer->tax_id_type),
            'consumer_document_number' => $customer->tax_id,
            'consumer_address' => $customer->address,
            'consumer_email' => $customer->email,
            'consumer_phone' => $customer->phone,
            'customer_id' => $customer->id,
            'service_id' => $service?->id,
            'service_description' => $serviceDescription,
            'amount_minor' => $data['amount_minor'] ?? null,
            'currency' => $data['currency'] ?? null,
            'detail' => $data['detail'],
            'consumer_request' => $data['consumer_request'],
            'is_test' => false,
        ];

        try {
            $complaint = $this->registrar->register($brand, $attributes, $responseDays);
        } catch (QueryException $exception) {
            $state = (string) ($exception->errorInfo[0] ?? $exception->getCode());
            if ($state === '23503') {
                throw ProblemException::validation(['reference' => ['La referencia indicada no existe.']]);
            }
            throw $exception;
        }

        return (new PortalComplaintResource($complaint))->response()->setStatusCode(201);
    }

    private function customer(Request $request): Customer
    {
        return Customer::query()->find(PortalCustomer::id($request))
            ?? throw ProblemException::forbidden('Su usuario no está vinculado a un cliente.');
    }

    private function responseDays(string $customerId): int
    {
        $configured = app(SettingsResolver::class)->get('complaints.response_days', ['customer' => $customerId]);

        return is_numeric($configured) && (int) $configured > 0 && (int) $configured <= 365 ? (int) $configured : 15;
    }
}
