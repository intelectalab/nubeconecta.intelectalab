<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class NotificationTemplateResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return $this->resource->makeHidden(['created_by', 'updated_by'])->toArray();
    }
}
