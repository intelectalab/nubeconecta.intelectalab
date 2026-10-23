<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Tabla canónica `plan_prices`: precio de venta por moneda (PEN/USD) y vigencia sin superposición (RN-CAT-002). */
class PlanPrice extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    protected $table = 'plan_prices';

    protected $fillable = ['plan_id', 'currency', 'price_minor', 'setup_fee_minor', 'effective_from', 'effective_to'];

    protected $attributes = ['version' => 1, 'setup_fee_minor' => 0];

    protected function casts(): array
    {
        return [
            'price_minor' => 'integer', 'setup_fee_minor' => 'integer', 'version' => 'integer',
            'effective_from' => 'date:Y-m-d', 'effective_to' => 'date:Y-m-d',
        ];
    }

    public function plan(): BelongsTo
    {
        return $this->belongsTo(Plan::class);
    }
}
