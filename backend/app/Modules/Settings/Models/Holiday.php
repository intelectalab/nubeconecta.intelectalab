<?php

declare(strict_types=1);

namespace App\Modules\Settings\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** Tabla canónica `holidays` (database/schema.sql). */
class Holiday extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    protected $table = 'holidays';

    protected $fillable = ['country', 'date', 'name', 'recurring'];

    protected $attributes = ['version' => 1];

    protected function casts(): array
    {
        return ['date' => 'date:Y-m-d', 'recurring' => 'boolean', 'version' => 'integer'];
    }
}
