<?php

declare(strict_types=1);

namespace App\Modules\Brands\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Casts\Attribute;

/** Tabla canónica `brand_theme_versions` (database/schema.sql). */
class BrandThemeVersion extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    protected $table = 'brand_theme_versions';

    protected $fillable = ['tokens', 'surfaces', 'change_note'];

    protected $attributes = ['version' => 1];

    protected function casts(): array
    {
        return ['tokens' => 'array', 'contrast_report' => 'array', 'contrast_min_ratio' => 'float', 'contrast_lowest_ratio' => 'float', 'contrast_checked_at' => 'datetime', 'preview_expires_at' => 'datetime', 'published_at' => 'datetime', 'archived_at' => 'datetime', 'version_number' => 'integer', 'version' => 'integer'];
    }

    protected $hidden = ['preview_token_hash'];

    /** text[] de PostgreSQL <-> lista PHP. */
    protected function surfaces(): Attribute
    {
        return Attribute::make(
            get: fn (?string $value): array => $value === null || $value === '{}' ? [] : explode(',', trim($value, '{}')),
            set: fn (array $value): string => '{'.implode(',', $value).'}',
        );
    }
}
