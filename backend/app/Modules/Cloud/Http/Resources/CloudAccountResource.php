<?php

declare(strict_types=1);

namespace App\Modules\Cloud\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class CloudAccountResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $customer = $this->relationLoaded('customer') ? $this->customer : null;
        $pa = $this->relationLoaded('providerAccount') ? $this->providerAccount : null;
        return [
            'id' => $this->id, 'platform' => $this->platform, 'external_account_id' => $this->external_account_id,
            'owner' => $this->owner, 'modality' => $this->modality, 'status' => $this->status, 'tagging_status' => $this->tagging_status,
            'provider_account_id' => $this->provider_account_id,
            'provider_account' => $pa === null ? null : ['id' => $pa->id, 'label' => $pa->label, 'provider_name' => $pa->relationLoaded('provider') ? $pa->provider?->name : null],
            'customer_id' => $this->customer_id,
            'customer' => $customer === null ? null : ['id' => $customer->id, 'code' => $customer->code, 'name' => $customer->trade_name ?: $customer->legal_name],
            'authorization_file_id' => $this->authorization_file_id,
            'access_reference' => $this->access_reference,
            'period_start' => $this->period_start?->toDateString(), 'period_end' => $this->period_end?->toDateString(),
            'access_revoked_at' => $this->access_revoked_at?->toIso8601String(),
            'projects_count' => $this->projects_count === null ? null : (int) $this->projects_count,
            'version' => (int) $this->version,
            'created_at' => $this->created_at?->toIso8601String(), 'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
