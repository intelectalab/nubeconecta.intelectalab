<?php

namespace Tests\Feature;

use App\Models\User;
use Tests\TestCase;

class HealthEndpointTest extends TestCase
{
    public function test_health_endpoint_reports_components_without_throwing(): void
    {
        $response = $this->getJson('/api/v1/health');

        // 200 si todo responde, 503 si Redis o la base no están disponibles;
        // en ningún caso debe ser un 500.
        $this->assertContains($response->status(), [200, 503]);

        $response->assertJsonStructure([
            'status',
            'app' => ['status', 'name'],
            'checks' => [
                'database' => ['status', 'latency_ms'],
                'redis' => ['status', 'latency_ms'],
            ],
            'time',
        ]);

        $response->assertJsonPath('app.status', 'up');
        // En pruebas la base es SQLite en memoria: siempre disponible.
        $response->assertJsonPath('checks.database.status', 'up');
    }

    public function test_environment_and_version_are_hidden_from_anonymous_callers(): void
    {
        $response = $this->getJson('/api/v1/health');

        // Un monitor anónimo no debe ver el entorno ni la versión del framework.
        $this->assertArrayNotHasKey('env', $response->json('app'));
        $this->assertArrayNotHasKey('laravel', $response->json('app'));
    }

    public function test_environment_and_version_are_visible_to_authenticated_staff(): void
    {
        $this->actingAs(User::factory()->make(['type' => 'staff']));

        $response = $this->getJson('/api/v1/health');

        $response->assertJsonPath('app.env', 'testing');
        $this->assertNotEmpty($response->json('app.laravel'));
    }
}
