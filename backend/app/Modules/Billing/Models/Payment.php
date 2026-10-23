<?php

declare(strict_types=1);

namespace App\Modules\Billing\Models;

use App\Modules\Customers\Models\Customer;
use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Tabla canónica `payments` (M-BIL §3, docs/03 §5). Un voucher nace `reported`
 * y no salda nada (RN-BIL-050); solo `validated` cuenta para el saldo. La
 * anulación de un pago validado lo deja `rejected` con `validated_at` (ver README).
 */
class Payment extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    public const STATUSES = ['reported', 'validated', 'rejected', 'refunded', 'charged_back'];

    public const VIA = ['portal', 'sales', 'finance', 'webhook', 'import'];

    protected $table = 'payments';

    protected $fillable = [];

    protected $attributes = ['version' => 1, 'kind' => 'payment', 'status' => 'reported', 'fee_minor' => 0];

    protected function casts(): array
    {
        return [
            'version' => 'integer', 'amount_minor' => 'integer', 'fee_minor' => 'integer',
            'received_at' => 'datetime', 'validated_at' => 'datetime', 'refunded_at' => 'datetime',
        ];
    }

    public function allocations(): HasMany
    {
        return $this->hasMany(PaymentAllocation::class)->orderBy('created_at')->orderBy('id');
    }

    public function method(): BelongsTo
    {
        return $this->belongsTo(PaymentMethod::class, 'payment_method_id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function proof(): BelongsTo
    {
        return $this->belongsTo(StoredFile::class, 'proof_file_id');
    }

    /** Pago validado y luego anulado (revierte sus aplicaciones). */
    public function isVoided(): bool
    {
        return $this->status === 'rejected' && $this->validated_at !== null;
    }

    public function allocatedMinor(): int
    {
        return (int) $this->allocations->sum('amount_minor');
    }
}
