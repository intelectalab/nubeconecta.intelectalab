<?php

declare(strict_types=1);

namespace App\Modules\Settings\Http\Controllers;

use App\Modules\Settings\Models\SettingChange;
use App\Modules\Settings\Services\SettingsWriter;
use App\Shared\Http\Resources\ModelResource;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** /api/v1/admin/setting-changes: historial (settings.setting_change.view) y reversión (revertSettingChange). */
final class SettingChangeController
{
    public function __construct(private readonly SettingsWriter $writer) {}

    public function index(Request $request): JsonResponse
    {
        $query = SettingChange::query();
        foreach (['key', 'scope_type', 'scope_id', 'created_by'] as $filter) {
            if (($value = $request->input("filter.{$filter}")) !== null) {
                $query->where($filter, $value);
            }
        }

        return CursorPagination::respond($query, $request, ['created_at'], ModelResource::class);
    }

    public function revert(Request $request, string $id): JsonResponse
    {
        $change = SettingChange::query()->findOrFail($id);
        $this->writer->authorize($request, $change->key);
        $data = $request->validate(['reason' => ['nullable', 'string', 'max:2000']]);
        $new = $this->writer->revert($change, $data['reason'] ?? null);

        return (new ModelResource($new->refresh()))->response()->setStatusCode(201);
    }
}
