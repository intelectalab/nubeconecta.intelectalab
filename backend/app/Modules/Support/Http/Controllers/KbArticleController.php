<?php

declare(strict_types=1);

namespace App\Modules\Support\Http\Controllers;

use App\Modules\Support\Http\Resources\KbArticleResource;
use App\Modules\Support\Models\KbArticle;
use App\Modules\Support\Services\KbService;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Base de conocimientos: artículos (helpdesk.kb_article.*). */
final class KbArticleController
{
    public function __construct(private readonly KbService $kb) {}

    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'filter.visibility' => ['sometimes', Rule::in(KbArticle::VISIBILITIES)],
            'filter.status' => ['sometimes', Rule::in(KbArticle::STATUSES)],
            'filter.kb_category_id' => ['sometimes', 'uuid'],
            'filter.brand_id' => ['sometimes', 'uuid'],
            'q' => ['sometimes', 'nullable', 'string', 'max:100'],
        ]);
        $query = KbArticle::query()->with(['category:id,name,slug', 'brand:id,name']);
        foreach (['visibility', 'status', 'kb_category_id', 'brand_id'] as $column) {
            $value = $request->input("filter.{$column}");
            if (is_string($value) && $value !== '') {
                $query->where($column, $value);
            }
        }
        KbService::applySearch($query, (string) $request->query('q', ''));

        return CursorPagination::respond($query, $request, ['created_at', 'title', 'status', 'published_at'], KbArticleResource::class);
    }

    public function store(Request $request): JsonResponse
    {
        $article = $this->kb->createArticle($request->validate($this->kb->articleRules(false)));

        return (new KbArticleResource($article->load(['category:id,name,slug', 'brand:id,name'])))->response()->setStatusCode(201);
    }

    public function show(string $id): KbArticleResource
    {
        return new KbArticleResource(KbArticle::query()->with(['category:id,name,slug', 'brand:id,name'])->findOrFail($id));
    }

    public function update(Request $request, string $id): KbArticleResource
    {
        $article = KbArticle::query()->findOrFail($id);
        $article = $this->kb->updateArticle($article, $request->validate($this->kb->articleRules(true, $id)));

        return new KbArticleResource($article->load(['category:id,name,slug', 'brand:id,name']));
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $data = $request->validate(['version' => ['required', 'integer']]);
        $this->kb->deleteArticle(KbArticle::query()->findOrFail($id), (int) $data['version']);

        return response()->json(null, 204);
    }
}
