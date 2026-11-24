<?php

declare(strict_types=1);

namespace App\Modules\Identity\Models;

use App\Modules\Tenancy\Models\SaasPlan;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Organización (tabla `organizations`). La fila `is_operator` es la empresa
 * operadora; las demás son inquilinos SaaS (multitenancy Fase 1, docs/00 §19).
 */
class Organization extends Model
{
    use HasUuids, SoftDeletes, TracksVersionAndActor;

    public const SAAS_STATUSES = ['trial', 'active', 'suspended', 'cancelled'];

    protected $fillable = [
        'name', 'slug', 'country', 'default_currency', 'default_locale', 'default_timezone',
        'is_operator', 'saas_plan_id', 'saas_status', 'saas_renewal_date', 'subdomain',
    ];

    protected function casts(): array
    {
        return [
            'is_operator' => 'boolean',
            'saas_renewal_date' => 'date',
        ];
    }

    public function saasPlan(): BelongsTo
    {
        return $this->belongsTo(SaasPlan::class, 'saas_plan_id');
    }

    /** Devuelve la organización existente o crea la primera con config('hub.organization'). */
    public static function ensureDefault(): self
    {
        return static::query()->orderBy('created_at')->first()
            ?? static::query()->create([
                'name' => config('hub.organization.name'),
                'slug' => config('hub.organization.slug'),
            ]);
    }
}
