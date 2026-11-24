<?php

declare(strict_types=1);

namespace App\Modules\WebConnector\Http\Resources;

use App\Modules\WebConnector\Models\LegalDocumentVersion;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** Documento legal con su versión vigente y, al cargarse, toda su historia. */
final class LegalDocumentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'brand_id' => $this->brand_id,
            'kind' => $this->kind,
            'product_category_id' => $this->product_category_id,
            'locale' => $this->locale,
            'title' => $this->title,
            'slug' => $this->slug,
            'published_version_id' => $this->published_version_id,
            'published_label' => $this->whenLoaded('versions', fn () => optional($this->versions->firstWhere('id', $this->published_version_id))->version_label),
            'effective_at' => $this->whenLoaded('versions', fn () => optional($this->versions->firstWhere('id', $this->published_version_id))?->effective_at?->toIso8601String()),
            'versions_count' => $this->whenCounted('versions'),
            'versions' => $this->whenLoaded('versions', fn () => $this->versions->map(fn (LegalDocumentVersion $v) => [
                'id' => $v->id,
                'version_number' => (int) $v->version_number,
                'version_label' => $v->version_label,
                'body' => $v->body,
                'change_summary' => $v->change_summary,
                'legal_reviewed_by' => $v->legal_reviewed_by,
                'legal_reviewed_at' => $v->legal_reviewed_at?->toIso8601String(),
                'effective_at' => $v->effective_at?->toIso8601String(),
                'status' => $v->status,
                'published_at' => $v->published_at?->toIso8601String(),
                'superseded_at' => $v->superseded_at?->toIso8601String(),
                'version' => (int) $v->version,
            ])->all()),
            'version' => (int) $this->version,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
