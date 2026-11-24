<?php

declare(strict_types=1);

namespace App\Modules\Vault\Http\Controllers;

use App\Modules\Vault\Http\Resources\OneTimeLinkResource;
use App\Modules\Vault\Models\OneTimeLink;
use App\Modules\Vault\Models\Secret;
use App\Modules\Vault\Services\VaultService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/** /api/v1/admin/vault/one-time-links: enlaces de un solo uso para entregar accesos al cliente. */
final class OneTimeLinkController
{
    public function __construct(private readonly VaultService $vault) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $query = OneTimeLink::query()->orderByDesc('created_at');
        $secretId = $request->query('secret_id');
        if (is_string($secretId) && $secretId !== '') {
            $query->where('secret_id', $secretId);
        }

        return OneTimeLinkResource::collection($query->limit(100)->get());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'purpose' => ['required', Rule::in(OneTimeLink::PURPOSES)],
            'secret_id' => ['nullable', 'uuid'],
            'payload' => ['nullable', 'string', 'max:20000'],
            'recipient_email' => ['nullable', 'email', 'max:255'],
            'contact_id' => ['nullable', 'uuid'],
            'max_views' => ['sometimes', 'integer', 'between:1,10'],
            'expires_in_minutes' => ['sometimes', 'integer', 'between:5,20160'],
        ]);
        // Exactamente una fuente: un secreto existente o un texto libre.
        if (empty($data['secret_id']) === empty($data['payload'])) {
            throw ValidationException::withMessages(['secret_id' => ['Indique un secreto o un texto (payload), no ambos.']]);
        }
        if (! empty($data['secret_id'])) {
            Secret::query()->findOrFail($data['secret_id']); // 404 si no es de la organización
        }

        $result = $this->vault->createOneTimeLink([
            ...$data,
            'max_views' => $data['max_views'] ?? 1,
            'expires_at' => now()->addMinutes($data['expires_in_minutes'] ?? 1440),
        ]);

        return (new OneTimeLinkResource($result['link']))
            ->additional(['meta' => [
                // El token y la ruta de consumo se muestran UNA sola vez.
                'token' => $result['token'],
                'consume_path' => "/api/v1/public/vault/one-time/{$result['token']}",
            ]])
            ->response()->setStatusCode(201);
    }

    public function destroy(string $id): JsonResponse
    {
        $link = OneTimeLink::query()->findOrFail($id);
        if ($link->revoked_at === null) {
            $link->forceFill(['revoked_at' => now(), 'updated_by' => Auth::id()])->save();
        }

        return response()->json(status: 204);
    }
}
