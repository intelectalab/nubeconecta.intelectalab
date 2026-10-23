<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Http\Controllers;

use App\Modules\Catalog\Events\PlanChanged;
use App\Modules\Catalog\Models\Plan;
use App\Shared\Http\Controllers\ResourceController;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/** /api/v1/admin/plans (catalog.plan.*): planes/variantes de un producto por ciclo de cobro. */
final class PlanController extends ResourceController
{
    protected function model(): string
    {
        return Plan::class;
    }

    protected function entity(): string
    {
        return 'plan';
    }

    protected function with(): array
    {
        return ['prices'];
    }

    protected function rules(Request $request, ?Model $model): array
    {
        $org = app(CurrentOrganization::class)->id();
        $req = $model === null ? 'required' : 'sometimes';

        return [
            'product_id' => [$model === null ? 'required' : 'prohibited', 'uuid', Rule::exists('products', 'id')->where('organization_id', $org)->whereNull('deleted_at')],
            'code' => [$req, 'string', 'max:80', 'regex:/^[A-Za-z0-9]+([._-][A-Za-z0-9]+)*$/'],
            'name' => [$req, 'string', 'max:200'],
            'cycle' => [$req, Rule::in(Plan::CYCLES)],
            'cost_minor' => ['sometimes', 'nullable', 'integer', 'min:0', 'required_with:cost_currency'],
            'cost_currency' => ['sometimes', 'nullable', 'string', 'regex:/^[A-Z]{3}$/', 'required_with:cost_minor'],
            'tax_code' => ['sometimes', 'nullable', 'string', 'max:20'],
            'limits' => ['sometimes', 'array'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }

    protected function sortable(): array
    {
        return ['code', 'name', 'cycle', 'created_at'];
    }

    protected function defaultSort(): string
    {
        return 'code';
    }

    protected function filters(): array
    {
        return ['product_id' => 'product_id', 'cycle' => 'cycle', 'is_active' => 'is_active'];
    }

    protected function beforeDelete(Model $model): void
    {
        if (DB::table('order_items')->where('plan_id', $model->getKey())->exists()) {
            throw new ProblemException(409, 'plan_in_use', 'El plan tiene pedidos: desactívelo en lugar de borrarlo.');
        }
    }

    protected function afterSave(Model $model, bool $creating, ?array $before): void
    {
        PlanChanged::dispatch($model->organization_id, $model->getKey(), $creating ? 'created' : 'updated');
    }

    protected function afterDelete(Model $model): void
    {
        PlanChanged::dispatch($model->organization_id, $model->getKey(), 'deleted');
    }
}
