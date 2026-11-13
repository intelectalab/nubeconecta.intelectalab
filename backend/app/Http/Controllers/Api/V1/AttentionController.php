<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Modules\Billing\Models\Invoice;
use App\Modules\Billing\Models\Payment;
use App\Modules\Domains\Models\Domain;
use App\Modules\Sales\Models\Lead;
use App\Modules\Support\Models\Ticket;
use App\Shared\Contracts\AccessControl;
use App\Shared\Http\Problem\ProblemException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * GET /api/v1/admin/attention
 *
 * Contadores de "Atención hoy" (solo cuentas, no listas), de toda la organización.
 * Cada clave solo se incluye si el usuario tiene el permiso de su fuente. Días en UTC.
 */
final class AttentionController extends Controller
{
    public function __invoke(Request $request, AccessControl $access): JsonResponse
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
        $data = [];

        if ($access->allows($user, 'billing.invoice.view')) {
            $data['payments_to_validate'] = Payment::query()->where('status', 'reported')->count();
            $data['invoices_due_today'] = Invoice::query()
                ->where('balance_minor', '>', 0)
                ->whereIn('status', ['issued', 'partially_paid', 'overdue'])
                ->where('due_date', $today)
                ->count();
        }
        if ($access->allows($user, 'domains.domain.view')) {
            $data['domains_expiring_7d'] = Domain::query()
                ->where('status', 'active')
                ->where('auto_renew', false)
                ->whereBetween('registry_expires_at', [$today, $now->copy()->addDays(7)->toDateString()])
                ->count();
        }
        if ($access->allows($user, 'helpdesk.ticket.view')) {
            $data['tickets_overdue_sla'] = Ticket::query()
                ->whereNotIn('status', ['resolved', 'closed'])
                ->where('resolution_due_at', '<', $now)
                ->count();
        }
        if ($access->allows($user, 'sales.lead.view')) {
            $data['sales_followups_today'] = Lead::query()
                ->where('status', 'open')
                ->where('next_follow_up_at', '>=', $now->copy()->startOfDay())
                ->where('next_follow_up_at', '<=', $now->copy()->endOfDay())
                ->count();
        }

        return response()->json(['data' => $data]);
    }
}
