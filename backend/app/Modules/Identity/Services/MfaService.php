<?php

declare(strict_types=1);

namespace App\Modules\Identity\Services;

use App\Models\User;
use App\Modules\Identity\Models\MfaRecoveryCode;
use App\Shared\Audit\AuditLogger;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Segundo factor por aplicación TOTP y códigos de recuperación. */
final class MfaService
{
    public function __construct(private readonly AuditLogger $audit) {}

    /** Verifica un código TOTP e impide reutilizar el mismo paso de tiempo. */
    public function verifyTotp(User $user, string $code, ?string $secret = null): bool
    {
        $secret ??= $user->mfa_secret;
        if ($secret === null) {
            return false;
        }

        $step = Totp::verify($secret, $code);
        if ($step === null) {
            return false;
        }

        // Un código de un paso igual o anterior al último aceptado no vale (RFC 6238 §5.2).
        $lastKey = "identity:{$user->organization_id}:totp-last:{$user->id}";
        if ((int) Cache::get($lastKey, PHP_INT_MIN) >= $step) {
            return false;
        }

        // add() es atómico: el mismo código no vale dos veces aunque lleguen en paralelo.
        if (! Cache::add("identity:{$user->organization_id}:totp-used:{$user->id}:{$step}", true, Totp::PERIOD * 3)) {
            return false;
        }
        Cache::put($lastKey, $step, Totp::PERIOD * 3);

        return true;
    }

    public function verifyRecoveryCode(User $user, string $code): bool
    {
        $hash = self::hashRecovery($code);

        return DB::transaction(fn (): bool => MfaRecoveryCode::query()
            ->where('user_id', $user->id)
            ->where('code_hash', $hash)
            ->whereNull('used_at')
            ->update(['used_at' => now(), 'updated_at' => now()]) === 1);
    }

    /**
     * Activa TOTP con el secreto ya confirmado y devuelve los códigos de recuperación en claro
     * (se muestran una sola vez).
     *
     * @return list<string>
     */
    public function enableTotp(User $user, string $secret): array
    {
        return DB::transaction(function () use ($user, $secret): array {
            $user->forceFill(['mfa_secret' => $secret, 'mfa_method' => 'totp', 'mfa_enabled_at' => now()])->save();
            $codes = $this->regenerateRecoveryCodes($user);
            $this->audit->record('user.mfa_enabled', 'user', $user->id, null, ['mfa_method' => 'totp']);

            return $codes;
        });
    }

    public function disableTotp(User $user): void
    {
        DB::transaction(function () use ($user): void {
            $before = ['mfa_method' => $user->mfa_method];
            $user->forceFill(['mfa_secret' => null, 'mfa_method' => null, 'mfa_enabled_at' => null])->save();
            MfaRecoveryCode::query()->where('user_id', $user->id)->delete();
            $this->audit->record('user.mfa_disabled', 'user', $user->id, $before, ['mfa_method' => null]);
        });
    }

    /** @return list<string> */
    private function regenerateRecoveryCodes(User $user): array
    {
        MfaRecoveryCode::query()->where('user_id', $user->id)->delete();

        $codes = [];
        for ($i = 0; $i < (int) config('hub.auth.recovery_codes', 10); $i++) {
            $code = Str::lower(Str::random(5).'-'.Str::random(5));
            $codes[] = $code;
            MfaRecoveryCode::query()->create([
                'user_id' => $user->id,
                'organization_id' => $user->organization_id,
                'code_hash' => self::hashRecovery($code),
            ]);
        }

        return $codes;
    }

    private static function hashRecovery(string $code): string
    {
        return hash('sha256', Str::lower(trim($code)));
    }
}
