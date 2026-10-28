<?php

declare(strict_types=1);

namespace App\Modules\Sales\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** Tabla canónica `lead_activities`: notas, llamadas, correos y seguimientos del prospecto. */
class LeadActivity extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    public const TYPES = ['call', 'whatsapp', 'email', 'meeting', 'note', 'follow_up'];

    protected $table = 'lead_activities';

    protected $fillable = ['lead_id', 'type', 'subject', 'notes', 'due_at', 'reminder_at', 'completed_at', 'assigned_to'];

    protected function casts(): array
    {
        return ['due_at' => 'datetime', 'reminder_at' => 'datetime', 'completed_at' => 'datetime', 'version' => 'integer'];
    }
}
