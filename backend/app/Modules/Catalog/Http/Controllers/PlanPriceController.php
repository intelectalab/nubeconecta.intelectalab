<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Http\Controllers;

use App\Modules\Catalog\Events\PlanPriceChanged;
use App\Modules\Catalog\Models\PlanPrice;
use App\Shared\Http\Controllers\ResourceController;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;

/**
 * /api/v1/admin/plan-prices (catalog.plan_price.*). RN-CAT-002: un cambio de
 * precio es una fila nueva que cierra la vigencia abierta anterior; las
 * vigencias no se superponen y un precio ya vigente no se edita ni se borra.
 * Pendiente: aviso a clientes con servicios antes de la siguiente renovación.
 */
final class PlanPriceController extends ResourceController
{
    protected function model(): string
    {
        return PlanPrice::class;
    }

    protected function entity(): string
    {
        return 'plan_price';
    }

    protected function rules(Request $request, ?Model $model): array
    {
        $org = app(CurrentOrganization::class)->id();
        $creating = $model === null;

        return [
            'plan_id' => [$creating ? 'required' : 'prohibited', 'uuid', Rule::exists('plans', 'id')->where('organization_id', $org)->whereNull('deleted_at')],
            'currency' => [$creating ? 'required' : 'prohibited', Rule::in(['PEN', 'USD'])],
            'price_minor' => [$creating ? 'required' : 'sometimes', 'integer', 'min:0', 'max:9999999999'],
            'setup_fee_minor' => ['sometimes', 'integer', 'min:0', 'max:9999999999'],
            'effective_from' => [$creating ? 'sometimes' : 'prohibited', 'date_format:Y-m-d'],
            'effective_to' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
        ];
    }

    protected function sortable(): array
    {
        return ['effective_from', 'currency', 'created_at'];
    }

    protected function defaultSort(): string
    {
        return '-effective_from';
    }

    protected function filters(): array
    {
        return ['plan_id' => 'plan_id', 'currency' => 'currency'];
    }

    protected function beforeSave(Model $model, array $data, bool $creating): void
    {
        $today = now()->toDateString();
        if ($creating) {
            $model->setAttribute('effective_from', $data['effective_from'] ?? $today);
        }
        $from = Carbon::parse($model->getAttribute('effective_from'))->toDateString();
        $to = $model->getAttribute('effective_to') === null ? null : Carbon::parse($model->getAttribute('effective_to'))->toDateString();
        if ($to !== null && $to <= $from) {
            throw ProblemException::validation(['effective_to' => ['La fecha de fin debe ser posterior al inicio de la vigencia.']]);
        }
        if (! $creating && $from <= $today && $model->isDirty(['price_minor', 'setup_fee_minor'])) {
            throw new ProblemException(409, 'price_in_effect', 'Un precio vigente no se edita: registre una nueva vigencia.');
        }

        $others = PlanPrice::query()->where('plan_id', $model->getAttribute('plan_id'))->where('currency', $model->getAttribute('currency'))
            ->when($model->exists, fn ($q) => $q->whereKeyNot($model->getKey()))->lockForUpdate()->get();
        foreach ($others as $other) {
            $oFrom = $other->effective_from->toDateString();
            $oTo = $other->effective_to?->toDateString();
            // Alta: la vigencia abierta anterior se cierra en la fecha del nuevo precio.
            if ($creating && $oTo === null && $oFrom < $from) {
                $other->forceFill(['effective_to' => $from])->save();
                $this->audit->record('plan_price.updated', 'plan_price', $other->getKey(), ['effective_to' => null], ['effective_to' => $from], ['reason' => 'superseded']);

                continue;
            }
            $overlaps = ($to === null || $oFrom < $to) && ($oTo === null || $from < $oTo);
            if ($overlaps) {
                throw new ProblemException(409, 'price_overlap', 'La vigencia se superpone con otro precio del plan en la misma moneda.', ['conflicting_id' => $other->getKey()]);
            }
        }
    }

    protected function beforeDelete(Model $model): void
    {
        if ($model->getAttribute('effective_from')->toDateString() <= now()->toDateString()) {
            throw new ProblemException(409, 'price_in_effect', 'Solo se borran precios programados que aún no entran en vigencia.');
        }
    }

    protected function afterSave(Model $model, bool $creating, ?array $before): void
    {
        PlanPriceChanged::dispatch($model->organization_id, $model->getAttribute('plan_id'), $model->getKey(), $creating ? 'created' : 'updated');
    }

    protected function afterDelete(Model $model): void
    {
        PlanPriceChanged::dispatch($model->organization_id, $model->getAttribute('plan_id'), $model->getKey(), 'deleted');
    }
}
