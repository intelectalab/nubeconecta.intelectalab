<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Http\Controllers;

use App\Modules\Catalog\Models\ProductListing;
use App\Shared\Http\Controllers\ResourceController;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * /api/v1/admin/product-listings (catalog.product_listing.*), P-CAT-05: ficha
 * del producto en una marca. Es lo que publica `/public/wp/catalog` (RN-CAT-001).
 */
final class ProductListingController extends ResourceController
{
    protected function model(): string
    {
        return ProductListing::class;
    }

    protected function entity(): string
    {
        return 'product_listing';
    }

    protected function rules(Request $request, ?Model $model): array
    {
        $org = app(CurrentOrganization::class)->id();
        $creating = $model === null;

        return [
            'product_id' => [$creating ? 'required' : 'prohibited', 'uuid', Rule::exists('products', 'id')->where('organization_id', $org)->whereNull('deleted_at')],
            'brand_id' => [$creating ? 'required' : 'prohibited', 'uuid', Rule::exists('brands', 'id')->where('organization_id', $org)->whereNull('deleted_at')],
            'display_name' => [$creating ? 'required' : 'sometimes', 'array'],
            'display_name.es' => [$creating ? 'required' : 'sometimes', 'string', 'max:200'],
            'display_name.en' => ['sometimes', 'string', 'max:200'],
            'tagline' => ['sometimes', 'array'],
            'tagline.*' => ['string', 'max:300'],
            'highlights' => ['sometimes', 'array', 'max:30'],
            'sellable_online' => ['sometimes', 'boolean'],
            'is_featured' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'integer', 'min:0', 'max:100000'],
            'visible_from' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
            'visible_until' => ['sometimes', 'nullable', 'date_format:Y-m-d', 'after:visible_from'],
        ];
    }

    protected function sortable(): array
    {
        return ['sort_order', 'created_at'];
    }

    protected function defaultSort(): string
    {
        return 'sort_order';
    }

    protected function filters(): array
    {
        return ['product_id' => 'product_id', 'brand_id' => 'brand_id', 'sellable_online' => 'sellable_online'];
    }

    protected function beforeSave(Model $model, array $data, bool $creating): void
    {
        $productBrand = DB::table('products')->where('id', $model->getAttribute('product_id'))->value('brand_id');
        if ($productBrand !== null && $productBrand !== $model->getAttribute('brand_id')) {
            throw ProblemException::validation(['brand_id' => ['El producto pertenece a otra marca.']]);
        }
    }
}
