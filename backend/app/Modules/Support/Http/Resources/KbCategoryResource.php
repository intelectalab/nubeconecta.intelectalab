<?php

declare(strict_types=1);

namespace App\Modules\Support\Http\Resources;

use App\Modules\Support\Models\KbCategory;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @property KbCategory $resource */
final class KbCategoryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return parent::toArray($request);
    }
}
