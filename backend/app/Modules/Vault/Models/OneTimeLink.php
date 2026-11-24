<?php

declare(strict_types=1);

namespace App\Modules\Vault\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Enlace de un solo uso para entregar un acceso o código al cliente
 * (tabla `one_time_links`). El token plano solo existe al crearlo; se guarda su
 * sha256. El contenido cifrado (payload) nunca se serializa.
 */
class OneTimeLink extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    public const PURPOSES = ['credential_delivery', 'domain_auth_code', 'welcome_access', 'account_handover'];

    protected $table = 'one_time_links';

    protected $fillable = ['purpose', 'secret_id', 'recipient_email', 'contact_id', 'max_views', 'expires_at'];

    protected $attributes = ['version' => 1, 'max_views' => 1, 'views_count' => 0];

    protected $hidden = ['payload_ciphertext', 'payload_nonce', 'token_hash'];

    protected function casts(): array
    {
        return [
            'max_views' => 'integer',
            'views_count' => 'integer',
            'expires_at' => 'datetime',
            'consumed_at' => 'datetime',
            'revoked_at' => 'datetime',
            'version' => 'integer',
        ];
    }

    public function secret(): BelongsTo
    {
        return $this->belongsTo(Secret::class);
    }

    public function isUsable(): bool
    {
        return $this->revoked_at === null
            && $this->consumed_at === null
            && $this->views_count < $this->max_views
            && $this->expires_at->isFuture();
    }
}
