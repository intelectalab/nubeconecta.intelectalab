<?php

declare(strict_types=1);

namespace App\Modules\Customers\Http\Controllers\Admin;

use App\Modules\Customers\Models\Contact;
use App\Modules\Customers\Models\Customer;
use App\Modules\Customers\Services\CustomerImporter;
use App\Modules\Customers\Services\PrivacyService;
use App\Shared\Http\Problem\ProblemException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;

/**
 * P-CUS-06 (privacidad del titular) e importación CSV (M-CUS §4.6 y §4.7).
 */
final class PrivacyController
{
    /** POST …/customers/{id}/personal-data-exports (customers.customer.export): cola `default`. */
    public function export(Request $request, string $id, PrivacyService $privacy): JsonResponse
    {
        $customer = Customer::query()->findOrFail($id);
        $contact = $this->contact($request, $customer);

        return response()->json(['data' => ['request_id' => $privacy->requestExport($customer, $contact), 'status' => 'queued']], 202);
    }

    /** POST …/customers/{id}/personal-data-erasure (customers.customer.delete): exige escribir el código del cliente. */
    public function erase(Request $request, string $id, PrivacyService $privacy): JsonResponse
    {
        $customer = Customer::query()->findOrFail($id);
        $data = $request->validate(['confirm_code' => ['required', 'string']]);
        if (trim($data['confirm_code']) !== $customer->code) {
            throw ProblemException::validation(['confirm_code' => ['Escriba el código del cliente para confirmar.']]);
        }

        return response()->json(['data' => $privacy->erase($customer, $this->contact($request, $customer))]);
    }

    /** GET …/customers/import-templates/{kind}: plantilla CSV (customers o contacts). */
    public function template(string $kind): Response
    {
        abort_unless(in_array($kind, ['customers', 'contacts'], true), 404);

        return response(CustomerImporter::template($kind), 200, ['Content-Type' => 'text/csv; charset=UTF-8', 'Content-Disposition' => "attachment; filename=plantilla-{$kind}.csv"]);
    }

    /** POST …/customers/imports: archivo CSV (`file`) o texto (`csv`); `dry_run` para la vista previa. */
    public function import(Request $request, CustomerImporter $importer): JsonResponse
    {
        $data = $request->validate([
            'kind' => ['sometimes', Rule::in(['customers', 'contacts'])],
            'file' => ['required_without:csv', 'file', 'mimetypes:text/csv,text/plain,application/csv,application/vnd.ms-excel', 'max:5120'],
            'csv' => ['required_without:file', 'string', 'max:5242880'],
            'origin_brand_id' => ['required_unless:kind,contacts', 'nullable', 'uuid'],
            'dry_run' => ['sometimes', 'boolean'],
        ]);
        $csv = isset($data['file']) ? (string) file_get_contents($data['file']->getRealPath()) : (string) $data['csv'];

        return response()->json(['data' => $importer->import($data['kind'] ?? 'customers', $csv, $data['origin_brand_id'] ?? null, (bool) ($data['dry_run'] ?? false))]);
    }

    private function contact(Request $request, Customer $customer): ?Contact
    {
        $id = $request->validate(['contact_id' => ['sometimes', 'nullable', 'uuid']])['contact_id'] ?? null;

        return $id === null ? null : Contact::query()->where('customer_id', $customer->id)->findOrFail($id);
    }
}
