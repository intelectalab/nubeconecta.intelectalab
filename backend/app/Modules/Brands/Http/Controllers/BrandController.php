<?php

declare(strict_types=1);

namespace App\Modules\Brands\Http\Controllers;

use App\Modules\Brands\Events\BrandUpdated;
use App\Modules\Brands\Models\Brand;
use App\Shared\Http\Controllers\ResourceController;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * /api/v1/admin/brands (brands.brand.*). El dominio del portal es único por marca;
 * el borrado es lógico (deleted_at): clientes, servicios y facturas conservan su marca.
 */
final class BrandController extends ResourceController
{
    private const DOMAIN = 'regex:/^(?=.{1,253}$)([a-z0-9](-?[a-z0-9])*\.)+[a-z]{2,63}$/i';

    protected function model(): string
    {
        return Brand::class;
    }

    protected function entity(): string
    {
        return 'brand';
    }

    protected function with(): array
    {
        return ['legalEntity'];
    }

    protected function rules(Request $request, ?Model $model): array
    {
        $required = $model === null ? 'required' : 'sometimes';

        return [
            'code' => [$required, 'string', 'regex:/^[a-z][a-z0-9_-]{1,39}$/'],
            'name' => [$required, 'string', 'max:200'],
            'domain' => ['sometimes', 'nullable', 'string', self::DOMAIN],
            'portal_domain' => ['sometimes', 'nullable', 'string', self::DOMAIN],
            'default_legal_entity_id' => [$required, 'uuid', Rule::exists('legal_entities', 'id')->where('organization_id', app(CurrentOrganization::class)->id())],
            'email_from' => ['sometimes', 'nullable', 'email:rfc'],
            'email_from_name' => ['sometimes', 'nullable', 'string', 'max:200'],
            'support_email' => ['sometimes', 'nullable', 'email:rfc'],
            'status' => ['sometimes', Rule::in(['active', 'inactive'])],
            'locale' => ['sometimes', 'string', 'regex:/^[a-z]{2}(-[A-Z]{2})?$/'],
            'status_page_slug' => ['sometimes', 'nullable', 'string', 'regex:/^[a-z0-9-]{1,63}$/'],
        ];
    }

    protected function sortable(): array
    {
        return ['code', 'name', 'created_at'];
    }

    protected function defaultSort(): string
    {
        return 'code';
    }

    protected function filters(): array
    {
        return ['status' => 'status'];
    }

    protected function beforeSave(Model $model, array $data, bool $creating): void
    {
        $others = fn () => Brand::withTrashed()->when(! $creating, fn ($q) => $q->whereKeyNot($model->getKey()));
        if ($model->portal_domain !== null) {
            $model->portal_domain = strtolower($model->portal_domain);
            if ($others()->whereRaw('lower(portal_domain) = ?', [$model->portal_domain])->exists()) {
                throw ProblemException::validation(['portal_domain' => [__('validation.unique', ['attribute' => 'portal_domain'])]]);
            }
        }
        if ($model->domain !== null) {
            $model->domain = strtolower($model->domain);
        }
        if ($others()->where('code', $model->code)->exists()) {
            throw ProblemException::validation(['code' => [__('validation.unique', ['attribute' => 'code'])]]);
        }
    }

    protected function afterSave(Model $model, bool $creating, ?array $before): void
    {
        BrandUpdated::dispatch($model->organization_id, $model->getKey(), $creating ? 'created' : 'updated');
    }

    protected function afterDelete(Model $model): void
    {
        BrandUpdated::dispatch($model->organization_id, $model->getKey(), 'deleted');
    }
}
