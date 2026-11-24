<?php

declare(strict_types=1);

namespace App\Modules\Tenancy\Http\Controllers;

use App\Modules\Identity\Models\Organization;
use App\Modules\Tenancy\Http\Resources\TenantResource;
use App\Modules\Tenancy\Services\TenantProvisioner;
use App\Shared\Audit\AuditLogger;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Organization\PlanLimits;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Gestión de inquilinos por el operador (multitenancy Fase 1). Las consultas
 * son cross-organización a propósito: `organizations` no lleva filtro por
 * organización (es la raíz). El acceso lo restringe el middleware `operator`
 * (solo la organización operadora) + el permiso `tenancy.*`.
 */
final class TenantController
{
    public function __construct(
        private readonly TenantProvisioner $provisioner,
        private readonly AuditLogger $audit,
    ) {}

    public function index(Request $request): JsonResponse
    {
        // Uso por inquilino en una sola consulta (subconsultas correlacionadas, sin N+1).
        $query = Organization::query()->where('is_operator', false)->with('saasPlan')
            ->select('organizations.*')
            ->addSelect([
                'usage_staff' => DB::table('users')->selectRaw('count(*)')->whereColumn('users.organization_id', 'organizations.id')->where('type', 'staff')->whereNull('deleted_at'),
                'usage_customers' => DB::table('customers')->selectRaw('count(*)')->whereColumn('customers.organization_id', 'organizations.id')->whereNull('deleted_at'),
                'usage_services' => DB::table('services')->selectRaw('count(*)')->whereColumn('services.organization_id', 'organizations.id')->whereNull('deleted_at'),
            ]);

        return CursorPagination::respond($query, $request, ['created_at', 'name', 'slug', 'status'], TenantResource::class);
    }

    public function show(string $id): TenantResource
    {
        $org = Organization::query()->where('is_operator', false)->with('saasPlan')->findOrFail($id);
        $org->setAttribute('usage', app(PlanLimits::class)->usage($org->id));

        return new TenantResource($org);
    }

    /** Renueva la suscripción: nueva fecha de vencimiento y reactiva al inquilino. */
    public function renew(Request $request, string $id): TenantResource
    {
        $data = $request->validate(['saas_renewal_date' => ['required', 'date', 'after:today']]);
        $org = $this->tenant($id);
        $org->forceFill(['status' => 'active', 'saas_status' => 'active', 'saas_renewal_date' => $data['saas_renewal_date']])->save();
        $this->audit->record('tenant.renewed', 'organization', $org->id, null, ['saas_renewal_date' => $data['saas_renewal_date']]);

        return new TenantResource($org->refresh()->load('saasPlan'));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:160'],
            'slug' => ['required', 'string', 'max:60', 'regex:/^[a-z0-9\-]+$/', Rule::unique('organizations', 'slug')->whereNull('deleted_at')],
            'subdomain' => ['nullable', 'string', 'max:41', 'regex:/^[a-z0-9][a-z0-9-]{0,40}$/', Rule::unique('organizations', 'subdomain')->whereNull('deleted_at')],
            'country' => ['sometimes', 'string', 'size:2'],
            'saas_plan_id' => ['nullable', 'uuid', Rule::exists('saas_plans', 'id')->where(fn ($q) => $q->where('organization_id', $this->operatorOrgId())->where('status', 'active')->whereNull('deleted_at'))],
            'saas_renewal_date' => ['nullable', 'date'],
            'admin_name' => ['required', 'string', 'max:160'],
            'admin_email' => ['required', 'string', 'email', 'max:255'],
        ]);

        // Correo único en todo el sistema (Opción A): comprobación global y explícita.
        if (DB::table('users')->whereRaw('lower(email) = ?', [mb_strtolower($data['admin_email'])])->whereNull('deleted_at')->exists()) {
            throw ValidationException::withMessages(['admin_email' => [__('validation.unique', ['attribute' => 'admin_email'])]]);
        }

        $result = $this->provisioner->create($data);
        $org = $result['organization'];

        $this->audit->record('tenant.created', 'organization', $org->id, null,
            ['name' => $org->name, 'slug' => $org->slug],
            ['admin_email' => $result['admin']->email]);

        return (new TenantResource($org->load('saasPlan')))
            ->additional(['meta' => [
                'admin' => ['id' => $result['admin']->id, 'email' => $result['admin']->email],
                // Se muestra UNA sola vez; el admin debe cambiarla al entrar.
                'temporary_password' => $result['temporary_password'],
            ]])
            ->response()->setStatusCode(201);
    }

    public function suspend(string $id): TenantResource
    {
        $org = $this->tenant($id);
        $org->forceFill(['status' => 'suspended', 'saas_status' => 'suspended'])->save();
        // Corta las sesiones activas de los usuarios del inquilino (cierre inmediato).
        DB::table('user_sessions')->where('organization_id', $org->id)->whereNull('revoked_at')
            ->update(['revoked_at' => now(), 'updated_at' => now()]);
        $this->audit->record('tenant.suspended', 'organization', $org->id);

        return new TenantResource($org->refresh()->load('saasPlan'));
    }

    public function reactivate(string $id): TenantResource
    {
        $org = $this->tenant($id);
        $org->forceFill(['status' => 'active', 'saas_status' => 'active'])->save();
        $this->audit->record('tenant.reactivated', 'organization', $org->id);

        return new TenantResource($org->refresh()->load('saasPlan'));
    }

    public function changePlan(Request $request, string $id): TenantResource
    {
        $data = $request->validate([
            'saas_plan_id' => ['required', 'uuid', Rule::exists('saas_plans', 'id')->where(fn ($q) => $q->where('organization_id', $this->operatorOrgId())->where('status', 'active')->whereNull('deleted_at'))],
        ]);
        $org = $this->tenant($id);
        $org->update(['saas_plan_id' => $data['saas_plan_id']]);
        $this->audit->record('tenant.plan_changed', 'organization', $org->id, null, ['saas_plan_id' => $data['saas_plan_id']]);

        return new TenantResource($org->refresh()->load('saasPlan'));
    }

    /** Un inquilino existente (nunca la propia operadora). */
    private function tenant(string $id): Organization
    {
        $org = Organization::query()->findOrFail($id);
        if ($org->is_operator) {
            throw ProblemException::forbidden('La organización operadora no es un inquilino gestionable.');
        }

        return $org;
    }

    private function operatorOrgId(): string
    {
        return app(\App\Shared\Organization\CurrentOrganization::class)->id();
    }
}
