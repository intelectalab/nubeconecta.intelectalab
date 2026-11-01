<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Componente de un plan paquete, con cantidad y control de versión. */
final class BundleItem extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    protected $table = 'bundle_items';

    protected $fillable = ['bundle_plan_id', 'item_plan_id', 'quantity'];

    protected $attributes = ['version' => 1, 'quantity' => 1];

    protected function casts(): array
    {
        return ['quantity' => 'decimal:3', 'version' => 'integer'];
    }

    public function bundlePlan(): BelongsTo
    {
        return $this->belongsTo(Plan::class, 'bundle_plan_id');
    }

    public function itemPlan(): BelongsTo
    {
        return $this->belongsTo(Plan::class, 'item_plan_id');
    }
}
