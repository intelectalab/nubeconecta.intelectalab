<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class DomainTldPriceResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id, 'tld' => $this->tld, 'provider_id' => $this->provider_id,
            'operation' => $this->operation, 'years' => $this->years, 'cost_minor' => $this->cost_minor,
            'cost_currency' => $this->cost_currency, 'price_minor' => $this->price_minor, 'currency' => $this->currency,
            'effective_from' => $this->effective_from?->format('Y-m-d'),
            'effective_to' => $this->effective_to?->format('Y-m-d'),
            'domain_extension_id' => $this->domain_extension_id, 'version' => $this->version,
        ];
    }
}
