<?php

declare(strict_types=1);

namespace App\Modules\Domains\Models;

use App\Modules\Customers\Models\Customer;
use App\Modules\Providers\Models\ProviderAccount;
use App\Modules\Services\Models\Service;
use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Dominio de un cliente o de la empresa. Dos fechas: `registry_expires_at` (real, del registrador)
 * y la comercial en `services.commercial_due_date` del servicio vinculado.
 */
class Domain extends Model
{
    use BelongsToOrganization, HasUuids, SoftDeletes, TracksVersionAndActor;

    public const STATUSES = ['active', 'expired', 'redemption', 'pending_transfer', 'transferred_out', 'not_found'];

    public const HOLDERS = ['company', 'customer'];

    protected $table = 'domains';

    protected $fillable = [
        'name', 'tld', 'provider_account_id', 'customer_id', 'service_id', 'holder', 'registered_at', 'registry_expires_at',
        'auto_renew', 'lock', 'dnssec', 'privacy', 'nameservers', 'transfer_locked_until', 'status',
    ];

    protected $attributes = [
        'version' => 1, 'status' => 'active', 'sync_mode' => 'manual', 'auto_renew' => false, 'lock' => true,
        'dnssec' => false, 'privacy' => false, 'nameservers' => '[]', 'custom' => '{}',
    ];

    protected function casts(): array
    {
        return [
            'registered_at' => 'date', 'registry_expires_at' => 'date', 'transfer_locked_until' => 'date',
            'auto_renew' => 'boolean', 'lock' => 'boolean', 'dnssec' => 'boolean', 'privacy' => 'boolean',
            'nameservers' => 'array', 'custom' => 'array', 'last_synced_at' => 'datetime', 'last_transfer_at' => 'datetime',
            'version' => 'integer',
        ];
    }

    public function contacts(): HasMany { return $this->hasMany(DomainContact::class)->orderBy('role'); }
    public function customer(): BelongsTo { return $this->belongsTo(Customer::class); }
    public function service(): BelongsTo { return $this->belongsTo(Service::class); }
    public function providerAccount(): BelongsTo { return $this->belongsTo(ProviderAccount::class); }
}
