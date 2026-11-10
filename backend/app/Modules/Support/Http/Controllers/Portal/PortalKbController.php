<?php

declare(strict_types=1);

namespace App\Modules\Support\Http\Controllers\Portal;

use App\Modules\Customers\Models\Customer;
use App\Modules\Customers\Support\PortalCustomer;
use App\Modules\Support\Http\Resources\Portal\PortalKbArticleResource;
use App\Modules\Support\Models\KbArticle;
use App\Modules\Support\Services\KbService;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Centro de ayuda del portal del cliente (portal.kb_article.view): solo
 * artículos públicos y publicados, de la marca del cliente o comunes.
 */
final class PortalKbController
{
    public function index(Request $request): JsonResponse
    {
        $request->validate(['q' => ['sometimes', 'nullable', 'string', 'max:100']]);
        $query = $this->base($request)->with(['category:id,name,slug']);
        KbService::applySearch($query, (string) $request->query('q', ''));

        return CursorPagination::respond($query, $request, ['published_at', 'title', 'created_at'], PortalKbArticleResource::class);
    }

    public function show(Request $request, string $id): PortalKbArticleResource
    {
        $article = $this->base($request)->with(['category:id,name,slug'])->find($id)
            ?? throw ProblemException::notFound();

        return new PortalKbArticleResource($article);
    }

    /** Artículos visibles para este cliente: públicos, publicados y de su marca (o comunes). */
    private function base(Request $request): Builder
    {
        $brandId = Customer::query()->whereKey(PortalCustomer::id($request))->value('origin_brand_id');

        return KbArticle::query()
            ->where('visibility', 'public')
            ->where('status', 'published')
            ->where(fn (Builder $w) => $w->whereNull('brand_id')->orWhere('brand_id', $brandId));
    }
}
