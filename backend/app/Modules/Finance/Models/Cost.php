<?php

declare(strict_types=1);

namespace App\Modules\Finance\Models;

use App\Modules\Inventory\Models\Resource;
use App\Modules\Providers\Models\ProviderAccount;
use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Cost extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    protected $table = 'costs';
    protected $fillable = ['kind', 'resource_id', 'provider_account_id', 'provider_bill_id', 'payment_id', 'period_month', 'amount_minor', 'cost_currency', 'allocation_method', 'description'];
    protected $attributes = ['version' => 1, 'allocation_method' => 'manual'];

    protected function casts(): array { return ['period_month' => 'date:Y-m-d', 'amount_minor' => 'integer', 'version' => 'integer']; }
    public function allocations(): HasMany { return $this->hasMany(CostAllocation::class); }
    public function resource(): BelongsTo { return $this->belongsTo(Resource::class); }
    public function providerAccount(): BelongsTo { return $this->belongsTo(ProviderAccount::class); }
}
