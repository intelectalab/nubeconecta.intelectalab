<?php

declare(strict_types=1);

namespace App\Modules\Customers\Http\Resources;

use App\Modules\Customers\Models\Customer;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Cliente visto desde el portal: lista blanca de campos. Nunca incluye notas
 * internas, responsable (`account_manager_id`), rentabilidad ni campos
 * personalizados no visibles al cliente (M-CUS §5, §13).
 *
 * @property Customer $resource
 */
final class PortalCustomerResource extends JsonResource
{
    public const FIELDS = [
        'id', 'code', 'type', 'legal_name', 'trade_name', 'tax_id_type', 'tax_id', 'country', 'currency',
        'locale', 'timezone', 'email', 'phone', 'address', 'tax_treatment', 'invoice_consolidation', 'version',
    ];

    /** @param list<string> $visibleCustom claves de custom_field_definitions con visible_to_customer */
    public function __construct(Customer $resource, private readonly array $visibleCustom = [])
    {
        parent::__construct($resource);
    }

    public function toArray(Request $request): array
    {
        $data = [];
        foreach (self::FIELDS as $field) {
            $data[$field] = $this->resource->getAttribute($field);
        }
        $data['custom'] = (object) array_intersect_key((array) $this->resource->custom, array_flip($this->visibleCustom));

        return $data;
    }
}
