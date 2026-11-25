<?php

declare(strict_types=1);

namespace Tests\Feature\Monitoring;

use App\Shared\Audit\AuditLogger;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
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

    public function test_assisted_execution_opens_a_task_and_completes_with_evidence(): void
    {
        config(['hub.files.disk' => 'local']);
        Storage::fake('local');
        $service = $this->serviceId();

        $req = $this->create($service);
        $approved = $this->postJson(self::BASE."/{$req['id']}/approve", ['version' => $req['version']])->assertOk()->json('data');

        // Iniciar asistida → en proceso + se abre una tarea.
        $started = $this->postJson(self::BASE."/{$req['id']}/start", ['version' => $approved['version'], 'execution_mode' => 'assisted'])
            ->assertOk()->assertJsonPath('data.status', 'in_progress')->assertJsonPath('data.execution_mode', 'assisted')->json('data');
        $taskId = (string) DB::table('restore_requests')->where('id', $req['id'])->value('task_id');
        $this->assertNotEmpty($taskId);
        $this->assertDatabaseHas('tasks', ['id' => $taskId, 'customer_id' => $this->rucCustomer, 'service_id' => $service]);

        // Completar sin evidencia → 422.
        $this->assertProblem($this->postJson(self::BASE."/{$req['id']}/complete", ['version' => $started['version'], 'result_notes' => 'x']), 422, 'validation_failed');

        // Completar con evidencia → completada.
        $this->post(self::BASE."/{$req['id']}/complete", [
            'version' => $started['version'], 'result_notes' => 'Restaurado correctamente',
            'file' => UploadedFile::fake()->create('evidencia.pdf', 20, 'application/pdf'),
        ], $this->key())->assertOk()->assertJsonPath('data.status', 'completed');
        $this->assertNotNull(DB::table('restore_requests')->where('id', $req['id'])->value('evidence_file_id'));

        // Camino de fallo en otra solicitud.
        $r2 = $this->create($service);
        $a2 = $this->postJson(self::BASE."/{$r2['id']}/approve", ['version' => $r2['version']])->assertOk()->json('data');
        $s2 = $this->postJson(self::BASE."/{$r2['id']}/start", ['version' => $a2['version']])->assertOk()->json('data');
        $this->postJson(self::BASE."/{$r2['id']}/fail", ['version' => $s2['version'], 'result_notes' => 'La herramienta no tenía el punto solicitado'])
            ->assertOk()->assertJsonPath('data.status', 'failed');

        $this->assertNull(app(AuditLogger::class)->verify());
    }
}
