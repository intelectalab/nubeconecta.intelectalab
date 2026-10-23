<?php

declare(strict_types=1);

namespace App\Modules\Billing\Http\Controllers;

use App\Modules\Billing\Contracts\EInvoiceConnector;
use App\Modules\Billing\Http\Resources\InvoiceResource;
use App\Modules\Billing\Models\Invoice;
use App\Modules\Billing\Services\InvoiceService;
use App\Modules\Billing\Support\AmountInWords;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;

/**
 * /api/v1/admin/invoices (billing.invoice.*), P-BIL-02/03 en su franja MVP:
 * listado con filtros y cursor, ficha, emitir, anular y representación
 * imprimible (HTML).
 */
final class InvoiceController
{
    public function __construct(private readonly InvoiceService $invoices) {}

    public function index(Request $request): JsonResponse
    {
        $request->validate(self::filterRules() + [
            'filter.customer_id' => ['sometimes', 'uuid'],
            'filter.brand_id' => ['sometimes', 'uuid'],
            'filter.order_id' => ['sometimes', 'uuid'],
            'q' => ['sometimes', 'nullable', 'string', 'max:100'],
        ]);
        $query = Invoice::query()->with(['customer:id,code,legal_name,trade_name']);
        self::filter($query, $request, ['status', 'fiscal_status', 'type', 'currency', 'customer_id', 'brand_id']);
        if (is_string($orderId = $request->input('filter.order_id')) && $orderId !== '') {
            $query->where('custom->order_id', $orderId); // comprobante generado al aprobar ese pedido
        }
        $q = trim((string) $request->query('q', ''));
        if ($q !== '') {
            $query->where(fn (Builder $w) => $w->whereRaw("(series || '-' || lpad(number::text, 8, '0')) ilike ?", ["%{$q}%"])
                ->orWhereHas('customer', fn (Builder $c) => $c->where('legal_name', 'ilike', "%{$q}%")->orWhere('code', 'ilike', "%{$q}%")->orWhere('tax_id', 'ilike', "%{$q}%")));
        }

        return CursorPagination::respond($query, $request, ['created_at', 'issue_date', 'due_date', 'total_minor', 'number'], InvoiceResource::class);
    }

    /** @return array<string, list<mixed>> */
    public static function filterRules(): array
    {
        return [
            'filter.status' => ['sometimes', Rule::in(Invoice::STATUSES)],
            'filter.fiscal_status' => ['sometimes', Rule::in(Invoice::FISCAL_STATUSES)],
            'filter.type' => ['sometimes', Rule::in(Invoice::TYPES)],
            'filter.currency' => ['sometimes', Rule::in(['PEN', 'USD'])],
            'filter.issued_from' => ['sometimes', 'date_format:Y-m-d'],
            'filter.issued_to' => ['sometimes', 'date_format:Y-m-d'],
            'filter.has_balance' => ['sometimes', Rule::in(['true', 'false', '1', '0'])],
        ];
    }

    /** @param list<string> $columns */
    public static function filter(Builder $query, Request $request, array $columns): void
    {
        foreach ($columns as $column) {
            $value = $request->input("filter.{$column}");
            if (is_string($value) && $value !== '') {
                $query->where($column, $value);
            }
        }
        if ($from = $request->input('filter.issued_from')) {
            $query->where('issue_date', '>=', $from);
        }
        if ($to = $request->input('filter.issued_to')) {
            $query->where('issue_date', '<=', $to);
        }
        $balance = $request->input('filter.has_balance');
        if ($balance !== null) {
            in_array($balance, ['true', '1'], true) ? $query->where('balance_minor', '>', 0) : $query->where('balance_minor', 0);
        }
    }

    public function show(string $id): InvoiceResource
    {
        return new InvoiceResource(Invoice::query()->with(['items', 'customer', 'allocations.payment.method'])->findOrFail($id));
    }

    public function issue(Request $request, string $id): InvoiceResource
    {
        $data = $request->validate(['version' => ['sometimes', 'integer']]);
        $this->invoices->issue(Invoice::query()->findOrFail($id), isset($data['version']) ? (int) $data['version'] : null);

        return $this->show($id);
    }

    public function void(Request $request, string $id, EInvoiceConnector $connector): InvoiceResource
    {
        $data = $request->validate(['reason' => ['required', 'string', 'min:3', 'max:500'], 'version' => ['sometimes', 'integer']]);
        $this->invoices->void(Invoice::query()->findOrFail($id), $data['reason'], isset($data['version']) ? (int) $data['version'] : null, $connector);

        return $this->show($id);
    }

    public function document(Request $request, string $id): Response
    {
        return self::render($this->invoices, Invoice::query()->findOrFail($id), $request->boolean('download'));
    }

    /** Representación impresa en HTML (imprimible a PDF desde el navegador); `download=1` la entrega como adjunto. */
    public static function render(InvoiceService $invoices, Invoice $invoice, bool $download): Response
    {
        $doc = $invoices->document($invoice);
        $html = view('billing::invoice', [
            'doc' => $doc, 'invoice' => $invoice, 'words' => AmountInWords::format($doc['total_minor'], $doc['currency']),
            'simulated' => (bool) ($invoice->custom['einvoice']['simulated'] ?? false),
        ])->render();
        $name = ($doc['full_number'] ?? 'borrador-'.substr($invoice->id, 0, 8)).'.html';

        return response($html, 200, [
            'Content-Type' => 'text/html; charset=utf-8',
            'Content-Disposition' => ($download ? 'attachment' : 'inline').'; filename="'.$name.'"',
            'X-Content-Type-Options' => 'nosniff',
            'Content-Security-Policy' => "default-src 'none'; style-src 'unsafe-inline'",
        ]);
    }
}
