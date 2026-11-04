<?php

declare(strict_types=1);

namespace App\Modules\Sales\Models;

use App\Models\User;
use App\Modules\Brands\Models\Brand;
use App\Modules\Customers\Models\Customer;
use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class Quote extends Model
{
    use BelongsToOrganization, HasUuids, SoftDeletes, TracksVersionAndActor;

    public const STATUSES = ['draft', 'sent', 'accepted', 'rejected', 'expired'];

    protected $table = 'quotes';

    protected $fillable = ['brand_id', 'customer_id', 'lead_id', 'owner_id', 'currency', 'valid_until'];

    protected $attributes = ['status' => 'draft', 'current_version' => 1, 'version' => 1];

    protected function casts(): array
    {
        return ['current_version' => 'integer', 'version' => 'integer', 'valid_until' => 'date', 'sent_at' => 'datetime', 'accepted_at' => 'datetime', 'rejected_at' => 'datetime'];
    }

    public function versions(): HasMany
    {
        return $this->hasMany(QuoteVersion::class)->orderBy('version_number');
    }

    public function currentVersion(): HasOne
    {
        // Las versiones son append-only: la vigente es la de mayor version_number.
        // No se usa ofMany/latestOfMany: usan MAX(id), que no existe para uuid en PostgreSQL
        // (mismo motivo que Service::subscription). hasOne + orderByDesc toma la primera por padre.
        return $this->hasOne(QuoteVersion::class)->orderByDesc('version_number');
    }

    public function customer(): BelongsTo { return $this->belongsTo(Customer::class); }
    public function lead(): BelongsTo { return $this->belongsTo(Lead::class); }
    public function brand(): BelongsTo { return $this->belongsTo(Brand::class); }
    public function owner(): BelongsTo { return $this->belongsTo(User::class, 'owner_id'); }
}
