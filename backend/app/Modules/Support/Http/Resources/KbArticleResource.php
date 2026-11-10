<?php

declare(strict_types=1);

namespace App\Modules\Support\Http\Resources;

use App\Modules\Support\Models\KbArticle;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @property KbArticle $resource */
final class KbArticleResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $article = $this->resource;
        $data = $article->makeHidden(['category', 'brand'])->toArray();
        $data['category'] = $article->relationLoaded('category') && $article->category !== null
            ? ['id' => $article->category->id, 'name' => $article->category->name, 'slug' => $article->category->slug]
            : null;
        $data['brand'] = $article->relationLoaded('brand') && $article->brand !== null
            ? ['id' => $article->brand->id, 'name' => $article->brand->name]
            : null;

        return $data;
    }
}
