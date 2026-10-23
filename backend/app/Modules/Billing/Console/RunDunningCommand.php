<?php

declare(strict_types=1);

namespace App\Modules\Billing\Console;

use App\Modules\Billing\Jobs\RunDunningSequence;
use App\Modules\Billing\Services\CollectionsService;
use Illuminate\Console\Command;

/** Ejecuta en el acto la cobranza diaria (la programación vive en routes/console.php). */
final class RunDunningCommand extends Command
{
    protected $signature = 'hub:billing:dunning';

    protected $description = 'Marca comprobantes vencidos y registra los avisos de cobranza del día (RunDunningSequence)';

    public function handle(CollectionsService $collections): int
    {
        $result = (new RunDunningSequence)->handle($collections);
        $this->info("Vencidos: {$result['overdue']}; avisos registrados: {$result['notices']}");

        return self::SUCCESS;
    }
}
