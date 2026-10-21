<?php

declare(strict_types=1);

namespace App\Modules\Brands\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Tabla canónica `brand_themes` (database/schema.sql). */
class BrandTheme extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    protected $table = 'brand_themes';

    protected $fillable = ['brand_id', 'name'];

    protected $attributes = ['version' => 1];

    protected function casts(): array
    {
        return ['published_at' => 'datetime', 'version' => 'integer'];
    }

    public function brand(): BelongsTo
    {
        return $this->belongsTo(Brand::class);
    }

    public function versions(): HasMany
    {
        return $this->hasMany(BrandThemeVersion::class)->orderByDesc('version_number');
    }
}
