<?php

declare(strict_types=1);

namespace App\Modules\Identity\Services;

use App\Models\User;
use App\Shared\Http\Problem\ProblemException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Tokens de un solo uso del portal (tabla user_tokens): invitación y
 * restablecimiento de contraseña. Solo se guarda el hash SHA-256; emitir uno
 * nuevo invalida los vigentes del mismo usuario y propósito.
 */
final class UserTokenService
{
    public const INVITATION = 'invitation';

    public const PASSWORD_RESET = 'password_reset';

    /** Emite un token y devuelve el valor plano (solo viaja en el correo). */
    public function issue(User $user, string $purpose): string
    {
        $ttl = $purpose === self::INVITATION
            ? now()->addHours(max(1, (int) config('hub.auth.invitation_hours')))
            : now()->addMinutes(max(1, (int) config('hub.auth.password_reset_minutes')));
        $plain = Str::random(64);

        DB::transaction(function () use ($user, $purpose, $ttl, $plain): void {
            DB::table('user_tokens')->where('user_id', $user->id)->where('purpose', $purpose)
                ->whereNull('consumed_at')->whereNull('revoked_at')->update(['revoked_at' => now()]);
            DB::table('user_tokens')->insert([
                'organization_id' => $user->organization_id,
                'user_id' => $user->id,
                'purpose' => $purpose,
                'token_hash' => self::hash($plain),
                'expires_at' => $ttl,
            ]);
        });

        return $plain;
    }

    /**
     * Usuario del token vigente, sin consumirlo. Vencido → 410 token_expired;
     * inexistente, usado, reemplazado o de una cuenta que ya no es un cliente activo → 410 token_invalid.
     *
     * @return array{0: User, 1: string} usuario y id de la fila del token
     */
    public function check(string $plain, string $purpose): array
    {
        $row = DB::table('user_tokens')->where('token_hash', self::hash($plain))->where('purpose', $purpose)->first();
        if ($row === null || $row->consumed_at !== null || $row->revoked_at !== null) {
            throw new ProblemException(410, 'token_invalid');
        }
        if (strtotime((string) $row->expires_at) <= time()) {
            throw new ProblemException(410, 'token_expired');
        }
        $user = User::query()->find($row->user_id);
        if ($user === null || $user->type !== 'customer' || ! $user->isActive()) {
            throw new ProblemException(410, 'token_invalid');
        }

        return [$user, (string) $row->id];
    }

    /** Consume el token de forma atómica: false si otra petición lo usó antes. */
    public function consume(string $tokenId): bool
    {
        return DB::table('user_tokens')->where('id', $tokenId)->whereNull('consumed_at')->whereNull('revoked_at')
            ->where('expires_at', '>', now())->update(['consumed_at' => now()]) === 1;
    }

    private static function hash(string $plain): string
    {
        return hash('sha256', $plain);
    }
}
