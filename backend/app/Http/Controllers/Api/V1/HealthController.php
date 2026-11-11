<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;
use Throwable;

/**
 * GET /api/v1/health
 *
 * Estado de la aplicación y de sus dependencias (base de datos y Redis).
 * Nunca lanza excepción: si una dependencia no responde se informa como
 * "down" y la respuesta es 503, útil para healthchecks de Docker o del
 * balanceador. El detalle del error solo se muestra con APP_DEBUG=true.
 * El entorno y la versión del framework solo se revelan a staff autenticado
 * (no se filtran a monitores anónimos).
 */
class HealthController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $checks = [
            'database' => $this->check(function (): array {
                $connection = DB::connection();
                $connection->select('select 1');

                return ['driver' => $connection->getDriverName()];
            }),
            'redis' => $this->check(function (): array {
                Redis::connection()->ping();

                return ['client' => config('database.redis.client')];
            }),
        ];

        $healthy = collect($checks)->every(fn (array $c) => $c['status'] === 'up');

        $app = ['status' => 'up', 'name' => config('app.name')];
        // Entorno y versión solo para staff autenticado: no divulgar a monitores anónimos.
        $actor = $request->user();
        if ($actor !== null && ($actor->type ?? null) === 'staff') {
            $app['env'] = app()->environment();
            $app['laravel'] = app()->version();
        }

        return response()->json([
            'status' => $healthy ? 'ok' : 'degraded',
            'app' => $app,
            'checks' => $checks,
            'time' => now()->toIso8601String(),
        ], $healthy ? 200 : 503);
    }

    /**
     * @param  callable(): array<string, mixed>  $probe
     * @return array<string, mixed>
     */
    private function check(callable $probe): array
    {
        $start = microtime(true);

        try {
            $extra = $probe();

            return ['status' => 'up', 'latency_ms' => $this->elapsed($start)] + $extra;
        } catch (Throwable $e) {
            $result = ['status' => 'down', 'latency_ms' => $this->elapsed($start)];

            if (config('app.debug')) {
                $result['error'] = $e->getMessage();
            }

            return $result;
        }
    }

    private function elapsed(float $start): int
    {
        return (int) round((microtime(true) - $start) * 1000);
    }
}
