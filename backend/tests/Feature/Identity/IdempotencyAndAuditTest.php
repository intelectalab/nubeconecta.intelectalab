<?php

declare(strict_types=1);

namespace Tests\Feature\Identity;

use App\Shared\Audit\AuditLogger;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;

final class IdempotencyAndAuditTest extends IdentityTestCase
{
    private int $executions = 0;

    protected function setUp(): void
    {
        parent::setUp();

        Route::middleware(['api', 'hub.auth', 'idempotency'])->post('api/v1/_test/payments', function () {
            $this->executions++;

            return response()->json(['data' => ['execution' => $this->executions, 'amount' => request('amount')]], 201);
        });

        $this->setSetting('security.mfa.required_for_staff', false);
        $this->actingAs($this->makeUser(['support']));
    }

    public function test_missing_key_is_rejected(): void
    {
        $this->assertProblem($this->postJson('/api/v1/_test/payments', ['amount' => 10]), 400, 'bad_request');
        $this->assertSame(0, $this->executions);
    }

    public function test_same_key_and_body_replays_stored_response(): void
    {
        $headers = ['Idempotency-Key' => 'b6f1c7e2-0d1a-4c55-9a43-6a8c3f0e1d11'];

        $first = $this->postJson('/api/v1/_test/payments', ['amount' => 10, 'currency' => 'PEN'], $headers)->assertCreated();
        // Mismo cuerpo con otro orden de claves: misma petición.
        $second = $this->postJson('/api/v1/_test/payments', ['currency' => 'PEN', 'amount' => 10], $headers)
            ->assertCreated()->assertHeader('Idempotent-Replayed', 'true');

        $this->assertSame(1, $this->executions);
        $this->assertEquals($first->json(), $second->json()); // jsonb no conserva el orden de claves
        $this->assertDatabaseHas('idempotency_keys', ['key' => $headers['Idempotency-Key'], 'response_status' => 201]);
    }

    public function test_same_key_with_other_body_returns_422(): void
    {
        $headers = ['Idempotency-Key' => 'key-0001-abcdef'];
        $this->postJson('/api/v1/_test/payments', ['amount' => 10], $headers)->assertCreated();

        $this->assertProblem($this->postJson('/api/v1/_test/payments', ['amount' => 99], $headers), 422, 'idempotency_key_reused');
        $this->assertSame(1, $this->executions);
    }

    public function test_key_in_progress_returns_409(): void
    {
        DB::table('idempotency_keys')->insert([
            'organization_id' => DB::table('organizations')->value('id'),
            'key' => 'en-curso-0001', 'scope' => 'POST api/v1/_test/payments',
            'request_hash' => str_repeat('0', 64), 'locked_until' => now()->addMinute(), 'expires_at' => now()->addDay(),
        ]);

        // El hash distinto da 422; con el mismo hash y bloqueo vigente sería 409. Se fuerza el hash real:
        $this->postJson('/api/v1/_test/payments', ['amount' => 1], ['Idempotency-Key' => 'calc-hash-0001'])->assertCreated();
        $realHash = DB::table('idempotency_keys')->where('key', 'calc-hash-0001')->value('request_hash');
        DB::table('idempotency_keys')->where('key', 'en-curso-0001')->update(['request_hash' => $realHash]);

        $this->assertProblem($this->postJson('/api/v1/_test/payments', ['amount' => 1], ['Idempotency-Key' => 'en-curso-0001']), 409, 'idempotency_in_progress');
        $this->assertSame(1, $this->executions);
    }

    public function test_audit_chain_links_events_and_detects_tampering(): void
    {
        $audit = app(AuditLogger::class);
        $first = $audit->record('test.created', 'test', null, null, ['a' => 1, 'password' => 'x']);
        $second = $audit->record('test.updated', 'test', null, ['a' => 1], ['a' => 2]);

        $rows = DB::table('audit_events')->whereIn('id', [$first, $second])->orderBy('chain_seq')->get();
        $this->assertSame($rows[0]->hash, $rows[1]->prev_hash);
        $this->assertSame($rows[0]->chain_seq + 1, $rows[1]->chain_seq);
        $this->assertStringContainsString('[redacted]', $rows[0]->after);
        $this->assertNull($audit->verify());
        $this->artisan('hub:audit:verify')->assertSuccessful();

        // Solo inserción: UPDATE falla incluso para el dueño de la tabla.
        try {
            DB::transaction(fn () => DB::table('audit_events')->where('id', $first)->update(['action' => 'x']));
            $this->fail('UPDATE sobre audit_events debió fallar.');
        } catch (QueryException $e) {
            $this->assertSame('42501', $e->getCode());
        }

        // Manipulación saltándose los triggers (superusuario): la verificación la detecta.
        DB::statement('SET session_replication_role = replica');
        DB::table('audit_events')->where('id', $first)->update(['action' => 'test.tampered']);
        DB::statement('SET session_replication_role = DEFAULT');

        $this->assertSame((int) $rows[0]->chain_seq, $audit->verify());
        $this->artisan('hub:audit:verify')->assertFailed();
    }
}
