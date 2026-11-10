<?php

declare(strict_types=1);

namespace App\Modules\Support\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Categoría de la base de conocimientos (tabla canónica `kb_categories`). */
class KbCategory extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    public const VISIBILITIES = ['public', 'internal'];

    protected $table = 'kb_categories';

    protected $fillable = ['parent_id', 'name', 'slug', 'visibility', 'sort_order'];

    protected $attributes = ['version' => 1, 'visibility' => 'public', 'sort_order' => 0];

    protected function casts(): array
    {
        return ['version' => 'integer', 'sort_order' => 'integer'];
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function articles(): HasMany
    {
        return $this->hasMany(KbArticle::class, 'kb_category_id');
    }
}
