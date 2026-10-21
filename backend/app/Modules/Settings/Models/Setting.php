<?php

declare(strict_types=1);

namespace App\Modules\Settings\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** Tabla canónica `settings` (database/schema.sql). */
class Setting extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    protected $table = 'settings';

    protected $fillable = ['key', 'scope_type', 'scope_id', 'value'];

    protected $attributes = ['version' => 1];

    protected function casts(): array
    {
        return ['value' => 'json', 'version' => 'integer'];
    }
}
