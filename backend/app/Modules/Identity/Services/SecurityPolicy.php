<?php

declare(strict_types=1);

namespace App\Modules\Identity\Services;

use App\Models\User;
use App\Shared\Settings\SettingsReader;
use Illuminate\Validation\Rules\Password;

/** Política de seguridad administrable (ajustes security.*, docs/00 §26, M-IDN §11). */
final class SecurityPolicy
{
    public function __construct(private readonly SettingsReader $settings) {}

    public function maxLoginAttempts(): int
    {
        return max(1, $this->settings->int('security.login_max_attempts', 5));
    }

    public function lockoutMinutes(): int
    {
        return max(1, $this->settings->int('security.login_lockout_minutes', 15));
    }

    public function sessionHours(): int
    {
        return max(1, $this->settings->int('security.session_duration_hours', 8));
    }

    public function sensitiveMfaMaxAgeMinutes(): int
    {
        return max(1, $this->settings->int('security.sensitive_action_mfa_max_age_minutes', 10));
    }

    public function totpEnabled(): bool
    {
        return $this->settings->bool('security.mfa.app_enabled', true);
    }

    /**
     * ¿La política exige segundo factor a este usuario?
     * Orden (docs/05 §7): rol admin siempre → security.mfa.required_by_role (gana) → tipo de usuario.
     */
    public function mfaRequiredFor(User $user): bool
    {
        $roles = $user->activeRoleCodes();
        if (in_array('admin', $roles, true)) {
            // Por defecto el admin siempre lleva 2FA; el ajuste permite desactivarlo (baja la seguridad de todos los admin).
            return $this->settings->bool('security.mfa.required_for_admin', true);
        }

        $byRole = (array) $this->settings->get('security.mfa.required_by_role', []);
        $decisions = array_intersect_key($byRole, array_flip($roles));
        if (in_array('required', $decisions, true)) {
            return true;
        }
        if ($decisions !== [] && ! in_array('required', $decisions, true)) {
            return false;
        }

        return $user->type === 'customer'
            ? $this->settings->bool('security.mfa.required_for_customers', false)
            : $this->settings->bool('security.mfa.required_for_staff', true);
    }

    public function passwordMinLength(): int
    {
        return max(8, $this->settings->int('security.password.min_length', 10));
    }

    /** @return array<string, bool> */
    public function passwordComplexity(): array
    {
        return array_map(static fn ($v): bool => (bool) $v, (array) $this->settings->get('security.password.complexity', []));
    }

    /** Días de vigencia de la contraseña (0 = no vence). */
    public function passwordExpiryDays(): int
    {
        return max(0, $this->settings->int('security.password.expiry_days', 0));
    }

    /** Cuántas contraseñas anteriores no se pueden reutilizar (0 = sin historial). */
    public function passwordHistoryCount(): int
    {
        return max(0, $this->settings->int('security.password.history_count', 0));
    }

    /** Contraseña puesta por un administrador o vencida: el usuario solo puede cambiarla. */
    public function passwordChangeRequired(User $user): bool
    {
        if ($user->must_change_password) {
            return true;
        }
        $days = $this->passwordExpiryDays();

        return $days > 0 && $user->password_changed_at !== null && $user->password_changed_at->lt(now()->subDays($days));
    }

    /** Regla de contraseña según security.password.min_length y .complexity. */
    public function passwordRule(): Password
    {
        $complexity = $this->passwordComplexity();
        $rule = Password::min($this->passwordMinLength());

        if (($complexity['uppercase'] ?? false) || ($complexity['lowercase'] ?? false)) {
            $rule->mixedCase();
        }
        if ($complexity['number'] ?? false) {
            $rule->numbers();
        }
        if ($complexity['symbol'] ?? false) {
            $rule->symbols();
        }

        return $rule;
    }
}
