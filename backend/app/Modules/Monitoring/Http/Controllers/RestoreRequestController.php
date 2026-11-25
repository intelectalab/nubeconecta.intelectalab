<?php

declare(strict_types=1);

namespace App\Modules\Monitoring\Http\Controllers;

use App\Modules\Monitoring\Http\Resources\RestoreRequestResource;
use App\Modules\Monitoring\Models\RestoreRequest;
use App\Modules\Monitoring\Services\RestoreRequestService;
use App\Shared\Concurrency\VersionGuard;
use App\Shared\Organization\CurrentOrganization;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;

/**
 * /api/v1/admin/restore-requests (monitoring.restore_request.*): bandeja del
 * operador para las solicitudes de restauración (aprobar/rechazar/cancelar y
 * registrar altas internas). La ejecución se maneja en una fase posterior.
 */
final class RestoreRequestController
{
    public function __construct(private readonly RestoreRequestService $service) {}

    private function base(): \Illuminate\Database\Eloquent\Builder
    {
        return RestoreRequest::query()->with(['service:id,label,code', 'ticket:id,number,status', 'customer:id,legal_name,trade_name']);
    }

    public function index(Request $request): JsonResponse
    {
        $query = $this->base();
        foreach (['status', 'customer_id', 'service_id'] as $col) {
            if (is_string($v = $request->input("filter.{$col}")) && $v !== '') {
                $query->where($col, $v);
            }
        }

        return CursorPagination::respond($query, $request, ['created_at', 'status', 'code'], RestoreRequestResource::class, '-created_at');
    }

    public function show(string $id): RestoreRequestResource
    {
        return new RestoreRequestResource($this->base()->findOrFail($id));
    }

    public function store(Request $request): JsonResponse
    {
        $org = app(CurrentOrganization::class)->id();
        $data = $request->validate([
            'service_id' => ['required', 'uuid', Rule::exists('services', 'id')->where('organization_id', $org)->whereNull('deleted_at')],
            'hosting_account_id' => ['nullable', 'uuid', Rule::exists('hosting_accounts', 'id')->where('organization_id', $org)],
            'target_kind' => ['required', Rule::in(RestoreRequest::TARGET_KINDS)],
            'target_name' => ['required', 'string', 'max:255'],
            'restore_point_at' => ['required', 'date', 'before_or_equal:now'],
            'overwrite_confirmed' => ['accepted'],
        ]);

        $req = $this->service->create($data, 'support', (string) Auth::id());

        return (new RestoreRequestResource($this->base()->findOrFail($req->id)))->response()->setStatusCode(201);
    }

    public function approve(Request $request, string $id): RestoreRequestResource
    {
        $req = $this->guarded($request, $id);

        return new RestoreRequestResource($this->service->approve($req, (string) Auth::id())->load(['service:id,label,code', 'ticket:id,number,status', 'customer:id,legal_name,trade_name']));
    }

    public function reject(Request $request, string $id): RestoreRequestResource
    {
        $data = $request->validate(['version' => ['required', 'integer'], 'reason' => ['required', 'string', 'max:1000']]);
        $req = RestoreRequest::query()->findOrFail($id);
        VersionGuard::check($req, $data['version']);

        return new RestoreRequestResource($this->service->reject($req, $data['reason'])->load(['service:id,label,code', 'ticket:id,number,status', 'customer:id,legal_name,trade_name']));
    }

    public function cancel(Request $request, string $id): RestoreRequestResource
    {
        $req = $this->guarded($request, $id);

        return new RestoreRequestResource($this->service->cancel($req)->load(['service:id,label,code', 'ticket:id,number,status', 'customer:id,legal_name,trade_name']));
    }

    public function start(Request $request, string $id): RestoreRequestResource
    {
        $data = $request->validate(['version' => ['required', 'integer'], 'execution_mode' => ['sometimes', Rule::in(RestoreRequest::EXECUTION_MODES)]]);
        $req = RestoreRequest::query()->findOrFail($id);
        VersionGuard::check($req, $data['version']);

        return new RestoreRequestResource($this->service->start($req, $data['execution_mode'] ?? 'assisted')->load(['service:id,label,code', 'ticket:id,number,status', 'customer:id,legal_name,trade_name']));
    }

    public function complete(Request $request, string $id, \App\Modules\Files\Services\FileService $files): RestoreRequestResource
    {
        $data = $request->validate([
            'version' => ['required', 'integer'],
            'file' => ['required', 'file', 'max:10240'],
            'result_notes' => ['nullable', 'string', 'max:2000'],
        ]);
        $req = RestoreRequest::query()->findOrFail($id);
        VersionGuard::check($req, $data['version']);
        $file = $files->upload($request->file('file'), ['visibility' => 'internal']);

        return new RestoreRequestResource($this->service->complete($req, $file->id, $data['result_notes'] ?? null)->load(['service:id,label,code', 'ticket:id,number,status', 'customer:id,legal_name,trade_name']));
    }

    public function fail(Request $request, string $id): RestoreRequestResource
    {
        $data = $request->validate(['version' => ['required', 'integer'], 'result_notes' => ['required', 'string', 'max:2000']]);
        $req = RestoreRequest::query()->findOrFail($id);
        VersionGuard::check($req, $data['version']);

        return new RestoreRequestResource($this->service->fail($req, $data['result_notes'])->load(['service:id,label,code', 'ticket:id,number,status', 'customer:id,legal_name,trade_name']));
    }

    private function guarded(Request $request, string $id): RestoreRequest
    {
        $data = $request->validate(['version' => ['required', 'integer']]);
        $req = RestoreRequest::query()->findOrFail($id);
        VersionGuard::check($req, $data['version']);

        return $req;
    }
}
