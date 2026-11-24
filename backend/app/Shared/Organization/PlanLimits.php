<?php

declare(strict_types=1);

namespace App\Shared\Organization;

use App\Shared\Http\Problem\ProblemException;
use Illuminate\Support\Facades\DB;

/**
 * Límites del plan SaaS por inquilino (multitenancy Fase 3). Cuenta el uso real
 * y lo compara con el tope del plan de la organización antes de crear recursos.
 *
 * Decidido por tablas (no por modelos) para no acoplar Shared a los módulos.
 * `NULL` en un límite = ilimitado. La organización operadora (o sin plan) no
 * tiene topes. Métricas: `staff_users`, `customers`, `services`.
 */
final class PlanLimits
{
    public const METRICS = ['staff_users', 'customers', 'services'];

    /** Etiqueta en español por métrica, para el mensaje de error. */
    private const LABEL = ['staff_users' => 'usuarios internos', 'customers' => 'clientes', 'services' => 'servicios'];

    public function __construct(private readonly CurrentOrganization $current) {}

    /**
     * Uso actual del inquilino por métrica.
     *
     * @return array{staff_users:int, customers:int, services:int}
     */
    public function usage(string $orgId): array
    {
        return [
            'staff_users' => (int) DB::table('users')->where('organization_id', $orgId)->where('type', 'staff')->whereNull('deleted_at')->count(),
            'customers' => (int) DB::table('customers')->where('organization_id', $orgId)->whereNull('deleted_at')->count(),
            'services' => (int) DB::table('services')->where('organization_id', $orgId)->whereNull('deleted_at')->count(),
        ];
    }

    /**
     * Topes del plan del inquilino (NULL = ilimitado). Operadora o sin plan → todo NULL.
     *
     * @return array{staff_users:?int, customers:?int, services:?int}
     */
    public function limits(string $orgId): array
    {
        $row = DB::table('organizations as o')
            ->leftJoin('saas_plans as p', 'p.id', '=', 'o.saas_plan_id')
            ->where('o.id', $orgId)
            ->first(['o.is_operator', 'p.max_staff_users', 'p.max_customers', 'p.max_services']);

        if ($row === null || $row->is_operator) {
            return ['staff_users' => null, 'customers' => null, 'services' => null];
        }

        return [
            'staff_users' => $row->max_staff_users === null ? null : (int) $row->max_staff_users,
            'customers' => $row->max_customers === null ? null : (int) $row->max_customers,
            'services' => $row->max_services === null ? null : (int) $row->max_services,
        ];
    }

    /**
     * Lanza 422 `plan_limit_reached` si crear `$incoming` recursos de `$metric`
     * superaría el tope del plan del inquilino. Sin plan/ilimitado → no hace nada.
     */
    public function assertCanAdd(string $metric, int $incoming = 1, ?string $orgId = null): void
    {
        $orgId ??= $this->current->id();
        $limit = $this->limits($orgId)[$metric] ?? null;
        if ($limit === null) {
            return;
        }
        $used = $this->usage($orgId)[$metric];
        if ($used + $incoming > $limit) {
            $label = self::LABEL[$metric] ?? $metric;
            throw new ProblemException(
                422,
                'plan_limit_reached',
                "El plan de este inquilino permite hasta {$limit} {$label} (en uso: {$used}). Actualiza el plan para agregar más.",
                ['metric' => $metric, 'limit' => $limit, 'used' => $used],
            );
        }
    }
}
