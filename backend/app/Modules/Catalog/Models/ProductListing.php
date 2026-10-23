<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

/** Tabla canónica `product_listings`: ficha del producto en una marca (la que leen las webs WordPress). */
class ProductListing extends Model
{
    use BelongsToOrganization, HasUuids, SoftDeletes, TracksVersionAndActor;

    protected $table = 'product_listings';

    protected $fillable = ['product_id', 'brand_id', 'display_name', 'tagline', 'highlights', 'sellable_online', 'is_featured', 'sort_order', 'visible_from', 'visible_until'];

    protected $hidden = ['deleted_at'];

    protected $attributes = ['version' => 1, 'tagline' => '{}', 'highlights' => '[]', 'sellable_online' => false, 'is_featured' => false, 'sort_order' => 0];

    protected function casts(): array
    {
        return [
            'display_name' => 'array', 'tagline' => 'array', 'highlights' => 'array', 'sellable_online' => 'boolean',
            'is_featured' => 'boolean', 'sort_order' => 'integer', 'version' => 'integer',
            'visible_from' => 'date:Y-m-d', 'visible_until' => 'date:Y-m-d',
        ];
    }
}
