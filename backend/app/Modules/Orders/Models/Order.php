<?php

declare(strict_types=1);

namespace App\Modules\Orders\Models;

use App\Modules\Brands\Models\Brand;
use App\Modules\Customers\Models\Customer;
use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Tabla canónica `orders` (M-ORD §3). Máquina 7 de docs/03; en el MVP solo
 * `draft → approved`, `draft|approved → cancelled`. `total_minor` incluye el
 * IGV; subtotal e impuesto se derivan de las líneas (OrderResource).
 */
class Order extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    public const STATUSES = ['draft', 'approved', 'payment_validated', 'provisioning', 'testing', 'active', 'manual_review', 'failed', 'cancelled'];

    /** Estados desde los que se puede anular sin reembolso (docs/03 §7, MVP). */
    public const CANCELLABLE = ['draft', 'approved'];

    protected $table = 'orders';

    protected $fillable = ['customer_id', 'brand_id', 'currency', 'notes'];

    protected $attributes = ['version' => 1, 'status' => 'draft', 'channel' => 'sales', 'total_minor' => 0];

    protected function casts(): array
    {
        return ['total_minor' => 'integer', 'version' => 'integer', 'approved_at' => 'datetime', 'payment_validated_at' => 'datetime', 'activated_at' => 'datetime'];
    }

    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class)->orderBy('created_at')->orderBy('id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function brand(): BelongsTo
    {
        return $this->belongsTo(Brand::class);
    }
}
