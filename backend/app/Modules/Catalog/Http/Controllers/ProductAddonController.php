<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Http\Controllers;

use App\Modules\Catalog\Http\Resources\ProductAddonResource;
use App\Modules\Catalog\Models\Product;
use App\Modules\Catalog\Models\ProductAddon;
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

/** Gestiona los complementos de un producto dentro de su ficha de catálogo. */
final class ProductAddonController
{
    public function __construct(private readonly AuditLogger $audit) {}

    public function index(string $id): JsonResponse
    {
        $product = Product::query()->findOrFail($id);
        $addons = $product->addons()->with('addonProduct')->get();

        return ProductAddonResource::collection($addons)->response();
    }

    public function store(Request $request, string $id): JsonResponse
    {
        $product = Product::query()->findOrFail($id);
        $organizationId = app(CurrentOrganization::class)->id();
        $data = $request->validate([
            'addon_product_id' => [
                'required', 'uuid', Rule::exists('products', 'id')->where('organization_id', $organizationId)->whereNull('deleted_at'),
                Rule::notIn([$product->id]),
            ],
            'is_required' => ['sometimes', 'boolean'],
        ]);

        if ($product->addons()->where('addon_product_id', $data['addon_product_id'])->exists()) {
            throw ProblemException::validation(['addon_product_id' => ['Este complemento ya está adjunto al producto.']]);
        }

        try {
            $addon = DB::transaction(function () use ($product, $data): ProductAddon {
                $addon = $product->addons()->create([
                    'addon_product_id' => $data['addon_product_id'],
                    'is_required' => $data['is_required'] ?? false,
                ]);
                $this->audit->record('product_addon.created', 'product_addon', $addon->id, null, $addon->attributesToArray());

                return $addon->load('addonProduct');
            });
        } catch (QueryException $exception) {
            if ($this->isUniqueViolation($exception)) {
                throw ProblemException::validation(['addon_product_id' => ['Este complemento ya está adjunto al producto.']]);
            }

            throw $exception;
        }

        return (new ProductAddonResource($addon))->response()->setStatusCode(201);
    }

    public function update(Request $request, string $id, string $addon): ProductAddonResource
    {
        $product = Product::query()->findOrFail($id);
        $model = $product->addons()->findOrFail($addon);
        $data = $request->validate([
            'version' => ['required', 'integer', 'min:1'],
            'is_required' => ['sometimes', 'boolean'],
        ]);

        DB::transaction(function () use ($model, $data): void {
            VersionGuard::check($model, $data['version']);
            $before = $model->attributesToArray();
            $model->fill(array_intersect_key($data, array_flip(['is_required'])));
            $model->save();
            $this->audit->record('product_addon.updated', 'product_addon', $model->id, $before, $model->refresh()->attributesToArray());
        });

        return new ProductAddonResource($model->load('addonProduct'));
    }

    public function destroy(string $id, string $addon): Response
    {
        $product = Product::query()->findOrFail($id);
        $model = $product->addons()->findOrFail($addon);

        DB::transaction(function () use ($model): void {
            $before = $model->attributesToArray();
            $model->delete();
            $this->audit->record('product_addon.deleted', 'product_addon', $model->id, $before, null);
        });

        return response()->noContent();
    }

    private function isUniqueViolation(QueryException $exception): bool
    {
        return in_array((string) ($exception->errorInfo[0] ?? $exception->getCode()), ['23000', '23505'], true);
    }
}
