<?php

declare(strict_types=1);

namespace App\Modules\Customers\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/** Nueva fila de consentimiento (la última fila manda). (M-CUS §9) */
final class CommunicationConsentChanged implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(public readonly string $organizationId, public readonly string $id) {}
}
