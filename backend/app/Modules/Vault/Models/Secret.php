<?php

declare(strict_types=1);

namespace App\Modules\Vault\Models;

use App\Modules\Customers\Models\Customer;
use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Secreto de la bóveda (tabla `secrets`). El valor cifrado (ciphertext/nonce)
 * NUNCA se serializa: se guarda y revela por VaultService con VaultCipher.
 */
class Secret extends Model
{
    use BelongsToOrganization, HasUuids, SoftDeletes, TracksVersionAndActor;

    public const KINDS = ['ssh', 'sftp', 'ftp', 'cpanel', 'whm', 'plesk', 'panel', 'cloud', 'registrar', 'database', 'app_admin', 'api_token', 'private_key', 'other'];

    public const OWNER_TYPES = ['provider_account', 'server', 'hosting_account', 'cloud_account', 'domain', 'resource', 'saas_instance', 'service', 'customer', 'webhook_endpoint', 'wp_site'];

    protected $table = 'secrets';

    protected $fillable = [
        'kind', 'name', 'owner_type', 'owner_id', 'customer_id', 'is_connector_credential',
        'username', 'host', 'port', 'metadata', 'rotates_at', 'expires_at',
    ];

    protected $attributes = ['version' => 1, 'is_connector_credential' => false];

    /** El valor cifrado nunca sale en una serialización. */
    protected $hidden = ['ciphertext', 'nonce'];

    protected function casts(): array
    {
        return [
            'is_connector_credential' => 'boolean',
            'metadata' => 'array',
            'port' => 'integer',
            'rotates_at' => 'date',
            'expires_at' => 'datetime',
            'last_rotated_at' => 'datetime',
            'version' => 'integer',
        ];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function grants(): HasMany
    {
        return $this->hasMany(SecretGrant::class);
    }
}
