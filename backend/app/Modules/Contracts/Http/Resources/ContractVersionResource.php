<?php

declare(strict_types=1);

namespace App\Modules\Contracts\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class ContractVersionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return ['id' => $this->id, 'version_number' => $this->version_number, 'kind' => $this->kind, 'body' => $this->body, 'change_summary' => $this->change_summary, 'clause_ids' => $this->clause_ids, 'locked_at' => $this->locked_at, 'created_at' => $this->created_at];
    }
}
