<?php

declare(strict_types=1);

namespace App\Modules\Billing\Models;

use App\Modules\Brands\Models\Brand;
use App\Modules\Brands\Models\LegalEntity;
use App\Modules\Customers\Models\Customer;
use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Tabla canónica `invoices` (M-BIL §3; máquinas 3 y 4 de docs/03). Importes en
 * céntimos (bigint); `balance_minor` es el saldo pendiente que usará Cobranza.
 * Emitida no se edita (RN-BIL-017).
 */
class Invoice extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    public const TYPES = ['invoice', 'receipt', 'credit_note', 'debit_note'];

    public const STATUSES = ['draft', 'issued', 'partially_paid', 'paid', 'overdue', 'void'];

    public const FISCAL_STATUSES = ['not_applicable', 'pending', 'accepted', 'rejected', 'voided'];

    protected $table = 'invoices';

    protected $fillable = [];

    protected $attributes = ['version' => 1, 'status' => 'draft', 'fiscal_status' => 'not_applicable', 'custom' => '{}', 'locale' => 'es'];

    protected function casts(): array
    {
        return [
            'custom' => 'array', 'version' => 'integer', 'number' => 'integer',
            'subtotal_minor' => 'integer', 'discount_minor' => 'integer', 'tax_minor' => 'integer', 'total_minor' => 'integer', 'balance_minor' => 'integer',
            'issue_date' => 'date:Y-m-d', 'due_date' => 'date:Y-m-d', 'issued_at' => 'datetime', 'voided_at' => 'datetime', 'paid_at' => 'datetime',
        ];
    }

    public function items(): HasMany
    {
        return $this->hasMany(InvoiceItem::class)->orderBy('sort_order')->orderBy('id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /** Aplicaciones de pagos (solo las de pagos `validated` cuentan para el saldo). */
    public function allocations(): HasMany
    {
        return $this->hasMany(PaymentAllocation::class)->orderBy('created_at')->orderBy('id');
    }

    public function brand(): BelongsTo
    {
        return $this->belongsTo(Brand::class);
    }

    public function legalEntity(): BelongsTo
    {
        return $this->belongsTo(LegalEntity::class);
    }

    public function fullNumber(): ?string
    {
        return $this->series === null ? null : sprintf('%s-%08d', $this->series, $this->number);
    }
}
