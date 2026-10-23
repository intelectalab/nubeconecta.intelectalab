<?php

declare(strict_types=1);

namespace App\Modules\Billing\Jobs;

use App\Modules\Billing\Contracts\EInvoiceConnector;
use App\Modules\Billing\Services\InvoiceService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;

/** IssueEInvoices de M-BIL §9 (cola `billing`, 5 reintentos según docs/08 §21): envía un comprobante emitido al OSE/PSE. */
final class SubmitEInvoice implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $tries = 5;

    /** @var list<int> */
    public array $backoff = [60, 300, 900, 3600];

    public function __construct(public readonly string $invoiceId) {}

    public function handle(InvoiceService $invoices, EInvoiceConnector $connector): void
    {
        $invoices->submit($this->invoiceId, $connector);
    }
}
