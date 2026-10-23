<?php

declare(strict_types=1);

namespace App\Modules\Customers\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/** Contacto con acceso al portal: IDN crea el usuario y envía la invitación. (M-CUS §9) */
final class ContactPortalAccessGranted implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(public readonly string $organizationId, public readonly string $id, public readonly string $userId) {}
}
