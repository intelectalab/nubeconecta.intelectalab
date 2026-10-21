<?php

declare(strict_types=1);

namespace App\Modules\Settings\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** Tabla canónica `business_hours` (database/schema.sql). */
class BusinessHour extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    protected $table = 'business_hours';

    protected $fillable = ['calendar', 'timezone', 'weekday', 'opens_at', 'closes_at'];

    protected $attributes = ['version' => 1];

    protected function casts(): array
    {
        return ['weekday' => 'integer', 'version' => 'integer'];
    }
}
