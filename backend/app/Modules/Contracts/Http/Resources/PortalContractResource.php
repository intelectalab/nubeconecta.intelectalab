<?php

declare(strict_types=1);

namespace App\Modules\Contracts\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Contrato en el portal del cliente: estado, vigencia y condiciones comerciales
 * propias. Sin aprobador, cotización de origen ni notas internas.
 */
final class PortalContractResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $brand = $this->relationLoaded('brand') ? $this->brand : null;
        $date = fn ($v) => $v === null ? null : substr((string) $v, 0, 10);

        return [
            'id' => $this->id,
            'kind' => $this->kind,
            'status' => $this->status,
            'starts_on' => $date($this->starts_on),
            'ends_on' => $date($this->ends_on),
            'currency' => trim((string) $this->currency),
            'management_fee_percent' => $this->management_fee_percent,
            'management_fee_min_minor' => $this->management_fee_min_minor,
            'included_hours' => $this->included_hours,
            'current_version' => (int) $this->current_version,
            'brand' => $brand === null ? null : ['name' => $brand->name],
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
