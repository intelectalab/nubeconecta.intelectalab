<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Http\Controllers;

use App\Modules\Catalog\Http\Resources\ServiceTypeFieldResource;
use App\Modules\Catalog\Models\ServiceType;
use App\Shared\Audit\AuditLogger;
use App\Shared\Concurrency\VersionGuard;
use App\Shared\Http\Problem\ProblemException;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

final class ServiceTypeFieldController
{
    public function __construct(private readonly AuditLogger $audit) {}

    public function index(string $serviceTypeId): JsonResponse
    {
        $serviceType = ServiceType::query()->findOrFail($serviceTypeId);
        return ServiceTypeFieldResource::collection($serviceType->fields()->get())->response();
    }

    public function store(Request $request, string $serviceTypeId): JsonResponse
    {
        $serviceType = ServiceType::query()->findOrFail($serviceTypeId);
        $data = $request->validate($this->rules($serviceType, true));
        $this->validateOptions($data['field_type'], $data['options'] ?? null);
        if ($data['field_type'] !== 'select') {
            $data['options'] = [];
        }
        // `position` es NOT NULL sin default en el esquema: si no se envía, se agrega al final.
        if (! array_key_exists('position', $data)) {
            $data['position'] = (int) $serviceType->fields()->max('position') + 1;
        }
        try {
            $field = DB::transaction(function () use ($serviceType, $data) {
                $field = $serviceType->fields()->create($data);
                $this->audit->record('service_type_field.created', 'service_type_field', $field->id, null, $field->refresh()->attributesToArray());
                return $field;
            });
        } catch (QueryException $exception) {
            if ($this->isUniqueViolation($exception)) {
                throw ProblemException::validation(['key' => ['Ya existe un campo con esta clave para el tipo de servicio.']]);
            }
            throw $exception;
        }
        return (new ServiceTypeFieldResource($field))->response()->setStatusCode(201);
    }

    public function update(Request $request, string $serviceTypeId, string $fieldId): ServiceTypeFieldResource
    {
        $serviceType = ServiceType::query()->findOrFail($serviceTypeId);
        $field = $serviceType->fields()->findOrFail($fieldId);
        $data = $request->validate(['version' => ['required', 'integer', 'min:1']] + $this->rules($serviceType, false));
        $effectiveType = $field->field_type;
        $effectiveOptions = $data['options'] ?? $field->options;
        $this->validateOptions($effectiveType, $effectiveOptions);
        if ($effectiveType !== 'select') {
            $data['options'] = [];
        }
        try {
            DB::transaction(function () use ($field, $data): void {
                VersionGuard::check($field, $data['version']);
                $before = $field->attributesToArray();
                $field->fill(array_intersect_key($data, array_flip($field->getFillable())))->save();
                $this->audit->record('service_type_field.updated', 'service_type_field', $field->id, $before, $field->refresh()->attributesToArray());
            });
        } catch (QueryException $exception) {
            if ($this->isForeignKeyViolation($exception)) {
                throw new ProblemException(409, 'service_type_field_in_use', 'El campo tiene valores; desactívelo con is_active=false');
            }
            throw $exception;
        }
        return new ServiceTypeFieldResource($field);
    }

    public function destroy(string $serviceTypeId, string $fieldId): Response
    {
        $serviceType = ServiceType::query()->findOrFail($serviceTypeId);
        $field = $serviceType->fields()->findOrFail($fieldId);
        try {
            DB::transaction(function () use ($field): void {
                $before = $field->attributesToArray();
                $field->delete();
                $this->audit->record('service_type_field.deleted', 'service_type_field', $field->id, $before, null);
            });
        } catch (QueryException $exception) {
            if ($this->isForeignKeyViolation($exception)) {
                throw new ProblemException(409, 'service_type_field_in_use', 'El campo tiene valores; desactívelo con is_active=false');
            }
            throw $exception;
        }
        return response()->noContent();
    }

    private function rules(ServiceType $serviceType, bool $creating): array
    {
        $required = $creating ? 'required' : 'sometimes';
        return [
            'key' => $creating ? [$required, 'string', 'regex:/^[a-z][a-z0-9_]*$/', Rule::unique('service_type_fields', 'key')->where('service_type_id', $serviceType->id)] : ['prohibited'],
            'label' => [$required, 'array'], 'label.es' => [$creating ? 'required' : 'required_with:label', 'string', 'min:1'], 'label.en' => ['sometimes', 'nullable', 'string'],
            'help_text' => ['sometimes', 'array'], 'help_text.es' => ['sometimes', 'nullable', 'string'], 'help_text.en' => ['sometimes', 'nullable', 'string'],
            'field_type' => [$creating ? 'required' : 'prohibited', Rule::in(['text', 'number', 'select', 'date', 'file', 'checkbox'])],
            'options' => ['sometimes', 'array'], 'validation' => ['sometimes', 'array'],
            'is_required' => ['sometimes', 'boolean'], 'filled_by' => ['sometimes', Rule::in(['customer', 'staff'])],
            'position' => ['sometimes', 'integer', 'min:0', 'max:32767'], 'is_active' => ['sometimes', 'boolean'],
        ];
    }

    private function validateOptions(string $fieldType, mixed $options): void
    {
        if ($fieldType === 'select' && (! is_array($options) || count($options) < 1)) {
            throw ProblemException::validation(['options' => ['Los campos select requieren al menos una opción.']]);
        }
        if ($fieldType !== 'select' && is_array($options) && count($options) > 0) {
            throw ProblemException::validation(['options' => ['Los campos que no son select deben tener options vacío.']]);
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
