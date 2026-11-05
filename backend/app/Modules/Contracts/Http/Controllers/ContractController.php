<?php

declare(strict_types=1);

namespace App\Modules\Contracts\Http\Controllers;

use App\Modules\Contracts\Http\Resources\ContractResource;
use App\Modules\Contracts\Models\Contract;
use App\Modules\Contracts\Services\ContractService;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class ContractController
{
    public function __construct(private readonly ContractService $contracts) {}

    public function index(Request $request): JsonResponse
    {
        $request->validate(['filter.status' => ['sometimes', Rule::in(Contract::STATUSES)], 'filter.customer_id' => ['sometimes', 'uuid'], 'filter.brand_id' => ['sometimes', 'uuid'], 'filter.currency' => ['sometimes', Rule::in(['PEN', 'USD'])], 'q' => ['sometimes', 'nullable', 'string', 'max:100']]);
        $query = Contract::query()->with(['currentVersion', 'customer:id,code,legal_name,trade_name', 'brand:id,name', 'approver:id,name']);
        foreach (['status', 'customer_id', 'brand_id', 'currency'] as $column) {
            $value = $request->input("filter.{$column}");
            if (is_string($value) && $value !== '') { $query->where($column, $value); }
        }
        $q = trim((string) $request->query('q', ''));
        if ($q !== '') { $query->where(fn (Builder $w) => $w->where('number', 'ilike', "%{$q}%")->orWhereHas('customer', fn (Builder $c) => $c->where('legal_name', 'ilike', "%{$q}%")->orWhere('trade_name', 'ilike', "%{$q}%"))); }
        return CursorPagination::respond($query, $request, ['created_at', 'number', 'status', 'starts_on', 'ends_on'], ContractResource::class);
    }

    public function store(Request $request): JsonResponse
    {
        return (new ContractResource($this->contracts->create($request->validate($this->contracts->rules()), $request->header('Idempotency-Key'))))->response()->setStatusCode(201);
    }

    public function show(string $id): ContractResource
    {
        return new ContractResource(Contract::query()->with(['currentVersion', 'customer:id,code,legal_name,trade_name', 'brand:id,name', 'approver:id,name', 'quote:id,number'])->findOrFail($id));
    }

    public function update(Request $request, string $id): ContractResource
    {
        return new ContractResource($this->contracts->updateDraft(Contract::query()->findOrFail($id), $request->validate($this->contracts->updateRules())));
    }

    public function submit(Request $request, string $id): ContractResource { return new ContractResource($this->contracts->submit(Contract::query()->findOrFail($id), $this->version($request))); }
    public function approve(Request $request, string $id): ContractResource { return new ContractResource($this->contracts->approve(Contract::query()->findOrFail($id), $this->version($request))); }
    public function send(Request $request, string $id): ContractResource { return new ContractResource($this->contracts->send(Contract::query()->findOrFail($id), $this->version($request))); }
    public function sign(Request $request, string $id): ContractResource { return new ContractResource($this->contracts->sign(Contract::query()->findOrFail($id), $this->version($request))); }
    public function expire(Request $request, string $id): ContractResource { return new ContractResource($this->contracts->expire(Contract::query()->findOrFail($id), $this->version($request))); }

    public function terminate(Request $request, string $id): ContractResource
    {
        $data = $request->validate(['version' => ['required', 'integer'], 'reason' => ['required', 'string', 'min:1', 'max:2000']]);
        return new ContractResource($this->contracts->terminate(Contract::query()->findOrFail($id), $data['reason'], (int) $data['version']));
    }

    public function addendum(Request $request, string $id): ContractResource
    {
        $data = $request->validate(['version' => ['required', 'integer'], 'body' => ['required', 'string'], 'change_summary' => ['required', 'string', 'max:2000'], 'clause_ids' => ['sometimes', 'array'], 'clause_ids.*' => ['uuid'], 'variables' => ['sometimes', 'array']]);
        return new ContractResource($this->contracts->addendum(Contract::query()->findOrFail($id), $data));
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $this->contracts->deleteDraft(Contract::query()->findOrFail($id), $this->version($request));
        return response()->json(null, 204);
    }

    private function version(Request $request): int { return (int) $request->validate(['version' => ['required', 'integer']])['version']; }
}
