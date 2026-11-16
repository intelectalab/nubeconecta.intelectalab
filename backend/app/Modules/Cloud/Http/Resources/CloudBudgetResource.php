<?php

declare(strict_types=1);

namespace App\Modules\Cloud\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class CloudBudgetResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $project = $this->relationLoaded('project') ? $this->project : null;
        return [
            'id' => $this->id, 'cloud_project_id' => $this->cloud_project_id,
            'project' => $project === null ? null : ['id' => $project->id, 'name' => $project->name, 'customer_id' => $project->customer_id],
            'period_month' => $this->period_month?->format('Y-m'),
            'amount_minor' => (int) $this->amount_minor, 'cost_currency' => $this->cost_currency, 'actual_minor' => (int) $this->actual_minor,
            'consumption_pct' => (int) round($this->actual_minor * 100 / max(1, (int) $this->amount_minor)),
            'last_alerted_pct' => $this->last_alerted_pct,
            'version' => (int) $this->version,
            'created_at' => $this->created_at?->toIso8601String(), 'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
