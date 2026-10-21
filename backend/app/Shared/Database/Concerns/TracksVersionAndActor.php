<?php

declare(strict_types=1);

namespace App\Shared\Database\Concerns;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;

/**
 * Columnas comunes del contrato: created_by / updated_by con el usuario
 * autenticado y `version` (concurrencia optimista) +1 en cada actualización.
 * Un modelo sin columna `version` define `public function usesVersion(): bool { return false; }`.
 */
trait TracksVersionAndActor
{
    public static function bootTracksVersionAndActor(): void
    {
        static::creating(static function (Model $model): void {
            $actor = Auth::id();
            $model->created_by ??= $actor;
            $model->updated_by ??= $actor;
        });

        static::updating(static function (Model $model): void {
            $model->updated_by = Auth::id() ?? $model->updated_by;
            if ($model->usesVersion() && ! $model->isDirty('version')) {
                $model->version = (int) $model->getOriginal('version') + 1;
            }
        });
    }

    public function usesVersion(): bool
    {
        return true;
    }
}
