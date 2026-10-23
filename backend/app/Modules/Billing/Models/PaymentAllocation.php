<?php

declare(strict_types=1);

namespace App\Modules\Billing\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabla canónica `payment_allocations`: aplicación de un pago a un comprobante.
 * En un pago `reported` es la aplicación propuesta; solo las de pagos
 * `validated` reducen `invoices.balance_minor`.
 */
class PaymentAllocation extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    protected $table = 'payment_allocations';

    protected $fillable = [];

    protected $attributes = ['version' => 1];

    protected function casts(): array
    {
        return ['version' => 'integer', 'amount_minor' => 'integer'];
    }

    public function payment(): BelongsTo
    {
        return $this->belongsTo(Payment::class);
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }
}
