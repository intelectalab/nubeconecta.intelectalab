<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** Notificación in-app de un usuario del personal (feed de la campana). */
final class UserNotification extends Model
{
    use BelongsToOrganization, HasUuids;

    public const UPDATED_AT = null;

    protected $table = 'user_notifications';

    protected $guarded = ['*'];

    protected function casts(): array
    {
        return ['read_at' => 'datetime', 'created_at' => 'datetime'];
    }
}
