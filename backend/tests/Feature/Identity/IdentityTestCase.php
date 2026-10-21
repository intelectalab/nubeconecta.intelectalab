<?php

declare(strict_types=1);

namespace Tests\Feature\Identity;

use App\Models\User;
use App\Modules\Identity\Database\Seeders\IdentitySeeder;
use App\Modules\Identity\Models\Role;
use App\Modules\Identity\Services\Totp;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Base de las pruebas de Identity y app/Shared. Requiere PostgreSQL real
 * (triggers de auditoría, roles y permisos del esquema canónico).
 */
abstract class IdentityTestCase extends TestCase
{
    use RefreshDatabase;

    protected bool $seed = true;

    protected string $seeder = IdentitySeeder::class;

    protected function setUp(): void
    {
        parent::setUp();

        if (DB::connection()->getDriverName() !== 'pgsql') {
            $this->markTestSkipped('Estas pruebas requieren PostgreSQL (DB_CONNECTION=pgsql).');
        }

        // Petición de la SPA: Sanctum la trata como stateful (cookie de sesión).
        $this->withHeaders(['Origin' => 'http://localhost', 'Referer' => 'http://localhost/', 'Accept' => 'application/json']);
    }

    /** @param list<string> $roles */
    protected function makeUser(array $roles = [], ?string $password = null, bool $mfa = false, string $type = 'staff'): User
    {
        $factory = User::factory()->state(['type' => $type]);
        if ($password !== null) {
            $factory = $factory->withPassword($password);
        }
        if ($mfa) {
            $factory = $factory->state(['mfa_secret' => Totp::generateSecret(), 'mfa_method' => 'totp', 'mfa_enabled_at' => now()]);
        }
        $user = $factory->create();

        foreach ($roles as $code) {
            $role = Role::query()->where('code', $code)->firstOrFail();
            $user->roles()->attach($role->id, ['organization_id' => $user->organization_id]);
        }

        return $user->refresh();
    }

    protected function setSetting(string $key, mixed $value): void
    {
        DB::table('settings')->updateOrInsert(
            ['organization_id' => DB::table('organizations')->value('id'), 'key' => $key, 'scope_type' => 'global', 'scope_id' => null],
            ['value' => json_encode($value)],
        );
        // SettingsReader/SecurityPolicy son scoped y memorizan: en producción se reinician por petición.
        $this->app->forgetScopedInstances();
    }

    /** @param array<string, mixed> $json */
    protected function assertProblem(\Illuminate\Testing\TestResponse $response, int $status, string $code): void
    {
        $response->assertStatus($status)->assertHeader('Content-Type', 'application/problem+json')->assertJsonPath('code', $code);
        $this->assertNotEmpty($response->json('request_id'));
    }
}
