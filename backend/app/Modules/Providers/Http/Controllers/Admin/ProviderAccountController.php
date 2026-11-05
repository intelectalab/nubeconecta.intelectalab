<?php

declare(strict_types=1);

namespace App\Modules\Providers\Http\Controllers\Admin;

use App\Modules\Providers\Http\Resources\ProviderAccountResource;
use App\Modules\Providers\Models\Provider;
use App\Modules\Providers\Models\ProviderAccount;
use App\Modules\Providers\Services\ProviderAccountService;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

final class ProviderAccountController
{
    public function __construct(private readonly ProviderAccountService $accounts) {}

    public function index(Request $request, string $provider): JsonResponse
    {
        Provider::query()->findOrFail($provider);
        $query = ProviderAccount::query()->with('provider:id,code,name,type')->where('provider_id', $provider);

        return CursorPagination::respond($query, $request, ['label', 'status', 'renewal_date', 'created_at', 'updated_at'], ProviderAccountResource::class, 'label');
    }

    public function store(Request $request, string $provider): JsonResponse
    {
        Provider::query()->findOrFail($provider);
        $data = $request->merge(['provider_id' => $provider])->validate($this->accounts->rules());
        $account = $this->accounts->create($data)->load('provider:id,code,name,type');

        return (new ProviderAccountResource($account))->response()->setStatusCode(201);
    }

    public function show(string $id): ProviderAccountResource
    {
        return new ProviderAccountResource($this->find($id)->load(['provider:id,code,name,type', 'customer:id,code,legal_name,trade_name']));
    }

    public function update(Request $request, string $id): ProviderAccountResource
    {
        $account = $this->find($id);

        return new ProviderAccountResource($this->accounts->update($account, $request->validate($this->accounts->updateRules()))->load('provider:id,code,name,type'));
    }

    public function destroy(Request $request, string $id): Response
    {
        $data = $request->validate(['version' => ['required', 'integer']]);
        $this->accounts->delete($this->find($id), (int) $data['version']);

        return response()->noContent();
    }

    private function find(string $id): ProviderAccount
    {
        return ProviderAccount::query()->findOrFail($id);
    }
}
