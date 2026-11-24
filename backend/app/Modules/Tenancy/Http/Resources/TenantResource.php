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

        // Uso: `show` lo adjunta como arreglo; `index` lo trae en columnas usage_* (subconsultas).
        $usage = $org->getAttribute('usage');
        if ($usage === null && $org->getAttribute('usage_staff') !== null) {
            $usage = [
                'staff_users' => (int) $org->getAttribute('usage_staff'),
                'customers' => (int) $org->getAttribute('usage_customers'),
                'services' => (int) $org->getAttribute('usage_services'),
            ];
        }

        $limits = $plan === null
            ? ['staff_users' => null, 'customers' => null, 'services' => null]
            : [
                'staff_users' => $plan->max_staff_users,
                'customers' => $plan->max_customers,
                'services' => $plan->max_services,
            ];

        $renewal = $org->saas_renewal_date;

        return [
            'id' => $org->id,
            'name' => $org->name,
            'slug' => $org->slug,
            'country' => $org->country,
            'status' => $org->status,              // active | suspended (operativo)
            'subdomain' => $org->subdomain,
            'is_operator' => $org->is_operator,
            'saas_status' => $org->saas_status,    // trial | active | suspended | cancelled
            'saas_renewal_date' => $renewal?->toDateString(),
            'renewal_in_days' => $renewal === null ? null : (int) now()->startOfDay()->diffInDays($renewal->copy()->startOfDay(), false),
            'plan' => $plan === null ? null : ['id' => $plan->id, 'code' => $plan->code, 'name' => $plan->name, 'limits' => $limits],
            'limits' => $limits,
            'usage' => $usage,
            'version' => $org->version,
            'created_at' => $org->created_at?->toIso8601String(),
        ];
    }
}
