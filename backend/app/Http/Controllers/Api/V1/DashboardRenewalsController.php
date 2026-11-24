<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Modules\Domains\Models\Domain;
use App\Modules\Services\Models\Service;
use App\Shared\Contracts\AccessControl;
use App\Shared\Http\Problem\ProblemException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

/**
 * GET /api/v1/admin/dashboard/renewals
 *
 * Lista de vencimientos próximos (hoy..hoy+N, N≤90, por defecto 30) para el
 * panel de inicio: servicios con vencimiento comercial y dominios por expirar.
 * Cada fuente se incluye solo si el usuario tiene su permiso de lectura.
 * `brand_id` (uuid) acota los servicios (los dominios no llevan marca).
 */
final class DashboardRenewalsController extends Controller
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

        $brand = $request->query('brand_id');
        $brandId = is_string($brand) && Str::isUuid($brand) ? $brand : null;
        $days = (int) $request->query('days', '30');
        $days = max(1, min(90, $days));
        $today = now()->startOfDay();
        $until = $today->copy()->addDays($days)->toDateString();
        $from = $today->toDateString();

        $rows = [];

        if ($access->allows($user, 'services.service.view')) {
            $services = Service::query()
                ->where('status', 'active')
                ->whereBetween('commercial_due_date', [$from, $until])
                ->when($brandId, fn ($q) => $q->where('brand_id', $brandId))
                ->with(['customer:id,legal_name,trade_name', 'subscription:id,service_id,price_minor,quantity,currency'])
                ->orderBy('commercial_due_date')
                ->limit(50)
                ->get();
            foreach ($services as $s) {
                $sub = $s->subscription;
                $rows[] = [
                    'kind' => 'service',
                    'id' => $s->id,
                    'date' => Carbon::parse($s->commercial_due_date)->toDateString(),
                    'label' => $s->label ?? $s->code,
                    'mono' => false,
                    'customer' => $s->customer ? ['id' => $s->customer->id, 'name' => $s->customer->trade_name ?: $s->customer->legal_name] : null,
                    'amount_minor' => $sub ? (int) ($sub->price_minor * (float) $sub->quantity) : null,
                    'currency' => $sub?->currency ? trim((string) $sub->currency) : null,
                    'auto_renew' => (bool) $s->auto_renew,
                ];
            }
        }

        if ($access->allows($user, 'domains.domain.view')) {
            $domains = Domain::query()
                ->where('status', 'active')
                ->whereNotNull('registry_expires_at')
                ->whereBetween('registry_expires_at', [$from, $until])
                ->with(['customer:id,legal_name,trade_name'])
                ->orderBy('registry_expires_at')
                ->limit(50)
                ->get();
            foreach ($domains as $d) {
                $rows[] = [
                    'kind' => 'domain',
                    'id' => $d->id,
                    'date' => Carbon::parse($d->registry_expires_at)->toDateString(),
                    'label' => $d->tld ? $d->name.'.'.ltrim((string) $d->tld, '.') : $d->name,
                    'mono' => true,
                    'customer' => $d->customer ? ['id' => $d->customer->id, 'name' => $d->customer->trade_name ?: $d->customer->legal_name] : null,
                    'amount_minor' => null,
                    'currency' => null,
                    'auto_renew' => (bool) $d->auto_renew,
                ];
            }
        }

        // Orden global por fecha y recorte.
        usort($rows, fn ($a, $b) => strcmp($a['date'], $b['date']));
        foreach ($rows as &$row) {
            $row['days_until'] = (int) $today->diffInDays(Carbon::parse($row['date'])->startOfDay(), false);
        }
        unset($row);

        return response()->json(['data' => array_slice($rows, 0, 20)]);
    }
}
