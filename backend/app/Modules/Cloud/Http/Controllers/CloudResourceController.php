<?php

declare(strict_types=1);

namespace App\Modules\Cloud\Http\Controllers;

use App\Modules\Cloud\Http\Resources\CloudResourceResource;
use App\Modules\Cloud\Models\CloudResource;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/** Recursos descubiertos: solo lectura (listar/ver). */
final class CloudResourceController
{
    private const RELATIONS = ['project:id,name', 'customer:id,code,legal_name,trade_name'];

    public function index(Request $request): JsonResponse
    {
        $query = CloudResource::query()->with(self::RELATIONS);
        foreach (['cloud_project_id', 'parent_id'] as $column) {
            $value = $request->query($column);
            if (is_string($value) && Str::isUuid($value)) { $query->where($column, $value); }
        }
        $customer = $request->query('customer_id');
        if (is_string($customer) && Str::isUuid($customer)) { $query->where('assigned_customer_id', $customer); }
        foreach (['kind' => CloudResource::KINDS, 'status' => CloudResource::STATUSES, 'assignment_status' => ['assigned', 'unassigned']] as $column => $allowed) {
            $value = $request->query($column);
            if (is_string($value) && in_array($value, $allowed, true)) { $query->where($column, $value); }
        }
        $type = $request->query('resource_type');
        if (is_string($type) && $type !== '' && strlen($type) <= 100) { $query->where('resource_type', $type); }
        $search = $request->query('search');
        $search = is_string($search) ? trim($search) : '';
        if ($search !== '') {
            $like = '%'.addcslashes($search, '\\%_').'%';
            $query->where(fn (Builder $w) => $w->where('name', 'ilike', $like)->orWhere('external_id', 'ilike', $like));
        }
        return CursorPagination::respond($query, $request, ['created_at', 'name', 'resource_type', 'kind', 'status', 'monthly_cost_minor'], CloudResourceResource::class);
    }

    public function show(string $id): CloudResourceResource
    {
        return new CloudResourceResource(CloudResource::query()->with(self::RELATIONS)->findOrFail($id));
    }
}
