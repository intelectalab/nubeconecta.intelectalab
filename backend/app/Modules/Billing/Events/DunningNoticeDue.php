<?php

declare(strict_types=1);

namespace App\Modules\Billing\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/** Aviso de cobranza registrado en dunning_events (etapa send_notice). Se emite tras el commit. */
final class DunningNoticeDue implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(
        public readonly string $organizationId,
        public readonly string $dunningEventId,
        public readonly string $invoiceId,
    ) {}
}
