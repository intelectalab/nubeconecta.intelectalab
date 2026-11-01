<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Tabla canónica `products` (M-CAT §3). `brand_id` NULL = todas las marcas;
 * `sellable_online` = venta en línea; el resto se vende por cotización.
 */
class Product extends Model
{
    use BelongsToOrganization, HasUuids, SoftDeletes, TracksVersionAndActor;

    protected $table = 'products';

    protected $fillable = [
        'code', 'category_id', 'brand_id', 'name', 'description', 'billing_type', 'provisioning_rule', 'connector',
        'requires_contract', 'export_eligible', 'tax_code', 'is_active', 'sellable_online', 'custom',
    ];

    protected $hidden = ['deleted_at'];

    protected $attributes = [
        'version' => 1, 'provisioning_rule' => 'manual', 'requires_contract' => false, 'export_eligible' => false,
        'is_active' => true, 'sellable_online' => false, 'custom' => '{}',
    ];

    protected function casts(): array
    {
        return [
            'requires_contract' => 'boolean', 'export_eligible' => 'boolean', 'is_active' => 'boolean',
            'sellable_online' => 'boolean', 'custom' => 'array', 'version' => 'integer',
        ];
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(ProductCategory::class, 'category_id');
    }

    public function plans(): HasMany
    {
        return $this->hasMany(Plan::class)->orderBy('code');
    }

    public function listings(): HasMany
    {
        return $this->hasMany(ProductListing::class);
    }

    public function addons(): HasMany
    {
        return $this->hasMany(ProductAddon::class, 'product_id')->orderBy('created_at');
    }
}
