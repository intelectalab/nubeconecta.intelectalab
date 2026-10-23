<?php

declare(strict_types=1);

namespace App\Modules\Billing\Jobs;

use App\Modules\Billing\Services\CollectionsService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;

/**
 * Cobranza diaria (M-BIL §9 `RunDunningSequence` + `MarkOverdueInvoices`):
 * marca vencidos y registra los avisos de la secuencia. Sin recargo por mora
 * (D-04) ni suspensión (fuera de la franja).
 */
final class RunDunningSequence implements ShouldBeUnique, ShouldQueue
{
    use Dispatchable, Queueable;

    public int $uniqueFor = 3600;

    /** @return array{overdue: int, notices: int} */
    public function handle(CollectionsService $collections): array
    {
        return ['overdue' => $collections->markOverdue(), 'notices' => $collections->runDunning()];
    }
}
