<?php

declare(strict_types=1);

namespace App\Modules\Monitoring\Models;

use App\Modules\Services\Models\Service;
use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Política de respaldo (tabla `backup_policies`): qué se respalda, con qué
 * frecuencia y retención, su RPO/RTO y quién es responsable. En modo manual el
 * sistema registra las corridas; la ejecución vía API del proveedor es posterior.
 */
class BackupPolicy extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    public const RESPONSIBILITIES = ['company', 'provider', 'customer'];

    public const FREQUENCIES = ['hourly', 'daily', 'weekly', 'monthly'];

    protected $table = 'backup_policies';

    protected $fillable = [
        'resource_id', 'service_id', 'name', 'responsibility', 'frequency', 'retention_days',
        'rpo_minutes', 'rto_minutes', 'encrypted', 'destination', 'is_active', 'responsible_user_id',
    ];

    protected $attributes = ['version' => 1, 'responsibility' => 'company', 'encrypted' => true, 'is_active' => true];

    protected function casts(): array
    {
        return [
            'retention_days' => 'integer',
            'rpo_minutes' => 'integer',
            'rto_minutes' => 'integer',
            'encrypted' => 'boolean',
            'is_active' => 'boolean',
            'version' => 'integer',
        ];
    }

    /** @return BelongsTo<Resource, BackupPolicy> */
    public function resource(): BelongsTo
    {
        return $this->belongsTo(Resource::class);
    }

    /** @return BelongsTo<Service, BackupPolicy> */
    public function service(): BelongsTo
    {
        return $this->belongsTo(Service::class);
    }

    /** @return HasMany<BackupRun> */
    public function runs(): HasMany
    {
        return $this->hasMany(BackupRun::class)->orderByDesc('started_at');
    }
}
