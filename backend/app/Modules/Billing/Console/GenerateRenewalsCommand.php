<?php

declare(strict_types=1);

namespace App\Modules\Billing\Console;

use App\Modules\Billing\Jobs\GenerateRenewalInvoices;
use App\Modules\Billing\Services\InvoiceService;
use App\Shared\Settings\SettingsReader;
use Illuminate\Console\Command;

/** Ejecuta en el acto la generación de renovaciones (la programación diaria vive en routes/console.php). */
final class GenerateRenewalsCommand extends Command
{
    protected $signature = 'hub:billing:renewals';

    protected $description = 'Genera los comprobantes en borrador de los servicios que vencen (GenerateRenewalInvoices)';

    public function handle(InvoiceService $invoices, SettingsReader $settings): int
    {
        $created = (new GenerateRenewalInvoices)->handle($invoices, $settings);
        $this->info("Comprobantes de renovación creados: {$created}");

        return self::SUCCESS;
    }
}
