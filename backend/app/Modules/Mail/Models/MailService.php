<?php

declare(strict_types=1);

namespace App\Modules\Mail\Models;

use App\Modules\Domains\Models\Domain;
use App\Modules\Providers\Models\ProviderAccount;
use App\Modules\Services\Models\Service;
use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/** Correo corporativo de un dominio (cPanel, Google Workspace, Microsoft 365). El cliente se deriva del dominio. */
class MailService extends Model
{
    use BelongsToOrganization, HasUuids, SoftDeletes, TracksVersionAndActor;

    public const PROVIDER_KINDS = ['cpanel', 'google_workspace', 'microsoft_365', 'other'];

    public const OWNERS = ['company', 'customer'];

    public const STATUSES = ['active', 'suspended', 'cancelled'];

    protected $table = 'mail_services';

    protected $fillable = [
        'domain_id', 'service_id', 'provider_kind', 'provider_account_id', 'hosting_account_id', 'tenant_id', 'plan', 'account_owner',
        'seats_purchased', 'seats_used', 'seats_billed', 'mailboxes_count', 'storage_used_mb', 'renewal_date', 'status',
    ];

    protected $attributes = ['version' => 1, 'status' => 'active', 'sync_mode' => 'manual', 'account_owner' => 'company'];

    protected function casts(): array
    {
        return [
            'renewal_date' => 'date', 'last_synced_at' => 'datetime', 'version' => 'integer',
            'seats_purchased' => 'integer', 'seats_used' => 'integer', 'seats_billed' => 'integer',
            'mailboxes_count' => 'integer', 'storage_used_mb' => 'integer',
        ];
    }

    public function domain(): BelongsTo { return $this->belongsTo(Domain::class)->withTrashed(); }
    public function service(): BelongsTo { return $this->belongsTo(Service::class); }
    public function providerAccount(): BelongsTo { return $this->belongsTo(ProviderAccount::class); }
    public function dnsChecks(): HasMany { return $this->hasMany(MailDnsCheck::class); }
}
