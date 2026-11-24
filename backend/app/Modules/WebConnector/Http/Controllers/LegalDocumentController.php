<?php

declare(strict_types=1);

namespace App\Modules\WebConnector\Http\Controllers;

use App\Modules\WebConnector\Http\Resources\LegalDocumentResource;
use App\Modules\WebConnector\Models\LegalDocument;
use App\Modules\WebConnector\Models\LegalDocumentVersion;
use App\Modules\WebConnector\Support\LegalHtmlSanitizer;
use App\Shared\Audit\AuditLogger;
use App\Shared\Concurrency\VersionGuard;
use App\Shared\Organization\CurrentOrganization;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * /api/v1/admin/web-connector/legal-documents (web_connector.legal_document.*):
 * documentos legales por marca y su flujo de versiones (borrador → publicada →
 * reemplazada). Publicar exige revisión legal y fecha de vigencia (CHECK de la base).
 */
final class LegalDocumentController
{
    public function __construct(private readonly AuditLogger $audit) {}

    public function index(Request $request): JsonResponse
    {
        $query = LegalDocument::query()->with('versions')->withCount('versions');
        foreach (['brand_id', 'kind', 'locale'] as $column) {
            $value = $request->input("filter.{$column}");
            if (is_string($value) && $value !== '') {
                $query->where($column, $value);
            }
        }

        return CursorPagination::respond($query, $request, ['created_at', 'title', 'kind'], LegalDocumentResource::class);
    }

    public function show(string $id): LegalDocumentResource
    {
        return new LegalDocumentResource(LegalDocument::query()->with('versions')->findOrFail($id));
    }

    public function store(Request $request): JsonResponse
    {
        $org = app(CurrentOrganization::class)->id();
        $data = $request->validate([
            'brand_id' => ['required', 'uuid', Rule::exists('brands', 'id')->where('organization_id', $org)->whereNull('deleted_at')],
            'kind' => ['required', Rule::in(LegalDocument::KINDS)],
            'locale' => ['sometimes', 'string', 'max:10'],
            'title' => ['required', 'string', 'max:200'],
            'slug' => ['required', 'string', 'max:160', 'regex:/^[a-z0-9]+(-[a-z0-9]+)*$/'],
            'version_label' => ['required', 'string', 'max:60'],
            'body' => ['required', 'string'],
            'change_summary' => ['nullable', 'string', 'max:2000'],
        ]);
        $locale = $data['locale'] ?? 'es';
        $this->assertUnique($org, $data['brand_id'], $data['kind'], $locale, $data['slug'], null);

        $doc = DB::transaction(function () use ($data, $locale): LegalDocument {
            $doc = new LegalDocument;
            $doc->forceFill([
                'brand_id' => $data['brand_id'],
                'kind' => $data['kind'],
                'locale' => $locale,
                'title' => $data['title'],
                'slug' => $data['slug'],
            ])->save();

            $ver = new LegalDocumentVersion;
            $ver->forceFill([
                'legal_document_id' => $doc->id,
                'version_number' => 1,
                'version_label' => $data['version_label'],
                'body' => LegalHtmlSanitizer::clean($data['body']),
                'change_summary' => $data['change_summary'] ?? null,
                'status' => 'draft',
            ])->save();

            $this->audit->record('legal_document.created', 'legal_document', $doc->id, null, $doc->attributesToArray(), ['slug' => $doc->slug]);

            return $doc;
        });

        return (new LegalDocumentResource($doc->load('versions')))->response()->setStatusCode(201);
    }

    public function update(Request $request, string $id): LegalDocumentResource
    {
        $doc = LegalDocument::query()->findOrFail($id);
        $org = app(CurrentOrganization::class)->id();
        $data = $request->validate([
            'version' => ['required', 'integer'],
            'title' => ['sometimes', 'string', 'max:200'],
            'slug' => ['sometimes', 'string', 'max:160', 'regex:/^[a-z0-9]+(-[a-z0-9]+)*$/'],
        ]);
        if (isset($data['slug'])) {
            $this->assertUnique($org, $doc->brand_id, $doc->kind, $doc->locale, $data['slug'], $doc->id);
        }

        DB::transaction(function () use ($doc, $data): void {
            VersionGuard::check($doc, $data['version']);
            $before = $doc->attributesToArray();
            $doc->forceFill(array_intersect_key($data, array_flip(['title', 'slug'])))->save();
            $this->audit->record('legal_document.updated', 'legal_document', $doc->id, $before, $doc->refresh()->attributesToArray());
        });

        return new LegalDocumentResource($doc->load('versions'));
    }

    public function destroy(string $id): JsonResponse
    {
        $doc = LegalDocument::query()->findOrFail($id);
        DB::transaction(function () use ($doc): void {
            $doc->delete();
            $this->audit->record('legal_document.deleted', 'legal_document', $doc->id, $doc->attributesToArray(), null);
        });

        return response()->json(status: 204);
    }

    public function storeVersion(Request $request, string $id): JsonResponse
    {
        $doc = LegalDocument::query()->findOrFail($id);
        $data = $request->validate([
            'version_label' => ['required', 'string', 'max:60'],
            'body' => ['required', 'string'],
            'change_summary' => ['nullable', 'string', 'max:2000'],
        ]);
        $this->assertUniqueLabel($doc->id, $data['version_label'], null);

        $ver = DB::transaction(function () use ($doc, $data): LegalDocumentVersion {
            $next = (int) LegalDocumentVersion::query()->where('legal_document_id', $doc->id)->max('version_number') + 1;
            $ver = new LegalDocumentVersion;
            $ver->forceFill([
                'legal_document_id' => $doc->id,
                'version_number' => $next,
                'version_label' => $data['version_label'],
                'body' => LegalHtmlSanitizer::clean($data['body']),
                'change_summary' => $data['change_summary'] ?? null,
                'status' => 'draft',
            ])->save();
            $this->audit->record('legal_document.version_drafted', 'legal_document', $doc->id, null, ['version_id' => $ver->id, 'version_number' => $next]);

            return $ver;
        });

        return (new LegalDocumentResource($doc->load('versions')))->additional(['meta' => ['version_id' => $ver->id]])->response()->setStatusCode(201);
    }

    public function updateVersion(Request $request, string $id, string $vid): LegalDocumentResource
    {
        $doc = LegalDocument::query()->findOrFail($id);
        $ver = LegalDocumentVersion::query()->where('legal_document_id', $doc->id)->findOrFail($vid);
        if ($ver->status !== 'draft') {
            throw ValidationException::withMessages(['status' => ['Solo se pueden editar versiones en borrador.']]);
        }
        $data = $request->validate([
            'version' => ['required', 'integer'],
            'version_label' => ['sometimes', 'string', 'max:60'],
            'body' => ['sometimes', 'string'],
            'change_summary' => ['nullable', 'string', 'max:2000'],
            'legal_reviewed_by' => ['nullable', 'string', 'max:160'],
        ]);
        if (isset($data['version_label'])) {
            $this->assertUniqueLabel($doc->id, $data['version_label'], $ver->id);
        }

        DB::transaction(function () use ($ver, $data, $doc): void {
            VersionGuard::check($ver, $data['version']);
            if (array_key_exists('body', $data)) {
                $data['body'] = LegalHtmlSanitizer::clean($data['body']);
            }
            if (array_key_exists('legal_reviewed_by', $data)) {
                $ver->legal_reviewed_at = ($data['legal_reviewed_by'] ?? null) ? now() : null;
            }
            $ver->forceFill(array_intersect_key($data, array_flip(['version_label', 'body', 'change_summary', 'legal_reviewed_by'])))->save();
            $this->audit->record('legal_document.version_updated', 'legal_document', $doc->id, null, ['version_id' => $ver->id]);
        });

        return new LegalDocumentResource($doc->load('versions'));
    }

    public function destroyVersion(string $id, string $vid): JsonResponse
    {
        $doc = LegalDocument::query()->findOrFail($id);
        $ver = LegalDocumentVersion::query()->where('legal_document_id', $doc->id)->findOrFail($vid);
        if ($ver->status !== 'draft') {
            throw ValidationException::withMessages(['status' => ['Solo se pueden eliminar versiones en borrador.']]);
        }
        DB::transaction(function () use ($ver, $doc): void {
            $ver->delete();
            $this->audit->record('legal_document.version_deleted', 'legal_document', $doc->id, ['version_id' => $ver->id], null);
        });

        return response()->json(status: 204);
    }

    /** Publica un borrador: lo vuelve vigente, reemplaza al anterior y fija la vigencia (web_connector.legal_document.approve). */
    public function publishVersion(Request $request, string $id, string $vid): LegalDocumentResource
    {
        $doc = LegalDocument::query()->findOrFail($id);
        $ver = LegalDocumentVersion::query()->where('legal_document_id', $doc->id)->findOrFail($vid);
        if ($ver->status !== 'draft') {
            throw ValidationException::withMessages(['status' => ['Solo se publica un borrador.']]);
        }
        $data = $request->validate([
            'version' => ['required', 'integer'],
            'legal_reviewed_by' => ['required', 'string', 'max:160'],
            'effective_at' => ['required', 'date'],
        ]);

        DB::transaction(function () use ($doc, $ver, $data): void {
            VersionGuard::check($ver, $data['version']);
            // Reemplaza la versión vigente anterior (índice único: una sola publicada por documento).
            LegalDocumentVersion::query()
                ->where('legal_document_id', $doc->id)->where('status', 'published')
                ->update(['status' => 'superseded', 'superseded_at' => now()]);

            $ver->forceFill([
                'legal_reviewed_by' => $data['legal_reviewed_by'],
                'legal_reviewed_at' => $ver->legal_reviewed_at ?? now(),
                'effective_at' => Carbon::parse($data['effective_at']),
                'status' => 'published',
                'published_at' => now(),
                'published_by' => Auth::id(),
            ])->save();

            $doc->forceFill(['published_version_id' => $ver->id])->save();
            $this->audit->record('legal_document.published', 'legal_document', $doc->id, null, ['version_id' => $ver->id, 'version_label' => $ver->version_label], ['effective_at' => (string) $data['effective_at']]);
        });

        return new LegalDocumentResource($doc->load('versions'));
    }

    private function assertUnique(string $org, string $brandId, string $kind, string $locale, string $slug, ?string $ignoreId): void
    {
        $slugTaken = LegalDocument::query()->where('brand_id', $brandId)->where('locale', $locale)->where('slug', $slug)
            ->when($ignoreId, fn ($q) => $q->whereKeyNot($ignoreId))->exists();
        if ($slugTaken) {
            throw ValidationException::withMessages(['slug' => ['Ya existe un documento con ese identificador para la marca.']]);
        }
        // Un documento por tipo y marca (categoría nula = generales): refleja legal_documents_kind_uq.
        $kindTaken = LegalDocument::query()->where('brand_id', $brandId)->where('locale', $locale)->where('kind', $kind)->whereNull('product_category_id')
            ->when($ignoreId, fn ($q) => $q->whereKeyNot($ignoreId))->exists();
        if ($kindTaken) {
            throw ValidationException::withMessages(['kind' => ['La marca ya tiene un documento de ese tipo.']]);
        }
    }

    private function assertUniqueLabel(string $docId, string $label, ?string $ignoreId): void
    {
        $taken = LegalDocumentVersion::query()->where('legal_document_id', $docId)->where('version_label', $label)
            ->when($ignoreId, fn ($q) => $q->whereKeyNot($ignoreId))->exists();
        if ($taken) {
            throw ValidationException::withMessages(['version_label' => ['Ya existe una versión con esa etiqueta.']]);
        }
    }
}
