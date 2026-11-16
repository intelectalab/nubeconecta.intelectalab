<?php

declare(strict_types=1);

namespace App\Modules\Mail\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class MailServiceResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $domain = $this->relationLoaded('domain') ? $this->domain : null;
        $customer = $domain !== null && $domain->relationLoaded('customer') ? $domain->customer : null;
        $service = $this->relationLoaded('service') ? $this->service : null;
        $account = $this->relationLoaded('providerAccount') ? $this->providerAccount : null;
        $renewal = $this->renewal_date;
        $diff = $this->seats_used !== null && $this->seats_billed !== null ? (int) $this->seats_used - (int) $this->seats_billed : null;
        return [
            'id' => $this->id, 'provider_kind' => $this->provider_kind, 'status' => $this->status, 'sync_mode' => $this->sync_mode,
            'domain_id' => $this->domain_id,
            'domain' => $domain === null ? null : ['id' => $domain->id, 'name' => $domain->name],
            'customer_id' => $domain?->customer_id,
            'customer' => $customer === null ? null : ['id' => $customer->id, 'code' => $customer->code, 'name' => $customer->trade_name ?: $customer->legal_name],
            'service_id' => $this->service_id,
            'service' => $service === null ? null : ['id' => $service->id, 'code' => $service->code, 'label' => $service->label, 'status' => $service->status],
            'provider_account_id' => $this->provider_account_id,
            'provider_account' => $account === null ? null : ['id' => $account->id, 'name' => $account->relationLoaded('provider') ? $account->provider?->name : null, 'account_label' => $account->label],
            'hosting_account_id' => $this->hosting_account_id,
            'tenant_id' => $this->tenant_id, 'plan' => $this->plan, 'account_owner' => $this->account_owner,
            'seats_purchased' => $this->seats_purchased, 'seats_used' => $this->seats_used, 'seats_billed' => $this->seats_billed,
            'seats_difference' => $diff,
            'mailboxes_count' => $this->mailboxes_count, 'storage_used_mb' => $this->storage_used_mb,
            'renewal_date' => $renewal?->toDateString(),
            'days_to_renewal' => $renewal === null ? null : (int) now()->startOfDay()->diffInDays($renewal->copy()->startOfDay(), false),
            'last_synced_at' => $this->last_synced_at?->toIso8601String(),
            'version' => (int) $this->version,
            'created_at' => $this->created_at?->toIso8601String(), 'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
