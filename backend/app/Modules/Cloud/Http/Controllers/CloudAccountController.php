<?php

declare(strict_types=1);

namespace App\Modules\Cloud\Http\Controllers;

use App\Modules\Cloud\Http\Resources\CloudAccountResource;
use App\Modules\Cloud\Models\CloudAccount;
use App\Modules\Cloud\Services\CloudService;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

final class CloudAccountController
{
    public function __construct(private readonly CloudService $cloud) {}

    public function index(Request $request): JsonResponse
    {
        $query = CloudAccount::query()->with(CloudService::accountRelations())->withCount('projects');
        // Los filtros inválidos (uuid mal formado, enum desconocido) se ignoran, no rompen.
        $customer = $request->query('customer_id');
        if (is_string($customer) && Str::isUuid($customer)) { $query->where('customer_id', $customer); }
        foreach (['platform' => CloudAccount::PLATFORMS, 'owner' => CloudAccount::OWNERS, 'modality' => CloudAccount::MODALITIES, 'status' => CloudAccount::STATUSES] as $column => $allowed) {
            $value = $request->query($column);
            if (is_string($value) && in_array($value, $allowed, true)) { $query->where($column, $value); }
        }
        $search = $request->query('search');
        $search = is_string($search) ? trim($search) : '';
        if ($search !== '') {
            $like = '%'.addcslashes($search, '\\%_').'%';
            $query->where(fn (Builder $w) => $w->where('external_account_id', 'ilike', $like)
                ->orWhereHas('customer', fn (Builder $c) => $c->where('legal_name', 'ilike', $like)->orWhere('trade_name', 'ilike', $like))
                ->orWhereHas('providerAccount', fn (Builder $p) => $p->where('label', 'ilike', $like)));
        }
        return CursorPagination::respond($query, $request, ['created_at', 'platform', 'external_account_id', 'status'], CloudAccountResource::class);
    }

    public function store(Request $request): JsonResponse
    {
        $account = $this->cloud->createAccount($request->validate($this->cloud->accountRules(null)));
        return (new CloudAccountResource($account))->response()->setStatusCode(201);
    }

    public function show(string $id): CloudAccountResource
    {
        return new CloudAccountResource($this->cloud->loadedAccount(CloudAccount::query()->findOrFail($id)));
    }

    public function update(Request $request, string $id): CloudAccountResource
    {
        $account = CloudAccount::query()->findOrFail($id);
        return new CloudAccountResource($this->cloud->updateAccount($account, $request->validate($this->cloud->accountRules($account))));
    }

    public function destroy(string $id): JsonResponse
    {
        $this->cloud->deleteAccount(CloudAccount::query()->findOrFail($id));
        return response()->json(null, 204);
    }
}
