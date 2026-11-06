<?php

declare(strict_types=1);

namespace App\Modules\Support\Models;

use App\Modules\Files\Models\File;
use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Ticket extends Model
{
    use BelongsToOrganization, HasUuids, SoftDeletes, TracksVersionAndActor;

    protected $table = 'tickets';

    protected $fillable = ['number', 'customer_id', 'contact_id', 'brand_id', 'type', 'status', 'priority', 'channel', 'subject', 'assignee_id', 'sla_policy_id', 'first_response_due_at', 'first_responded_at', 'resolution_due_at', 'sla_paused_since', 'sla_paused_minutes', 'sla_breached', 'whatsapp_conversation_id', 'resolved_at', 'closed_at', 'reopened_count', 'last_customer_activity_at', 'custom', 'department', 'category', 'level'];

    protected $attributes = ['version' => 1, 'type' => 'request', 'status' => 'new', 'priority' => 'medium', 'sla_paused_minutes' => 0, 'sla_breached' => false, 'reopened_count' => 0, 'level' => 1, 'custom' => '{}'];

    protected function casts(): array
    {
        return ['custom' => 'array', 'sla_breached' => 'boolean', 'first_response_due_at' => 'datetime', 'first_responded_at' => 'datetime', 'resolution_due_at' => 'datetime', 'sla_paused_since' => 'datetime', 'resolved_at' => 'datetime', 'closed_at' => 'datetime', 'last_customer_activity_at' => 'datetime', 'sla_paused_minutes' => 'integer', 'reopened_count' => 'integer', 'level' => 'integer', 'version' => 'integer'];
    }

    public function messages(): HasMany { return $this->hasMany(TicketMessage::class)->orderBy('created_at'); }

    /** Adjuntos ligados al ticket (archivos subidos con attachable_type='ticket'). */
    public function attachments(): HasMany
    {
        return $this->hasMany(File::class, 'attachable_id')->where('attachable_type', 'ticket')->orderByDesc('created_at');
    }
}
