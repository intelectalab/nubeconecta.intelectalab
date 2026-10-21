<?php

declare(strict_types=1);

namespace App\Shared\Concurrency;

use App\Shared\Http\Problem\ProblemException;
use Illuminate\Database\Eloquent\Model;

/**
 * PATCH exige `version` en el cuerpo; si no coincide responde 409 version_conflict
 * (docs/06 §2). Llamar dentro de la transacción que guarda el cambio.
 */
final class VersionGuard
{
    public static function check(Model $model, mixed $version): void
    {
        if (! is_int($version) && ! (is_string($version) && ctype_digit($version))) {
            throw ProblemException::validation(['version' => [__('validation.required', ['attribute' => 'version'])]]);
        }

        // Se relee con bloqueo para que dos PATCH simultáneos no pasen ambos.
        $current = (int) $model->newQueryWithoutScopes()->whereKey($model->getKey())->lockForUpdate()->value('version');

        if ($current !== (int) $version) {
            throw ProblemException::versionConflict($current);
        }
    }
}
