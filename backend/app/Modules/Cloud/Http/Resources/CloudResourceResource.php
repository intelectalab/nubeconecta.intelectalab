<?php

declare(strict_types=1);

namespace App\Modules\Cloud\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class CloudResourceResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $customer = $this->relationLoaded('customer') ? $this->customer : null;
        $project = $this->relationLoaded('project') ? $this->project : null;
        return [
            'id' => $this->id, 'cloud_project_id' => $this->cloud_project_id,
            'project' => $project === null ? null : ['id' => $project->id, 'name' => $project->name],
            'parent_id' => $this->parent_id, 'resource_type' => $this->resource_type, 'kind' => $this->kind,
            'external_id' => $this->external_id, 'name' => $this->name, 'region' => $this->region,
            'tags' => (object) ($this->tags ?? []), 'status' => $this->status, 'is_shared' => (bool) $this->is_shared,
            'assignment_status' => $this->assignment_status,
            'assigned_customer_id' => $this->assigned_customer_id,
            'customer' => $customer === null ? null : ['id' => $customer->id, 'code' => $customer->code, 'name' => $customer->trade_name ?: $customer->legal_name],
            'monthly_cost_minor' => $this->monthly_cost_minor === null ? null : (int) $this->monthly_cost_minor,
            'cost_currency' => $this->cost_currency,
            'last_synced_at' => $this->last_synced_at?->toIso8601String(),
            'version' => (int) $this->version,
            'created_at' => $this->created_at?->toIso8601String(), 'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
