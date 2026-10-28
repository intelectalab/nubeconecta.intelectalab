<?php

declare(strict_types=1);

namespace App\Modules\Sales\Database\Seeders;

use App\Modules\Sales\Services\LeadService;
use Illuminate\Database\Seeder;

/** Etapas del embudo, canales de captación y correlativo de prospectos por defecto. Idempotente. */
final class SalesSeeder extends Seeder
{
    public function run(): void
    {
        app(LeadService::class)->ensureDefaults();
    }
}
