<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class DomainTldPrice extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    protected $table = 'domain_tld_prices';

    protected $fillable = [
        'tld', 'provider_id', 'operation', 'years', 'cost_minor', 'cost_currency', 'price_minor',
        'currency', 'effective_from', 'effective_to', 'domain_extension_id',
    ];

    protected $attributes = ['version' => 1, 'years' => 1];

    protected function casts(): array
    {
        return [
            'years' => 'integer', 'cost_minor' => 'integer', 'price_minor' => 'integer',
            'effective_from' => 'date:Y-m-d', 'effective_to' => 'date:Y-m-d', 'version' => 'integer',
        ];
    }
}
