<?php

declare(strict_types=1);

namespace App\Modules\Support\Models;

use App\Models\User;
use App\Modules\Customers\Models\Contact;
use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TicketMessage extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    protected $table = 'ticket_messages';
    protected $fillable = ['ticket_id', 'author_type', 'author_user_id', 'author_contact_id', 'channel', 'body', 'is_internal', 'external_message_id', 'in_reply_to'];
    protected $attributes = ['version' => 1, 'is_internal' => false];

    protected function casts(): array { return ['is_internal' => 'boolean', 'version' => 'integer']; }

    public function authorUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'author_user_id');
    }

    public function authorContact(): BelongsTo
    {
        return $this->belongsTo(Contact::class, 'author_contact_id');
    }
}
