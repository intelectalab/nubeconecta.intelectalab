<?php

declare(strict_types=1);

namespace App\Modules\Support\Http\Controllers;

use App\Modules\Support\Http\Resources\KbCategoryResource;
use App\Modules\Support\Models\KbCategory;
use App\Modules\Support\Services\KbService;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Base de conocimientos: categorías (helpdesk.kb_category.*). */
final class KbCategoryController
{
    public function __construct(private readonly KbService $kb) {}

    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'filter.visibility' => ['sometimes', Rule::in(KbCategory::VISIBILITIES)],
            'q' => ['sometimes', 'nullable', 'string', 'max:100'],
        ]);
        $query = KbCategory::query();
        $visibility = $request->input('filter.visibility');
        if (is_string($visibility) && $visibility !== '') {
            $query->where('visibility', $visibility);
        }
        $q = trim((string) $request->query('q', ''));
        if ($q !== '') {
            $query->where(fn (Builder $w) => $w->where('name', 'ilike', "%{$q}%")->orWhere('slug', 'ilike', "%{$q}%"));
        }

        return CursorPagination::respond($query, $request, ['sort_order', 'name', 'created_at'], KbCategoryResource::class);
    }

    public function store(Request $request): JsonResponse
    {
        $category = $this->kb->createCategory($request->validate($this->kb->categoryRules(false)));

        return (new KbCategoryResource($category))->response()->setStatusCode(201);
    }

    public function show(string $id): KbCategoryResource
    {
        return new KbCategoryResource(KbCategory::query()->findOrFail($id));
    }

    public function update(Request $request, string $id): KbCategoryResource
    {
        $category = KbCategory::query()->findOrFail($id);
        $category = $this->kb->updateCategory($category, $request->validate($this->kb->categoryRules(true, $id)));

        return new KbCategoryResource($category);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $data = $request->validate(['version' => ['required', 'integer']]);
        $this->kb->deleteCategory(KbCategory::query()->findOrFail($id), (int) $data['version']);

        return response()->json(null, 204);
    }
}
