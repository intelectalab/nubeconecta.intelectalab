<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Http\Controllers;

use App\Modules\Catalog\Models\Product;
use App\Shared\Http\Controllers\ResourceController;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * /api/v1/admin/products (catalog.product.*), P-CAT-01/02. El detalle trae
 * planes con sus precios y las fichas por marca. Un producto usado en pedidos
 * o servicios no se borra: se desactiva (M-CAT §5).
 */
final class ProductController extends ResourceController
{
    protected function model(): string
    {
        return Product::class;
    }

    protected function entity(): string
    {
        return 'product';
    }

    protected function with(): array
    {
        return ['category:id,code,name,kind', 'plans.prices', 'listings'];
    }

    protected function rules(Request $request, ?Model $model): array
    {
        $org = app(CurrentOrganization::class)->id();
        $req = $model === null ? 'required' : 'sometimes';

        return [
            'code' => [$req, 'string', 'max:80', 'regex:/^[A-Za-z0-9]+([._-][A-Za-z0-9]+)*$/'],
            'category_id' => [$req, 'uuid', Rule::exists('product_categories', 'id')->where('organization_id', $org)],
            'brand_id' => ['sometimes', 'nullable', 'uuid', Rule::exists('brands', 'id')->where('organization_id', $org)->whereNull('deleted_at')],
            'name' => [$req, 'string', 'max:200'],
            'description' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'billing_type' => [$req, Rule::in(['recurring', 'one_time'])],
            'provisioning_rule' => ['sometimes', Rule::in(['manual', 'automatic'])],
            'requires_contract' => ['sometimes', 'boolean'],
            'export_eligible' => ['sometimes', 'boolean'],
            'tax_code' => ['sometimes', 'nullable', 'string', 'max:20'],
            'is_active' => ['sometimes', 'boolean'],
            'sellable_online' => ['sometimes', 'boolean'],
            'custom' => ['sometimes', 'array'],
        ];
    }

    protected function sortable(): array
    {
        return ['code', 'name', 'created_at', 'updated_at'];
    }

    protected function defaultSort(): string
    {
        return 'name';
    }

    protected function filters(): array
    {
        return ['category_id' => 'category_id', 'brand_id' => 'brand_id', 'is_active' => 'is_active', 'sellable_online' => 'sellable_online', 'billing_type' => 'billing_type'];
    }

    protected function query(): Builder
    {
        $query = parent::query();
        $q = trim((string) request()->query('q', ''));
        if ($q !== '') {
            $query->where(fn (Builder $w) => $w->where('name', 'ilike', "%{$q}%")->orWhere('code', 'ilike', "%{$q}%"));
        }
        $brand = request()->attributes->get('catalog.brand');
        if (is_string($brand)) {
            $query->where(fn (Builder $w) => $w->whereNull('brand_id')->orWhere('brand_id', $brand));
        }

        return $query;
    }

    public function index(Request $request): JsonResponse
    {
        // filter[brand_id] incluye los productos de todas las marcas (brand_id NULL).
        $brand = $request->input('filter.brand_id');
        if (is_string($brand) && $brand !== '') {
            $filter = (array) $request->input('filter', []);
            unset($filter['brand_id']);
            $request->merge(['filter' => $filter]);
            $request->attributes->set('catalog.brand', $brand);
        }

        return parent::index($request);
    }

    protected function beforeDelete(Model $model): void
    {
        if (DB::table('order_items')->where('product_id', $model->getKey())->exists() || DB::table('services')->where('product_id', $model->getKey())->exists()) {
            throw new ProblemException(409, 'product_in_use', 'El producto tiene pedidos o servicios: desactívelo en lugar de borrarlo.');
        }
    }
}
