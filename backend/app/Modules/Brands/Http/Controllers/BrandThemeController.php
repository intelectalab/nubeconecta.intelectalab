<?php

declare(strict_types=1);

namespace App\Modules\Brands\Http\Controllers;

use App\Modules\Brands\Events\BrandThemeCreated;
use App\Modules\Brands\Models\BrandTheme;
use App\Modules\Brands\Models\BrandThemeVersion;
use App\Modules\Brands\Services\BrandThemeService;
use App\Shared\Audit\AuditLogger;
use App\Shared\Concurrency\VersionGuard;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Http\Resources\ModelResource;
use App\Shared\Organization\CurrentOrganization;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * /api/v1/admin/brand-themes y /admin/brand-theme-versions (brands.theme.*).
 * Un tema por marca; sus cambios son versiones. Publicar y revertir exigen
 * brands.theme.approve (solo admin).
 */
final class BrandThemeController
{
    public function __construct(private readonly BrandThemeService $themes, private readonly AuditLogger $audit) {}

    public function index(Request $request): JsonResponse
    {
        $query = BrandTheme::query();
        if ($brand = $request->input('filter.brand_id')) {
            $query->where('brand_id', $brand);
        }

        return CursorPagination::respond($query, $request, ['name', 'created_at'], ModelResource::class, 'name');
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'brand_id' => ['required', 'uuid', Rule::exists('brands', 'id')->where('organization_id', app(CurrentOrganization::class)->id())->whereNull('deleted_at')],
            'name' => ['required', 'string', 'max:200'],
        ]);
        if (BrandTheme::query()->where('brand_id', $data['brand_id'])->exists()) {
            throw new ProblemException(409, 'conflict', 'La marca ya tiene tema; cree una versión nueva.');
        }
        $theme = DB::transaction(function () use ($data): BrandTheme {
            $theme = BrandTheme::query()->create($data);
            $this->audit->record('brand_theme.created', 'brand_theme', $theme->id, null, $data);
            BrandThemeCreated::dispatch($theme->organization_id, $theme->id);

            return $theme;
        });

        return (new ModelResource($theme->refresh()))->response()->setStatusCode(201);
    }

    public function show(string $id): ModelResource
    {
        return new ModelResource(BrandTheme::query()->with('versions')->findOrFail($id));
    }

    public function storeVersion(Request $request, string $id): JsonResponse
    {
        $theme = BrandTheme::query()->findOrFail($id);
        $data = $request->validate([
            'tokens' => ['sometimes', 'array'],
            'surfaces' => ['sometimes', 'array'],
            'change_note' => ['nullable', 'string', 'max:2000'],
        ]);
        $version = $this->themes->draft($theme, $request->has('tokens') ? (array) $request->json('tokens') : null, $data['surfaces'] ?? null, $data['change_note'] ?? null);

        return (new ModelResource($version))->response()->setStatusCode(201);
    }

    public function showVersion(string $id): ModelResource
    {
        return new ModelResource(BrandThemeVersion::query()->findOrFail($id));
    }

    public function updateVersion(Request $request, string $id): ModelResource
    {
        $version = BrandThemeVersion::query()->findOrFail($id);
        $data = $request->validate([
            'version' => ['required', 'integer'],
            'tokens' => ['sometimes', 'array'],
            'surfaces' => ['sometimes', 'array'],
            'change_note' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ]);
        if ($request->has('tokens')) {
            $data['tokens'] = (array) $request->json('tokens');
        }

        return new ModelResource(DB::transaction(function () use ($version, $data): BrandThemeVersion {
            VersionGuard::check($version, $data['version']);

            return $this->themes->update($version, $data);
        }));
    }

    public function checkContrast(string $id): ModelResource
    {
        return new ModelResource($this->themes->checkContrast(BrandThemeVersion::query()->findOrFail($id)));
    }

    public function previewLink(string $id): JsonResponse
    {
        $link = $this->themes->previewLink(BrandThemeVersion::query()->findOrFail($id));

        return response()->json(['data' => $link + ['url' => url('/api/v1/public/brand-theme-previews/'.$link['token'])]], 201);
    }

    public function publish(string $id): ModelResource
    {
        return new ModelResource($this->themes->publish(BrandThemeVersion::query()->findOrFail($id)));
    }

    public function revert(Request $request, string $id): JsonResponse
    {
        $data = $request->validate(['change_note' => ['nullable', 'string', 'max:2000']]);
        $version = $this->themes->revert(BrandThemeVersion::query()->findOrFail($id), $data['change_note'] ?? null);

        return (new ModelResource($version))->response()->setStatusCode(201);
    }
}
