<?php

declare(strict_types=1);

namespace App\Modules\Services\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Tabla canónica `subscriptions`: ciclo, precio congelado, moneda y próxima fecha de facturación (máquina 2 de docs/03). */
class Subscription extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    protected $table = 'subscriptions';

    protected $fillable = [];

    protected $attributes = ['version' => 1, 'status' => 'active', 'quantity' => 1];

    protected function casts(): array
    {
        return [
            'price_minor' => 'integer', 'version' => 'integer', 'next_invoice_date' => 'date:Y-m-d', 'starts_on' => 'date:Y-m-d',
            'ends_on' => 'date:Y-m-d', 'paused_at' => 'datetime', 'cancelled_at' => 'datetime',
        ];
    }

    public function service(): BelongsTo
    {
        return $this->belongsTo(Service::class);
    }
}
