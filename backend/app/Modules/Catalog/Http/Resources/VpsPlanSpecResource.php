<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Http\Resources;

use App\Modules\Catalog\Models\VpsPlanSpec;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** Representación administrativa de una ficha VPS. */
final class VpsPlanSpecResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        /** @var VpsPlanSpec $spec */
        $spec = $this->resource;

        return [
            'id' => $spec->id, 'product_id' => $spec->product_id, 'vcpu' => $spec->vcpu,
            'ram_mb' => $spec->ram_mb, 'disk_gb' => $spec->disk_gb, 'transfer_gb' => $spec->transfer_gb,
            'os_options' => $spec->os_options, 'is_managed' => $spec->is_managed, 'location' => $spec->location,
            'cpu_model' => $spec->cpu_model, 'disk_type' => $spec->disk_type, 'provider_id' => $spec->provider_id,
            'provider_plan_ref' => $spec->provider_plan_ref, 'version' => $spec->version,
        ];
    }
}
