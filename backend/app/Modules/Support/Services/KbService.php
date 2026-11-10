<?php

declare(strict_types=1);

namespace App\Modules\Support\Services;

use App\Modules\Support\Models\KbArticle;
use App\Modules\Support\Models\KbCategory;
use App\Shared\Audit\AuditLogger;
use App\Shared\Concurrency\VersionGuard;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/** CRUD de la base de conocimientos (categorías y artículos) con versión y auditoría. */
final class KbService
{
    public function __construct(private readonly AuditLogger $audit, private readonly CurrentOrganization $organization) {}

    /* ---------------- Categorías ---------------- */

    /** @return array<string, list<mixed>> */
    public function categoryRules(bool $updating, ?string $ignoreId = null): array
    {
        $org = $this->organization->id();
        $unique = Rule::unique('kb_categories', 'slug')->where('organization_id', $org);
        if ($ignoreId !== null) {
            $unique->ignore($ignoreId);
        }

        return [
            'name' => [$updating ? 'sometimes' : 'required', 'string', 'max:200'],
            'slug' => [$updating ? 'sometimes' : 'required', 'string', 'max:200', 'regex:/^[a-z0-9]+(-[a-z0-9]+)*$/', $unique],
            'visibility' => ['sometimes', Rule::in(KbCategory::VISIBILITIES)],
            'parent_id' => ['sometimes', 'nullable', 'uuid', Rule::exists('kb_categories', 'id')->where('organization_id', $org)],
            'sort_order' => ['sometimes', 'integer', 'min:0'],
        ] + ($updating ? ['version' => ['required', 'integer']] : []);
    }

    /** @param array<string, mixed> $data */
    public function createCategory(array $data): KbCategory
    {
        return DB::transaction(function () use ($data): KbCategory {
            $category = new KbCategory;
            $category->forceFill($this->categoryData($data))->save();
            $this->audit->record('kb_category.created', 'kb_category', $category->id, null, $category->refresh()->attributesToArray());

            return $category;
        });
    }

    /** @param array<string, mixed> $data */
    public function updateCategory(KbCategory $category, array $data): KbCategory
    {
        return DB::transaction(function () use ($category, $data): KbCategory {
            $category = KbCategory::query()->lockForUpdate()->findOrFail($category->id);
            VersionGuard::check($category, $data['version']);
            $before = $category->attributesToArray();
            $category->forceFill($this->categoryData($data))->save();
            $this->audit->record('kb_category.updated', 'kb_category', $category->id, $before, $category->refresh()->attributesToArray());

            return $category;
        });
    }

    public function deleteCategory(KbCategory $category, int $version): void
    {
        DB::transaction(function () use ($category, $version): void {
            $category = KbCategory::query()->lockForUpdate()->findOrFail($category->id);
            VersionGuard::check($category, $version);
            $before = $category->attributesToArray();
            $category->delete();
            $this->audit->record('kb_category.deleted', 'kb_category', $category->id, $before, []);
        });
    }

    /* ---------------- Artículos ---------------- */

    /** @return array<string, list<mixed>> */
    public function articleRules(bool $updating, ?string $ignoreId = null): array
    {
        $org = $this->organization->id();
        $locale = 'es';
        $unique = Rule::unique('kb_articles', 'slug')->where('organization_id', $org)->whereNull('deleted_at')->where('locale', $locale);
        if ($ignoreId !== null) {
            $unique->ignore($ignoreId);
        }

        return [
            'kb_category_id' => ['sometimes', 'nullable', 'uuid', Rule::exists('kb_categories', 'id')->where('organization_id', $org)],
            'brand_id' => ['sometimes', 'nullable', 'uuid', Rule::exists('brands', 'id')->where('organization_id', $org)->whereNull('deleted_at')],
            'locale' => ['sometimes', 'string', 'max:10'],
            'title' => [$updating ? 'sometimes' : 'required', 'string', 'max:300'],
            'slug' => [$updating ? 'sometimes' : 'required', 'string', 'max:200', 'regex:/^[a-z0-9]+(-[a-z0-9]+)*$/', $unique],
            'body' => [$updating ? 'sometimes' : 'required', 'string'],
            'visibility' => ['sometimes', Rule::in(KbArticle::VISIBILITIES)],
            'status' => ['sometimes', Rule::in(KbArticle::STATUSES)],
        ] + ($updating ? ['version' => ['required', 'integer']] : []);
    }

    /** @param array<string, mixed> $data */
    public function createArticle(array $data): KbArticle
    {
        return DB::transaction(function () use ($data): KbArticle {
            $article = new KbArticle;
            $values = $this->articleData($data);
            $values['published_at'] = ($values['status'] ?? 'draft') === 'published' ? now() : null;
            $article->forceFill($values)->save();
            $this->audit->record('kb_article.created', 'kb_article', $article->id, null, $article->refresh()->attributesToArray());

            return $article;
        });
    }

    /** @param array<string, mixed> $data */
    public function updateArticle(KbArticle $article, array $data): KbArticle
    {
        return DB::transaction(function () use ($article, $data): KbArticle {
            $article = KbArticle::query()->lockForUpdate()->findOrFail($article->id);
            VersionGuard::check($article, $data['version']);
            $before = $article->attributesToArray();
            $values = $this->articleData($data);
            if (array_key_exists('status', $values)) {
                // Fija la fecha de publicación al pasar a «publicado»; la limpia al salir de ese estado.
                $values['published_at'] = $values['status'] === 'published'
                    ? ($article->published_at ?? now())
                    : null;
            }
            $article->forceFill($values)->save();
            $this->audit->record('kb_article.updated', 'kb_article', $article->id, $before, $article->refresh()->attributesToArray());

            return $article;
        });
    }

    public function deleteArticle(KbArticle $article, int $version): void
    {
        DB::transaction(function () use ($article, $version): void {
            $article = KbArticle::query()->lockForUpdate()->findOrFail($article->id);
            VersionGuard::check($article, $version);
            $before = $article->attributesToArray();
            $article->delete();
            $this->audit->record('kb_article.deleted', 'kb_article', $article->id, $before, ['deleted_at' => $article->deleted_at?->toIso8601String()]);
        });
    }

    /** @param array<string, mixed> $data @return array<string, mixed> */
    private function categoryData(array $data): array
    {
        return array_intersect_key($data, array_flip(['parent_id', 'name', 'slug', 'visibility', 'sort_order']));
    }

    /** @param array<string, mixed> $data @return array<string, mixed> */
    private function articleData(array $data): array
    {
        return array_intersect_key($data, array_flip(['kb_category_id', 'brand_id', 'locale', 'title', 'slug', 'body', 'visibility', 'status']));
    }

    /** Búsqueda por título/cuerpo reutilizable (admin y portal). */
    public static function applySearch(Builder $query, string $term): Builder
    {
        $term = trim($term);
        if ($term === '') {
            return $query;
        }

        return $query->where(fn (Builder $w) => $w->where('title', 'ilike', "%{$term}%")->orWhere('body', 'ilike', "%{$term}%"));
    }
}
