<?php

declare(strict_types=1);

namespace App\Modules\Identity\Services;

use App\Models\User;
use App\Modules\Identity\Mail\PortalLinkMail;
use App\Shared\Audit\AuditLogger;
use App\Shared\Http\Problem\ProblemException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;

/**
 * Credenciales del portal (clientes): invitación para crear la contraseña y
 * "olvidé mi contraseña". Los enlaces son de un solo uso (UserTokenService).
 */
final class PortalCredentialService
{
    public function __construct(
        private readonly UserTokenService $tokens,
        private readonly PasswordService $passwords,
        private readonly AuditLogger $audit,
    ) {}

    /** Envía (en cola) el correo de invitación con enlace nuevo; invalida el anterior. */
    public function sendInvitation(User $user): void
    {
        $token = $this->tokens->issue($user, UserTokenService::INVITATION);
        Mail::to($user->email)->queue(new PortalLinkMail(
            'invitation', $user->name, PortalLinkMail::link('invitation', $token),
            self::duration((int) config('hub.auth.invitation_hours') * 60),
        ));
        $this->audit->record('user.invitation_sent', 'user', $user->id, null, null, [], actor: ['type' => 'system', 'id' => null], organizationId: $user->organization_id);
    }

    /** La respuesta HTTP es genérica: nada de aquí revela si el correo existe. */
    public function requestPasswordReset(string $email): void
    {
        $user = User::query()->whereRaw('lower(email) = ?', [mb_strtolower(trim($email))])->where('type', 'customer')->first();
        if ($user === null || ! $user->isActive()) {
            return;
        }
        if ($user->password_hash === null) { // invitación sin activar: se reenvía la invitación
            $this->sendInvitation($user);

            return;
        }
        $token = $this->tokens->issue($user, UserTokenService::PASSWORD_RESET);
        Mail::to($user->email)->queue(new PortalLinkMail(
            'password_reset', $user->name, PortalLinkMail::link('password_reset', $token),
            self::duration((int) config('hub.auth.password_reset_minutes')),
        ));
        $this->audit->record('user.password_reset_requested', 'user', $user->id, null, null, [], actor: ['type' => 'system', 'id' => null], organizationId: $user->organization_id);
    }

    /** @return array{name: string, email: string} correo enmascarado */
    public function verifyInvitation(string $token): array
    {
        [$user] = $this->tokens->check($token, UserTokenService::INVITATION);

        return ['name' => $user->name, 'email' => self::mask($user->email)];
    }

    public function acceptInvitation(string $token, string $password): void
    {
        $this->useToken($token, UserTokenService::INVITATION, $password, 'user.invitation_accepted', closeSessions: false, verifyEmail: true);
    }

    public function resetPassword(string $token, string $password): void
    {
        $this->useToken($token, UserTokenService::PASSWORD_RESET, $password, 'user.password_reset', closeSessions: true, verifyEmail: false);
    }

    private function useToken(string $token, string $purpose, string $password, string $action, bool $closeSessions, bool $verifyEmail): void
    {
        DB::transaction(function () use ($token, $purpose, $password, $action, $closeSessions, $verifyEmail): void {
            [$user, $tokenId] = $this->tokens->check($token, $purpose);
            if (! $this->tokens->consume($tokenId)) {
                throw new ProblemException(410, 'token_invalid');
            }
            $revoked = $this->passwords->set($user, $password, $closeSessions);
            if ($verifyEmail && $user->email_verified_at === null) {
                $user->forceFill(['email_verified_at' => now()])->save();
            }
            // Cualquier otro enlace pendiente del usuario queda sin efecto.
            DB::table('user_tokens')->where('user_id', $user->id)->whereNull('consumed_at')->whereNull('revoked_at')
                ->update(['revoked_at' => now()]);
            $this->audit->record($action, 'user', $user->id, null, null, ['revoked_sessions' => $revoked],
                actor: ['type' => 'user', 'id' => $user->id], organizationId: $user->organization_id);
        });
    }

    private static function mask(string $email): string
    {
        [$local, $domain] = array_pad(explode('@', $email, 2), 2, '');
        $dot = strrpos($domain, '.');
        $host = $dot === false ? $domain : substr($domain, 0, $dot);
        $tld = $dot === false ? '' : substr($domain, $dot);

        return mb_substr($local, 0, 1).'***@'.mb_substr($host, 0, 1).'***'.$tld;
    }

    private static function duration(int $minutes): string
    {
        return $minutes % 60 === 0
            ? ($minutes / 60).($minutes === 60 ? ' hora' : ' horas')
            : $minutes.' minutos';
    }
}
