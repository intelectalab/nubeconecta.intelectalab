<?php

declare(strict_types=1);

namespace App\Modules\Files\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class File extends Model
{
    use BelongsToOrganization, HasUuids, SoftDeletes, TracksVersionAndActor;

    protected $table = 'files';

    // El servicio fija también los campos que normalmente son sensibles.
    protected $fillable = [];

    protected $attributes = [
        'version' => 1,
        'scan_status' => 'pending',
        'visibility' => 'internal',
    ];

    protected function casts(): array
    {
        return [
            'size_bytes' => 'integer',
            'retention_until' => 'date',
            'version' => 'integer',
        ];
    }

    public function attachable(): MorphTo
    {
        return $this->morphTo();
    }

    public function isCustomerVisible(): bool
    {
        return $this->visibility === 'customer';
    }
}
