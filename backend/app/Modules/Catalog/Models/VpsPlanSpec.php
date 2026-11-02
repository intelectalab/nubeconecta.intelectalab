<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Models;

use App\Shared\Database\Casts\PostgresTextArray;
use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Ficha técnica de un producto VPS y su plan de proveedor. */
final class VpsPlanSpec extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    protected $table = 'vps_plan_specs';

    protected $fillable = ['product_id', 'vcpu', 'ram_mb', 'disk_gb', 'transfer_gb', 'os_options', 'is_managed', 'location', 'cpu_model', 'disk_type', 'provider_id', 'provider_plan_ref'];

    protected $attributes = ['version' => 1, 'os_options' => '{}'];

    protected function casts(): array
    {
        return [
            'vcpu' => 'integer', 'ram_mb' => 'integer', 'disk_gb' => 'integer', 'transfer_gb' => 'integer',
            'os_options' => PostgresTextArray::class, 'is_managed' => 'boolean', 'version' => 'integer',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'product_id');
    }
}
