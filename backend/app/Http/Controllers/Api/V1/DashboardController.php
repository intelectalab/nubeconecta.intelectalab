<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Modules\Billing\Services\CollectionsService;
use App\Modules\Services\Models\Service;
use App\Modules\Services\Models\Subscription;
use App\Modules\Services\Support\Cycle;
use App\Modules\Support\Models\Ticket;
use App\Shared\Contracts\AccessControl;
use App\Shared\Http\Problem\ProblemException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * GET /api/v1/admin/dashboard
 *
 * KPIs agregados del panel de inicio en una sola llamada. Cada métrica solo se
 * incluye si el usuario tiene el permiso que la gobierna (las demás se omiten).
 * `brand_id` (uuid, opcional) acota mrr, services_due_30 y tickets; `receivable`
 * es siempre de toda la organización (el aging no filtra por marca).
 * Todos los modelos traen el scope global de organización.
 */
final class DashboardController extends Controller
{
    public function __invoke(Request $request, AccessControl $access, CollectionsService $collections): JsonResponse
    {
        $user = $request->user();
        // Mismos gates previos que PermissionGate: quien debe cambiar contraseña o
        // enrolar MFA no accede a datos del panel (aquí también, aunque no usemos el
        // middleware `permission:`), para no filtrar KPIs financieros en ese estado.
        if ($access->mustChangePassword($user)) {
            throw new ProblemException(403, 'password_change_required');
        }
        if ($access->mustEnrollMfa($user)) {
            throw ProblemException::mfaRequired();
        }

        $brand = $request->query('brand_id');
        $brandId = is_string($brand) && Str::isUuid($brand) ? $brand : null;

        $data = [];
        if ($access->allows($user, 'services.service.view')) {
            $data['services_due_30'] = $this->servicesDue30($brandId);
        }
        // El MRR es dato financiero (ingreso recurrente de la empresa): se gobierna
        // con billing.invoice.view, igual que `receivable`. Así solo lo ve el personal
        // de facturación/cobranza, el admin y el superadmin; no la operación.
        if ($access->allows($user, 'billing.invoice.view')) {
            $data['mrr'] = $this->mrr($brandId);
            $data['receivable'] = $this->receivable($collections);
        }
        if ($access->allows($user, 'helpdesk.ticket.view')) {
            $data['tickets'] = $this->tickets($brandId);
        }

        return response()->json(['data' => $data]);
    }

    /**
     * Ingreso recurrente mensual equivalente por moneda: suma de
     * price_minor * quantity / meses(ciclo) de las suscripciones activas cuyo
     * servicio está activo y no eliminado.
     *
     * @return list<array{currency: string, amount_minor: int}>
     */
    public function mrr(?string $brandId): array
    {
        $rows = Subscription::query()
            ->where('status', 'active')
            ->whereIn('cycle', array_keys(Cycle::MONTHS))
            ->whereHas('service', fn ($q) => $q->where('status', 'active')->when($brandId, fn ($q) => $q->where('brand_id', $brandId)))
            ->selectRaw('currency, cycle, SUM(price_minor * quantity) as gross')
            ->groupBy('currency', 'cycle')
            ->get();

        $byCurrency = [];
        foreach ($rows as $row) {
            $currency = trim((string) $row->currency);
            $byCurrency[$currency] = ($byCurrency[$currency] ?? 0.0) + ((float) $row->gross / Cycle::MONTHS[$row->cycle]);
        }
        ksort($byCurrency);

        $out = [];
        foreach ($byCurrency as $currency => $amount) {
            $out[] = ['currency' => (string) $currency, 'amount_minor' => (int) round($amount)];
        }

        return $out;
    }

    /** Servicios activos con vencimiento comercial entre hoy y hoy+30 (inclusive). */
    private function servicesDue30(?string $brandId): int
    {
        return Service::query()
            ->where('status', 'active')
            ->whereBetween('commercial_due_date', [now()->toDateString(), now()->addDays(30)->toDateString()])
            ->when($brandId, fn ($q) => $q->where('brand_id', $brandId))
            ->count();
    }

    /**
     * Por cobrar y vencido por moneda, reutilizando el aging de cobranza
     * (mismo agregado por moneda que /admin/collections/aging meta.totals).
     *
     * @return list<array{currency: string, total_minor: int, overdue_minor: int}>
     */
    private function receivable(CollectionsService $collections): array
    {
        $totals = [];
        foreach ($collections->aging() as $row) {
            $cur = $row['currency'];
            $totals[$cur] ??= ['currency' => $cur, 'total_minor' => 0, 'overdue_minor' => 0];
            $totals[$cur]['total_minor'] += $row['total_minor'];
            $totals[$cur]['overdue_minor'] += $row['overdue_minor'];
        }

        return array_values($totals);
    }

    /** @return array{open: int, overdue_sla: int, unassigned: int} */
    private function tickets(?string $brandId): array
    {
        $open = fn () => Ticket::query()
            ->whereNotIn('status', ['resolved', 'closed'])
            ->when($brandId, fn ($q) => $q->where('brand_id', $brandId));

        return [
            'open' => $open()->count(),
            'overdue_sla' => $open()->where('resolution_due_at', '<', now())->count(),
            'unassigned' => $open()->whereNull('assignee_id')->count(),
        ];
    }
}
