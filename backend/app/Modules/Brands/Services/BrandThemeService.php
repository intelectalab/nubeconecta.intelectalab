<?php

declare(strict_types=1);

namespace App\Modules\Brands\Services;

use App\Modules\Brands\Events\BrandThemeVersionArchived;
use App\Modules\Brands\Events\BrandThemeVersionDrafted;
use App\Modules\Brands\Events\BrandThemeVersionPublished;
use App\Modules\Brands\Events\BrandThemeVersionReverted;
use App\Modules\Brands\Models\Brand;
use App\Modules\Brands\Models\BrandTheme;
use App\Modules\Brands\Models\BrandThemeVersion;
use App\Modules\Settings\Services\SettingsResolver;
use App\Shared\Audit\AuditLogger;
use App\Shared\Http\Problem\ProblemException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Ciclo de vida de las versiones de tema (máquina 26 de docs/03:
 * draft → published → archived). Ventas prepara borradores y verifica el
 * contraste; solo admin publica o revierte (brands.theme.approve, en la ruta).
 */
final class BrandThemeService
{
    public const SURFACES = ['portal', 'admin', 'email'];

    public function __construct(
        private readonly ThemeTokens $tokens,
        private readonly AuditLogger $audit,
        private readonly SettingsResolver $settings,
    ) {}

    /** @param array<string, mixed>|null $tokens null = copia de la publicada (o vacío si no hay) */
    public function draft(BrandTheme $theme, ?array $tokens, ?array $surfaces, ?string $note, ?BrandThemeVersion $restoredFrom = null): BrandThemeVersion
    {
        return DB::transaction(function () use ($theme, $tokens, $surfaces, $note, $restoredFrom): BrandThemeVersion {
            BrandTheme::query()->whereKey($theme->id)->lockForUpdate()->first();
            $base = $restoredFrom ?? ($theme->published_version_id ? BrandThemeVersion::query()->find($theme->published_version_id) : null);
            $tokens ??= $base?->tokens ?? [];
            $this->tokens->validate($tokens);

            $version = new BrandThemeVersion;
            $version->forceFill([
                'brand_theme_id' => $theme->id,
                'brand_id' => $theme->brand_id,
                'version_number' => (int) BrandThemeVersion::query()->where('brand_theme_id', $theme->id)->max('version_number') + 1,
                'tokens' => $tokens,
                'surfaces' => $this->surfaces($surfaces ?? $base?->surfaces ?? ['portal']),
                'logo_file_id' => $base?->logo_file_id,
                'favicon_file_id' => $base?->favicon_file_id,
                'status' => 'draft',
                'change_note' => $note,
                'restored_from_version_id' => $restoredFrom?->id,
            ])->save();
            $this->audit->record('brand_theme_version.drafted', 'brand_theme_version', $version->id, null, $this->snapshot($version), ['restored_from_version_id' => $restoredFrom?->id]);
            BrandThemeVersionDrafted::dispatch($version->organization_id, $version->id);

            return $version->refresh();
        });
    }

    /** Editar un borrador borra su verificación de contraste. */
    public function update(BrandThemeVersion $version, array $data): BrandThemeVersion
    {
        $this->assertDraft($version);
        if (array_key_exists('tokens', $data)) {
            $this->tokens->validate($data['tokens']);
            $version->tokens = $data['tokens'];
            $version->forceFill(['contrast_min_ratio' => null, 'contrast_lowest_ratio' => null, 'contrast_report' => [], 'contrast_checked_at' => null]);
        }
        if (array_key_exists('surfaces', $data)) {
            $version->surfaces = $this->surfaces($data['surfaces']);
        }
        if (array_key_exists('change_note', $data)) {
            $version->change_note = $data['change_note'];
        }
        $before = $this->snapshot(BrandThemeVersion::query()->findOrFail($version->id));
        $version->save();
        $this->audit->record('brand_theme_version.updated', 'brand_theme_version', $version->id, $before, $this->snapshot($version));

        return $version->refresh();
    }

    /** Mide los pares texto/fondo y guarda el resultado; no publica. */
    public function checkContrast(BrandThemeVersion $version): BrandThemeVersion
    {
        $this->assertDraft($version);
        $result = $this->tokens->contrast($version->tokens ?? []);
        if ($result['missing'] !== []) {
            throw ProblemException::validation(array_fill_keys($result['missing'], [__('brands.contrast_pairs_missing')]));
        }
        $version->forceFill([
            'contrast_min_ratio' => $result['min'],
            'contrast_lowest_ratio' => $result['lowest'],
            'contrast_report' => $result['report'],
            'contrast_checked_at' => now(),
        ])->save();
        $this->audit->record('brand_theme_version.contrast_checked', 'brand_theme_version', $version->id, null, ['lowest' => $result['lowest'], 'min' => $result['min']]);

        return $version->refresh();
    }

    /** @return array{token: string, expires_at: string} */
    public function previewLink(BrandThemeVersion $version): array
    {
        $token = Str::random(48);
        $expires = now()->addMinutes((int) $this->settings->get('brands.theme.preview_link_minutes'));
        $version->forceFill(['preview_token_hash' => hash('sha256', $token), 'preview_expires_at' => $expires])->save();
        $this->audit->record('brand_theme_version.preview_link_created', 'brand_theme_version', $version->id, null, ['preview_expires_at' => $expires->toIso8601ZuluString()]);

        return ['token' => $token, 'expires_at' => $expires->toIso8601ZuluString()];
    }

    /** Publica con el contraste verificado contra el mínimo vigente; archiva la anterior en la misma transacción. */
    public function publish(BrandThemeVersion $version, string $action = 'published'): BrandThemeVersion
    {
        return DB::transaction(function () use ($version, $action): BrandThemeVersion {
            $theme = BrandTheme::query()->whereKey($version->brand_theme_id)->lockForUpdate()->firstOrFail();
            $version = BrandThemeVersion::query()->whereKey($version->id)->lockForUpdate()->firstOrFail();
            $this->assertDraft($version);
            $min = (float) $this->settings->get('brands.theme.min_contrast_ratio');
            if ($version->contrast_checked_at === null || $version->contrast_lowest_ratio === null || (float) $version->contrast_min_ratio < $min) {
                throw new ProblemException(422, 'contrast_not_verified', null, ['min_contrast_ratio' => $min]);
            }
            if ($version->contrast_lowest_ratio < $min) {
                throw new ProblemException(422, 'contrast_below_minimum', null, ['min_contrast_ratio' => $min, 'lowest_ratio' => $version->contrast_lowest_ratio, 'version_id' => $version->id]);
            }

            $now = now();
            $previous = BrandThemeVersion::query()->where('brand_id', $version->brand_id)->where('status', 'published')->lockForUpdate()->first();
            if ($previous !== null) {
                $previous->forceFill(['status' => 'archived', 'archived_at' => $now])->save();
                BrandThemeVersionArchived::dispatch($previous->organization_id, $previous->id);
            }
            $version->forceFill(['status' => 'published', 'published_at' => $now, 'published_by' => auth()->id(), 'preview_token_hash' => null, 'preview_expires_at' => null])->save();
            $theme->forceFill(['published_version_id' => $version->id, 'published_at' => $now])->save();

            $brand = Brand::query()->findOrFail($version->brand_id);
            $brand->theme = ['version_id' => $version->id, 'version_number' => $version->version_number, 'surfaces' => $version->surfaces, 'tokens' => $version->tokens];
            $brand->save();

            $this->audit->record("brand_theme_version.{$action}", 'brand_theme_version', $version->id, $previous ? ['published_version_id' => $previous->id] : null, $this->snapshot($version));
            $action === 'reverted'
                ? BrandThemeVersionReverted::dispatch($version->organization_id, $version->id)
                : BrandThemeVersionPublished::dispatch($version->organization_id, $version->id);

            return $version->refresh();
        });
    }

    /**
     * Volver a una versión anterior: crea una copia nueva, la verifica y la publica.
     * Si ya no alcanza el mínimo, la copia queda como borrador y responde 422.
     */
    public function revert(BrandThemeVersion $source, ?string $note): BrandThemeVersion
    {
        if ($source->status === 'published') {
            throw new ProblemException(409, 'invalid_transition', 'La versión ya es la publicada.');
        }
        $theme = BrandTheme::query()->findOrFail($source->brand_theme_id);
        $copy = $this->draft($theme, $source->tokens, $source->surfaces, $note ?? "Reversión a la versión {$source->version_number}", $source);
        $result = $this->tokens->contrast($copy->tokens ?? []);
        if ($result['missing'] !== []) {
            throw new ProblemException(422, 'contrast_not_verified', null, ['version_id' => $copy->id]);
        }
        $this->checkContrast($copy);

        return $this->publish($copy, 'reverted');
    }

    private function assertDraft(BrandThemeVersion $version): void
    {
        if ($version->status !== 'draft') {
            throw new ProblemException(409, 'invalid_transition', "Solo se edita o publica un borrador (estado actual: {$version->status}).");
        }
    }

    /** @param mixed $surfaces @return list<string> */
    private function surfaces(mixed $surfaces): array
    {
        if (! is_array($surfaces) || $surfaces === [] || array_diff($surfaces, self::SURFACES) !== []) {
            throw ProblemException::validation(['surfaces' => [__('brands.surface')]]);
        }

        return array_values(array_unique($surfaces));
    }

    /** @return array<string, mixed> */
    private function snapshot(BrandThemeVersion $version): array
    {
        return $version->only(['brand_theme_id', 'brand_id', 'version_number', 'status', 'surfaces', 'tokens', 'change_note']);
    }
}
