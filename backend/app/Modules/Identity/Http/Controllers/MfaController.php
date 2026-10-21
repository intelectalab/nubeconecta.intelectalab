<?php

declare(strict_types=1);

namespace App\Modules\Identity\Http\Controllers;

use App\Models\User;
use App\Modules\Identity\Services\AuthSessionManager;
use App\Modules\Identity\Services\MfaService;
use App\Modules\Identity\Services\SecurityPolicy;
use App\Modules\Identity\Services\Totp;
use App\Shared\Http\Problem\ProblemException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\ValidationException;

/** Alta, confirmación y baja de TOTP, y MFA reciente (step-up). Requiere sesión. */
final class MfaController
{
    private const ENROLL_KEY = 'hub.mfa_totp_enrollment';

    public function __construct(private readonly MfaService $mfa) {}

    public function startTotp(Request $request, SecurityPolicy $policy): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        if (! $policy->totpEnabled()) {
            throw ProblemException::forbidden('El segundo factor por aplicación está desactivado.');
        }
        if ($user->hasMfa()) {
            throw new ProblemException(409, 'conflict', 'El segundo factor ya está activo.');
        }

        $secret = Totp::generateSecret();
        $request->session()->put(self::ENROLL_KEY, encrypt($secret));

        return response()->json(['data' => [
            'secret' => $secret,
            'otpauth_uri' => Totp::provisioningUri($secret, $user->email, (string) config('hub.auth.totp_issuer')),
        ]]);
    }

    public function confirmTotp(Request $request, AuthSessionManager $sessions): JsonResponse
    {
        $data = $request->validate(['code' => ['required', 'string', 'max:16']]);
        /** @var User $user */
        $user = $request->user();

        $stored = $request->session()->get(self::ENROLL_KEY);
        $secret = is_string($stored) ? decrypt($stored) : null;
        if ($secret === null || ! $this->mfa->verifyTotp($user, $data['code'], $secret)) {
            throw ValidationException::withMessages(['code' => [__('problems.invalid_mfa_code')]]);
        }

        $codes = $this->mfa->enableTotp($user, $secret);
        $request->session()->forget(self::ENROLL_KEY);
        $sessions->markMfaVerified($request);

        return response()->json(['data' => ['mfa_method' => 'totp', 'recovery_codes' => $codes]], 201);
    }

    public function disableTotp(Request $request, SecurityPolicy $policy): Response
    {
        /** @var User $user */
        $user = $request->user();
        // M-IDN §4.2: si la política exige segundo factor, no se queda sin él (el método por correo aún no existe).
        if ($policy->mfaRequiredFor($user)) {
            throw ProblemException::forbidden('La política de seguridad exige segundo factor para su usuario.');
        }
        if (! $user->hasMfa()) {
            throw new ProblemException(409, 'conflict', 'El segundo factor no está activo.');
        }

        $this->mfa->disableTotp($user);

        return response()->noContent();
    }

    public function stepUp(Request $request, AuthSessionManager $sessions): JsonResponse
    {
        $data = $request->validate(['code' => ['required', 'string', 'max:16']]);
        /** @var User $user */
        $user = $request->user();

        if (! $user->hasMfa() || ! $this->mfa->verifyTotp($user, $data['code'])) {
            throw ValidationException::withMessages(['code' => [__('problems.invalid_mfa_code')]]);
        }

        $sessions->markMfaVerified($request);

        return response()->json(['data' => ['mfa_verified_at' => now()->toIso8601ZuluString()]]);
    }
}
