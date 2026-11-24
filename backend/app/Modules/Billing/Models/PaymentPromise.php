<?php

declare(strict_types=1);

namespace App\Modules\Billing\Models;

use App\Modules\Customers\Models\Customer;
use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Compromiso de pago (tabla `payment_promises`): el cliente se compromete a pagar
 * un comprobante en una fecha. Es una herramienta de seguimiento de cobranza
 * (open → kept/broken); no altera la mora ni la suspensión (fuera de alcance, D-04).
 */
class PaymentPromise extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    public const STATUSES = ['open', 'kept', 'broken'];

    protected $table = 'payment_promises';

    protected $fillable = ['invoice_id', 'customer_id', 'promised_date', 'amount_minor', 'currency', 'status', 'resolved_at', 'notes'];

    protected $attributes = ['version' => 1, 'status' => 'open'];

    protected function casts(): array
    {
        return [
            'promised_date' => 'date',
            'amount_minor' => 'integer',
            'resolved_at' => 'immutable_datetime',
            'version' => 'integer',
        ];
    }

    /** @return BelongsTo<Invoice, PaymentPromise> */
    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }

    /** @return BelongsTo<Customer, PaymentPromise> */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }
}
