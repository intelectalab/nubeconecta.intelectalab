<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Tabla canónica `product_categories` (M-CAT §3). Las de sistema no se borran ni cambian de tipo. */
class ProductCategory extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    public const KINDS = ['shared_hosting', 'reseller_hosting', 'vps', 'dedicated_server', 'cloud', 'domain', 'ssl', 'email', 'website', 'online_store', 'moodle', 'license', 'support', 'custom_development', 'custom'];

    protected $table = 'product_categories';

    protected $fillable = ['parent_id', 'code', 'name', 'kind', 'shortcode_type', 'sort_order'];

    protected $attributes = ['version' => 1, 'kind' => 'custom', 'sort_order' => 0, 'is_system' => false];

    protected function casts(): array
    {
        return ['is_system' => 'boolean', 'sort_order' => 'integer', 'version' => 'integer'];
    }

    public function products(): HasMany
    {
        return $this->hasMany(Product::class, 'category_id');
    }
}
