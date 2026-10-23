<?php

declare(strict_types=1);

namespace App\Modules\Customers\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

/** Tabla canónica `customer_notes`: notas internas; nunca viajan al portal. */
class CustomerNote extends Model
{
    use BelongsToOrganization, HasUuids, SoftDeletes, TracksVersionAndActor;

    protected $table = 'customer_notes';

    protected $fillable = ['body', 'is_pinned'];

    protected $attributes = ['version' => 1, 'is_pinned' => false];

    protected function casts(): array
    {
        return ['is_pinned' => 'boolean', 'version' => 'integer'];
    }
}
