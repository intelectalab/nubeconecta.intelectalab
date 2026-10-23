<?php

declare(strict_types=1);

namespace App\Modules\Services\Support;

use App\Modules\Services\Contracts\ServiceProvisioner;
use App\Modules\Services\Models\Service;

/** Alternativa manual (docs/08): sin conector, la activación confirma que el recurso ya existe. */
final class ManualProvisioner implements ServiceProvisioner
{
    public function provision(Service $service): array
    {
        return ['status' => 'succeeded', 'connector' => null, 'external_id' => null, 'message' => 'Aprovisionamiento manual: sin conector, el personal confirmó el recurso.'];
    }
}
