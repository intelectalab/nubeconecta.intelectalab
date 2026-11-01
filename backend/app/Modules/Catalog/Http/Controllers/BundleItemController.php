<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Http\Controllers;

use App\Modules\Catalog\Http\Resources\BundleItemResource;
use App\Modules\Catalog\Models\Plan;
use App\Shared\Audit\AuditLogger;
use App\Shared\Concurrency\VersionGuard;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/** Gestiona la composición de planes paquete mediante planes componente. */
final class BundleItemController
{
    public function __construct(private readonly AuditLogger $audit) {}

    public function index(string $id): JsonResponse
    {
        $bundle = Plan::query()->findOrFail($id);
        $items = $bundle->bundleItems()->with('itemPlan')->get();

        return BundleItemResource::collection($items)->response();
    }

    public function store(Request $request, string $id): JsonResponse
    {
        $bundle = Plan::query()->findOrFail($id);
        $organizationId = app(CurrentOrganization::class)->id();
        $data = $request->validate([
            'item_plan_id' => [
                'required', 'uuid',
                Rule::exists('plans', 'id')->where('organization_id', $organizationId)->where('is_active', true)->whereNull('deleted_at'),
                Rule::notIn([$bundle->id]),
            ],
            'quantity' => ['sometimes', 'numeric', 'gt:0'],
        ]);

        if ($bundle->bundleItems()->where('item_plan_id', $data['item_plan_id'])->exists()) {
            throw ProblemException::validation(['item_plan_id' => ['Este plan ya forma parte del paquete.']]);
        }

        try {
            $item = DB::transaction(function () use ($bundle, $data) {
                $item = $bundle->bundleItems()->create([
                    'item_plan_id' => $data['item_plan_id'],
                    'quantity' => $data['quantity'] ?? 1,
                ]);
                $this->audit->record('bundle_item.created', 'bundle_item', $item->id, null, $item->attributesToArray());

                return $item->load('itemPlan');
            });
        } catch (QueryException $exception) {
            if ($this->isUniqueViolation($exception)) {
                throw ProblemException::validation(['item_plan_id' => ['Este plan ya forma parte del paquete.']]);
            }

            throw $exception;
        }

        return (new BundleItemResource($item))->response()->setStatusCode(201);
    }

    public function update(Request $request, string $id, string $item): BundleItemResource
    {
        $bundle = Plan::query()->findOrFail($id);
        $model = $bundle->bundleItems()->findOrFail($item);
        $data = $request->validate([
            'version' => ['required', 'integer', 'min:1'],
            'quantity' => ['required', 'numeric', 'gt:0'],
        ]);

        DB::transaction(function () use ($model, $data): void {
            VersionGuard::check($model, $data['version']);
            $before = $model->attributesToArray();
            $model->fill(['quantity' => $data['quantity']]);
            $model->save();
            $this->audit->record('bundle_item.updated', 'bundle_item', $model->id, $before, $model->refresh()->attributesToArray());
        });

        return new BundleItemResource($model->load('itemPlan'));
    }

    public function destroy(string $id, string $item): Response
    {
        $bundle = Plan::query()->findOrFail($id);
        $model = $bundle->bundleItems()->findOrFail($item);

        DB::transaction(function () use ($model): void {
            $before = $model->attributesToArray();
            $model->delete();
            $this->audit->record('bundle_item.deleted', 'bundle_item', $model->id, $before, null);
        });

        return response()->noContent();
    }

    private function isUniqueViolation(QueryException $exception): bool
    {
        return in_array((string) ($exception->errorInfo[0] ?? $exception->getCode()), ['23000', '23505'], true);
    }
}
