<?php

declare(strict_types=1);

namespace App\Modules\Identity\Services;

use App\Models\User;
use App\Modules\Identity\Models\Permission;
use App\Shared\Contracts\AccessControl;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Http\Request;

/** Implementación de App\Shared\Contracts\AccessControl sobre roles, role_permissions y user_sessions. */
final class AccessControlService implements AccessControl
{
    /** @var array<string, bool>|null */
    private ?array $sensitive = null;

    public function __construct(
        private readonly SecurityPolicy $policy,
        private readonly AuthSessionManager $sessions,
    ) {}

    public function allows(Authenticatable $user, string $permission): bool
    {
        return $user instanceof User && $user->isActive() && in_array($permission, $user->permissionCodes(), true);
    }

    public function mustEnrollMfa(Authenticatable $user): bool
    {
        return $user instanceof User && ! $user->hasMfa() && $this->policy->mfaRequiredFor($user);
    }

    public function mustChangePassword(Authenticatable $user): bool
    {
        return $user instanceof User && $this->policy->passwordChangeRequired($user);
    }

    public function isSensitive(string $permission): bool
    {
        $this->sensitive ??= Permission::query()->where('is_sensitive', true)->pluck('is_sensitive', 'code')->all();

        return isset($this->sensitive[$permission]);
    }

    public function hasRecentMfa(Authenticatable $user, Request $request): bool
    {
        $session = $this->sessions->current($request);
        if ($session === null || $session->user_id !== $user->getAuthIdentifier() || $session->mfa_verified_at === null) {
            return false;
        }

        return $session->mfa_verified_at->greaterThan(now()->subMinutes($this->policy->sensitiveMfaMaxAgeMinutes()));
    }
}
