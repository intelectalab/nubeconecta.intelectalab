<?php

declare(strict_types=1);

namespace App\Shared\Http\Resources;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Recurso genérico `{data}`: los atributos visibles del modelo (respeta $hidden
 * y los casts) más las relaciones cargadas. Para recursos administrativos sin
 * campos calculados; un recurso con forma propia define su clase.
 *
 * @property Model $resource
 */
final class ModelResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return $this->resource->toArray();
    }
}
