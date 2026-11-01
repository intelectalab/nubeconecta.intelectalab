<?php

declare(strict_types=1);

namespace App\Shared\Authorization;

use Illuminate\Contracts\Session\Session;

/**
 * Estado "ver como cliente" guardado en la sesión del propio staff (la inicia
 * el panel, la lee el portal): nunca se crea una sesión del cliente ni se
 * tocan sus credenciales. Mientras está activa, EnsureUserType y
 * PermissionGate dejan LEER rutas portal.* y bloquean toda escritura.
 */
final class ImpersonationState
{
    private const KEY = 'hub.impersonation';

    /** Duración de la vista; al vencer, el portal vuelve a responder 403. */
    public const MINUTES = 30;

    /** @return array{customer_id: string, started_at: int, expires_at: int} */
    public static function start(Session $session, string $customerId): array
    {
        $state = [
            'customer_id' => $customerId,
            'started_at' => now()->getTimestamp(),
            'expires_at' => now()->addMinutes(self::MINUTES)->getTimestamp(),
        ];
        $session->put(self::KEY, $state);

        return $state;
    }

    /** @return array{customer_id: string, started_at: int, expires_at: int}|null */
    public static function current(Session $session): ?array
    {
        $state = $session->get(self::KEY);
        if (! is_array($state) || ! is_string($state['customer_id'] ?? null)) {
            return null;
        }
        if (($state['expires_at'] ?? 0) <= now()->getTimestamp()) {
            $session->forget(self::KEY);

            return null;
        }

        return $state;
    }

    /** @return array{customer_id: string, started_at: int, expires_at: int}|null lo que había activo, para auditar el fin. */
    public static function stop(Session $session): ?array
    {
        $state = self::current($session);
        $session->forget(self::KEY);

        return $state;
    }
}
