<?php

declare(strict_types=1);

namespace App\Modules\Brands\Http\Controllers;

use App\Modules\Brands\Models\Brand;
use App\Modules\Brands\Models\BrandThemeVersion;
use App\Modules\Brands\Services\BrandResolver;
use App\Shared\Http\Problem\ProblemException;
use Illuminate\Http\JsonResponse;

/**
 * Sin permisos: GET /api/v1/public/brand-themes/{brand} (tokens publicados por
 * código de marca, para el portal y el carrito) y la vista previa firmada
 * GET /api/v1/public/brand-theme-previews/{token} (404 si venció; nunca se indexa).
 */
final class PublicBrandThemeController
{
    public function show(BrandResolver $resolver, string $brand): JsonResponse
    {
        $model = $resolver->forCode($brand) ?? throw ProblemException::notFound();

        return response()->json(['data' => $this->present($model, $model->theme ?: null)])
            ->header('Cache-Control', 'public, max-age=60');
    }

    public function preview(string $token): JsonResponse
    {
        $version = BrandThemeVersion::query()
            ->where('preview_token_hash', hash('sha256', $token))
            ->where('preview_expires_at', '>', now())
            ->first() ?? throw new ProblemException(404, 'not_found', null, [], ['X-Robots-Tag' => 'noindex, nofollow']);
        $brand = Brand::query()->findOrFail($version->brand_id);

        return response()->json(['data' => $this->present($brand, [
            'version_id' => $version->id,
            'version_number' => $version->version_number,
            'surfaces' => $version->surfaces,
            'tokens' => $version->tokens,
        ]) + ['preview' => true, 'status' => $version->status]])
            ->header('X-Robots-Tag', 'noindex, nofollow')
            ->header('Cache-Control', 'no-store');
    }

    /** @param array<string, mixed>|null $theme */
    private function present(Brand $brand, ?array $theme): array
    {
        return [
            'brand' => ['code' => $brand->code, 'name' => $brand->name, 'locale' => $brand->locale],
            'theme' => $theme,
        ];
    }
}
