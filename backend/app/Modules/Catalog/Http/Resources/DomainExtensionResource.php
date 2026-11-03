<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class DomainExtensionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id, 'tld' => $this->tld, 'default_registrar_id' => $this->default_registrar_id,
            'min_margin_percent' => $this->min_margin_percent, 'sellable_online' => $this->sellable_online,
            'allows_transfer_in' => $this->allows_transfer_in, 'is_featured' => $this->is_featured,
            'sort_order' => $this->sort_order, 'is_active' => $this->is_active, 'version' => $this->version,
        ];
    }
}
