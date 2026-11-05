<?php

declare(strict_types=1);

namespace App\Modules\Contracts\Models;

use App\Models\User;
use App\Modules\Brands\Models\Brand;
use App\Modules\Customers\Models\Customer;
use App\Modules\Sales\Models\Quote;
use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class Contract extends Model
{
    use BelongsToOrganization, HasUuids, SoftDeletes, TracksVersionAndActor;

    public const STATUSES = ['draft', 'in_review', 'approved', 'sent', 'signed_active', 'expired', 'terminated'];

    protected $table = 'contracts';

    protected $fillable = ['customer_id', 'brand_id', 'contract_template_id', 'quote_id', 'starts_on', 'ends_on', 'currency', 'management_fee_percent', 'management_fee_min_minor', 'included_hours', 'custom', 'kind'];

    protected $attributes = ['status' => 'draft', 'current_version' => 1, 'version' => 1, 'kind' => 'contract'];

    protected function casts(): array
    {
        return ['current_version' => 'integer', 'version' => 'integer', 'starts_on' => 'date', 'ends_on' => 'date', 'management_fee_percent' => 'decimal:3', 'management_fee_min_minor' => 'integer', 'included_hours' => 'decimal:2', 'approved_at' => 'datetime', 'sent_at' => 'datetime', 'signed_at' => 'datetime', 'terminated_at' => 'datetime', 'custom' => 'array'];
    }

    public function versions(): HasMany { return $this->hasMany(ContractVersion::class)->orderBy('version_number'); }

    public function currentVersion(): HasOne
    {
        // No usar ofMany/latestOfMany: PostgreSQL no admite MAX(uuid).
        return $this->hasOne(ContractVersion::class)->orderByDesc('version_number');
    }

    public function customer(): BelongsTo { return $this->belongsTo(Customer::class); }
    public function brand(): BelongsTo { return $this->belongsTo(Brand::class); }
    public function quote(): BelongsTo { return $this->belongsTo(Quote::class); }
    public function approver(): BelongsTo { return $this->belongsTo(User::class, 'approved_by'); }
}
