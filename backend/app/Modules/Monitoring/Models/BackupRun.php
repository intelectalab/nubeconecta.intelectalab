<?php

declare(strict_types=1);

namespace App\Modules\Monitoring\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Corrida de respaldo (tabla `backup_runs`): un intento de respaldo de una
 * política, con su estado, tamaño y ubicación. En modo manual se registra a mano;
 * con API de la herramienta del nodo se leería automáticamente (fase posterior).
 */
class BackupRun extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    public const STATUSES = ['running', 'succeeded', 'failed', 'partial'];

    protected $table = 'backup_runs';

    protected $fillable = [
        'backup_policy_id', 'status', 'started_at', 'finished_at', 'size_bytes',
        'location', 'error', 'backup_tool_account_id', 'external_id',
    ];

    protected $attributes = ['version' => 1];

    protected function casts(): array
    {
        return [
            'started_at' => 'immutable_datetime',
            'finished_at' => 'immutable_datetime',
            'size_bytes' => 'integer',
            'version' => 'integer',
        ];
    }

    /** @return BelongsTo<BackupPolicy, BackupRun> */
    public function policy(): BelongsTo
    {
        return $this->belongsTo(BackupPolicy::class, 'backup_policy_id');
    }
}
