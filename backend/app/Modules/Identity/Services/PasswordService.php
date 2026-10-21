<?php

declare(strict_types=1);

namespace App\Modules\Identity\Services;

use App\Models\User;
use App\Modules\Identity\Models\UserSession;
use App\Shared\Audit\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

/**
 * Cambio de contraseña del propio usuario (POST /auth/password/change, M-IDN):
 * exige la actual, aplica la política (security.password.*), impide reutilizar
 * las últimas security.password.history_count (password_histories), limpia
 * must_change_password y cierra las demás sesiones del usuario.
 */
final class PasswordService
{
    public function __construct(
        private readonly SecurityPolicy $policy,
        private readonly AuthSessionManager $sessions,
        private readonly AuditLogger $audit,
    ) {}

    public function change(User $user, string $current, string $new, Request $request): void
    {
        if ($user->password_hash === null || ! Hash::check($current, $user->password_hash)) {
            $this->audit->record('user.password_change_failed', 'user', $user->id, null, null, ['reason' => 'bad_current_password']);
            throw ValidationException::withMessages(['current_password' => [__('validation.current_password')]]);
        }

        if ($this->reused($user, $new)) {
            throw ValidationException::withMessages(['password' => [__('problems.password_reused')]]);
        }

        DB::transaction(function () use ($user, $new, $request): void {
            $keep = $this->policy->passwordHistoryCount();
            if ($keep > 0) {
                DB::table('password_histories')->insert([
                    'organization_id' => $user->organization_id,
                    'user_id' => $user->id,
                    'password_hash' => $user->password_hash,
                    'created_by' => $user->id,
                ]);
                $stale = DB::table('password_histories')->where('user_id', $user->id)
                    ->orderByDesc('created_at')->orderByDesc('id')->offset($keep)->limit(1000)->pluck('id');
                DB::table('password_histories')->whereIn('id', $stale)->delete();
            }

            $user->forceFill([
                'password_hash' => Hash::make($new),
                'password_changed_at' => now(),
                'must_change_password' => false,
            ])->save();

            $current = $this->sessions->current($request);
            $revoked = UserSession::query()->where('user_id', $user->id)->whereNull('revoked_at')
                ->when($current !== null, fn ($q) => $q->whereKeyNot($current->id))
                ->update(['revoked_at' => now(), 'updated_at' => now()]);

            $this->audit->record('user.password_changed', 'user', $user->id, null, null, ['revoked_sessions' => $revoked]);
        });
    }

    /** La nueva coincide con la actual o con alguna de las últimas security.password.history_count. */
    private function reused(User $user, string $new): bool
    {
        if ($user->password_hash !== null && Hash::check($new, $user->password_hash)) {
            return true;
        }
        $keep = $this->policy->passwordHistoryCount();
        if ($keep === 0) {
            return false;
        }

        return DB::table('password_histories')->where('user_id', $user->id)
            ->orderByDesc('created_at')->limit($keep)->pluck('password_hash')
            ->contains(fn (string $hash): bool => Hash::check($new, $hash));
    }
}
