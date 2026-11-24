<?php

declare(strict_types=1);

namespace App\Modules\Vault\Http\Controllers;

use App\Models\User;
use App\Modules\Vault\Http\Resources\SecretResource;
use App\Modules\Vault\Models\Secret;
use App\Modules\Vault\Services\VaultService;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** /api/v1/admin/vault/secrets (M-VLT). El valor solo se devuelve en `reveal`, nunca en listado/vista. */
final class SecretController
{
    public function __construct(private readonly VaultService $vault) {}

    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'filter.kind' => ['sometimes', Rule::in(Secret::KINDS)],
            'filter.owner_type' => ['sometimes', Rule::in(Secret::OWNER_TYPES)],
            'filter.owner_id' => ['sometimes', 'uuid'],
            'filter.customer_id' => ['sometimes', 'uuid'],
            'q' => ['sometimes', 'nullable', 'string', 'max:100'],
        ]);
        $query = Secret::query()->with(['customer:id,code,legal_name,trade_name']);
        foreach (['kind', 'owner_type', 'owner_id', 'customer_id'] as $column) {
            $value = $request->input("filter.{$column}");
            if (is_string($value) && $value !== '') {
                $query->where($column, $value);
            }
        }
        $q = trim((string) $request->query('q', ''));
        if ($q !== '') {
            $query->where(fn (Builder $w) => $w->where('name', 'ilike', "%{$q}%")->orWhere('username', 'ilike', "%{$q}%")->orWhere('host', 'ilike', "%{$q}%"));
        }

        return CursorPagination::respond($query, $request, ['created_at', 'name', 'kind', 'rotates_at'], SecretResource::class);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules());
        $secret = $this->vault->create($data, $data['value']);

        return (new SecretResource($secret))->response()->setStatusCode(201);
    }

    public function show(string $id): SecretResource
    {
        return new SecretResource(Secret::query()->with(['customer:id,code,legal_name,trade_name'])->findOrFail($id));
    }

    public function update(Request $request, string $id): SecretResource
    {
        $secret = Secret::query()->findOrFail($id);
        $data = $request->validate([
            'version' => ['required', 'integer'],
            'name' => ['sometimes', 'string', 'max:160'],
            'username' => ['sometimes', 'nullable', 'string', 'max:160'],
            'host' => ['sometimes', 'nullable', 'string', 'max:255'],
            'port' => ['sometimes', 'nullable', 'integer', 'between:1,65535'],
            'customer_id' => ['sometimes', 'nullable', 'uuid'],
            'metadata' => ['sometimes', 'array'],
            'rotates_at' => ['sometimes', 'nullable', 'date'],
            'expires_at' => ['sometimes', 'nullable', 'date'],
            'value' => ['sometimes', 'string', 'max:20000'],
        ]);
        if ((int) $data['version'] !== (int) $secret->version) {
            throw new ProblemException(409, 'version_conflict', 'El secreto cambió; recargue.', ['current_version' => (int) $secret->version]);
        }

        $secret->fill(array_intersect_key($data, array_flip(['name', 'username', 'host', 'port', 'customer_id', 'metadata', 'rotates_at', 'expires_at'])))->save();
        if (isset($data['value'])) {
            $this->vault->updateValue($secret, $data['value']);
        }

        return new SecretResource($secret->refresh()->load('customer:id,code,legal_name,trade_name'));
    }

    public function destroy(string $id): JsonResponse
    {
        Secret::query()->findOrFail($id)->delete();

        return response()->json(status: 204);
    }

    public function reveal(Request $request, string $id): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:500']]);
        $secret = Secret::query()->findOrFail($id);
        /** @var User $user */
        $user = $request->user();
        $value = $this->vault->reveal($secret, $user, $data['reason'], $request);

        // Sin caché: el valor no debe quedar en ningún intermediario.
        return response()->json(['data' => ['value' => $value]])->header('Cache-Control', 'no-store');
    }

    /** @return array<string, mixed> */
    private function rules(): array
    {
        return [
            'kind' => ['required', Rule::in(Secret::KINDS)],
            'name' => ['required', 'string', 'max:160'],
            'owner_type' => ['required', Rule::in(Secret::OWNER_TYPES)],
            'owner_id' => ['required', 'uuid'],
            'customer_id' => ['nullable', 'uuid'],
            'is_connector_credential' => ['sometimes', 'boolean'],
            'username' => ['nullable', 'string', 'max:160'],
            'host' => ['nullable', 'string', 'max:255'],
            'port' => ['nullable', 'integer', 'between:1,65535'],
            'metadata' => ['sometimes', 'array'],
            'rotates_at' => ['nullable', 'date'],
            'expires_at' => ['nullable', 'date'],
            'value' => ['required', 'string', 'max:20000'],
        ];
    }
}
