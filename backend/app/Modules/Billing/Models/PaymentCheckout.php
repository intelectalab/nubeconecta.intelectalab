<?php

declare(strict_types=1);

namespace App\Modules\Billing\Models;

use App\Modules\WebConnector\Casts\PgTextArray;
use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/**
 * Tabla canónica `payment_checkouts`: intento de pago con tarjeta desde el
 * portal. `created` con `external_transaction_id` = pago pendiente en la pasarela.
 */
class PaymentCheckout extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    protected $table = 'payment_checkouts';

    protected $fillable = [];

    protected $attributes = ['version' => 1, 'status' => 'created', 'surcharge_minor' => 0];

    protected function casts(): array
    {
        return [
            'invoice_ids' => PgTextArray::class, 'version' => 'integer', 'amount_minor' => 'integer', 'surcharge_minor' => 'integer',
            'expires_at' => 'datetime', 'completed_at' => 'datetime',
        ];
    }

    /** Estado visible: approved, declined, pending (pasarela lo tiene en proceso), created, expired o cancelled. */
    public function outcome(): string
    {
        if ($this->status === 'created' && $this->external_transaction_id !== null) {
            return 'pending';
        }
        if ($this->status === 'created' && $this->expires_at !== null && $this->expires_at->isPast()) {
            return 'expired';
        }

        return $this->status;
    }

    /** Referencia externa enviada a la pasarela: comprobante + intento único. */
    public function externalReference(): string
    {
        return 'inv:'.($this->invoice_ids[0] ?? '').':chk:'.$this->id;
    }

    /** @return array{0: string, 1: string}|null [invoice_id, checkout_id] */
    public static function parseReference(?string $reference): ?array
    {
        $uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

        return is_string($reference) && preg_match("/^inv:({$uuid}):chk:({$uuid})$/i", $reference, $m) === 1 ? [strtolower($m[1]), strtolower($m[2])] : null;
    }
}
