<?php

declare(strict_types=1);

namespace App\Modules\Domains\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class DomainResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $expires = $this->registry_expires_at;
        $service = $this->relationLoaded('service') ? $this->service : null;
        $account = $this->relationLoaded('providerAccount') ? $this->providerAccount : null;
        $customer = $this->relationLoaded('customer') ? $this->customer : null;
        return [
            'id' => $this->id, 'name' => $this->name, 'tld' => $this->tld, 'status' => $this->status, 'sync_mode' => $this->sync_mode,
            'holder' => $this->holder,
            'provider_account_id' => $this->provider_account_id,
            'registrar' => $account === null ? null : ['id' => $account->id, 'name' => $account->relationLoaded('provider') ? $account->provider?->name : null, 'account_label' => $account->label],
            'customer_id' => $this->customer_id,
            'customer' => $customer === null ? null : ['id' => $customer->id, 'code' => $customer->code, 'name' => $customer->trade_name ?: $customer->legal_name],
            'service_id' => $this->service_id,
            'service' => $service === null ? null : ['id' => $service->id, 'code' => $service->code, 'label' => $service->label, 'status' => $service->status],
            'registered_at' => $this->registered_at?->toDateString(),
            'registry_expires_at' => $expires?->toDateString(),
            'commercial_due_date' => $service?->commercial_due_date === null ? null : substr((string) $service->commercial_due_date, 0, 10),
            'days_remaining' => $expires === null ? null : (int) now()->startOfDay()->diffInDays($expires->copy()->startOfDay(), false),
            'auto_renew' => (bool) $this->auto_renew, 'lock' => (bool) $this->lock, 'dnssec' => (bool) $this->dnssec, 'privacy' => (bool) $this->privacy,
            'nameservers' => $this->nameservers ?? [],
            'transfer_locked_until' => $this->transfer_locked_until?->toDateString(),
            'last_synced_at' => $this->last_synced_at?->toIso8601String(), 'last_transfer_at' => $this->last_transfer_at?->toIso8601String(),
            'contacts' => DomainContactResource::collection($this->whenLoaded('contacts')),
            'version' => (int) $this->version,
            'created_at' => $this->created_at?->toIso8601String(), 'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
