<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Http\Controllers;

use App\Modules\Catalog\Http\Resources\ServiceTypeResource;
use App\Modules\Catalog\Models\ServiceType;
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

final class ServiceTypeController
{
    private const COMPONENT_KINDS = ['server', 'hosting', 'domain', 'dns', 'cdn', 'email', 'bulk_email', 'ssl_certificate', 'database', 'storage', 'wordpress_site', 'custom_system', 'moodle_platform', 'license', 'other'];

    public function __construct(private readonly AuditLogger $audit) {}

    public function index(Request $request): JsonResponse
    {
        $query = ServiceType::query()->with('fields');
        foreach (['status', 'category_id'] as $filter) {
            $value = $request->query($filter);
            if ($value !== null && $value !== '') {
                $query->where($filter, $value);
            }
        }

        return CursorPagination::respond($query, $request, ['code', 'created_at', 'updated_at'], ServiceTypeResource::class, '-created_at');
    }

    public function show(string $id): ServiceTypeResource
    {
        return new ServiceTypeResource(ServiceType::query()->with('fields')->findOrFail($id));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules($request, null));
        $data['status'] = 'draft';
        $data['brand_ids'] ??= [];
        $data['description'] ??= [];
        $data['delivery_tasks'] ??= [];
        $data['portal_fields'] ??= [];
        try {
            $serviceType = DB::transaction(function () use ($data): ServiceType {
                $serviceType = ServiceType::query()->create($data);
                $this->audit->record('service_type.created', 'service_type', $serviceType->id, null, $serviceType->refresh()->attributesToArray());
                return $serviceType;
            });
        } catch (QueryException $exception) {
            $this->translateDatabaseException($exception, 'code');
            throw $exception;
        }
        return (new ServiceTypeResource($serviceType->load('fields')))->response()->setStatusCode(201);
    }

    public function update(Request $request, string $id): ServiceTypeResource
    {
        $serviceType = ServiceType::query()->findOrFail($id);
        $data = $request->validate(['version' => ['required', 'integer', 'min:1']] + $this->rules($request, $serviceType));
        try {
            DB::transaction(function () use ($serviceType, $data): void {
                VersionGuard::check($serviceType, $data['version']);
                $before = $serviceType->attributesToArray();
                $serviceType->fill(array_intersect_key($data, array_flip($serviceType->getFillable())))->save();
                $this->audit->record('service_type.updated', 'service_type', $serviceType->id, $before, $serviceType->refresh()->attributesToArray());
            });
        } catch (QueryException $exception) {
            $this->translateDatabaseException($exception, 'code');
            throw $exception;
        }
        return new ServiceTypeResource($serviceType->load('fields'));
    }

    public function destroy(string $id): Response
    {
        $serviceType = ServiceType::query()->findOrFail($id);
        try {
            DB::transaction(function () use ($serviceType): void {
                $before = $serviceType->attributesToArray();
                $serviceType->delete();
                $this->audit->record('service_type.deleted', 'service_type', $serviceType->id, $before, null);
            });
        } catch (QueryException $exception) {
            if ($this->isForeignKeyViolation($exception)) {
                throw new ProblemException(409, 'service_type_in_use', 'No se puede eliminar: el tipo tiene dependencias; archívelo');
            }
            throw $exception;
        }
        return response()->noContent();
    }

    public function activate(Request $request, string $id): ServiceTypeResource
    {
        $serviceType = ServiceType::query()->findOrFail($id);
        $data = $request->validate(['version' => ['required', 'integer', 'min:1']]);
        if (count($serviceType->brand_ids ?? []) < 1) {
            throw ProblemException::validation(['brand_ids' => ['Agregue al menos una marca antes de activar el tipo de servicio.']]);
        }
        DB::transaction(function () use ($serviceType, $data): void {
            VersionGuard::check($serviceType, $data['version']);
            $before = $serviceType->attributesToArray();
            $serviceType->status = 'active';
            $serviceType->activated_at = now();
            $serviceType->save();
            $this->audit->record('service_type.activated', 'service_type', $serviceType->id, $before, $serviceType->refresh()->attributesToArray());
        });
        return new ServiceTypeResource($serviceType->load('fields'));
    }

    public function archive(Request $request, string $id): ServiceTypeResource
    {
        $serviceType = ServiceType::query()->findOrFail($id);
        $data = $request->validate(['version' => ['required', 'integer', 'min:1']]);
        DB::transaction(function () use ($serviceType, $data): void {
            VersionGuard::check($serviceType, $data['version']);
            $before = $serviceType->attributesToArray();
            $serviceType->status = 'archived';
            $serviceType->archived_at = now();
            $serviceType->save();
            $this->audit->record('service_type.archived', 'service_type', $serviceType->id, $before, $serviceType->refresh()->attributesToArray());
        });
        return new ServiceTypeResource($serviceType->load('fields'));
    }

    private function rules(Request $request, ?ServiceType $model): array
    {
        $org = app(CurrentOrganization::class)->id();
        $required = $model === null ? 'required' : 'sometimes';
        return [
            'code' => [$required, 'string', 'regex:/^[a-z0-9]+(-[a-z0-9]+)*$/', Rule::unique('service_types', 'code')->where('organization_id', $org)->ignore($model?->id)],
            'status' => ['prohibited'], 'activated_at' => ['prohibited'], 'archived_at' => ['prohibited'],
            'name' => [$required, 'array'], 'name.es' => [$model === null ? 'required' : 'required_with:name', 'string', 'min:1'], 'name.en' => ['sometimes', 'string'],
            'description' => ['sometimes', 'array'], 'description.es' => ['sometimes', 'string'], 'description.en' => ['sometimes', 'string'],
            'icon' => ['sometimes', 'nullable', 'string'],
            'category_id' => [$required, 'uuid', Rule::exists('product_categories', 'id')->where('organization_id', $org)],
            'brand_ids' => ['sometimes', 'array'], 'brand_ids.*' => ['uuid', Rule::exists('brands', 'id')->where('organization_id', $org)],
            'sale_mode' => ['sometimes', Rule::in(['online', 'quote_only'])], 'requires_contract' => ['sometimes', 'boolean'],
            'default_provider_id' => ['sometimes', 'nullable', 'uuid', Rule::exists('providers', 'id')->where('organization_id', $org)],
            'component_kind' => ['sometimes', 'nullable', Rule::in(self::COMPONENT_KINDS)],
            'delivery_tasks' => ['sometimes', 'array'], 'delivery_tasks.*.title' => ['required_with:delivery_tasks.*', 'array'],
            'delivery_tasks.*.title.es' => ['required_with:delivery_tasks.*.title', 'string', 'min:1'],
            'delivery_tasks.*.title.en' => ['sometimes', 'nullable', 'string'], 'delivery_tasks.*.role' => ['sometimes', 'nullable', 'string'],
            'delivery_tasks.*.due_days' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'delivery_tasks.*.checklist' => ['sometimes', 'array'], 'delivery_tasks.*.checklist.*' => ['string'],
            'portal_fields' => ['sometimes', 'array'], 'portal_fields.*' => ['string', 'regex:/^[a-z][a-z0-9_]*$/'],
        ];
    }

    private function translateDatabaseException(QueryException $exception, string $field): void
    {
        if ($this->isUniqueViolation($exception)) {
            throw ProblemException::validation([$field => ['Ya existe un tipo de servicio con este código.']]);
        }
        if ($this->isForeignKeyViolation($exception)) {
            throw ProblemException::validation(['category_id' => ['La referencia indicada no es válida para esta organización.']]);
        }
    }

    private function isUniqueViolation(QueryException $exception): bool
    {
        return in_array((string) ($exception->errorInfo[0] ?? $exception->getCode()), ['23000', '23505'], true);
    }

    private function isForeignKeyViolation(QueryException $exception): bool
    {
        return (string) ($exception->errorInfo[0] ?? $exception->getCode()) === '23503';
    }
}
