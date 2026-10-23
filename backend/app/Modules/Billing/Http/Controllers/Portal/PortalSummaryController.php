<?php

declare(strict_types=1);

namespace App\Modules\Billing\Http\Controllers\Portal;

use App\Modules\Billing\Models\Invoice;
use App\Modules\Billing\Models\Payment;
use App\Modules\Billing\Services\PaymentService;
use App\Modules\Customers\Support\PortalCustomer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Resumen del portal (P-PRT-02): servicios activos, próximos vencimientos,
 * deuda total y vencida por moneda y vouchers en revisión. Solo del cliente de la sesión.
 */
final class PortalSummaryController
{
    public function __invoke(Request $request): JsonResponse
    {
        $customerId = PortalCustomer::id($request);
        $services = DB::table('services')->where('customer_id', $customerId)->whereNull('deleted_at')
            ->selectRaw('status, count(*) as n')->groupBy('status')->pluck('n', 'status');
        $open = Invoice::query()->where('customer_id', $customerId)->whereIn('status', PaymentService::OPEN_STATUSES)->where('balance_minor', '>', 0)
            ->orderByRaw('due_date asc nulls last')->orderBy('id')->get();
        $today = now()->toDateString();
        $debt = [];
        foreach ($open as $invoice) {
            $cur = trim((string) $invoice->currency);
            $debt[$cur] ??= ['currency' => $cur, 'balance_minor' => 0, 'overdue_minor' => 0, 'invoices' => 0];
            $debt[$cur]['balance_minor'] += $invoice->balance_minor;
            $debt[$cur]['overdue_minor'] += ($invoice->due_date !== null && $invoice->due_date->toDateString() < $today) ? $invoice->balance_minor : 0;
            $debt[$cur]['invoices']++;
        }

        return response()->json(['data' => [
            'services' => ['active' => (int) ($services['active'] ?? 0), 'suspended' => (int) ($services['suspended'] ?? 0), 'pending' => (int) ($services['pending'] ?? 0)],
            'debt' => array_values($debt),
            'upcoming_invoices' => $open->take(5)->map(fn (Invoice $i) => [
                'id' => $i->id, 'number' => $i->fullNumber(), 'type' => $i->type, 'status' => $i->status, 'currency' => trim((string) $i->currency),
                'due_date' => $i->due_date?->toDateString(), 'total_minor' => $i->total_minor, 'balance_minor' => $i->balance_minor,
            ])->values(),
            'pending_vouchers' => Payment::query()->where('customer_id', $customerId)->where('status', 'reported')->count(),
            'as_of' => $today,
        ]]);
    }
}
