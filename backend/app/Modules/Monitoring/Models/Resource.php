<?php

declare(strict_types=1);

namespace App\Modules\Monitoring\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** Minimal relation target for the canonical resources table, owned by inventory. */
class Resource extends Model
{
    use BelongsToOrganization, HasUuids;
    protected $table = 'resources';
}
