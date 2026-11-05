<?php

declare(strict_types=1);

namespace App\Modules\Monitoring\Models;

use App\Models\User;
use App\Modules\Services\Models\Service;
use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Monitor extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    public const TYPES = ['http', 'keyword', 'ping', 'port', 'dns', 'ssl', 'heartbeat', 'mail_reputation', 'external'];
    public const STATUSES = ['up', 'down', 'degraded', 'paused', 'unknown'];

    protected $table = 'monitors';
    protected $fillable = ['name', 'type', 'target', 'interval_seconds', 'resource_id', 'project_component_id', 'service_id', 'is_active', 'authorized_by'];
    protected $attributes = ['version' => 1, 'status' => 'unknown', 'is_active' => true];

    protected function casts(): array
    {
        return ['interval_seconds' => 'integer', 'is_active' => 'boolean', 'last_checked_at' => 'datetime', 'version' => 'integer'];
    }

    public function service(): BelongsTo { return $this->belongsTo(Service::class); }
    public function resource(): BelongsTo { return $this->belongsTo(Resource::class); }
    public function authorizedBy(): BelongsTo { return $this->belongsTo(User::class, 'authorized_by'); }
}
