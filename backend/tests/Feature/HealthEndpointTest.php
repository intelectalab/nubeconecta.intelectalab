<?php

namespace Tests\Feature;

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
            'app' => ['status', 'name', 'env', 'laravel'],
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
}
