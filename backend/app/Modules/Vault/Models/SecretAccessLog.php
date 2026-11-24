<?php

declare(strict_types=1);

namespace App\Modules\Vault\Models;

use App\Models\User;
use App\Shared\Database\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Bitácora de solo inserción de cada revelación o uso de un secreto (tabla
 * `secret_access_logs`). Nunca guarda el valor. Un trigger de la base impide
 * UPDATE/DELETE.
 */
class SecretAccessLog extends Model
{
    use BelongsToOrganization, HasUuids;

    public const ACTIONS = ['reveal', 'copy', 'connector_use', 'reveal_denied', 'one_time_link'];

    protected $table = 'secret_access_logs';

    /** La tabla solo tiene created_at (sin updated_at). */
    public const UPDATED_AT = null;

    protected $fillable = ['secret_id', 'user_id', 'action', 'reason', 'ip', 'user_agent'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
