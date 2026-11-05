<?php

declare(strict_types=1);

namespace App\Modules\Providers\Models;

use App\Modules\Customers\Models\Customer;
use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Provider extends Model
{
    use BelongsToOrganization, HasUuids, SoftDeletes, TracksVersionAndActor;

    public const TYPES = ['hosting', 'server', 'cloud', 'registrar', 'email', 'ssl', 'cdn', 'bulk_email', 'payment', 'einvoice', 'saas', 'dns', 'ai', 'other'];

    protected $table = 'providers';

    protected $fillable = ['code', 'name', 'type', 'origin', 'portal_url', 'cost_currency', 'connector', 'status', 'notes_internal', 'sla_notes', 'customer_id', 'custom'];

    protected $attributes = ['origin' => 'company', 'cost_currency' => 'USD', 'status' => 'active', 'custom' => '{}', 'version' => 1];

    protected function casts(): array
    {
        return ['custom' => 'array', 'version' => 'integer'];
    }

    public function accounts(): HasMany
    {
        return $this->hasMany(ProviderAccount::class)->orderBy('label');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }
}
