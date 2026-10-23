<?php

declare(strict_types=1);

namespace App\Modules\Customers\Http\Controllers\Admin;

use App\Modules\Customers\Contracts\TaxIdLookup;
use App\Modules\Customers\Http\Resources\CustomerResource;
use App\Modules\Customers\Models\AuditEntry;
use App\Modules\Customers\Models\Customer;
use App\Modules\Customers\Services\CustomerService;
use App\Modules\Customers\Services\MergeService;
use App\Modules\Customers\Services\PrivacyService;
use App\Modules\Customers\Services\RelatedRecords;
use App\Modules\Customers\Support\TaxIdValidator;
use App\Shared\Audit\AuditLogger;
use App\Shared\Contracts\AccessControl;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Pagination\CursorPagination;
use App\Shared\Http\Resources\ModelResource;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * /api/v1/admin/customers (customers.customer.*): P-CUS-01, 02, 03 y 05.
 * Listado con búsqueda y filtros por cursor, alta con duplicados, edición
 * con versión, baja, fusión, ficha 360°, historial y exportación.
 */
final class CustomerController
{
    private const OPEN_INVOICE = ['issued', 'partially_paid', 'overdue'];

    public function __construct(
        private readonly CustomerService $customers,
        private readonly AuditLogger $audit,
    ) {}

    public function index(Request $request): JsonResponse
    {
        return CursorPagination::respond($this->filtered($request), $request, ['code', 'legal_name', 'trade_name', 'country', 'created_at', 'updated_at'], CustomerResource::class, 'legal_name');
    }

    public function store(Request $request): JsonResponse
    {
        $customer = $this->customers->create($request->validate($this->customers->rules(null)));

        return (new CustomerResource($customer->refresh()))->response()->setStatusCode(201);
    }

    public function show(string $id): CustomerResource
    {
        return new CustomerResource($this->find($id));
    }

    public function update(Request $request, string $id): CustomerResource
    {
        $customer = $this->find($id);
        $data = $request->validate(['version' => ['required', 'integer']] + $this->customers->rules($customer));

        return new CustomerResource($this->customers->update($customer, $data, 'admin')->refresh());
    }

    /** Baja lógica; con deuda o servicios activos responde 409 (misma regla que P-CUS-06). */
    public function destroy(string $id, PrivacyService $privacy): Response
    {
        $customer = $this->find($id);
        $privacy->assertErasable($customer);
        DB::transaction(function () use ($customer): void {
            $before = $customer->attributesToArray();
            $customer->forceFill(['status' => 'inactive'])->save();
            $customer->delete();
            $this->audit->record('customer.deleted', 'customer', $customer->id, $before, null, [], $customer->id);
        });

        return response()->noContent();
    }

    /** GET …/customers/duplicates: coincidencias al salir del campo documento (P-CUS-02). */
    public function duplicates(Request $request): JsonResponse
    {
        $data = $request->validate([
            'tax_id_type' => ['nullable', Rule::in(TaxIdValidator::TYPES)],
            'tax_id' => ['nullable', 'string', 'max:30'],
            'email' => ['nullable', 'string', 'max:255'],
            'legal_name' => ['nullable', 'string', 'max:300'],
            'except_id' => ['nullable', 'uuid'],
        ]);

        return response()->json(['data' => $this->customers->findDuplicates($data['tax_id_type'] ?? null, $data['tax_id'] ?? null, $data['email'] ?? null, $data['legal_name'] ?? null, $data['except_id'] ?? null)]);
    }

    /** GET …/customers/tax-id-lookup: valida el documento y consulta el conector (nulo por defecto). */
    public function taxIdLookup(Request $request, TaxIdLookup $lookup): JsonResponse
    {
        $data = $request->validate(['tax_id_type' => ['required', Rule::in(TaxIdValidator::TYPES)], 'tax_id' => ['required', 'string', 'max:30'], 'country' => ['nullable', 'string', 'size:2']]);
        $taxId = TaxIdValidator::normalize($data['tax_id_type'], $data['tax_id']);
        $error = TaxIdValidator::error($data['tax_id_type'], $taxId, $data['country'] ?? null);
        if ($error !== null) {
            throw ProblemException::validation(['tax_id' => [$error]]);
        }

        return response()->json(['data' => ['tax_id_type' => $data['tax_id_type'], 'tax_id' => $taxId, 'valid' => true, 'lookup' => $lookup->lookup($data['tax_id_type'], $taxId)]]);
    }

    /** GET …/customers/merge-preview: comparación y conteos que se moverán (P-CUS-05). */
    public function mergePreview(Request $request, MergeService $merge): JsonResponse
    {
        $data = $request->validate(['survivor_id' => ['required', 'uuid'], 'absorbed_id' => ['required', 'uuid', 'different:survivor_id']]);
        $survivor = $this->find($data['survivor_id']);
        $absorbed = $this->find($data['absorbed_id']);

        return response()->json(['data' => [
            'survivor' => (new CustomerResource($survivor))->resolve($request),
            'absorbed' => (new CustomerResource($absorbed))->resolve($request),
            'fields' => MergeService::FIELDS,
            'counts' => $merge->preview($survivor, $absorbed),
        ]]);
    }

    /** POST …/customers/merge (mergeCustomers). */
    public function merge(Request $request, MergeService $merge): JsonResponse
    {
        $data = $request->validate([
            'survivor_id' => ['required', 'uuid'],
            'absorbed_id' => ['required', 'uuid'],
            'survivor_version' => ['required', 'integer'],
            'absorbed_version' => ['required', 'integer'],
            'confirm_code' => ['required', 'string'],
            'fields' => ['sometimes', 'array'],
            'fields.*' => [Rule::in(['survivor', 'absorbed'])],
        ]);
        $result = $merge->merge($data['survivor_id'], $data['absorbed_id'], $data['confirm_code'], $data['fields'] ?? [], (int) $data['survivor_version'], (int) $data['absorbed_version']);

        return response()->json(['data' => (new CustomerResource($result['survivor']->refresh()))->resolve($request), 'meta' => ['moved' => (object) $result['moved']]]);
    }

    /** GET …/customers/{id}/overview: ficha 360° (P-CUS-03). Pestañas de otros módulos: conteos por tabla. */
    public function overview(Request $request, string $id, RelatedRecords $related, AccessControl $access): JsonResponse
    {
        $customer = $this->find($id);
        $exempt = DB::table('settings')->where('key', 'services.suspension.exempt')->where('scope_type', 'customer')->where('scope_id', $customer->id)->value('value');
        $balance = DB::table('invoices')->where('customer_id', $customer->id)->whereIn('status', self::OPEN_INVOICE)
            ->selectRaw('currency, sum(balance_minor) as balance_minor')->groupBy('currency')->pluck('balance_minor', 'currency')->map(fn ($v) => (int) $v);

        $data = [
            'customer' => (new CustomerResource($customer))->resolve($request),
            'suspension_exempt' => $exempt !== null && json_decode((string) $exempt, true) === true,
            'balance_minor' => (object) $balance->all(),
            'counts' => $related->counts($customer->id) + [
                'customer_notes' => $customer->notes()->count(),
                'contacts' => $customer->contacts()->count(),
            ],
            'billing_contact_missing' => ! $customer->contacts()->whereRaw("'billing' = ANY(roles)")->exists(),
        ];
        // Rentabilidad: la clave solo existe con finance.cost.view; el cálculo es de FIN (pendiente, null).
        if ($access->allows($request->user(), 'finance.cost.view')) {
            $data['profitability'] = null;
        }

        return response()->json(['data' => $data]);
    }

    /** GET …/customers/{id}/history: auditoría del cliente y de los absorbidos en fusiones. */
    public function history(Request $request, string $id): JsonResponse
    {
        $customer = $this->find($id);
        $ids = Customer::withTrashed()->where('merged_into_id', $customer->id)->pluck('id')->push($customer->id)->all();
        $query = AuditEntry::query()->whereIn('customer_id', $ids);
        if ($action = $request->input('filter.action')) {
            $query->where('action', $action);
        }

        return CursorPagination::respond($query, $request, ['occurred_at', 'chain_seq'], ModelResource::class, '-occurred_at');
    }

    /** POST …/customers/exports: CSV del listado filtrado (customers.customer.export). Síncrono, hasta 10 000 filas. */
    public function export(Request $request): StreamedResponse
    {
        $query = $this->filtered($request)->orderBy('code')->limit(10000);
        $this->audit->record('customer.exported', 'customer', null, null, null, ['filters' => (array) $request->input('filter', [])]);
        $columns = ['code', 'type', 'legal_name', 'trade_name', 'tax_id_type', 'tax_id', 'country', 'currency', 'email', 'phone', 'status', 'created_at'];

        return response()->streamDownload(function () use ($query, $columns): void {
            $out = fopen('php://output', 'wb');
            fputcsv($out, $columns, ',', '"', '\\');
            foreach ($query->cursor() as $c) {
                fputcsv($out, array_map(function ($col) use ($c) {
                    $v = (string) $c->getAttribute($col);

                    return $v !== '' && in_array($v[0], ['=', '+', '-', '@'], true) ? "'".$v : $v;
                }, $columns), ',', '"', '\\');
            }
            fclose($out);
        }, 'clientes.csv', ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    private function find(string $id): Customer
    {
        $customer = Customer::query()->find($id);
        if ($customer === null) {
            $merged = Customer::onlyTrashed()->whereKey($id)->value('merged_into_id');
            if ($merged !== null) {
                throw new ProblemException(404, 'customer_merged', 'El cliente fue fusionado.', ['merged_into_id' => $merged]);
            }
            throw ProblemException::notFound();
        }

        return $customer;
    }

    private function filtered(Request $request): Builder
    {
        $query = Customer::query()->select('customers.*')
            ->selectSub(DB::table('services')->selectRaw('count(*)')->whereColumn('services.customer_id', 'customers.id')->where('services.status', 'active')->whereNull('services.deleted_at'), 'active_services_count')
            ->selectSub(DB::table('invoices')->selectRaw('coalesce(sum(balance_minor), 0)')->whereColumn('invoices.customer_id', 'customers.id')->where('invoices.status', 'overdue'), 'overdue_balance_minor');

        foreach (['origin_brand_id', 'country', 'account_manager_id', 'status', 'type', 'currency'] as $column) {
            $value = $request->input("filter.{$column}");
            if (is_string($value) && $value !== '') {
                $query->where("customers.{$column}", $column === 'country' ? strtoupper($value) : $value);
            }
        }
        if (filter_var($request->input('filter.has_overdue_debt'), FILTER_VALIDATE_BOOLEAN)) {
            $query->whereExists(fn ($q) => $q->selectRaw('1')->from('invoices')->whereColumn('invoices.customer_id', 'customers.id')->where('invoices.status', 'overdue')->where('invoices.balance_minor', '>', 0));
        }
        if (is_string($tag = $request->input('filter.tag')) && $tag !== '') {
            $query->whereExists(fn ($q) => $q->selectRaw('1')->from('taggables as tg')->join('tags as t', 't.id', '=', 'tg.tag_id')
                ->where('tg.taggable_type', Customer::MORPH)->whereColumn('tg.taggable_id', 'customers.id')
                ->where(fn ($w) => \Illuminate\Support\Str::isUuid($tag) ? $w->where('t.id', $tag) : $w->where('t.slug', $tag)));
        }
        $custom = $request->input('filter.custom');
        if (is_array($custom) && $custom !== []) {
            $filterable = DB::table('custom_field_definitions')->where('entity_type', Customer::MORPH)->where('filterable', true)
                ->where('organization_id', app(\App\Shared\Organization\CurrentOrganization::class)->id())->pluck('key')->all();
            foreach ($custom as $key => $value) {
                if (! in_array($key, $filterable, true)) {
                    throw ProblemException::badRequest("El campo personalizado [{$key}] no es filtrable.");
                }
                $query->whereRaw('customers.custom ->> ? = ?', [$key, (string) $value]);
            }
        }
        if (is_string($q = $request->input('q')) && ($q = trim($q)) !== '') {
            $like = '%'.str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], mb_strtolower($q)).'%';
            $query->where(fn ($w) => $w->whereRaw('lower(customers.legal_name) like ?', [$like])
                ->orWhereRaw('lower(customers.trade_name) like ?', [$like])
                ->orWhereRaw('lower(customers.code) like ?', [$like])
                ->orWhereRaw('lower(customers.email) like ?', [$like])
                ->orWhere('customers.tax_id', 'like', strtoupper($like)));
        }

        return $query;
    }
}
