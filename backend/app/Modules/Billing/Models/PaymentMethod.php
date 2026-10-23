<?php

declare(strict_types=1);

namespace App\Modules\Billing\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** Tabla canónica `payment_methods` (P-BIL-13). `connector = null`: medio manual con constancia (RN-BIL-057). */
class PaymentMethod extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    protected $table = 'payment_methods';

    protected $fillable = [];

    protected $attributes = ['version' => 1, 'instructions' => '{}'];

    protected function casts(): array
    {
        return [
            'instructions' => 'array', 'version' => 'integer', 'fee_fixed_minor' => 'integer',
            'pass_to_customer' => 'boolean', 'requires_proof' => 'boolean', 'available_in_portal' => 'boolean', 'is_active' => 'boolean',
        ];
    }

    /** Medios que el cliente puede usar para reportar una constancia: activos, del portal y sin pasarela (la tarjeta va por D-18). */
    public function acceptsVoucher(): bool
    {
        return $this->is_active && $this->available_in_portal && $this->kind !== 'card_gateway';
    }
}
