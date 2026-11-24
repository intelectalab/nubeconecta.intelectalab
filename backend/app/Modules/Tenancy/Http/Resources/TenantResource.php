<?php

declare(strict_types=1);

namespace App\Modules\Tenancy\Http\Resources;

use App\Modules\Identity\Models\Organization;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @property Organization $resource */
final class TenantResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $org = $this->resource;
        $plan = $org->relationLoaded('saasPlan') ? $org->saasPlan : null;

        return [
            'id' => $org->id,
            'name' => $org->name,
            'slug' => $org->slug,
            'country' => $org->country,
            'status' => $org->status,              // active | suspended (operativo)
            'is_operator' => $org->is_operator,
            'saas_status' => $org->saas_status,    // trial | active | suspended | cancelled
            'saas_renewal_date' => $org->saas_renewal_date?->toDateString(),
            'plan' => $plan === null ? null : ['id' => $plan->id, 'code' => $plan->code, 'name' => $plan->name],
            // Uso: solo lo adjunta `show` (null en el listado para no hacer N+1).
            'usage' => $org->getAttribute('usage') ?? null,
            'version' => $org->version,
            'created_at' => $org->created_at?->toIso8601String(),
        ];
    }
}
