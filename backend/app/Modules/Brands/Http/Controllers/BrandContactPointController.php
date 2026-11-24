<?php

declare(strict_types=1);

namespace App\Modules\Brands\Http\Controllers;

use App\Modules\Brands\Models\BrandContactPoint;
use App\Shared\Http\Controllers\ResourceController;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * /api/v1/admin/brand-contact-points: teléfonos, correos, WhatsApp, dirección y
 * horario por marca (M-WCN «Contacto por marca»). Gestionado con los permisos de
 * marca (brands.brand.view para leer, brands.brand.update para escribir).
 */
final class BrandContactPointController extends ResourceController
{
    protected function model(): string
    {
        return BrandContactPoint::class;
    }

    protected function entity(): string
    {
        return 'brand_contact_point';
    }

    protected function rules(Request $request, ?Model $model): array
    {
        $required = $model === null ? 'required' : 'sometimes';
        $org = app(CurrentOrganization::class)->id();
        $kind = $request->input('kind', $model?->kind);

        return [
            'brand_id' => [$required, 'uuid', Rule::exists('brands', 'id')->where('organization_id', $org)->whereNull('deleted_at')],
            'kind' => [$required, Rule::in(BrandContactPoint::KINDS)],
            'value' => array_merge([$required, 'string', 'max:255'], match ($kind) {
                'phone', 'whatsapp' => ['regex:/^\+[1-9][0-9]{6,14}$/'],
                'email' => ['email'],
                default => [],
            }),
            'label' => ['sometimes', 'array'],
            'is_primary' => ['sometimes', 'boolean'],
            'is_public' => ['sometimes', 'boolean'],
            'position' => ['sometimes', 'integer', 'min:0', 'max:1000'],
        ];
    }

    protected function sortable(): array
    {
        return ['position', 'kind', 'created_at'];
    }

    protected function defaultSort(): string
    {
        return 'position';
    }

    protected function filters(): array
    {
        return ['brand_id' => 'brand_id', 'kind' => 'kind', 'is_public' => 'is_public'];
    }

    /** Solo un punto principal por marca y tipo (índice único parcial): desmarca los demás antes de guardar. */
    protected function beforeSave(Model $model, array $data, bool $creating): void
    {
        if ($model->is_primary) {
            BrandContactPoint::query()
                ->where('brand_id', $model->brand_id)->where('kind', $model->kind)->where('is_primary', true)
                ->when(! $creating, fn ($q) => $q->where('id', '!=', $model->getKey()))
                ->update(['is_primary' => false, 'updated_at' => now()]);
        }
    }
}
