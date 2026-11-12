<?php

declare(strict_types=1);

namespace Tests\Feature\Shared;

use App\Shared\Http\Problem\ProblemException;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

/**
 * Observabilidad: los errores de negocio 4xx son esperados y NO deben registrarse
 * (ruido); los 5xx reales SÍ deben llegar al logger para no operar prod a ciegas.
 */
final class ProblemReportingTest extends TestCase
{
    public function test_report_contract_silences_4xx_and_logs_5xx(): void
    {
        // report() devuelve true = "manejado" (no se loguea); false = reporte por defecto.
        $this->assertTrue((new ProblemException(403, 'forbidden'))->report());
        $this->assertTrue((new ProblemException(404, 'not_found'))->report());
        $this->assertTrue((new ProblemException(422, 'validation_failed'))->report());
        $this->assertFalse((new ProblemException(500, 'server_error'))->report());
        $this->assertFalse((new ProblemException(503, 'service_unavailable'))->report());
    }

    public function test_business_4xx_errors_are_not_logged(): void
    {
        Log::spy();

        report(new ProblemException(403, 'forbidden'));
        report(new ProblemException(422, 'validation_failed', 'detalle'));

        Log::shouldNotHaveReceived('error');
    }

    public function test_server_5xx_errors_are_logged(): void
    {
        Log::spy();

        report(new ProblemException(500, 'server_error', 'algo reventó'));

        Log::shouldHaveReceived('error')->once();
    }
}
