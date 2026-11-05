<?php

declare(strict_types=1);

namespace App\Modules\Providers\Models;

use App\Modules\Customers\Models\Customer;
use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProviderAccount extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    protected $table = 'provider_accounts';

    protected $fillable = ['provider_id', 'label', 'external_account_id', 'owner', 'customer_id', 'connector', 'connector_enabled', 'write_enabled', 'renewal_date', 'cost_minor', 'cost_currency', 'billing_cycle', 'status', 'custom'];

    protected $attributes = ['owner' => 'company', 'connector_enabled' => false, 'write_enabled' => false, 'status' => 'active', 'capabilities' => '{}', 'custom' => '{}', 'version' => 1];

    protected function casts(): array
    {
        return ['connector_enabled' => 'boolean', 'write_enabled' => 'boolean', 'renewal_date' => 'date', 'cost_minor' => 'integer', 'custom' => 'array', 'capabilities' => 'array', 'last_test_result' => 'array', 'last_synced_at' => 'datetime', 'last_tested_at' => 'datetime', 'version' => 'integer'];
    }

    public function provider(): BelongsTo
    {
        return $this->belongsTo(Provider::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }
}
