<?php

declare(strict_types=1);

namespace App\Modules\Billing\Http\Controllers;

use App\Modules\Billing\Services\CollectionsService;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * /api/v1/admin/collections (P-BIL-01/12, franja MVP): antigüedad de deuda por
 * cliente y moneda, y avisos de cobranza registrados.
 */
final class CollectionsController
{
    public function aging(Request $request, CollectionsService $collections): JsonResponse
    {
        $request->validate(['filter.customer_id' => ['sometimes', 'uuid'], 'filter.currency' => ['sometimes', Rule::in(['PEN', 'USD'])]]);
        $rows = $collections->aging($request->input('filter.customer_id'), $request->input('filter.currency'));
        $totals = [];
        foreach ($rows as $row) {
            $totals[$row['currency']] ??= ['currency' => $row['currency'], 'buckets' => array_fill_keys(CollectionsService::BUCKETS, 0), 'total_minor' => 0, 'overdue_minor' => 0];
            foreach ($row['buckets'] as $k => $v) {
                $totals[$row['currency']]['buckets'][$k] += $v;
            }
            $totals[$row['currency']]['total_minor'] += $row['total_minor'];
            $totals[$row['currency']]['overdue_minor'] += $row['overdue_minor'];
        }

        return response()->json(['data' => $rows, 'meta' => ['as_of' => now()->toDateString(), 'totals' => array_values($totals)]]);
    }

    public function dunningEvents(Request $request, CurrentOrganization $organization): JsonResponse
    {
        $request->validate(['filter.invoice_id' => ['sometimes', 'uuid'], 'filter.status' => ['sometimes', Rule::in(['scheduled', 'done', 'skipped_promise', 'skipped_exempt', 'skipped_paid', 'failed'])]]);
        $invoice = $request->input('filter.invoice_id');
        $status = $request->input('filter.status');
        $rows = DB::table('dunning_events as e')->join('invoices as i', 'i.id', '=', 'e.invoice_id')->join('customers as c', 'c.id', '=', 'i.customer_id')
            ->where('e.organization_id', $organization->id())
            ->when(is_string($invoice), fn ($q) => $q->where('e.invoice_id', $invoice))
            ->when(is_string($status), fn ($q) => $q->where('e.status', $status))
            ->orderByDesc('e.scheduled_for')->limit(200)
            ->get(['e.id', 'e.invoice_id', 'e.action', 'e.status', 'e.scheduled_for', 'e.executed_at', 'e.detail', 'i.series', 'i.number', 'i.customer_id', 'c.legal_name']);

        return response()->json(['data' => $rows->map(fn ($r) => [
            'id' => $r->id, 'invoice_id' => $r->invoice_id, 'invoice_number' => $r->series === null ? null : sprintf('%s-%08d', $r->series, $r->number),
            'customer_id' => $r->customer_id, 'customer_name' => $r->legal_name, 'action' => $r->action, 'status' => $r->status,
            'scheduled_for' => $r->scheduled_for, 'executed_at' => $r->executed_at, 'detail' => json_decode((string) $r->detail, true),
        ])->values()]);
    }
}
