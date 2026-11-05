<?php

declare(strict_types=1);

namespace App\Modules\Work\Http\Resources;

use App\Modules\Work\Models\Task;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @property Task $resource */
final class TaskResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $task = $this->resource;
        $data = $task->makeHidden(['assignee', 'customer', 'service', 'parent', 'subtasks'])->toArray();
        $data['assignee'] = $task->assignee === null ? null : ['id' => $task->assignee->id, 'name' => $task->assignee->name];
        $data['customer'] = $task->customer === null ? null : [
            'id' => $task->customer->id, 'code' => $task->customer->code,
            'name' => $task->customer->trade_name ?: $task->customer->legal_name,
        ];
        $data['service'] = $task->service === null ? null : ['id' => $task->service->id, 'label' => $task->service->label];
        $data['subtasks'] = $this->whenLoaded('subtasks', fn () => self::collection($task->subtasks));

        return $data;
    }
}
