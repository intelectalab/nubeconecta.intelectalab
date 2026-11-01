<?php

declare(strict_types=1);

namespace App\Modules\Customers\Support;

use App\Modules\Customers\Models\Contact;
use App\Shared\Authorization\ImpersonationState;
use App\Shared\Http\Problem\ProblemException;
use Illuminate\Http\Request;

/**
 * Interfaz pública de CUS para los demás portales (SRV, BIL): el cliente del
 * usuario del portal se toma del contacto enlazado a la sesión, nunca de la
 * petición (sin IDOR).
 */
final class PortalCustomer
{
    public static function id(Request $request): string
    {
        // Vista "ver como cliente": el cliente sale del estado en sesión del staff.
        if ($request->user()?->type === 'staff' && ($state = ImpersonationState::current($request->session())) !== null) {
            return $state['customer_id'];
        }

        $customerId = Contact::query()->where('user_id', $request->user()?->getAuthIdentifier())->value('customer_id');

        return $customerId === null
            ? throw ProblemException::forbidden('Su usuario no está vinculado a un cliente.')
            : (string) $customerId;
    }
}
