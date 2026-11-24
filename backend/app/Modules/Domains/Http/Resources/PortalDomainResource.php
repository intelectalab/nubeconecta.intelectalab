<?php

declare(strict_types=1);

namespace App\Modules\Domains\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Dominio en el portal del cliente: solo datos propios del dominio y su
 * vencimiento. Sin registrador, cuenta de proveedor, modo de sincronización ni
 * otros datos internos.
 */
final class PortalDomainResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $expires = $this->registry_expires_at;
        $service = $this->relationLoaded('service') ? $this->service : null;

        return [
            'id' => $this->id,
            'name' => $this->name,
            'tld' => $this->tld,
            'status' => $this->status,
            'registered_at' => $this->registered_at?->toDateString(),
            'registry_expires_at' => $expires?->toDateString(),
            'commercial_due_date' => $service?->commercial_due_date === null ? null : substr((string) $service->commercial_due_date, 0, 10),
            'days_remaining' => $expires === null ? null : (int) now()->startOfDay()->diffInDays($expires->copy()->startOfDay(), false),
            'auto_renew' => (bool) $this->auto_renew,
            'nameservers' => $this->nameservers ?? [],
            'service' => $service === null ? null : ['code' => $service->code, 'label' => $service->label, 'status' => $service->status],
        ];
    }
}
