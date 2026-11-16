<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Console;

use App\Shared\Organization\CurrentOrganization;

/**
 * Catálogo de demostración (MVP): copia los datos del prototipo del panel a la marca
 * NubeConecta. Idempotente (códigos `demo-*`); se niega en producción.
 * Precios en PEN tal cual del prototipo (y USD donde el prototipo los trae); sin costos.
 * Los datos viven en {@see AbstractCatalogLoader}.
 */
final class DemoCatalogCommand extends AbstractCatalogLoader
{
    protected $signature = 'hub:demo:catalog {--brand=alojamientoplus : Código de la marca destino}';

    protected $description = 'Carga el catálogo de demostración del prototipo (no se ejecuta en producción)';

    private const NOTE = 'Dato del prototipo (demostración).';

    public function handle(CurrentOrganization $organization): int
    {
        if ($this->laravel->environment('production')) {
            $this->error('hub:demo:catalog no se ejecuta en producción.');

            return self::FAILURE;
        }

        $this->load($organization);
        $this->info("Catálogo de demostración cargado en la marca {$this->option('brand')}: ".($this->products + $this->skipped).' productos.');

        return self::SUCCESS;
    }

    protected function productCode(string $id, string $cat, string $name): string
    {
        return 'demo-'.strtolower($id);
    }

    protected function planCode(string $suffix): string
    {
        return 'demo-'.strtolower("{$this->currentId}-{$suffix}");
    }

    protected function productCustom(string $id, array $custom): array
    {
        return ['demo' => true, 'source' => 'prototipo', 'prototype_id' => strtoupper($id)] + $custom;
    }

    protected function describe(string $sub): string
    {
        return "{$sub}. ".self::NOTE;
    }

    protected function registrar(): array
    {
        return ['demo-registrador', 'Registrador (demostración)', self::NOTE];
    }
}
