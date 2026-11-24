<?php

declare(strict_types=1);

namespace App\Modules\WebConnector\Http\Controllers;

use App\Modules\WebConnector\Http\Resources\WebFormResource;
use App\Modules\WebConnector\Models\WebForm;
use App\Modules\WebConnector\Models\WebFormField;
use App\Shared\Audit\AuditLogger;
use App\Shared\Concurrency\VersionGuard;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Organization\CurrentOrganization;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/** /api/v1/admin/web-connector/forms (web_connector.form.*): definición de formularios embebibles y sus campos. */
final class WebFormController
{
    public function __construct(private readonly AuditLogger $audit) {}

    public function index(Request $request): JsonResponse
    {
        $query = WebForm::query()->withCount('fields');
        foreach (['brand_id', 'status', 'destination'] as $column) {
            $value = $request->input("filter.{$column}");
            if (is_string($value) && $value !== '') {
                $query->where($column, $value);
            }
        }

        return CursorPagination::respond($query, $request, ['created_at', 'name', 'code', 'status'], WebFormResource::class);
    }

    public function show(string $id): WebFormResource
    {
        return new WebFormResource(WebForm::query()->with('fields')->findOrFail($id));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request, null);
        $form = DB::transaction(function () use ($data): WebForm {
            $form = new WebForm;
            $form->forceFill($this->formAttributes($data))->save();
            $this->syncFields($form, $data['fields']);
            $this->audit->record('web_form.created', 'web_form', $form->id, null, $form->refresh()->attributesToArray(), ['code' => $form->code]);

            return $form;
        });

        return (new WebFormResource($form->load('fields')))->response()->setStatusCode(201);
    }

    public function update(Request $request, string $id): WebFormResource
    {
        $form = WebForm::query()->findOrFail($id);
        $data = $this->validated($request, $form);

        DB::transaction(function () use ($form, $data): void {
            VersionGuard::check($form, $data['version']);
            $before = $form->attributesToArray();
            $form->forceFill($this->formAttributes($data))->save();
            $this->syncFields($form, $data['fields']);
            $this->audit->record('web_form.updated', 'web_form', $form->id, $before, $form->refresh()->attributesToArray());
        });

        return new WebFormResource($form->load('fields'));
    }

    public function destroy(string $id): JsonResponse
    {
        $form = WebForm::query()->findOrFail($id);
        DB::transaction(function () use ($form): void {
            $form->delete();
            $this->audit->record('web_form.deleted', 'web_form', $form->id, $form->attributesToArray(), null);
        });

        return response()->json(status: 204);
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, ?WebForm $form): array
    {
        $org = app(CurrentOrganization::class)->id();
        $required = $form === null ? 'required' : 'sometimes';
        $data = $request->validate([
            'version' => [$form === null ? 'sometimes' : 'required', 'integer'],
            'brand_id' => [$required, 'uuid', Rule::exists('brands', 'id')->where('organization_id', $org)->whereNull('deleted_at')],
            'code' => [$required, 'string', 'max:60', 'regex:/^[a-z0-9]+(-[a-z0-9]+)*$/', Rule::unique('web_forms', 'code')->where(fn ($q) => $q->where('organization_id', $org))->whereNull('deleted_at')->ignore($form?->id)],
            'name' => [$required, 'string', 'max:160'],
            'status' => ['sometimes', Rule::in(WebForm::STATUSES)],
            'destination' => [$required, Rule::in(WebForm::DESTINATIONS)],
            'lead_channel_id' => ['nullable', 'uuid'],
            'ticket_type' => ['nullable', Rule::in(['incident', 'request', 'question', 'billing', 'complaint', 'security'])],
            'ticket_department' => ['nullable', 'string', 'max:120'],
            'notify_email' => ['nullable', 'email', 'max:255'],
            'owner_user_id' => ['nullable', 'uuid', Rule::exists('users', 'id')->where('organization_id', $org)->whereNull('deleted_at')],
            'consent_required' => ['sometimes', 'boolean'],
            'consent_purpose' => ['nullable', Rule::in(['marketing', 'privacy'])],
            'consent_text' => ['sometimes', 'array'],
            'captcha_required' => ['sometimes', 'boolean'],
            'success_message' => ['sometimes', 'array'],
            'redirect_url' => ['nullable', 'url', 'max:500'],
            'fields' => [$required, 'array', 'min:1'],
            'fields.*.key' => ['required', 'string', 'regex:/^[a-z][a-z0-9_]*$/', 'max:50', 'distinct'],
            'fields.*.label' => ['required', 'array'],
            'fields.*.field_type' => ['required', Rule::in(WebFormField::TYPES)],
            'fields.*.is_required' => ['sometimes', 'boolean'],
            'fields.*.help_text' => ['sometimes', 'array'],
            'fields.*.options' => ['sometimes', 'array'],
            'fields.*.validation' => ['sometimes', 'array'],
            'fields.*.maps_to' => ['nullable', Rule::in(WebFormField::MAPS_TO)],
        ]);

        // Reglas de negocio reflejo de los CHECK de la base.
        $consent = $data['consent_required'] ?? $form?->consent_required ?? true;
        if ($consent && (empty($data['consent_purpose'] ?? $form?->consent_purpose) || empty($data['consent_text'] ?? $form?->consent_text))) {
            throw ValidationException::withMessages(['consent_text' => ['Con consentimiento obligatorio debe indicar el propósito y el texto de la casilla.']]);
        }
        $status = $data['status'] ?? $form?->status ?? 'draft';
        if ($status === 'active' && empty($data['success_message'] ?? $form?->success_message)) {
            throw ValidationException::withMessages(['success_message' => ['Un formulario activo necesita un mensaje de confirmación.']]);
        }
        foreach ($data['fields'] as $i => $field) {
            if (in_array($field['field_type'], ['select', 'checkboxes'], true) && empty($field['options'] ?? [])) {
                throw ValidationException::withMessages(["fields.{$i}.options" => ['Lista y casillas requieren al menos una opción.']]);
            }
        }

        return $data;
    }

    /** @param array<string, mixed> $data @return array<string, mixed> */
    private function formAttributes(array $data): array
    {
        $keys = ['brand_id', 'code', 'name', 'status', 'destination', 'lead_channel_id', 'ticket_type', 'ticket_department', 'notify_email', 'owner_user_id', 'consent_required', 'consent_purpose', 'consent_text', 'captcha_required', 'success_message', 'redirect_url'];

        return array_intersect_key($data, array_flip($keys));
    }

    /** Reemplaza los campos del formulario (borra y recrea; evita choques de clave/posición únicas). */
    private function syncFields(WebForm $form, array $fields): void
    {
        WebFormField::query()->where('web_form_id', $form->id)->delete();
        foreach (array_values($fields) as $position => $field) {
            WebFormField::query()->create([
                'web_form_id' => $form->id,
                'key' => $field['key'],
                'label' => $field['label'],
                'help_text' => $field['help_text'] ?? [],
                'field_type' => $field['field_type'],
                'is_required' => $field['is_required'] ?? false,
                'options' => $field['options'] ?? [],
                'validation' => $field['validation'] ?? [],
                'maps_to' => $field['maps_to'] ?? null,
                'position' => $position,
            ]);
        }
    }
}
