<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class DomainExtension extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    protected $table = 'domain_extensions';

    protected $fillable = [
        'tld', 'default_registrar_id', 'min_margin_percent', 'sellable_online', 'allows_transfer_in',
        'is_featured', 'sort_order', 'is_active',
    ];

    protected $attributes = [
        'version' => 1, 'sellable_online' => false, 'allows_transfer_in' => true,
        'is_featured' => false, 'sort_order' => 0, 'is_active' => true,
    ];

    protected function casts(): array
    {
        return [
            'min_margin_percent' => 'decimal:2', 'sellable_online' => 'boolean',
            'allows_transfer_in' => 'boolean', 'is_featured' => 'boolean', 'sort_order' => 'integer',
            'is_active' => 'boolean', 'version' => 'integer',
        ];
    }
}
