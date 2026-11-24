<?php

declare(strict_types=1);

namespace App\Modules\Tenancy\Http\Controllers;

use App\Modules\Tenancy\Http\Resources\SaasPlanResource;
use App\Modules\Tenancy\Models\SaasPlan;
use App\Shared\Audit\AuditLogger;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

/**
 * Planes de la suscripción SaaS (multitenancy Fase 1). Scopeados a la
 * organización operadora por el filtro global; solo accesibles a través del
 * grupo de rutas con el middleware `operator`.
 */
final class SaasPlanController
{
    public function __construct(
        private readonly AuditLogger $audit,
        private readonly CurrentOrganization $organization,
    ) {}

    public function index(): AnonymousResourceCollection
    {
        return SaasPlanResource::collection(SaasPlan::query()->orderBy('name')->get());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules());
        $plan = SaasPlan::query()->create($data);
        $this->audit->record('saas_plan.created', 'saas_plan', $plan->id, null, ['code' => $plan->code, 'name' => $plan->name]);

        return (new SaasPlanResource($plan))->response()->setStatusCode(201);
    }

    public function update(Request $request, string $id): SaasPlanResource
    {
        $plan = SaasPlan::query()->findOrFail($id);
        $plan->update($request->validate($this->rules($plan->id)));

        return new SaasPlanResource($plan->refresh());
    }

    public function archive(string $id): SaasPlanResource
    {
        $plan = SaasPlan::query()->findOrFail($id);
        $plan->update(['status' => 'archived']);
        $this->audit->record('saas_plan.archived', 'saas_plan', $plan->id);

        return new SaasPlanResource($plan->refresh());
    }

    /** @return array<string, mixed> */
    private function rules(?string $ignoreId = null): array
    {
        return [
            'code' => [
                'required', 'string', 'max:50', 'regex:/^[a-z0-9_\-]+$/',
                Rule::unique('saas_plans', 'code')
                    ->where(fn ($q) => $q->where('organization_id', $this->organization->id())->whereNull('deleted_at'))
                    ->ignore($ignoreId),
            ],
            'name' => ['required', 'string', 'max:120'],
            'price_minor' => ['required', 'integer', 'min:0'],
            'currency' => ['required', Rule::in(['PEN', 'USD'])],
            'max_staff_users' => ['nullable', 'integer', 'min:1'],
            'max_customers' => ['nullable', 'integer', 'min:1'],
            'max_services' => ['nullable', 'integer', 'min:1'],
            'status' => ['sometimes', Rule::in(SaasPlan::STATUSES)],
        ];
    }
}
