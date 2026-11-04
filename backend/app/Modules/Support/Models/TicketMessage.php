<?php

declare(strict_types=1);

namespace App\Modules\Support\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class TicketMessage extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    protected $table = 'ticket_messages';
    protected $fillable = ['ticket_id', 'author_type', 'author_user_id', 'author_contact_id', 'channel', 'body', 'is_internal', 'external_message_id', 'in_reply_to'];
    protected $attributes = ['version' => 1, 'is_internal' => false];

    protected function casts(): array { return ['is_internal' => 'boolean', 'version' => 'integer']; }
}
