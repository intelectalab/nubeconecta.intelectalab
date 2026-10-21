<?php

declare(strict_types=1);

namespace App\Shared\Organization;

use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Organización operadora de la petición (docs/00 §19: hoy una sola fila).
 * Orden: valor fijado explícitamente (jobs, comandos, pruebas) → HUB_ORGANIZATION_ID
 * → la primera fila de `organizations`. Registrada como scoped: se reinicia en
 * cada petición o job.
 */
final class CurrentOrganization
{
    private ?string $id = null;

    public function set(?string $organizationId): void
    {
        $this->id = $organizationId;
    }

    public function id(): string
    {
        return $this->idOrNull()
            ?? throw new RuntimeException('No hay organización operadora. Ejecute el seeder o php artisan hub:create-admin.');
    }

    public function idOrNull(): ?string
    {
        return $this->id ??= $this->resolve();
    }

    private function resolve(): ?string
    {
        $configured = config('hub.organization.id');
        if (is_string($configured) && $configured !== '') {
            return $configured;
        }

        $id = DB::table('organizations')->whereNull('deleted_at')->orderBy('created_at')->orderBy('id')->value('id');

        return $id === null ? null : (string) $id;
    }
}
