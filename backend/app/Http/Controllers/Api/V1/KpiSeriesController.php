<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Modules\Billing\Models\Invoice;
use App\Modules\Billing\Models\Payment;
use App\Modules\Sales\Models\Lead;
use App\Shared\Contracts\AccessControl;
use App\Shared\Http\Problem\ProblemException;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * GET /api/v1/admin/kpis/series?id=<kpiId>
 *
 * Serie mensual REAL (últimos 12 meses calendario UTC, incluido el actual) de los
 * indicadores de FLUJO con columna de fecha: facturado, cobrado, vouch, ganados.
 * Los de stock (embudo, mrr, arr, tkab, activos, domv, rrec...) no tienen histórico
 * fiable: responden 404 `no_series` y la SPA mantiene la serie ilustrativa.
 * Mismas fuentes, filtros y permisos que KpiController; montos en soles (unidad mayor),
 * y si hay otra moneda en la ventana el indicador monetario se omite (404 `no_series`).
 */
final class KpiSeriesController extends Controller
{
    private const PERMISSIONS = [
        'facturado' => 'billing.invoice.view',
        'cobrado' => 'billing.payment.view',
        'vouch' => 'billing.payment.view',
        'ganados' => 'sales.lead.view',
    ];

    public function __invoke(Request $request, AccessControl $access): JsonResponse
    {
        $user = $request->user();
        if ($access->mustChangePassword($user)) {
            throw new ProblemException(403, 'password_change_required');
        }
        if ($access->mustEnrollMfa($user)) {
            throw ProblemException::mfaRequired();
        }

        $id = (string) $request->query('id', '');
        if (! isset(self::PERMISSIONS[$id])) {
            throw new ProblemException(404, 'no_series');
        }
        if (! $access->allows($user, self::PERMISSIONS[$id])) {
            throw new ProblemException(403, 'forbidden');
        }

        $start = CarbonImmutable::now('UTC')->startOfMonth()->subMonths(11);
        $end = $start->addMonths(12); // exclusivo
        $money = true;
        $currency = 'PEN';

        switch ($id) {
            case 'facturado':
                $query = Invoice::query()->whereIn('type', ['invoice', 'receipt', 'debit_note'])
                    ->whereIn('status', ['issued', 'partially_paid', 'paid', 'overdue'])
                    ->where('issue_date', '>=', $start->toDateString())->where('issue_date', '<', $end->toDateString());
                $rows = $this->monthly($query, 'issue_date', 'SUM(total_minor)');
                break;
            case 'cobrado':
                $query = Payment::query()->where('status', 'validated')->where('validated_at', '>=', $start)->where('validated_at', '<', $end);
                $rows = $this->monthly($query, 'validated_at', 'SUM(amount_minor)');
                break;
            case 'vouch':
                $money = false;
                $query = Payment::query()->where('status', 'validated')->where('validated_at', '>=', $start)->where('validated_at', '<', $end)
                    ->whereHas('method', fn ($q) => $q->where('kind', '!=', 'card_gateway'));
                $rows = $this->monthly($query, 'validated_at', 'COUNT(*)', false);
                break;
            default: // ganados
                $money = false;
                $query = Lead::query()->where('status', 'won')->where('converted_at', '>=', $start)->where('converted_at', '<', $end);
                $rows = $this->monthly($query, 'converted_at', 'COUNT(*)', false);
        }

        $byMonth = [];
        foreach ($rows as $row) {
            if ($money && trim((string) $row->currency) !== 'PEN' && (int) $row->total !== 0) {
                throw new ProblemException(404, 'no_series'); // otra moneda: no se mezclan
            }
            $m = (string) $row->m;
            $byMonth[$m] = ($byMonth[$m] ?? 0) + (int) $row->total;
        }

        $points = [];
        for ($i = 0; $i < 12; $i++) {
            $m = $start->addMonths($i)->format('Y-m');
            $raw = $byMonth[$m] ?? 0;
            $points[] = ['month' => $m, 'value' => $money ? $raw / 100 : $raw];
        }

        $out = ['id' => $id, 'points' => $points];
        if ($money) {
            $out['currency'] = $currency;
        }

        return response()->json(['data' => $out]);
    }

    /**
     * Agrupa por mes calendario (columna fija de la lista blanca, sin entrada de usuario).
     *
     * @param  Builder<\Illuminate\Database\Eloquent\Model>  $query
     * @return \Illuminate\Support\Collection<int, \stdClass>
     */
    private function monthly(Builder $query, string $column, string $agg, bool $byCurrency = true)
    {
        $month = "to_char(date_trunc('month', {$column}), 'YYYY-MM')";
        $select = "{$month} as m, {$agg} as total".($byCurrency ? ', currency' : '');
        $q = $query->selectRaw($select)->groupByRaw($month);
        if ($byCurrency) {
            $q->groupBy('currency');
        }

        return $q->get();
    }
}
