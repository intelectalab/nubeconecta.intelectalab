<?php

declare(strict_types=1);

namespace App\Modules\Support\Http\Resources\Portal;

use App\Modules\Support\Models\KbArticle;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Artículo de ayuda para el portal del cliente: solo campos públicos; nunca
 * estado, visibilidad, actores ni versión internos.
 *
 * @property KbArticle $resource
 */
final class PortalKbArticleResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $article = $this->resource;

        return [
            'id' => $article->id,
            'title' => $article->title,
            'slug' => $article->slug,
            'locale' => $article->locale,
            'body' => $this->when($request->routeIs('*.show'), fn () => $article->body),
            'category' => $article->relationLoaded('category') && $article->category !== null
                ? ['id' => $article->category->id, 'name' => $article->category->name, 'slug' => $article->category->slug]
                : null,
            'published_at' => $article->published_at?->toIso8601String(),
            'updated_at' => $article->updated_at?->toIso8601String(),
        ];
    }
}
