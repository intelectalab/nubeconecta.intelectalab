<?php

declare(strict_types=1);

namespace App\Modules\Cloud\Http\Controllers;

use App\Modules\Cloud\Http\Resources\CloudProjectResource;
use App\Modules\Cloud\Models\CloudAccount;
use App\Modules\Cloud\Models\CloudProject;
use App\Modules\Cloud\Services\CloudService;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

final class CloudProjectController
{
    public function __construct(private readonly CloudService $cloud) {}

    public function index(Request $request): JsonResponse
    {
        $query = $this->cloud->projectQuery();
        foreach (['customer_id', 'cloud_account_id'] as $column) {
            $value = $request->query($column);
            if (is_string($value) && Str::isUuid($value)) { $query->where('cloud_projects.'.$column, $value); }
        }
        $env = $request->query('environment');
        if (is_string($env) && in_array($env, CloudProject::ENVIRONMENTS, true)) { $query->where('environment', $env); }
        $platform = $request->query('platform');
        if (is_string($platform) && in_array($platform, CloudAccount::PLATFORMS, true)) {
            $query->whereHas('account', fn (Builder $a) => $a->where('platform', $platform));
        }
        $visible = $request->query('visible_to_customer');
        if (is_string($visible) && in_array($visible, ['0', '1', 'true', 'false'], true)) { $query->where('visible_to_customer', $request->boolean('visible_to_customer')); }
        $search = $request->query('search');
        $search = is_string($search) ? trim($search) : '';
        if ($search !== '') {
            $like = '%'.addcslashes($search, '\\%_').'%';
            $query->where(fn (Builder $w) => $w->where('cloud_projects.name', 'ilike', $like)->orWhere('cloud_projects.external_id', 'ilike', $like)
                ->orWhereHas('customer', fn (Builder $c) => $c->where('legal_name', 'ilike', $like)->orWhere('trade_name', 'ilike', $like)));
        }
        return CursorPagination::respond($query, $request, ['created_at', 'name', 'environment'], CloudProjectResource::class);
    }

    public function store(Request $request): JsonResponse
    {
        $project = $this->cloud->createProject($request->validate($this->cloud->projectRules(null)));
        return (new CloudProjectResource($project))->response()->setStatusCode(201);
    }

    public function show(string $id): CloudProjectResource
    {
        return new CloudProjectResource($this->cloud->loadedProject($id));
    }

    public function update(Request $request, string $id): CloudProjectResource
    {
        $project = CloudProject::query()->findOrFail($id);
        return new CloudProjectResource($this->cloud->updateProject($project, $request->validate($this->cloud->projectRules($project))));
    }

    public function destroy(string $id): JsonResponse
    {
        $this->cloud->deleteProject(CloudProject::query()->findOrFail($id));
        return response()->json(null, 204);
    }
}
