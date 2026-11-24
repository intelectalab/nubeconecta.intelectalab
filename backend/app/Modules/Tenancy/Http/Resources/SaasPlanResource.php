<?php

declare(strict_types=1);

namespace App\Modules\Tenancy\Http\Resources;

use App\Modules\Tenancy\Models\SaasPlan;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @property SaasPlan $resource */
final class SaasPlanResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $plan = $this->resource;

        return [
            'id' => $plan->id,
            'code' => $plan->code,
            'name' => $plan->name,
            'price_minor' => $plan->price_minor,
            'currency' => $plan->currency,
            'max_staff_users' => $plan->max_staff_users,
            'max_customers' => $plan->max_customers,
            'max_services' => $plan->max_services,
            'status' => $plan->status,
            'version' => $plan->version,
        ];
    }
}
