<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Models;

use App\Shared\Contracts\AccessControl;
use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\Auth;

/**
 * Tabla canónica `plans` (M-CAT §3): ciclo de cobro, costo de referencia y
 * límites. El costo solo se serializa con `finance.cost.view` (M-CAT §7).
 * Precio por hora: el esquema no tiene ciclo `hourly`; se usa `one_time` con
 * `limits.billing_unit = hour` y la cantidad del pedido son las horas (pendiente D-xx).
 */
class Plan extends Model
{
    use BelongsToOrganization, HasUuids, SoftDeletes, TracksVersionAndActor;

    public const CYCLES = ['monthly', 'quarterly', 'semiannual', 'annual', 'biennial', 'triennial', 'one_time'];

    protected $table = 'plans';

    protected $fillable = ['product_id', 'code', 'name', 'cycle', 'cost_minor', 'cost_currency', 'tax_code', 'limits', 'is_active'];

    protected $hidden = ['deleted_at'];

    protected $attributes = ['version' => 1, 'limits' => '{}', 'is_active' => true];

    protected function casts(): array
    {
        return ['limits' => 'array', 'is_active' => 'boolean', 'cost_minor' => 'integer', 'version' => 'integer'];
    }

    public function toArray(): array
    {
        $data = parent::toArray();
        $user = Auth::user();
        if ($user === null || ! app(AccessControl::class)->allows($user, 'finance.cost.view')) {
            unset($data['cost_minor'], $data['cost_currency']);
        }

        return $data;
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function prices(): HasMany
    {
        return $this->hasMany(PlanPrice::class)->orderBy('currency')->orderByDesc('effective_from');
    }
}
