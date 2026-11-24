<?php

declare(strict_types=1);

namespace App\Modules\Monitoring\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** Corrida de respaldo con el nombre de su política. */
final class BackupRunResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'backup_policy_id' => $this->backup_policy_id,
            'policy' => $this->whenLoaded('policy', fn () => $this->policy ? ['id' => $this->policy->id, 'name' => $this->policy->name] : null),
            'status' => $this->status,
            'started_at' => $this->started_at?->toIso8601String(),
            'finished_at' => $this->finished_at?->toIso8601String(),
            'size_bytes' => $this->size_bytes === null ? null : (int) $this->size_bytes,
            'location' => $this->location,
            'error' => $this->error,
            'external_id' => $this->external_id,
            'version' => (int) $this->version,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
