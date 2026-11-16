<?php

declare(strict_types=1);

namespace App\Modules\Cloud\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class CloudProjectResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $customer = $this->relationLoaded('customer') ? $this->customer : null;
        $account = $this->relationLoaded('account') ? $this->account : null;
        $attrs = $this->resource->getAttributes();
        $amount = isset($attrs['budget_amount_minor']) ? (int) $attrs['budget_amount_minor'] : null;
        $actual = isset($attrs['budget_actual_minor']) ? (int) $attrs['budget_actual_minor'] : null;
        $forecast = null;
        if ($amount !== null && $actual !== null) {
            // Proyección lineal del gasto real del mes en curso.
            $day = max(1, (int) now()->day);
            $forecast = (int) round($actual / $day * now()->daysInMonth);
        }
        return [
            'id' => $this->id, 'name' => $this->name, 'external_id' => $this->external_id,
            'environment' => $this->environment, 'region' => $this->region,
            'visible_to_customer' => (bool) $this->visible_to_customer, 'is_shared' => (bool) $this->is_shared,
            'tags' => (object) ($this->tags ?? []),
            'cloud_account_id' => $this->cloud_account_id,
            'account' => $account === null ? null : ['id' => $account->id, 'platform' => $account->platform, 'external_account_id' => $account->external_account_id, 'owner' => $account->owner, 'status' => $account->status],
            'customer_id' => $this->customer_id,
            'customer' => $customer === null ? null : ['id' => $customer->id, 'code' => $customer->code, 'name' => $customer->trade_name ?: $customer->legal_name],
            'resources_count' => isset($attrs['resources_count']) ? (int) $attrs['resources_count'] : null,
            'cost' => isset($attrs['cost_minor_calc']) ? ['monthly_minor' => (int) $attrs['cost_minor_calc'], 'currency' => $attrs['cost_currency_calc']] : null,
            'budget' => $amount === null ? null : [
                'id' => $attrs['budget_id'], 'period_month' => now()->format('Y-m'), 'amount_minor' => $amount, 'actual_minor' => $actual,
                'currency' => $attrs['budget_currency'], 'consumption_pct' => (int) round($actual * 100 / max(1, $amount)),
            ],
            'forecast_minor' => $forecast,
            'version' => (int) $this->version,
            'created_at' => $this->created_at?->toIso8601String(), 'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
