<?php

declare(strict_types=1);

namespace App\Modules\Customers\Services;

use App\Models\User;
use App\Modules\Customers\Events\ContactPortalAccessGranted;
use App\Modules\Customers\Models\Contact;
use App\Modules\Identity\Models\Role;
use App\Modules\Identity\Services\AuthSessionManager;
use App\Shared\Audit\AuditLogger;
use App\Shared\Http\Problem\ProblemException;
use Illuminate\Support\Facades\DB;

/**
 * Acceso al portal por contacto (M-CUS §4.2, P-CUS-04): crea el usuario de
 * tipo `customer` con rol `customer_admin` o `customer_user` y emite
 * ContactPortalAccessGranted para que IDN envíe la invitación. Quitar el
 * acceso da de baja al usuario y cierra sus sesiones.
 *
 * Pendiente de IDN: el correo de invitación con enlace para fijar la contraseña
 * (hoy no existe ese flujo); el evento queda emitido para conectarlo.
 */
final class PortalAccessService
{
    public const ROLES = ['customer_admin', 'customer_user'];

    public function __construct(private readonly AuditLogger $audit, private readonly AuthSessionManager $sessions) {}

    public function grant(Contact $contact, string $roleCode): Contact
    {
        if ($contact->email === null || $contact->email === '') {
            throw ProblemException::validation(['email' => ['El contacto necesita correo para acceder al portal.']]);
        }

        return DB::transaction(function () use ($contact, $roleCode): Contact {
            $role = Role::query()->where('code', $roleCode)->where('audience', 'customer')->firstOrFail();
            $user = $contact->user_id ? User::query()->find($contact->user_id) : null;
            if ($user === null) {
                $taken = User::query()->whereRaw('lower(email) = ?', [mb_strtolower($contact->email)])->exists();
                if ($taken) {
                    throw ProblemException::validation(['email' => ['Ese correo ya es usuario del sistema.']]);
                }
                $user = new User;
                $user->forceFill([
                    'type' => 'customer', 'name' => $contact->name, 'email' => mb_strtolower($contact->email),
                    'locale' => $contact->locale ?? 'es', 'status' => 'active',
                ])->save();
                $contact->forceFill(['user_id' => $user->id])->save();
            }
            $user->roles()->sync([$role->id => ['organization_id' => $user->organization_id]]);
            $user->forgetPermissionCache();
            $this->audit->record('contact.portal_access_granted', 'contact', $contact->id, null, ['user_id' => $user->id, 'role' => $roleCode], [], $contact->customer_id);
            ContactPortalAccessGranted::dispatch($contact->organization_id, $contact->id, $user->id);

            return $contact->refresh();
        });
    }

    public function revoke(Contact $contact): Contact
    {
        return DB::transaction(function () use ($contact): Contact {
            $user = $contact->user_id ? User::query()->find($contact->user_id) : null;
            if ($user !== null) {
                $this->sessions->revokeAll($user);
                $user->tokens()->delete();
                $user->forceFill(['status' => 'disabled', 'disabled_at' => now()])->save();
                $user->delete();
            }
            $contact->forceFill(['user_id' => null])->save();
            $this->audit->record('contact.portal_access_revoked', 'contact', $contact->id, ['user_id' => $user?->id], null, [], $contact->customer_id);

            return $contact->refresh();
        });
    }

    public function resendInvitation(Contact $contact): void
    {
        if ($contact->user_id === null) {
            throw new ProblemException(409, 'conflict', 'El contacto no tiene acceso al portal.');
        }
        $this->audit->record('contact.portal_invitation_resent', 'contact', $contact->id, null, null, ['user_id' => $contact->user_id], $contact->customer_id);
        ContactPortalAccessGranted::dispatch($contact->organization_id, $contact->id, $contact->user_id);
    }

    public function portalRole(Contact $contact): ?string
    {
        if ($contact->user_id === null) {
            return null;
        }

        return DB::table('user_roles as ur')->join('roles as r', 'r.id', '=', 'ur.role_id')
            ->where('ur.user_id', $contact->user_id)->whereIn('r.code', self::ROLES)->value('r.code');
    }
}
