<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Console;

use App\Shared\Organization\CurrentOrganization;
use Illuminate\Support\Str;

/**
 * Catálogo de lanzamiento: mismos productos, planes, características y precios que el
 * demo ({@see AbstractCatalogLoader}) con códigos limpios y permitido en producción.
 * Solo crea lo que falta: un producto o plan cuyo código ya existe no se toca.
 *
 * Códigos: producto = slug del nombre con prefijo de familia (`hosting-pyme`, `vps-pro`,
 * `dominio-com-pe`, `combo-emprende-online`); plan = producto + ciclo (`hosting-pyme-anual`).
 * El registrador de dominios queda con costo 0: completar tarifas reales en el panel.
 */
final class LaunchCatalogCommand extends AbstractCatalogLoader
{
    protected $signature = 'hub:catalog:launch {--brand=alojamientoplus : Código de la marca destino}';

    protected $description = 'Carga el catálogo de lanzamiento (idempotente; no modifica lo ya existente)';

    private const PREFIX = ['hosting' => 'hosting', 'combos' => 'combo'];

    private const SUFFIX = [
        'm' => 'mensual', 't' => 'trimestral', 's' => 'semestral', 'a' => 'anual',
        'monthly' => 'mensual', 'annual' => 'anual', 'one_time' => 'unico',
    ];

    public function handle(CurrentOrganization $organization): int
    {
        $this->createOnly = true;
        $this->load($organization);
        $this->info("Catálogo de lanzamiento en la marca {$this->option('brand')}: {$this->products} productos creados, {$this->plansCount} planes creados, {$this->skipped} productos ya existían (sin cambios).");

        return self::SUCCESS;
    }

    protected function productCode(string $id, string $cat, string $name): string
    {
        $slug = Str::slug($name);
        $prefix = self::PREFIX[$cat] ?? null;

        return $prefix !== null && ! str_starts_with($slug, $prefix.'-') ? "{$prefix}-{$slug}" : $slug;
    }

    protected function planCode(string $suffix): string
    {
        return $this->currentCode.'-'.(self::SUFFIX[$suffix] ?? $suffix);
    }

    protected function productCustom(string $id, array $custom): array
    {
        return ['source' => 'catalogo-lanzamiento'] + $custom;
    }

    protected function describe(string $sub): string
    {
        return "{$sub}.";
    }

    protected function registrar(): array
    {
        return ['registrador-dominios', 'Registrador de dominios', 'Costos pendientes de cargar (0 provisional).'];
    }
}
