<?php

declare(strict_types=1);

namespace App\Modules\WebConnector\Http\Controllers;

use App\Modules\WebConnector\Models\WpSite;
use App\Modules\WebConnector\Models\WpSiteToken;
use App\Modules\WebConnector\Services\WpSiteService;
use App\Shared\Http\Resources\ModelResource;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * /api/v1/admin/web-connector/sites/{id}/tokens (web_connector.site_token.*):
 * el valor plano solo aparece en la respuesta de creación; revocar exige motivo.
 */
final class WpSiteTokenController
{
    public function __construct(private readonly WpSiteService $sites) {}

    public function index(Request $request, string $id): JsonResponse
    {
        $site = WpSite::query()->findOrFail($id);

        return CursorPagination::respond(WpSiteToken::query()->where('wp_site_id', $site->id), $request, ['created_at'], ModelResource::class);
    }

    public function store(Request $request, string $id): JsonResponse
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:120']]);
        $result = $this->sites->createToken(WpSite::query()->findOrFail($id), $data['name']);

        return response()->json(['data' => $result['token']->toArray() + ['token' => $result['plain']]], 201)->header('Cache-Control', 'no-store');
    }

    public function destroy(Request $request, string $id, string $tokenId): Response
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:500']]);
        $token = WpSiteToken::query()->where('wp_site_id', $id)->findOrFail($tokenId);
        $this->sites->revokeToken($token, $data['reason']);

        return response()->noContent();
    }
}
