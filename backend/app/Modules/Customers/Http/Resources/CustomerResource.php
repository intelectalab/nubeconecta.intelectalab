<?php

declare(strict_types=1);

namespace App\Modules\Customers\Http\Resources;

use App\Modules\Customers\Models\Customer;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Cliente en el panel: columnas de `customers` más `tags` y, en el listado,
 * `active_services_count` y `overdue_balance_minor` (x-derived).
 *
 * @property Customer $resource
 */
final class CustomerResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $data = $this->resource->makeHidden(['deleted_at'])->toArray();
        $data['tags'] = $this->resource->tagList();
        foreach (['active_services_count', 'overdue_balance_minor'] as $derived) {
            if (array_key_exists($derived, $this->resource->getAttributes())) {
                $data[$derived] = (int) $this->resource->getAttribute($derived);
            }
        }

        return $data;
    }
}
