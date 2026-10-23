<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Http\Controllers;

use App\Modules\Catalog\Models\ProductCategory;
use App\Shared\Http\Controllers\ResourceController;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/** /api/v1/admin/product-categories (catalog.product_category.*), P-CAT-10. */
final class ProductCategoryController extends ResourceController
{
    protected function model(): string
    {
        return ProductCategory::class;
    }

    protected function entity(): string
    {
        return 'product_category';
    }

    protected function rules(Request $request, ?Model $model): array
    {
        $org = app(CurrentOrganization::class)->id();
        $req = $model === null ? 'required' : 'sometimes';

        return [
            'code' => [$req, 'string', 'max:60', 'regex:/^[a-z0-9]+(-[a-z0-9]+)*$/'],
            'name' => [$req, 'string', 'max:200'],
            'kind' => ['sometimes', Rule::in(ProductCategory::KINDS)],
            'parent_id' => ['sometimes', 'nullable', 'uuid', Rule::exists('product_categories', 'id')->where('organization_id', $org)],
            'shortcode_type' => ['sometimes', 'nullable', 'string', 'max:60', 'regex:/^[a-z0-9]+(-[a-z0-9]+)*$/'],
            'sort_order' => ['sometimes', 'integer', 'min:0', 'max:100000'],
        ];
    }

    protected function sortable(): array
    {
        return ['sort_order', 'code', 'name', 'created_at'];
    }

    protected function defaultSort(): string
    {
        return 'sort_order,code';
    }

    protected function filters(): array
    {
        return ['kind' => 'kind', 'parent_id' => 'parent_id'];
    }

    protected function beforeSave(Model $model, array $data, bool $creating): void
    {
        if (! $creating && $model->getAttribute('is_system') && $model->isDirty('kind')) {
            throw new ProblemException(409, 'system_category_protected', 'Una categoría del sistema no cambia de tipo.');
        }
        if ($model->getAttribute('parent_id') !== null && $model->getAttribute('parent_id') === $model->getKey()) {
            throw ProblemException::validation(['parent_id' => ['Una categoría no puede ser su propia categoría padre.']]);
        }
    }

    protected function beforeDelete(Model $model): void
    {
        if ($model->getAttribute('is_system')) {
            throw new ProblemException(409, 'system_category_protected', 'Las categorías del sistema no se borran.');
        }
        if (DB::table('products')->where('category_id', $model->getKey())->exists() || DB::table('product_categories')->where('parent_id', $model->getKey())->exists()) {
            throw new ProblemException(409, 'conflict', 'La categoría tiene productos o subcategorías.');
        }
    }
}
