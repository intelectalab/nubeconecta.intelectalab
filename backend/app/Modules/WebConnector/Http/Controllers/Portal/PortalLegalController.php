<?php

declare(strict_types=1);

namespace App\Modules\WebConnector\Http\Controllers\Portal;

use App\Modules\Customers\Support\PortalCustomer;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Contracts\Database\Query\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Documentos legales vigentes de la marca del cliente (portal.legal_document.view)
 * y su aceptación desde el portal (portal.legal_acceptance.create). Deja constancia
 * en legal_acceptances (contexto `portal`) con IP y user-agent hasheados.
 */
final class PortalLegalController
{
    public function index(Request $request): JsonResponse
    {
        [$org, $brandId, , $userId] = $this->context($request);

        $rows = DB::table('legal_documents as d')
            ->join('legal_document_versions as v', fn (Builder $j) => $j->on('v.id', '=', 'd.published_version_id')->where('v.status', '=', 'published'))
            ->leftJoin('legal_acceptances as a', fn (Builder $j) => $j->on('a.legal_document_version_id', '=', 'v.id')->where('a.user_id', '=', $userId))
            ->where('d.organization_id', $org)->where('d.brand_id', $brandId)->whereNull('d.deleted_at')
            ->orderBy('d.kind')
            ->get(['d.slug', 'd.kind', 'd.title', 'v.id as version_id', 'v.version_label', 'v.effective_at', DB::raw('(a.id is not null) as accepted')]);

        $data = $rows->map(fn ($r) => [
            'slug' => $r->slug,
            'kind' => $r->kind,
            'title' => $r->title,
            'version_id' => $r->version_id,
            'version_label' => $r->version_label,
            'effective_at' => $r->effective_at,
            'accepted' => (bool) $r->accepted,
        ])->all();

        return response()->json(['data' => $data]);
    }

    public function accept(Request $request): JsonResponse
    {
        [$org, $brandId, $customerId, $userId] = $this->context($request);
        $data = $request->validate(['version_id' => ['required', 'uuid']]);

        // La versión debe ser la publicada de un documento legal de la marca del cliente.
        $valid = DB::table('legal_documents as d')
            ->join('legal_document_versions as v', 'v.id', '=', 'd.published_version_id')
            ->where('d.organization_id', $org)->where('d.brand_id', $brandId)->whereNull('d.deleted_at')
            ->where('v.id', $data['version_id'])->where('v.status', 'published')
            ->exists();
        if (! $valid) {
            throw ProblemException::validation(['version_id' => ['La versión indicada no está vigente para tu marca.']]);
        }

        // Idempotente: una aceptación por usuario y versión.
        $already = DB::table('legal_acceptances')->where('user_id', $userId)->where('legal_document_version_id', $data['version_id'])->exists();
        if (! $already) {
            DB::table('legal_acceptances')->insert([
                'id' => (string) Str::uuid(),
                'organization_id' => $org,
                'legal_document_version_id' => $data['version_id'],
                'customer_id' => $customerId,
                'user_id' => $userId,
                'context' => 'portal',
                'ip_hash' => hash_hmac('sha256', (string) $request->ip(), (string) config('app.key')),
                'user_agent_hash' => hash_hmac('sha256', substr((string) $request->userAgent(), 0, 500), (string) config('app.key')),
                'created_at' => now(),
            ]);
        }

        return response()->json(['data' => ['accepted' => true]]);
    }

    /**
     * @return array{0:string,1:string,2:string,3:string} [org, brandId, customerId, userId]
     */
    private function context(Request $request): array
    {
        $customerId = PortalCustomer::id($request);
        $customer = DB::table('customers')->where('id', $customerId)->first(['origin_brand_id']);
        if ($customer === null || $customer->origin_brand_id === null) {
            throw ProblemException::validation(['brand' => ['Tu cuenta no tiene una marca asociada para documentos legales.']]);
        }

        return [(string) app(CurrentOrganization::class)->id(), (string) $customer->origin_brand_id, (string) $customerId, (string) $request->user()->getAuthIdentifier()];
    }
}
