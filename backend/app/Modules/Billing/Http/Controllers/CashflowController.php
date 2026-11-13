<?php

declare(strict_types=1);

namespace App\Modules\Billing\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Billing\Models\Invoice;
use App\Modules\Billing\Models\Payment;
use App\Modules\Billing\Models\PaymentMethod;
use App\Shared\Contracts\AccessControl;
use App\Shared\Http\Problem\ProblemException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * GET /api/v1/admin/billing/cashflow
 *
 * Facturado vs. cobrado de los últimos 12 meses (mes actual incluido) por moneda,
 * más el desglose por medio de pago del mes actual. Siempre de toda la organización
 * (payments no tiene brand_id). Meses en UTC. Modelos con scope global de organización.
 *
 * Facturado: invoice, receipt y debit_note suman; credit_note resta; se excluyen
 * draft y void y las filas sin issue_date. Cobrado: pagos `validated` por received_at
 * (incluye retenciones IGV registradas como pago, que sí reducen saldo).
 */
final class CashflowController extends Controller
{
    private const MONTHS = 12;

    public function __invoke(Request $request, AccessControl $access): JsonResponse
    {
        $user = $request->user();
        if ($access->mustChangePassword($user)) {
            throw new ProblemException(403, 'password_change_required');
        }
        if ($access->mustEnrollMfa($user)) {
            throw ProblemException::mfaRequired();
        }

        // Lo cobrado (pagos) es dato de pagos, no de facturas: se incluye solo si el
        // usuario tiene billing.payment.view (defensa en profundidad; hoy todo rol con
        // invoice.view también tiene payment.view, pero esto protege roles a medida).
        $canPayments = $access->allows($user, 'billing.payment.view');

        $now = now()->utc();
        $start = $now->copy()->startOfMonth()->subMonths(self::MONTHS - 1);
        $months = [];
        for ($i = 0; $i < self::MONTHS; $i++) {
            $months[] = $start->copy()->addMonths($i)->format('Y-m');
        }

        $billedRows = Invoice::query()
            ->whereNotIn('status', ['draft', 'void'])
            ->whereNotNull('issue_date')
            ->where('issue_date', '>=', $start->toDateString())
            ->selectRaw("to_char(issue_date, 'YYYY-MM') as month, currency, SUM(CASE WHEN type = 'credit_note' THEN -total_minor ELSE total_minor END) as amount")
            ->groupByRaw("to_char(issue_date, 'YYYY-MM'), currency")
            ->get();

        $collectedRows = $canPayments ? Payment::query()
            ->where('status', 'validated')
            ->whereNotNull('received_at')
            ->where('received_at', '>=', $start)
            ->selectRaw("to_char(received_at AT TIME ZONE 'UTC', 'YYYY-MM') as month, currency, SUM(amount_minor) as amount")
            ->groupByRaw("to_char(received_at AT TIME ZONE 'UTC', 'YYYY-MM'), currency")
            ->get() : collect();

        $currencies = $billedRows->pluck('currency')->merge($collectedRows->pluck('currency'))
            ->map(fn ($c) => trim((string) $c))->unique()->sort()->values()->all();

        $methods = [];
        if ($canPayments) {
            $methodRows = Payment::query()
                ->where('status', 'validated')
                ->where('received_at', '>=', $now->copy()->startOfMonth())
                ->where('received_at', '<', $now->copy()->startOfMonth()->addMonth())
                ->selectRaw('payment_method_id, currency, SUM(amount_minor) as amount')
                ->groupBy('payment_method_id', 'currency')
                ->get();
            $methodModels = PaymentMethod::query()->whereIn('id', $methodRows->pluck('payment_method_id')->all())->get()->keyBy('id');
            foreach ($methodRows as $row) {
                $m = $methodModels->get($row->payment_method_id);
                $methods[] = [
                    'kind' => $m?->kind ?? 'other',
                    'name' => $m?->name ?? '',
                    'currency' => trim((string) $row->currency),
                    'amount_minor' => (int) $row->amount,
                ];
            }
            usort($methods, fn ($a, $b) => [$a['currency'], -$a['amount_minor'], $a['name']] <=> [$b['currency'], -$b['amount_minor'], $b['name']]);
        }

        return response()->json(['data' => [
            'months' => $months,
            'billed' => $this->series($billedRows, $currencies, $months),
            'collected' => $canPayments ? $this->series($collectedRows, $currencies, $months) : [],
            'methods' => $methods,
        ]]);
    }

    /**
     * @param  iterable<object>  $rows
     * @param  list<string>  $currencies
     * @param  list<string>  $months
     * @return list<array{currency: string, points: list<array{month: string, amount_minor: int}>}>
     */
    private function series(iterable $rows, array $currencies, array $months): array
    {
        $map = [];
        foreach ($rows as $row) {
            $map[trim((string) $row->currency)][$row->month] = (int) $row->amount;
        }

        $out = [];
        foreach ($currencies as $currency) {
            $points = [];
            foreach ($months as $month) {
                $points[] = ['month' => $month, 'amount_minor' => $map[$currency][$month] ?? 0];
            }
            $out[] = ['currency' => $currency, 'points' => $points];
        }

        return $out;
    }
}
