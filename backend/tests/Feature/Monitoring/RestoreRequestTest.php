<?php

declare(strict_types=1);

namespace Tests\Feature\Monitoring;

use App\Shared\Audit\AuditLogger;
use Illuminate\Support\Facades\DB;
use Tests\Feature\Billing\SalesFlowTestCase;

/** Solicitudes de restauración (monitoring.restore_request.*): alta con ticket y máquina de estados. */
final class RestoreRequestTest extends SalesFlowTestCase
{
    private const BASE = '/api/v1/admin/restore-requests';

    private function serviceId(): string
    {
        $this->approvedOrder(items: [['plan_id' => $this->hourly]]);

        return (string) DB::table('services')->where('customer_id', $this->rucCustomer)->orderByDesc('created_at')->value('id');
    }

    private function create(string $service): array
    {
        return $this->postJson(self::BASE, [
            'service_id' => $service, 'target_kind' => 'website', 'target_name' => 'public_html',
            'restore_point_at' => now()->subDay()->toIso8601String(), 'overwrite_confirmed' => true,
        ], $this->key())->assertCreated()->json('data');
    }

    public function test_request_opens_a_ticket_and_follows_the_state_machine(): void
    {
        $service = $this->serviceId();

        $req = $this->create($service);
        $this->assertSame('requested', $req['status']);
        $this->assertStringStartsWith('RST-', $req['code']);
        $this->assertNotNull($req['ticket_id']);
        $this->assertDatabaseHas('tickets', ['id' => $req['ticket_id'], 'customer_id' => $this->rucCustomer]);

        // Aprobar.
        $approved = $this->postJson(self::BASE."/{$req['id']}/approve", ['version' => $req['version']])->assertOk()->json('data');
        $this->assertSame('approved', $approved['status']);
        $this->assertNotNull($approved['approved_at']);

        // Aprobar de nuevo → 409 (ya no está en «requested»).
        $this->assertProblem($this->postJson(self::BASE."/{$req['id']}/approve", ['version' => $approved['version']]), 409, 'invalid_transition');

        // Cancelar una aprobada.
        $this->postJson(self::BASE."/{$req['id']}/cancel", ['version' => $approved['version']])->assertOk()->assertJsonPath('data.status', 'cancelled');

        // Rechazar otra.
        $r2 = $this->create($service);
        $this->postJson(self::BASE."/{$r2['id']}/reject", ['version' => $r2['version'], 'reason' => 'Fuera de la ventana de retención'])
            ->assertOk()->assertJsonPath('data.status', 'rejected')->assertJsonPath('data.rejection_reason', 'Fuera de la ventana de retención');

        // Sin confirmar la sobrescritura → 422.
        $this->assertProblem($this->postJson(self::BASE, [
            'service_id' => $service, 'target_kind' => 'database', 'target_name' => 'db1', 'restore_point_at' => now()->subDay()->toIso8601String(), 'overwrite_confirmed' => false,
        ], $this->key()), 422, 'validation_failed');

        $this->assertNull(app(AuditLogger::class)->verify());
    }
}
