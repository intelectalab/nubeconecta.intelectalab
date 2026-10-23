<?php

declare(strict_types=1);

namespace App\Modules\Orders\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/**
 * Tabla canónica `order_items`: precio unitario congelado del catálogo al crear
 * el pedido. `config.tax` guarda el tratamiento y la tasa aplicados a la línea.
 */
class OrderItem extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    protected $table = 'order_items';

    protected $fillable = [];

    protected $attributes = ['version' => 1, 'config' => '{}', 'quantity' => 1];

    protected function casts(): array
    {
        return ['config' => 'array', 'unit_price_minor' => 'integer', 'version' => 'integer'];
    }
}
