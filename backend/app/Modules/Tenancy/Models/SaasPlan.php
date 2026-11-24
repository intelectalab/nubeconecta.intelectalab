<?php

declare(strict_types=1);

namespace App\Modules\Tenancy\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Plan de la suscripción SaaS que la empresa operadora ofrece a sus inquilinos
 * (multitenancy Fase 1). Pertenece a la organización operadora (scope global).
 */
class SaasPlan extends Model
{
    use BelongsToOrganization, HasUuids, SoftDeletes, TracksVersionAndActor;

    public const STATUSES = ['active', 'archived'];

    protected $table = 'saas_plans';

    protected $fillable = [
        'code', 'name', 'price_minor', 'currency',
        'max_staff_users', 'max_customers', 'max_services', 'status',
    ];

    protected $attributes = ['version' => 1, 'status' => 'active', 'price_minor' => 0, 'currency' => 'PEN'];

    protected function casts(): array
    {
        return [
            'price_minor' => 'integer',
            'max_staff_users' => 'integer',
            'max_customers' => 'integer',
            'max_services' => 'integer',
            'version' => 'integer',
        ];
    }
}
