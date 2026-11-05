<?php

declare(strict_types=1);

namespace App\Modules\Inventory\Http\Controllers;

use App\Modules\Inventory\Http\Resources\ServerResource;
use App\Modules\Inventory\Models\Server;
use App\Modules\Inventory\Services\ServerService;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class ServerController
{
    public function __construct(private readonly ServerService $servers) {}
    public function index(Request $request): JsonResponse
    {
        $request->validate(['q' => ['sometimes', 'nullable', 'string', 'max:100']]); $query = Server::query()->with('resource');
        $q = trim((string) $request->query('q', '')); if ($q !== '') $query->where(fn (Builder $w) => $w->where('hostname', 'ilike', "%$q%")->orWhereRaw('public_ip::text ILIKE ?', ["%$q%"]));
        return CursorPagination::respond($query, $request, ['created_at', 'hostname'], ServerResource::class);
    }
    public function store(Request $request): JsonResponse { $model = $this->servers->create($request->validate($this->servers->rules())); return (new ServerResource($model->load('resource')))->response()->setStatusCode(201); }
    public function show(string $id): ServerResource { return new ServerResource(Server::query()->with('resource')->findOrFail($id)); }
    public function update(Request $request, string $id): ServerResource { $model = $this->servers->update(Server::query()->findOrFail($id), $request->validate($this->servers->updateRules())); return new ServerResource($model->load('resource')); }
    public function destroy(Request $request, string $id): JsonResponse { $data = $request->validate(['version' => ['required', 'integer']]); $this->servers->delete(Server::query()->findOrFail($id), (int) $data['version']); return response()->json(null, 204); }
}
