<?php

declare(strict_types=1);

namespace App\Modules\WebConnector\Http\Controllers;

use App\Modules\WebConnector\Jobs\SendWpCacheInvalidations;
use App\Modules\WebConnector\Models\WpCacheInvalidation;
use App\Modules\WebConnector\Models\WpSite;
use App\Modules\WebConnector\Services\CacheInvalidator;
use App\Shared\Audit\AuditLogger;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Http\Resources\ModelResource;
use App\Shared\Organization\CurrentOrganization;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/** /api/v1/admin/web-connector/cache-invalidations (web_connector.cache_invalidation.*), P-WCN-10. */
final class WpCacheInvalidationController
{
    public function __construct(private readonly CacheInvalidator $invalidator, private readonly AuditLogger $audit) {}

    public function index(Request $request): JsonResponse
    {
        $query = WpCacheInvalidation::query();
        foreach (['wp_site_id', 'status', 'scope'] as $filter) {
            if (($value = $request->input("filter.{$filter}")) !== null && $value !== '') {
                $query->where($filter, $value);
            }
        }

        return CursorPagination::respond($query, $request, ['created_at'], ModelResource::class);
    }

    /** Invalidación manual de un sitio (activo) o de todos los sitios activos de una marca. */
    public function store(Request $request): JsonResponse
    {
        $org = app(CurrentOrganization::class)->id();
        $data = $request->validate([
            'wp_site_id' => ['required_without:brand_id', 'prohibits:brand_id', 'uuid', Rule::exists('wp_sites', 'id')->where('organization_id', $org)->whereNull('deleted_at')],
            'brand_id' => ['required_without:wp_site_id', 'uuid', Rule::exists('brands', 'id')->where('organization_id', $org)->whereNull('deleted_at')],
            'scope' => ['required', Rule::in(WpCacheInvalidation::SCOPES)],
            'keys' => ['sometimes', 'array', 'max:100'],
            'keys.*' => ['string', 'max:120'],
        ]);
        $keys = $data['keys'] ?? [];

        $created = DB::transaction(function () use ($data, $keys, $org) {
            if (isset($data['wp_site_id'])) {
                $site = WpSite::query()->findOrFail($data['wp_site_id']);
                if ($site->status !== 'active') {
                    throw ProblemException::validation(['wp_site_id' => ['Solo un sitio activo recibe avisos; usa "Probar webhook" mientras está pendiente.']]);
                }
                $list = collect([$this->invalidator->forSite($site, $data['scope'], $keys, null, Auth::id())]);
            } else {
                $list = $this->invalidator->forBrand($org, $data['brand_id'], $data['scope'], $keys, null, Auth::id());
            }
            $this->audit->record('wp_cache_invalidation.requested', 'wp_cache_invalidation', $list->first()?->id, null, null, [
                'scope' => $data['scope'], 'keys' => $keys, 'ids' => $list->pluck('id')->all(),
            ]);

            return $list;
        });

        return response()->json(['data' => $created->map(fn ($i) => $i->refresh()->toArray())->all()], 202);
    }

    /** Reintentar un aviso fallido: vuelve a `pending` con el contador a cero. */
    public function retry(string $id): JsonResponse
    {
        $invalidation = WpCacheInvalidation::query()->findOrFail($id);
        if ($invalidation->status !== 'failed') {
            throw new ProblemException(409, 'conflict', 'Solo se reintenta un aviso fallido.');
        }
        DB::transaction(function () use ($invalidation): void {
            $before = $invalidation->attributesToArray();
            $invalidation->forceFill(['status' => 'pending', 'attempts' => 0, 'next_retry_at' => null, 'last_error' => null])->save();
            $this->audit->record('wp_cache_invalidation.retried', 'wp_cache_invalidation', $invalidation->id, $before, $invalidation->refresh()->attributesToArray());
            SendWpCacheInvalidations::dispatch($invalidation->id)->afterCommit();
        });

        return (new ModelResource($invalidation->refresh()))->response()->setStatusCode(202);
    }
}
