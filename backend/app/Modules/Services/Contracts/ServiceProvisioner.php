<?php

declare(strict_types=1);

namespace App\Modules\Services\Contracts;

use App\Modules\Services\Models\Service;

/**
 * Aprovisionamiento del servicio (crear la cuenta o el recurso en WHM/cPanel,
 * registradores, cloud). En la franja MVP solo existe ManualProvisioner: el
 * personal crea el recurso fuera del sistema y la activación lo confirma.
 * Los conectores reales (docs/08, vía INV) implementarán esta interfaz.
 */
interface ServiceProvisioner
{
    /** @return array{status: 'succeeded'|'failed', connector: ?string, external_id: ?string, message: string} */
    public function provision(Service $service): array;
}
