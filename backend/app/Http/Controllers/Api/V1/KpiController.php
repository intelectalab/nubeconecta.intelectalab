<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Modules\Billing\Models\Invoice;
use App\Modules\Billing\Models\Payment;
use App\Modules\Billing\Services\PaymentService;
use App\Modules\Domains\Models\Domain;
use App\Modules\Sales\Models\Lead;
use App\Modules\Services\Models\Service;
use App\Modules\Support\Models\Complaint;
use App\Modules\Support\Models\Ticket;
use App\Shared\Contracts\AccessControl;
use App\Shared\Http\Problem\ProblemException;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * GET /api/v1/admin/kpis
 *
 * Valores REALES de un subconjunto conservador de indicadores del Panel de
 * indicadores, indexados por el id del KPI del front (data/kpi.ts). Solo se
 * incluyen los que tienen un cálculo claro; el resto sigue ilustrativo en la SPA.
 *
 * - Indicadores de flujo: mes calendario en curso (UTC). Indicadores de stock: hoy.
 * - Sin filtros por marca/categoría/responsable: siempre toda la organización
 *   (los modelos traen el scope global de organización).
 * - Montos en soles (unidad mayor). Si hay importes en otra moneda, el indicador
 *   monetario se OMITE (no hay conversión defendible): nunca se suman monedas.
 * - Cada clave solo aparece si el usuario tiene el permiso de su fuente.
 */
final class KpiController extends Controller
{
    public function __invoke(Request $request, AccessControl $access, DashboardController $dashboard): JsonResponse
    {
        $user = $request->user();
        if ($access->mustChangePassword($user)) {
            throw new ProblemException(403, 'password_change_required');
        }
        if ($access->mustEnrollMfa($user)) {
            throw ProblemException::mfaRequired();
        }

        $now = now()->utc();
        $today = $now->toDateString();
        $from = $now->copy()->startOfMonth();
        $to = $now->copy()->endOfMonth();
        $asOf = $now->toIso8601String();
        $data = [];
        $put = function (string $id, int|float|null $value) use (&$data, $asOf): void {
            if ($value !== null) {
                $data[$id] = ['value' => $value, 'as_of' => $asOf];
            }
        };

        if ($access->allows($user, 'billing.invoice.view')) {
            // Facturado: comprobantes emitidos del mes (sin notas de crédito, borradores ni anulados).
            $put('facturado', $this->penMajor($this->sumByCurrency(
                Invoice::query()->whereIn('type', ['invoice', 'receipt', 'debit_note'])
                    ->whereIn('status', ['issued', 'partially_paid', 'paid', 'overdue'])
                    ->whereBetween('issue_date', [$from->toDateString(), $to->toDateString()]),
                'total_minor',
            )));

            // Cobranza: mismo universo que el aging de Inicio (saldo abierto con importe pendiente).
            $open = fn () => Invoice::query()->whereIn('status', PaymentService::OPEN_STATUSES)->where('balance_minor', '>', 0)->whereNotNull('due_date');
            $put('vencido', $this->penMajor($this->sumByCurrency($open()->where('due_date', '<', $today), 'balance_minor')));
            $put('porvencer', $this->penMajor($this->sumByCurrency(
                $open()->whereBetween('due_date', [$today, $now->copy()->addDays(30)->toDateString()]),
                'balance_minor',
            )));

            // MRR y ARR (ARR = MRR × 12): mismo cálculo que el panel de Inicio.
            $mrr = $dashboard->mrr(null);
            $foreign = array_filter($mrr, fn (array $r) => $r['currency'] !== 'PEN' && $r['amount_minor'] > 0);
            if ($foreign === []) {
                $pen = 0;
                foreach ($mrr as $r) {
                    $pen += $r['currency'] === 'PEN' ? $r['amount_minor'] : 0;
                }
                $put('mrr', $pen / 100);
                $put('arr', $pen * 12 / 100);
            }
        }

        if ($access->allows($user, 'billing.payment.view')) {
            // Cobrado: pagos validados cuya validación cae en el mes (los anulados quedan `rejected`).
            $validated = fn () => Payment::query()->where('status', 'validated')->whereBetween('validated_at', [$from, $to]);
            $put('cobrado', $this->penMajor($this->sumByCurrency($validated(), 'amount_minor')));
            // Vouchers validados: pagos por transferencia/depósito (no pasarela de tarjeta) validados en el mes.
            $put('vouch', $validated()->whereHas('method', fn ($q) => $q->where('kind', '!=', 'card_gateway'))->count());
        }

        if ($access->allows($user, 'sales.lead.view')) {
            $put('embudo', $this->penMajor($this->sumByCurrency(Lead::query()->where('status', 'open'), 'estimated_amount_minor')));
            $put('ganados', Lead::query()->where('status', 'won')->whereBetween('converted_at', [$from, $to])->count());
        }

        if ($access->allows($user, 'helpdesk.ticket.view')) {
            $put('tkab', Ticket::query()->whereNotIn('status', ['resolved', 'closed'])->count());
        }

        if ($access->allows($user, 'services.service.view')) {
            $put('activos', Service::query()->where('status', 'active')->whereNotNull('customer_id')->distinct()->count('customer_id'));
        }

        if ($access->allows($user, 'domains.domain.view')) {
            $put('domv', Domain::query()->where('status', 'active')
                ->whereBetween('registry_expires_at', [$today, $now->copy()->addDays(30)->toDateString()])->count());
        }

        if ($access->allows($user, 'helpdesk.complaint.view')) {
            $put('rrec', Complaint::query()->where('is_test', false)->whereBetween('received_at', [$from, $to])->count());
        }

        return response()->json(['data' => $data]);
    }

    /**
     * Suma por moneda (céntimos).
     *
     * @param  Builder<\Illuminate\Database\Eloquent\Model>  $query
     * @return array<string, int>
     */
    private function sumByCurrency(Builder $query, string $column): array
    {
        $out = [];
        foreach ($query->selectRaw("currency, SUM({$column}) as total")->groupBy('currency')->get() as $row) {
            $out[trim((string) $row->currency)] = (int) $row->total;
        }

        return $out;
    }

    /**
     * Soles (unidad mayor), 0 si no hay filas, o null si hay importes en otra
     * moneda (o sin moneda): no se mezclan monedas.
     *
     * @param  array<string, int>  $byCurrency
     */
    private function penMajor(array $byCurrency): ?float
    {
        foreach ($byCurrency as $currency => $total) {
            if ($currency !== 'PEN' && $total !== 0) {
                return null;
            }
        }

        return ($byCurrency['PEN'] ?? 0) / 100;
    }
}
