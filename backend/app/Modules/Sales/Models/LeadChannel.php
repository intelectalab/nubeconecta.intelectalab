<?php

declare(strict_types=1);

namespace App\Modules\Sales\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** Tabla canónica `lead_channels`: canales de captación. */
class LeadChannel extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    protected $table = 'lead_channels';

    protected $fillable = ['code', 'name', 'kind', 'brand_id', 'is_active'];

    protected function casts(): array
    {
        return ['is_active' => 'boolean', 'version' => 'integer'];
    }
}
