<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Services;

use App\Modules\Notifications\Models\UserNotification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Productor del feed de notificaciones por usuario. Es secundario y aditivo: cualquier
 * fallo se registra y se traga para no afectar la acción principal. Llamar siempre
 * DESPUÉS de confirmar la transacción de la acción (un error SQL abortaría la transacción en Postgres).
 */
final class UserNotifier
{
    public function toUser(string $organizationId, string $userId, string $type, string $title, ?string $body = null, ?string $link = null): void
    {
        try {
            // Savepoint: un fallo no deja abortada una transacción externa.
            DB::transaction(function () use ($organizationId, $userId, $type, $title, $body, $link): void {
                $n = new UserNotification;
                $n->forceFill([
                    'organization_id' => $organizationId, 'user_id' => $userId, 'type' => $type,
                    'title' => $title, 'body' => $body, 'link' => $link,
                ])->save();
            });
        } catch (Throwable $e) {
            Log::warning('No se pudo crear la notificación de usuario.', ['type' => $type, 'error' => $e->getMessage()]);
        }
    }

    /**
     * Notifica a los usuarios staff activos de la organización cuyos roles vigentes incluyen el permiso.
     *
     * @param  list<string>  $exceptUserIds
     */
    public function toPermission(string $organizationId, string $permission, string $type, string $title, ?string $body = null, ?string $link = null, array $exceptUserIds = []): void
    {
        try {
            $ids = DB::table('users as u')
                ->join('user_roles as ur', 'ur.user_id', '=', 'u.id')
                ->join('roles as r', 'r.id', '=', 'ur.role_id')
                ->join('role_permissions as rp', 'rp.role_id', '=', 'r.id')
                ->join('permissions as p', 'p.id', '=', 'rp.permission_id')
                ->where('u.organization_id', $organizationId)
                ->where('r.organization_id', $organizationId)
                ->where('u.type', 'staff')
                ->where('u.status', 'active')
                ->whereNull('u.deleted_at')
                ->where('p.code', $permission)
                ->where(fn ($q) => $q->whereNull('ur.expires_at')->orWhere('ur.expires_at', '>', now()))
                ->distinct()
                ->pluck('u.id')
                ->all();
        } catch (Throwable $e) {
            Log::warning('No se pudieron resolver los destinatarios de la notificación.', ['permission' => $permission, 'error' => $e->getMessage()]);

            return;
        }
        foreach (array_diff($ids, $exceptUserIds) as $id) {
            $this->toUser($organizationId, (string) $id, $type, $title, $body, $link);
        }
    }
}
