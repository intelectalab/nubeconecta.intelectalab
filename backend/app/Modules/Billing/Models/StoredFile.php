<?php

declare(strict_types=1);

namespace App\Modules\Billing\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** Fila de la tabla canónica `files` para constancias de pago (ruta con organization_id, nombre aleatorio, disco privado). */
class StoredFile extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    protected $table = 'files';

    protected $fillable = [];

    protected $attributes = ['version' => 1, 'scan_status' => 'pending', 'visibility' => 'internal'];

    protected function casts(): array
    {
        return ['version' => 'integer', 'size_bytes' => 'integer'];
    }
}
