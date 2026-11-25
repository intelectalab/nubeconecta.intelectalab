<?php

declare(strict_types=1);

namespace App\Modules\Monitoring\Models;

use App\Modules\Customers\Models\Customer;
use App\Modules\Services\Models\Service;
use App\Modules\Support\Models\Ticket;
use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Solicitud de restauración (tabla `restore_requests`): el cliente (o soporte)
 * pide restaurar un servicio a un punto en el tiempo. Lleva un ticket de soporte
 * asociado y una máquina de estados estricta (requested → approved/rejected →
 * in_progress → completed/failed). La ejecución es asistida (tarea) o por API.
 */
class RestoreRequest extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    public const TARGET_KINDS = ['website', 'database', 'mailbox', 'full_account'];

    public const STATUSES = ['requested', 'approved', 'rejected', 'in_progress', 'completed', 'failed', 'cancelled'];

    public const EXECUTION_MODES = ['api', 'assisted'];

    protected $table = 'restore_requests';

    protected $fillable = [
        'code', 'customer_id', 'service_id', 'hosting_account_id', 'target_kind', 'target_name',
        'restore_point_at', 'backup_run_id', 'requested_via', 'requested_by', 'overwrite_confirmed',
        'status', 'ticket_id', 'approved_by', 'approved_at', 'rejection_reason', 'execution_mode',
        'backup_tool_account_id', 'external_job_id', 'task_id', 'started_at', 'completed_at',
        'evidence_file_id', 'result_notes',
    ];

    protected $attributes = ['version' => 1, 'status' => 'requested', 'overwrite_confirmed' => false];

    protected function casts(): array
    {
        return [
            'restore_point_at' => 'immutable_datetime',
            'approved_at' => 'immutable_datetime',
            'started_at' => 'immutable_datetime',
            'completed_at' => 'immutable_datetime',
            'overwrite_confirmed' => 'boolean',
            'version' => 'integer',
        ];
    }

    /** @return BelongsTo<Customer, RestoreRequest> */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /** @return BelongsTo<Service, RestoreRequest> */
    public function service(): BelongsTo
    {
        return $this->belongsTo(Service::class);
    }

    /** @return BelongsTo<Ticket, RestoreRequest> */
    public function ticket(): BelongsTo
    {
        return $this->belongsTo(Ticket::class);
    }
}
