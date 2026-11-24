<?php

declare(strict_types=1);

namespace App\Modules\Vault\Http\Controllers;

use App\Modules\Vault\Http\Resources\SecretGrantResource;
use App\Modules\Vault\Models\Secret;
use App\Modules\Vault\Models\SecretGrant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/** /api/v1/admin/vault/secrets/{id}/grants: concesiones de acceso a un secreto. */
final class SecretGrantController
{
    public function index(string $secretId): AnonymousResourceCollection
    {
        Secret::query()->findOrFail($secretId); // 404 si el secreto no es de la organización
        $grants = SecretGrant::query()->with(['user:id,name', 'role:id,code,name'])
            ->where('secret_id', $secretId)->orderByDesc('created_at')->get();

        return SecretGrantResource::collection($grants);
    }

    public function store(Request $request, string $secretId): JsonResponse
    {
        Secret::query()->findOrFail($secretId);
        $data = $request->validate([
            'user_id' => ['nullable', 'uuid', Rule::exists('users', 'id')->whereNull('deleted_at')],
            'role_id' => ['nullable', 'uuid', Rule::exists('roles', 'id')],
            'reason' => ['nullable', 'string', 'max:500'],
            'expires_at' => ['nullable', 'date', 'after:now'],
        ]);
        // El CHECK de la base exige exactamente uno: usuario O rol.
        if (empty($data['user_id']) === empty($data['role_id'])) {
            throw ValidationException::withMessages(['user_id' => ['Indique un usuario o un rol, no ambos.']]);
        }

        $grant = SecretGrant::query()->create([
            'secret_id' => $secretId,
            'user_id' => $data['user_id'] ?? null,
            'role_id' => $data['role_id'] ?? null,
            'reason' => $data['reason'] ?? null,
            'starts_at' => now(),
            'expires_at' => $data['expires_at'] ?? null,
        ]);

        return (new SecretGrantResource($grant->load(['user:id,name', 'role:id,code,name'])))->response()->setStatusCode(201);
    }

    public function destroy(string $secretId, string $grantId): JsonResponse
    {
        $grant = SecretGrant::query()->where('secret_id', $secretId)->findOrFail($grantId);
        if ($grant->revoked_at === null) {
            $grant->forceFill(['revoked_at' => now(), 'revoked_by' => Auth::id()])->save();
        }

        return response()->json(status: 204);
    }
}
