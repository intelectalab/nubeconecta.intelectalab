<?php

declare(strict_types=1);

namespace App\Modules\WebConnector\Jobs;

use App\Modules\WebConnector\Models\WpCacheInvalidation;
use App\Modules\WebConnector\Services\CacheInvalidator;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;

/**
 * Entrega un aviso de invalidación (cola `webhooks`). Los intentos se cuentan en
 * la fila (`attempts`, hasta web_connector.webhook.max_attempts); entre intentos
 * se libera con espera creciente. $tries solo es un tope de seguridad.
 */
final class SendWpCacheInvalidations implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $tries = 50;

    public function __construct(public readonly string $invalidationId)
    {
        $this->onQueue('webhooks');
    }

    public function handle(CacheInvalidator $invalidator): void
    {
        $invalidation = WpCacheInvalidation::withoutGlobalScope('organization')->find($this->invalidationId);
        if ($invalidation === null || $invalidation->status !== 'pending') {
            return;
        }

        if (! $invalidator->deliver($invalidation) && $invalidation->status === 'pending') {
            $this->release(CacheInvalidator::backoff($invalidation->attempts));
        }
    }
}
