<?php

declare(strict_types=1);

namespace App\Modules\Identity\Listeners;

use App\Models\User;
use App\Modules\Customers\Events\ContactPortalAccessGranted;
use App\Modules\Identity\Services\PortalCredentialService;

/** IDN: al dar acceso al portal (o reenviar la invitación) envía el enlace para crear la contraseña. */
final class SendPortalInvitation
{
    public function __construct(private readonly PortalCredentialService $credentials) {}

    public function handle(ContactPortalAccessGranted $event): void
    {
        $user = User::query()->find($event->userId);
        // Una cuenta ya activada (con contraseña) no recibe invitación: usa "olvidé mi contraseña".
        if ($user === null || $user->type !== 'customer' || ! $user->isActive() || $user->password_hash !== null) {
            return;
        }
        $this->credentials->sendInvitation($user);
    }
}
