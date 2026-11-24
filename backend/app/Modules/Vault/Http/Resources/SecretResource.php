<?php

declare(strict_types=1);

namespace App\Modules\Vault\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** Secreto SIN su valor: el listado y la vista nunca devuelven ciphertext/nonce ni el texto plano. */
final class SecretResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $customer = $this->relationLoaded('customer') ? $this->customer : null;

        return [
            'id' => $this->id,
            'kind' => $this->kind,
            'name' => $this->name,
            'owner_type' => $this->owner_type,
            'owner_id' => $this->owner_id,
            'customer_id' => $this->customer_id,
            'customer' => $customer === null ? null : ['id' => $customer->id, 'code' => $customer->code, 'name' => $customer->trade_name ?: $customer->legal_name],
            'is_connector_credential' => (bool) $this->is_connector_credential,
            'username' => $this->username,
            'host' => $this->host,
            'port' => $this->port,
            'metadata' => $this->metadata ?: new \stdClass,
            'rotates_at' => $this->rotates_at?->toDateString(),
            'last_rotated_at' => $this->last_rotated_at?->toIso8601String(),
            'expires_at' => $this->expires_at?->toIso8601String(),
            'version' => (int) $this->version,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
