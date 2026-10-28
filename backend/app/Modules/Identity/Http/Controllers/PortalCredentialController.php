<?php

declare(strict_types=1);

namespace App\Modules\Identity\Http\Controllers;

use App\Modules\Identity\Services\PortalCredentialService;
use App\Modules\Identity\Services\SecurityPolicy;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * /api/v1/portal/auth: endpoints públicos del portal para activar la cuenta
 * (invitación) y recuperar la contraseña. Con throttle; no inician sesión.
 */
final class PortalCredentialController
{
    public function __construct(private readonly PortalCredentialService $credentials, private readonly SecurityPolicy $policy) {}

    public function verifyInvitation(Request $request): JsonResponse
    {
        $data = $request->validate(['token' => ['required', 'string', 'max:128']]);

        return response()->json(['data' => $this->credentials->verifyInvitation($data['token'])]);
    }

    public function acceptInvitation(Request $request): Response
    {
        $data = $request->validate($this->passwordRules());
        $this->credentials->acceptInvitation($data['token'], $data['password']);

        return response()->noContent();
    }

    /** Siempre 202 con el mismo cuerpo, exista o no el correo. */
    public function forgot(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'string', 'email', 'max:255']]);
        $this->credentials->requestPasswordReset($data['email']);

        return response()->json(['data' => ['message' => 'Si el correo corresponde a una cuenta activa, enviaremos un enlace para restablecer la contraseña.']], 202);
    }

    public function reset(Request $request): Response
    {
        $data = $request->validate($this->passwordRules());
        $this->credentials->resetPassword($data['token'], $data['password']);

        return response()->noContent();
    }

    /** @return array<string, list<mixed>> */
    private function passwordRules(): array
    {
        return [
            'token' => ['required', 'string', 'max:128'],
            'password' => ['required', 'string', 'max:1024', 'confirmed', $this->policy->passwordRule()],
        ];
    }
}
