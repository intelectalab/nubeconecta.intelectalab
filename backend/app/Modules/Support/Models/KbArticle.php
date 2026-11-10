<?php

declare(strict_types=1);

namespace App\Modules\Support\Models;

use App\Modules\Brands\Models\Brand;
use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/** Artículo de la base de conocimientos (tabla canónica `kb_articles`). */
class KbArticle extends Model
{
    use BelongsToOrganization, HasUuids, SoftDeletes, TracksVersionAndActor;

    public const VISIBILITIES = ['public', 'internal'];

    public const STATUSES = ['draft', 'published', 'archived'];

    protected $table = 'kb_articles';

    protected $fillable = ['kb_category_id', 'brand_id', 'locale', 'title', 'slug', 'body', 'visibility', 'status'];

    protected $attributes = ['version' => 1, 'locale' => 'es', 'visibility' => 'internal', 'status' => 'draft'];

    protected function casts(): array
    {
        return ['published_at' => 'datetime', 'version' => 'integer'];
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(KbCategory::class, 'kb_category_id');
    }

    public function brand(): BelongsTo
    {
        return $this->belongsTo(Brand::class);
    }
}
