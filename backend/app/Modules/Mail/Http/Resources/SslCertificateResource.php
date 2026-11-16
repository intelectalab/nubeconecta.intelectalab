<?php

declare(strict_types=1);

namespace App\Modules\Mail\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class SslCertificateResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $domain = $this->relationLoaded('domain') ? $this->domain : null;
        $service = $this->relationLoaded('service') ? $this->service : null;
        $customer = $domain !== null && $domain->relationLoaded('customer') ? $domain->customer : null;
        $customer ??= $service !== null && $service->relationLoaded('customer') ? $service->customer : null;
        $expires = $this->expires_at;
        return [
            'id' => $this->id, 'common_name' => $this->common_name, 'covered_names' => $this->covered_names ?? [],
            'is_wildcard' => (bool) $this->is_wildcard, 'issuer' => $this->issuer, 'kind' => $this->kind, 'status' => $this->status,
            'renewal_mode' => $this->renewal_mode, 'auto_renew' => $this->renewal_mode === 'automatic',
            'is_published' => (bool) $this->is_published,
            'domain_id' => $this->domain_id,
            'domain' => $domain === null ? null : ['id' => $domain->id, 'name' => $domain->name],
            'customer_id' => $customer?->id,
            'customer' => $customer === null ? null : ['id' => $customer->id, 'code' => $customer->code, 'name' => $customer->trade_name ?: $customer->legal_name],
            'service_id' => $this->service_id,
            'service' => $service === null ? null : ['id' => $service->id, 'code' => $service->code, 'label' => $service->label, 'status' => $service->status],
            'purchase_provider_account_id' => $this->purchase_provider_account_id,
            'cost_minor' => $this->cost_minor, 'cost_currency' => $this->cost_currency,
            'price_minor' => $this->price_minor, 'currency' => $this->currency,
            'issued_at' => $this->issued_at?->toDateString(), 'expires_at' => $expires?->toDateString(),
            'days_remaining' => $expires === null ? null : (int) now()->startOfDay()->diffInDays($expires->copy()->startOfDay(), false),
            'installed_on_type' => $this->installed_on_type, 'installed_on_id' => $this->installed_on_id,
            'responsible_user_id' => $this->responsible_user_id,
            'last_checked_at' => $this->last_checked_at?->toIso8601String(),
            'version' => (int) $this->version,
            'created_at' => $this->created_at?->toIso8601String(), 'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
