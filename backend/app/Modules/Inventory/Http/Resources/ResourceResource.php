<?php

declare(strict_types=1);

namespace App\Modules\Inventory\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class ResourceResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $data = $this->resource->makeHidden(['providerAccount', 'server', 'hostingNode', 'hostingAccount'])->toArray();
        $data['provider_account'] = $this->whenLoaded('providerAccount', fn () => $this->providerAccount ? ['id' => $this->providerAccount->id, 'label' => $this->providerAccount->label] : null);
        $data['server'] = $this->whenLoaded('server', fn () => $this->server ? ['id' => $this->server->id, 'hostname' => $this->server->hostname] : null);
        $data['hosting_node'] = $this->whenLoaded('hostingNode', fn () => $this->hostingNode ? ['id' => $this->hostingNode->id, 'hostname' => $this->hostingNode->hostname] : null);
        $data['hosting_account'] = $this->whenLoaded('hostingAccount', fn () => $this->hostingAccount ? ['id' => $this->hostingAccount->id, 'username' => $this->hostingAccount->username] : null);
        return $data;
    }
}
