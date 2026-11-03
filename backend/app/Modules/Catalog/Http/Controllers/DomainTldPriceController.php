<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Http\Controllers;

use App\Modules\Catalog\Http\Resources\DomainTldPriceResource;
use App\Modules\Catalog\Models\DomainTldPrice;
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
use Illuminate\Validation\Rule;

final class DomainTldPriceController
{
    public function __construct(private readonly AuditLogger $audit) {}

    public function index(Request $request): JsonResponse
    {
        $query = DomainTldPrice::query();
        foreach (['tld', 'operation', 'currency'] as $filter) {
            $value = $request->query($filter);
            if ($value !== null && $value !== '') {
                $query->where($filter, $value);
            }
        }

        return CursorPagination::respond($query, $request, ['tld', 'operation', 'currency', 'effective_from', 'created_at', 'updated_at'], DomainTldPriceResource::class, '-effective_from');
    }

    public function show(string $id): DomainTldPriceResource
    {
        return new DomainTldPriceResource(DomainTldPrice::query()->findOrFail($id));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->createRules());
        $this->validateDateRange($data['effective_from'], $data['effective_to'] ?? null);
        try {
            $price = DB::transaction(function () use ($data): DomainTldPrice {
                $price = DomainTldPrice::query()->create($data);
                $this->audit->record('domain_tld_price.created', 'domain_tld_price', $price->id, null, $price->refresh()->attributesToArray());

                return $price;
            });
        } catch (QueryException $exception) {
            $this->translateDatabaseException($exception);
            throw $exception;
        }

        return (new DomainTldPriceResource($price))->response()->setStatusCode(201);
    }

    public function update(Request $request, string $id): DomainTldPriceResource
    {
        $price = DomainTldPrice::query()->findOrFail($id);
        $data = $request->validate([
            'version' => ['required', 'integer', 'min:1'],
            'tld' => ['prohibited'], 'provider_id' => ['prohibited'], 'operation' => ['prohibited'],
            'years' => ['prohibited'], 'currency' => ['prohibited'], 'effective_from' => ['prohibited'],
            'domain_extension_id' => ['prohibited'],
            'cost_minor' => ['sometimes', 'integer', 'min:0'], 'cost_currency' => ['sometimes', 'regex:/^[A-Z]{3}$/'],
            'price_minor' => ['sometimes', 'integer', 'min:0'], 'effective_to' => ['sometimes', 'nullable', 'date'],
        ]);
        if (array_key_exists('effective_to', $data)) {
            $this->validateDateRange($price->effective_from->toDateString(), $data['effective_to']);
        }
        DB::transaction(function () use ($price, $data): void {
            VersionGuard::check($price, $data['version']);
            $before = $price->attributesToArray();
            $price->fill(array_intersect_key($data, array_flip(['cost_minor', 'cost_currency', 'price_minor', 'effective_to'])))->save();
            $this->audit->record('domain_tld_price.updated', 'domain_tld_price', $price->id, $before, $price->refresh()->attributesToArray());
        });

        return new DomainTldPriceResource($price);
    }

    public function destroy(string $id): Response
    {
        $price = DomainTldPrice::query()->findOrFail($id);
        DB::transaction(function () use ($price): void {
            $before = $price->attributesToArray();
            $price->delete();
            $this->audit->record('domain_tld_price.deleted', 'domain_tld_price', $price->id, $before, null);
        });

        return response()->noContent();
    }

    private function createRules(): array
    {
        $org = app(CurrentOrganization::class)->id();

        return [
            'tld' => ['required', 'string', 'regex:/^[a-z0-9.-]+$/'],
            'provider_id' => ['required', 'uuid', Rule::exists('providers', 'id')->where('organization_id', $org)],
            'operation' => ['required', Rule::in(['register', 'renew', 'transfer', 'restore'])],
            'years' => ['sometimes', 'integer', 'between:1,10'],
            'cost_minor' => ['required', 'integer', 'min:0'], 'cost_currency' => ['required', 'regex:/^[A-Z]{3}$/'],
            'price_minor' => ['required', 'integer', 'min:0'], 'currency' => ['required', Rule::in(['PEN', 'USD'])],
            'effective_from' => ['required', 'date'], 'effective_to' => ['sometimes', 'nullable', 'date', 'after:effective_from'],
            'domain_extension_id' => ['sometimes', 'nullable', 'uuid', Rule::exists('domain_extensions', 'id')->where('organization_id', $org)],
        ];
    }

    private function validateDateRange(string $from, ?string $to): void
    {
        if ($to !== null && $to <= $from) {
            throw ProblemException::validation(['effective_to' => ['La fecha de fin debe ser posterior al inicio de la vigencia.']]);
        }
    }

    private function translateDatabaseException(QueryException $exception): void
    {
        $state = (string) ($exception->errorInfo[0] ?? $exception->getCode());
        if ($state === '23505') {
            throw ProblemException::validation(['effective_from' => ['Ya existe un precio para esa extensión/operación/moneda a partir de esa fecha.']]);
        }
        if ($state === '23503') {
            throw ProblemException::validation(['provider_id' => ['La referencia indicada no es válida para esta organización.']]);
        }
    }
}
