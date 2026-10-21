<?php

declare(strict_types=1);

namespace App\Shared\Database\Concerns;

use App\Shared\Organization\CurrentOrganization;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * Filtro global por organization_id y relleno al crear (docs/00 §19). Un id de
 * otra organización no se encuentra: route model binding responde 404.
 * Consultas de plataforma: Model::withoutGlobalScope('organization').
 */
trait BelongsToOrganization
{
    public static function bootBelongsToOrganization(): void
    {
        static::addGlobalScope('organization', static function (Builder $builder): void {
            $builder->where($builder->qualifyColumn('organization_id'), app(CurrentOrganization::class)->id());
        });

        static::creating(static function (Model $model): void {
            $model->organization_id ??= app(CurrentOrganization::class)->id();
        });
    }
}
