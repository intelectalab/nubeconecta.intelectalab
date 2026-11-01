<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Relación de complemento entre dos productos, con precio propio en el producto complementario. */
final class ProductAddon extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    protected $table = 'product_addons';

    protected $fillable = ['product_id', 'addon_product_id', 'is_required'];

    protected $attributes = ['version' => 1, 'is_required' => false];

    protected function casts(): array
    {
        return ['is_required' => 'boolean', 'version' => 'integer'];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'product_id');
    }

    public function addonProduct(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'addon_product_id');
    }
}
