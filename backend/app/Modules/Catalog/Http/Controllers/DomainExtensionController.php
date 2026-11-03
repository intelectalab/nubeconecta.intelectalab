<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Http\Controllers;

use App\Modules\Catalog\Http\Resources\DomainExtensionResource;
use App\Modules\Catalog\Models\DomainExtension;
use App\Shared\Audit\AuditLogger;
use App\Shared\Concurrency\VersionGuard;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Organization\CurrentOrganization;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

final class DomainExtensionController
{
    public function __construct(private readonly AuditLogger $audit) {}

    public function index(Request $request): JsonResponse
    {
        $query = DomainExtension::query();
        foreach (['is_active', 'sellable_online'] as $filter) {
            $value = $request->query($filter);
            if ($value !== null && $value !== '') {
                $query->where($filter, is_string($value) && in_array(strtolower($value), ['true', 'false'], true) ? strtolower($value) === 'true' : $value);
            }
        }

        return CursorPagination::respond($query, $request, ['tld', 'sort_order', 'created_at', 'updated_at'], DomainExtensionResource::class, 'sort_order');
    }

    public function show(string $id): DomainExtensionResource
    {
        return new DomainExtensionResource(DomainExtension::query()->findOrFail($id));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules(null), ['tld.unique' => 'Ya existe una extensión con este TLD en la organización.']);
        try {
            $extension = DB::transaction(function () use ($data): DomainExtension {
                $extension = DomainExtension::query()->create($data);
                $this->audit->record('domain_extension.created', 'domain_extension', $extension->id, null, $extension->refresh()->attributesToArray());

                return $extension;
            });
        } catch (QueryException $exception) {
            if ($this->isUniqueViolation($exception)) {
                throw ProblemException::validation(['tld' => ['Ya existe una extensión con este TLD en la organización.']]);
            }
            throw $exception;
        }

        return (new DomainExtensionResource($extension))->response()->setStatusCode(201);
    }

    public function update(Request $request, string $id): DomainExtensionResource
    {
        $extension = DomainExtension::query()->findOrFail($id);
        $data = $request->validate(
            ['version' => ['required', 'integer', 'min:1']] + $this->rules($extension),
            ['tld.unique' => 'Ya existe una extensión con este TLD en la organización.'],
        );
        try {
            DB::transaction(function () use ($extension, $data): void {
                VersionGuard::check($extension, $data['version']);
                $before = $extension->attributesToArray();
                $extension->fill(array_intersect_key($data, array_flip($extension->getFillable())))->save();
                $this->audit->record('domain_extension.updated', 'domain_extension', $extension->id, $before, $extension->refresh()->attributesToArray());
            });
        } catch (QueryException $exception) {
            if ($this->isUniqueViolation($exception)) {
                throw ProblemException::validation(['tld' => ['Ya existe una extensión con este TLD en la organización.']]);
            }
            throw $exception;
        }

        return new DomainExtensionResource($extension);
    }

    public function destroy(string $id): Response
    {
        $extension = DomainExtension::query()->findOrFail($id);
        try {
            DB::transaction(function () use ($extension): void {
                $before = $extension->attributesToArray();
                $extension->delete();
                $this->audit->record('domain_extension.deleted', 'domain_extension', $extension->id, $before, null);
            });
        } catch (QueryException $exception) {
            if ($this->isForeignKeyViolation($exception)) {
                throw new ProblemException(409, 'domain_extension_in_use', 'No se puede eliminar: la extensión tiene precios o referencias; desactívela.');
            }
            throw $exception;
        }

        return response()->noContent();
    }

    private function rules(?DomainExtension $model): array
    {
        $org = app(CurrentOrganization::class)->id();
        $required = $model === null ? 'required' : 'sometimes';

        return [
            'tld' => [$required, 'string', 'regex:/^[a-z0-9.-]+$/', Rule::unique('domain_extensions', 'tld')->where('organization_id', $org)->ignore($model?->id)],
            'default_registrar_id' => [$required, 'uuid', Rule::exists('providers', 'id')->where('organization_id', $org)],
            'min_margin_percent' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'sellable_online' => ['sometimes', 'boolean'], 'allows_transfer_in' => ['sometimes', 'boolean'],
            'is_featured' => ['sometimes', 'boolean'], 'sort_order' => ['sometimes', 'integer', 'min:0'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }

    private function isUniqueViolation(QueryException $exception): bool
    {
        return (string) ($exception->errorInfo[0] ?? $exception->getCode()) === '23505';
    }

    private function isForeignKeyViolation(QueryException $exception): bool
    {
        return (string) ($exception->errorInfo[0] ?? $exception->getCode()) === '23503';
    }
}
