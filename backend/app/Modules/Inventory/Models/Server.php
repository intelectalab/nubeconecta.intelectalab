<?php

declare(strict_types=1);

namespace App\Modules\Inventory\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Server extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    protected $table = 'servers';
    protected $fillable = ['resource_id', 'hostname', 'os', 'public_ip', 'private_ip', 'cpu', 'ram_mb', 'disk_gb', 'region', 'tenancy', 'custom'];
    protected $attributes = ['tenancy' => 'dedicated', 'custom' => '{}', 'version' => 1];
    protected function casts(): array { return ['cpu' => 'integer', 'ram_mb' => 'integer', 'disk_gb' => 'integer', 'custom' => 'array', 'version' => 'integer']; }
    public function resource(): BelongsTo { return $this->belongsTo(Resource::class); }
}
