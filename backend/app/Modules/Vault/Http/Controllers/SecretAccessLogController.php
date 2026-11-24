<?php

declare(strict_types=1);

namespace App\Modules\Vault\Http\Controllers;

use App\Modules\Vault\Http\Resources\SecretAccessLogResource;
use App\Modules\Vault\Models\Secret;
use App\Modules\Vault\Models\SecretAccessLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** /api/v1/admin/vault/secrets/{id}/access-logs: bitácora de revelaciones y usos de un secreto. */
final class SecretAccessLogController
{
    public function index(Request $request, string $secretId): JsonResponse
    {
        Secret::query()->findOrFail($secretId);
        $query = SecretAccessLog::query()->with(['user:id,name'])->where('secret_id', $secretId);

        return \App\Shared\Pagination\CursorPagination::respond($query, $request, ['created_at'], SecretAccessLogResource::class);
    }
}
