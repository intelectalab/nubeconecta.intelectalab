<?php

declare(strict_types=1);

namespace App\Modules\Services\Listeners;

use App\Modules\Orders\Events\OrderCancelled;
use App\Modules\Services\Models\Service;
use App\Modules\Services\Services\ServiceLifecycle;

/**
 * OrderCancelled → los servicios `pending` creados por ese pedido pasan a
 * `cancelled` (docs/03 §1). Los ya activos no se tocan: el pedido solo se
 * anula antes de activarse (Order::CANCELLABLE).
 */
final class CancelPendingServicesFromOrder
{
    public function __construct(private readonly ServiceLifecycle $lifecycle) {}

    public function handle(OrderCancelled $event): void
    {
        $services = Service::query()->where('customer_id', $event->customerId)->where('status', 'pending')
            ->whereRaw("custom->'order'->>'order_id' = ?", [$event->id])->get();
        foreach ($services as $service) {
            try {
                $this->lifecycle->transition($service, 'cancel', 'Pedido anulado', null, 'order');
            } catch (\Throwable $e) {
                report($e);
            }
        }
    }
}
