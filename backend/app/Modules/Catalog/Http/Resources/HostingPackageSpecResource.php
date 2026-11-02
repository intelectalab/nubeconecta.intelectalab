<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Http\Resources;

use App\Modules\Catalog\Models\HostingPackageSpec;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** Representación administrativa de una ficha de hosting. */
final class HostingPackageSpecResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        /** @var HostingPackageSpec $spec */
        $spec = $this->resource;

        return [
            'id' => $spec->id, 'product_id' => $spec->product_id, 'disk_mb' => $spec->disk_mb,
            'bandwidth_mb' => $spec->bandwidth_mb, 'email_accounts' => $spec->email_accounts,
            'databases' => $spec->databases, 'websites' => $spec->websites, 'whm_package' => $spec->whm_package,
            'preferred_node_id' => $spec->preferred_node_id, 'extra_resources' => $spec->extra_resources,
            'version' => $spec->version,
        ];
    }
}
