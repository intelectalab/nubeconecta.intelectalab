<?php

declare(strict_types=1);

namespace App\Modules\Inventory\Models;

use App\Modules\Providers\Models\ProviderAccount;
use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class Resource extends Model
{
    use BelongsToOrganization, HasUuids, SoftDeletes, TracksVersionAndActor;

    public const TYPES = ['hosting_node', 'hosting_account', 'server', 'cloud_resource', 'domain', 'mail_service', 'ssl_certificate', 'cdn_zone', 'bulk_email_account', 'dns_zone', 'saas_instance', 'database', 'storage', 'license', 'other'];
    public const STATUSES = ['active', 'suspended', 'stopped', 'terminated', 'not_found'];

    protected $table = 'resources';
    protected $fillable = ['type', 'provider_account_id', 'external_id', 'name', 'specs', 'cost_minor', 'cost_currency', 'renewal_date', 'sync_mode', 'custom'];
    protected $attributes = ['status' => 'active', 'sync_mode' => 'manual', 'specs' => '{}', 'custom' => '{}', 'version' => 1];

    protected function casts(): array
    {
        return ['specs' => 'array', 'custom' => 'array', 'cost_minor' => 'integer', 'renewal_date' => 'date', 'last_synced_at' => 'datetime', 'not_found_at' => 'datetime', 'version' => 'integer'];
    }

    public function providerAccount(): BelongsTo { return $this->belongsTo(ProviderAccount::class); }
    public function server(): HasOne { return $this->hasOne(Server::class); }
    public function hostingNode(): HasOne { return $this->hasOne(HostingNode::class); }
    public function hostingAccount(): HasOne { return $this->hasOne(HostingAccount::class); }
}
