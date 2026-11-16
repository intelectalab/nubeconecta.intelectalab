<?php

declare(strict_types=1);

namespace App\Modules\Cloud\Models;

use App\Modules\Customers\Models\Customer;
use App\Modules\Providers\Models\ProviderAccount;
use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/** Cuenta AWS/Azure/GCP con titular y modalidad (modo manual: sin lectura por API). */
class CloudAccount extends Model
{
    use BelongsToOrganization, HasUuids, SoftDeletes, TracksVersionAndActor;

    public const PLATFORMS = ['aws', 'azure', 'gcp', 'digitalocean', 'other'];

    public const OWNERS = ['company', 'customer'];

    public const MODALITIES = ['dedicated_company_account', 'managed_customer_account', 'shared_saas', 'managed_new_account_handover'];

    public const TAGGING = ['pending', 'in_progress', 'done'];

    public const STATUSES = ['active', 'access_revoked', 'handed_over', 'closed'];

    protected $table = 'cloud_accounts';

    protected $fillable = [
        'provider_account_id', 'platform', 'external_account_id', 'owner', 'modality', 'customer_id', 'authorization_file_id',
        'access_reference', 'period_start', 'period_end', 'tagging_status', 'access_revoked_at', 'status',
    ];

    protected $attributes = ['version' => 1, 'owner' => 'company', 'tagging_status' => 'pending', 'status' => 'active'];

    protected function casts(): array
    {
        return ['period_start' => 'date', 'period_end' => 'date', 'access_revoked_at' => 'datetime', 'version' => 'integer'];
    }

    public function customer(): BelongsTo { return $this->belongsTo(Customer::class); }
    public function providerAccount(): BelongsTo { return $this->belongsTo(ProviderAccount::class); }
    public function projects(): HasMany { return $this->hasMany(CloudProject::class); }
}
