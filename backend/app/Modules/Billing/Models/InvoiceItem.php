<?php

declare(strict_types=1);

namespace App\Modules\Billing\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** Tabla canónica `invoice_items`: una línea por servicio o cargo; total = subtotal + IGV de la línea. */
class InvoiceItem extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    protected $table = 'invoice_items';

    protected $fillable = [];

    protected $attributes = ['version' => 1, 'quantity' => 1, 'discount_minor' => 0, 'tax_minor' => 0, 'sort_order' => 0];

    protected function casts(): array
    {
        return [
            'version' => 'integer', 'unit_price_minor' => 'integer', 'discount_minor' => 'integer', 'subtotal_minor' => 'integer',
            'tax_minor' => 'integer', 'total_minor' => 'integer', 'sort_order' => 'integer',
            'period_start' => 'date:Y-m-d', 'period_end' => 'date:Y-m-d',
        ];
    }
}
