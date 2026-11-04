<?php

declare(strict_types=1);

namespace App\Modules\Sales\Http\Controllers;

use App\Modules\Sales\Http\Resources\QuoteResource;
use App\Modules\Sales\Models\Quote;
use App\Modules\Sales\Services\QuoteService;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class QuoteController
{
    public function __construct(private readonly QuoteService $quotes) {}

    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'filter.status' => ['sometimes', Rule::in(Quote::STATUSES)], 'filter.customer_id' => ['sometimes', 'uuid'],
            'filter.brand_id' => ['sometimes', 'uuid'], 'filter.currency' => ['sometimes', Rule::in(['PEN', 'USD'])],
            'q' => ['sometimes', 'nullable', 'string', 'max:100'],
        ]);
        $query = Quote::query()->with(['currentVersion.items', 'customer:id,code,legal_name,trade_name', 'lead:id,name,company_name', 'brand:id,name', 'owner:id,name']);
        foreach (['status', 'customer_id', 'brand_id', 'currency'] as $column) {
            $value = $request->input("filter.{$column}");
            if (is_string($value) && $value !== '') { $query->where($column, $value); }
        }
        $q = trim((string) $request->query('q', ''));
        if ($q !== '') {
            $query->where(fn (Builder $w) => $w->where('number', 'ilike', "%{$q}%")
                ->orWhereHas('customer', fn (Builder $c) => $c->where('legal_name', 'ilike', "%{$q}%")->orWhere('trade_name', 'ilike', "%{$q}%"))
                ->orWhereHas('lead', fn (Builder $l) => $l->where('name', 'ilike', "%{$q}%")->orWhere('company_name', 'ilike', "%{$q}%")));
        }
        return CursorPagination::respond($query, $request, ['created_at', 'number', 'status', 'valid_until'], QuoteResource::class);
    }

    public function store(Request $request): JsonResponse
    {
        $quote = $this->quotes->create($request->validate($this->quotes->rules()), $request->header('Idempotency-Key'));
        return (new QuoteResource($quote))->response()->setStatusCode(201);
    }

    public function show(string $id): QuoteResource
    {
        return new QuoteResource(Quote::query()->with(['currentVersion.items', 'customer:id,code,legal_name,trade_name', 'lead:id,name,company_name', 'brand:id,name', 'owner:id,name'])->findOrFail($id));
    }

    public function update(Request $request, string $id): QuoteResource
    {
        $quote = $this->quotes->updateDraft(Quote::query()->findOrFail($id), $request->validate($this->quotes->updateRules()));
        return new QuoteResource($quote);
    }

    public function send(Request $request, string $id): QuoteResource { $data = $request->validate(['version' => ['required', 'integer']]); return new QuoteResource($this->quotes->send(Quote::query()->findOrFail($id), (int) $data['version'])); }
    public function accept(Request $request, string $id): QuoteResource { $data = $request->validate(['version' => ['required', 'integer']]); return new QuoteResource($this->quotes->accept(Quote::query()->findOrFail($id), (int) $data['version'])); }
    public function expire(Request $request, string $id): QuoteResource { $data = $request->validate(['version' => ['required', 'integer']]); return new QuoteResource($this->quotes->expire(Quote::query()->findOrFail($id), (int) $data['version'])); }

    public function reject(Request $request, string $id): QuoteResource
    {
        $data = $request->validate(['version' => ['required', 'integer'], 'reason' => ['required', 'string', 'min:1', 'max:2000']]);
        return new QuoteResource($this->quotes->reject(Quote::query()->findOrFail($id), $data['reason'], (int) $data['version']));
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $data = $request->validate(['version' => ['required', 'integer']]);
        $this->quotes->deleteDraft(Quote::query()->findOrFail($id), (int) $data['version']);
        return response()->json(null, 204);
    }
}
