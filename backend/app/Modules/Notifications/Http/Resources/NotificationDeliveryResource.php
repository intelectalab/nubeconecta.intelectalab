<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class NotificationDeliveryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $data = $this->resource->makeHidden(['recipient_address'])->toArray();
        $data['events'] = $this->whenLoaded('events', fn () => $this->events->map(fn ($event) => [
            'id' => $event->id, 'status' => $event->status, 'detail' => $event->detail,
            'occurred_at' => $event->occurred_at, 'provider_message_id' => $event->provider_message_id,
        ]));
        return $data;
    }
}
