<?php

declare(strict_types=1);

namespace App\Modules\Providers\Http\Controllers\Admin;

use App\Modules\Providers\Http\Resources\ProviderResource;
use App\Modules\Providers\Models\Provider;
use App\Modules\Providers\Services\ProviderService;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;

final class ProviderController
{
    public function __construct(private readonly ProviderService $providers) {}

    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'filter.type' => ['sometimes', Rule::in(Provider::TYPES)],
            'filter.status' => ['sometimes', Rule::in(['active', 'inactive'])],
            'filter.origin' => ['sometimes', Rule::in(['company', 'customer'])],
            'filter.customer_id' => ['sometimes', 'uuid'],
            'q' => ['sometimes', 'nullable', 'string', 'max:100'],
        ]);
        $query = Provider::query()->with('customer:id,code,legal_name,trade_name');
        foreach (['type', 'status', 'origin', 'customer_id'] as $column) {
            if (($value = $request->input("filter.{$column}")) !== null && $value !== '') {
                $query->where($column, $value);
            }
        }
        if (($q = trim((string) $request->query('q', ''))) !== '') {
            $query->where(fn (Builder $w) => $w->where('code', 'ilike', "%{$q}%")->orWhere('name', 'ilike', "%{$q}%"));
        }

        return CursorPagination::respond($query, $request, ['code', 'name', 'type', 'status', 'created_at', 'updated_at'], ProviderResource::class, 'name');
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->providers->rules());
        if (($data['origin'] ?? 'company') === 'customer' && empty($data['customer_id'])) {
            throw ProblemException::validation(['customer_id' => ['El campo customer_id es obligatorio cuando origin es customer.']]);
        }
        $provider = $this->providers->create($data)->load('customer:id,code,legal_name,trade_name');

        return (new ProviderResource($provider))->response()->setStatusCode(201);
    }

    public function show(string $id): ProviderResource
    {
        return new ProviderResource($this->find($id)->load(['customer:id,code,legal_name,trade_name', 'accounts']));
    }

    public function update(Request $request, string $id): ProviderResource|JsonResponse
    {
        $provider = $this->find($id);
        $data = $request->validate($this->providers->updateRules($provider));
        $customerId = array_key_exists('customer_id', $data) ? $data['customer_id'] : $provider->customer_id;
        if (($data['origin'] ?? $provider->origin) === 'customer' && $customerId === null) {
            throw ProblemException::validation(['customer_id' => ['El campo customer_id es obligatorio cuando origin es customer.']]);
        }

        return new ProviderResource($this->providers->update($provider, $data)->load('customer:id,code,legal_name,trade_name'));
    }

    public function destroy(Request $request, string $id): Response
    {
        $data = $request->validate(['version' => ['required', 'integer']]);
        $this->providers->delete($this->find($id), (int) $data['version']);

        return response()->noContent();
    }

    private function find(string $id): Provider
    {
        return Provider::query()->with('customer:id,code,legal_name,trade_name')->findOrFail($id);
    }
}
