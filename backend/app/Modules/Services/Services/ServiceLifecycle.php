<?php

declare(strict_types=1);

namespace App\Modules\Services\Services;

use App\Modules\Orders\Events\OrderApproved;
use App\Modules\Services\Contracts\ServiceProvisioner;
use App\Modules\Services\Events\ServiceActivated;
use App\Modules\Services\Events\ServiceCancelled;
use App\Modules\Services\Events\ServiceCreated;
use App\Modules\Services\Events\ServiceReactivated;
use App\Modules\Services\Events\ServiceSuspended;
use App\Modules\Services\Models\Service;
use App\Modules\Services\Models\Subscription;
use App\Modules\Services\Support\Cycle;
use App\Shared\Audit\AuditLogger;
use App\Shared\Concurrency\VersionGuard;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Máquina 1 de docs/03 (franja MVP): alta `pending` desde OrderApproved,
 * `pending → active` (aprovisionamiento + suscripción en la misma transacción,
 * RN-SRV-001), `active ⇄ suspended` manual y `pending|active|suspended →
 * cancelled`. Cada transición valida estado, registra historial y auditoría y
 * emite evento (M-SRV §5).
 */
final class ServiceLifecycle
{
    /** Transiciones manuales admitidas: acción => [desde, hacia]. */
    public const TRANSITIONS = [
        'activate' => [['pending'], 'active'],
        'suspend' => [['active'], 'suspended'],
        'reactivate' => [['suspended'], 'active'],
        'cancel' => [['pending', 'active', 'suspended'], 'cancelled'],
    ];

    public function __construct(
        private readonly AuditLogger $audit,
        private readonly CurrentOrganization $organization,
        private readonly ServiceProvisioner $provisioner,
    ) {}

    /**
     * Un servicio `pending` por línea del pedido (las de instalación no generan
     * servicio). Idempotente: una línea con `service_id` se omite.
     *
     * @return list<Service>
     */
    public function createFromOrder(OrderApproved $event): array
    {
        return DB::transaction(function () use ($event): array {
            $created = [];
            $items = DB::table('order_items')->where('organization_id', $event->organizationId)->where('order_id', $event->id)
                ->whereIn('id', $event->itemIds)->orderBy('created_at')->orderBy('id')->lockForUpdate()->get();
            $start = now()->toDateString();
            foreach ($items as $item) {
                $config = json_decode((string) $item->config, true) ?: [];
                if ($item->service_id !== null || ($config['kind'] ?? null) === 'setup_fee') {
                    continue;
                }
                $cycle = $config['cycle'] ?? null;
                $service = new Service;
                $service->forceFill([
                    'code' => $this->nextCode(), 'customer_id' => $event->customerId, 'brand_id' => $event->brandId,
                    'product_id' => $item->product_id, 'plan_id' => $item->plan_id, 'label' => $item->description, 'status' => 'pending',
                    // Vencimiento comercial = inicio + ciclo; el inicio es la fecha de aprobación (periodo de la factura inicial).
                    'commercial_due_date' => Cycle::isRecurring($cycle) ? Cycle::add($start, $cycle) : null,
                    'auto_renew' => Cycle::isRecurring($cycle),
                    'custom' => ['order' => [
                        'order_id' => $event->id, 'order_item_id' => $item->id, 'cycle' => $cycle, 'starts_on' => $start,
                        'quantity' => (string) $item->quantity, 'unit_price_minor' => (int) $item->unit_price_minor, 'currency' => trim((string) $item->currency),
                    ]],
                ])->save();
                DB::table('order_items')->where('id', $item->id)->update(['service_id' => $service->id, 'updated_at' => now()]);
                $this->history($service, null, 'pending', null, 'order');
                $this->audit->record('service.created', 'service', $service->id, null, $service->refresh()->attributesToArray(), ['order_id' => $event->id], $service->customer_id);
                ServiceCreated::dispatch($service->organization_id, $service->id, $service->customer_id);
                $created[] = $service;
            }

            return $created;
        });
    }

    public function transition(Service $service, string $action, ?string $reason, ?int $version, string $source = 'manual'): Service
    {
        [$from, $to] = self::TRANSITIONS[$action];

        return DB::transaction(function () use ($service, $action, $from, $to, $reason, $version, $source): Service {
            $service = Service::query()->lockForUpdate()->findOrFail($service->id);
            if ($version !== null) {
                VersionGuard::check($service, $version);
            }
            if (! in_array($service->status, $from, true)) {
                throw new ProblemException(409, 'invalid_transition', "No se puede {$this->verb($action)} un servicio en estado {$service->status}.", ['status' => $service->status]);
            }
            $before = $service->attributesToArray();
            $metadata = ['reason' => $reason];
            $now = now();
            match ($action) {
                'activate' => $metadata += $this->activate($service),
                'suspend' => $service->forceFill(['suspended_at' => $now]),
                'reactivate' => $service->forceFill(['suspended_at' => null]),
                'cancel' => $service->forceFill(['cancelled_at' => $now]),
            };
            $service->forceFill(['status' => $to])->save();
            $this->subscriptionFollows($service, $action);
            $this->history($service, $before['status'], $to, $reason, $source);
            $this->audit->record("service.{$this->past($action)}", 'service', $service->id, $before, $service->refresh()->attributesToArray(), $metadata, $service->customer_id);
            $event = match ($action) {
                'activate' => ServiceActivated::class,
                'suspend' => ServiceSuspended::class,
                'reactivate' => ServiceReactivated::class,
                'cancel' => ServiceCancelled::class,
            };
            $event::dispatch($service->organization_id, $service->id, $service->customer_id);

            return $service;
        });
    }

    /** @return array<string, mixed> metadatos de auditoría */
    private function activate(Service $service): array
    {
        if (DB::table('products')->where('id', $service->product_id)->value('requires_contract')) {
            // CTR aún no existe: sin contrato `signed_active` no se activa (RN-SRV-002).
            throw new ProblemException(409, 'contract_required', 'El producto requiere un contrato vigente antes de activar el servicio.');
        }
        $order = $service->custom['order'] ?? [];
        $cycle = $order['cycle'] ?? DB::table('plans')->where('id', $service->plan_id)->value('cycle');
        $attempt = (int) DB::table('provisioning_runs')->where('service_id', $service->id)->max('attempt') + 1;
        $result = $this->provisioner->provision($service);
        DB::table('provisioning_runs')->insert([
            'id' => (string) Str::uuid7(), 'organization_id' => $service->organization_id, 'order_id' => $order['order_id'] ?? null,
            'order_item_id' => $order['order_item_id'] ?? null, 'service_id' => $service->id, 'connector' => $result['connector'],
            'operation' => 'create_account', 'attempt' => $attempt, 'idempotency_key' => "service:{$service->id}:create_account",
            'status' => $result['status'], 'external_id' => $result['external_id'], 'response' => json_encode(['message' => $result['message']]),
            'started_at' => now(), 'finished_at' => now(), 'created_by' => Auth::id(),
        ]);
        if ($result['status'] !== 'succeeded') {
            throw new ProblemException(409, 'provisioning_failed', $result['message']);
        }
        $service->forceFill(['activated_at' => now()]);
        if (Cycle::isRecurring($cycle)) {
            $starts = $order['starts_on'] ?? now()->toDateString();
            $next = $service->commercial_due_date?->toDateString() ?? Cycle::add($starts, $cycle);
            $sub = new Subscription;
            $sub->forceFill([
                'service_id' => $service->id, 'cycle' => $cycle, 'quantity' => $order['quantity'] ?? '1',
                'price_minor' => $order['unit_price_minor'] ?? 0, 'currency' => $order['currency'] ?? 'PEN',
                'starts_on' => $starts, 'next_invoice_date' => $next, 'status' => 'active',
            ])->save();
            $service->forceFill(['commercial_due_date' => $next]);
        }

        return ['provisioning' => $result['message']];
    }

    private function subscriptionFollows(Service $service, string $action): void
    {
        [$from, $to, $column] = match ($action) {
            'suspend' => [['active'], 'paused', 'paused_at'],
            'reactivate' => [['paused'], 'active', null],
            'cancel' => [['active', 'paused'], 'cancelled', 'cancelled_at'],
            default => [[], null, null],
        };
        if ($to === null) {
            return;
        }
        Subscription::query()->where('service_id', $service->id)->whereIn('status', $from)->get()
            ->each(fn (Subscription $s) => $s->forceFill(['status' => $to] + ($column ? [$column => now()] : ['paused_at' => null]))->save());
    }

    private function history(Service $service, ?string $from, string $to, ?string $reason, string $source): void
    {
        DB::table('service_status_history')->insert([
            'id' => (string) Str::uuid7(), 'organization_id' => $service->organization_id, 'service_id' => $service->id,
            'from_status' => $from, 'to_status' => $to, 'reason' => $reason, 'trigger_source' => $source,
            'approved_by' => in_array($to, ['suspended', 'cancelled'], true) ? Auth::id() : null, 'occurred_at' => now(), 'created_by' => Auth::id(),
        ]);
    }

    private function verb(string $action): string
    {
        return ['activate' => 'activar', 'suspend' => 'suspender', 'reactivate' => 'reactivar', 'cancel' => 'cancelar'][$action];
    }

    private function past(string $action): string
    {
        return ['activate' => 'activated', 'suspend' => 'suspended', 'reactivate' => 'reactivated', 'cancel' => 'cancelled'][$action];
    }

    private function nextCode(): string
    {
        $org = $this->organization->id();
        DB::table('code_sequences')->insertOrIgnore(['organization_id' => $org, 'entity' => 'service', 'prefix' => 'SRV', 'padding' => 6, 'next_value' => 1]);

        return (string) DB::selectOne('select hub_next_code(?, ?) as code', [$org, 'service'])->code;
    }
}
