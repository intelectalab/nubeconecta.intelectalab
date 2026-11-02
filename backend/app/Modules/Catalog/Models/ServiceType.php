<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Models;

use App\Shared\Database\Casts\PostgresTextArray;
use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ServiceType extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    protected $table = 'service_types';

    protected $fillable = [
        'code', 'name', 'description', 'icon', 'category_id', 'brand_ids', 'status', 'sale_mode',
        'requires_contract', 'default_provider_id', 'component_kind', 'delivery_tasks', 'portal_fields',
        'activated_at', 'archived_at',
    ];

    protected $attributes = ['version' => 1];

    protected function casts(): array
    {
        return [
            'name' => 'array', 'description' => 'array', 'delivery_tasks' => 'array',
            'brand_ids' => PostgresTextArray::class, 'portal_fields' => PostgresTextArray::class,
            'requires_contract' => 'boolean', 'activated_at' => 'datetime', 'archived_at' => 'datetime',
            'version' => 'integer',
        ];
    }

    public function fields(): HasMany
    {
        return $this->hasMany(ServiceTypeField::class, 'service_type_id')->orderBy('position');
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(ProductCategory::class, 'category_id');
    }
}
