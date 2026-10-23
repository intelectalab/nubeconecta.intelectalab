<?php

declare(strict_types=1);

namespace App\Modules\Services\Models;

use App\Modules\Catalog\Models\Plan;
use App\Modules\Catalog\Models\Product;
use App\Modules\Customers\Models\Customer;
use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Tabla canónica `services` (M-SRV §3, máquina 1 de docs/03). `custom.order`
 * guarda el origen y el precio congelado de la línea del pedido; el precio
 * que se factura vive en la suscripción (`subscriptions`).
 */
class Service extends Model
{
    use BelongsToOrganization, HasUuids, SoftDeletes, TracksVersionAndActor;

    public const STATUSES = ['pending', 'active', 'suspended', 'terminated', 'cancelled', 'handed_over'];

    protected $table = 'services';

    protected $fillable = [];

    protected $attributes = ['version' => 1, 'status' => 'pending', 'custom' => '{}', 'auto_renew' => true];

    protected function casts(): array
    {
        return [
            'custom' => 'array', 'version' => 'integer', 'auto_renew' => 'boolean', 'show_provider' => 'boolean',
            'activated_at' => 'datetime', 'suspended_at' => 'datetime', 'cancelled_at' => 'datetime', 'terminated_at' => 'datetime',
            'commercial_due_date' => 'date:Y-m-d',
        ];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function plan(): BelongsTo
    {
        return $this->belongsTo(Plan::class);
    }

    public function subscription(): HasOne
    {
        // La más reciente (latestOfMany usa MAX(id), que no existe para uuid en PostgreSQL).
        return $this->hasOne(Subscription::class)->orderByDesc('created_at')->orderByDesc('id');
    }

    public function subscriptions(): HasMany
    {
        return $this->hasMany(Subscription::class);
    }
}
