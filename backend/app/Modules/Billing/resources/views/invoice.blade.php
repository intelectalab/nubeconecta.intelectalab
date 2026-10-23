@php
    /** Representación impresa del comprobante (franja MVP). Importes en céntimos formateados sin flotantes. */
    $money = fn (int $v): string => number_format(intdiv($v, 100), 0, '.', ',').'.'.str_pad((string) ($v % 100), 2, '0', STR_PAD_LEFT);
    $docLabel = fn (?string $t): string => ['ruc' => 'RUC', 'dni' => 'DNI', 'ce' => 'CE', 'passport' => 'PASAPORTE', 'foreign_tax_id' => 'DOC. TRIB. EXTRANJERO', 'other' => 'DOC.'][$t ?? ''] ?? 'DOC.';
    $currencyName = $doc['currency'] === 'USD' ? 'Dólares americanos (USD)' : 'Soles (PEN)';
    $symbol = $doc['currency'] === 'USD' ? 'US$' : 'S/';
    $draft = $invoice->status === 'draft';
    $statusLabel = ['draft' => 'Borrador', 'issued' => 'Emitido', 'partially_paid' => 'Pagado parcialmente', 'paid' => 'Pagado', 'overdue' => 'Vencido', 'void' => 'Anulado'][$invoice->status] ?? $invoice->status;
    $fiscalLabel = ['not_applicable' => 'Sin envío', 'pending' => 'Pendiente de envío a SUNAT', 'accepted' => 'Aceptado por SUNAT', 'rejected' => 'Rechazado', 'voided' => 'Dado de baja'][$invoice->fiscal_status] ?? $invoice->fiscal_status;
    $cdr = $invoice->custom['einvoice']['cdr'] ?? null;
@endphp
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{ $doc['type_label'] }} {{ $doc['full_number'] ?? 'Borrador' }}</title>
<style>
    body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #111; background: #fff; margin: 24px; }
    .sheet { max-width: 780px; margin: 0 auto; }
    .head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
    .box { border: 2px solid #111; padding: 10px 16px; text-align: center; min-width: 220px; }
    .box strong { display: block; font-size: 14px; margin: 4px 0; }
    .banner { border: 2px dashed #b45309; color: #b45309; background: #fffbeb; padding: 8px 12px; margin: 12px 0; font-weight: bold; text-align: center; }
    .void { border-color: #b91c1c; color: #b91c1c; background: #fef2f2; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border: 1px solid #999; padding: 5px 6px; text-align: left; vertical-align: top; }
    th { background: #f1f1f1; }
    td.n, th.n { text-align: right; white-space: nowrap; }
    .grid { display: grid; grid-template-columns: 160px 1fr; gap: 2px 8px; margin-top: 12px; }
    .totals { width: 320px; margin-left: auto; }
    .muted { color: #555; font-size: 11px; }
    @media print { body { margin: 0; } .noprint { display: none; } }
</style>
</head>
<body>
<div class="sheet">
    <div class="head">
        <div>
            <strong style="font-size:15px">{{ $doc['issuer']['legal_name'] }}</strong><br>
            @if ($doc['issuer']['brand'])<span class="muted">Marca: {{ $doc['issuer']['brand'] }}</span><br>@endif
            {{ $doc['issuer']['address'] ?? 'Domicilio fiscal no registrado' }}
        </div>
        <div class="box">
            RUC {{ $doc['issuer']['tax_id'] }}
            <strong>{{ mb_strtoupper($doc['type_label']) }}</strong>
            {{ $doc['full_number'] ?? 'SIN NUMERAR' }}
        </div>
    </div>

    @if ($draft)
        <div class="banner">BORRADOR — sin serie ni número, sin valor fiscal.</div>
    @endif
    @if ($simulated)
        <div class="banner">SIMULACIÓN — Comprobante procesado por el conector de prueba. No fue enviado a SUNAT ni a un OSE/PSE y no tiene validez tributaria.</div>
    @endif
    @if ($invoice->status === 'void')
        <div class="banner void">ANULADO el {{ $invoice->voided_at?->format('d/m/Y') }}</div>
    @endif

    <div class="grid">
        <span>Fecha de emisión:</span><span>{{ $doc['issue_date'] ? \Illuminate\Support\Carbon::parse($doc['issue_date'])->format('d/m/Y') : '—' }}</span>
        <span>Fecha de vencimiento:</span><span>{{ $doc['due_date'] ? \Illuminate\Support\Carbon::parse($doc['due_date'])->format('d/m/Y') : '—' }}</span>
        <span>Cliente:</span><span>{{ $doc['customer']['legal_name'] }}</span>
        <span>{{ $docLabel($doc['customer']['tax_id_type']) }}:</span><span>{{ $doc['customer']['tax_id'] ?? '—' }}</span>
        <span>Dirección:</span><span>{{ $doc['customer']['address'] ?? '—' }}</span>
        <span>Moneda:</span><span>{{ $currencyName }}</span>
        <span>Forma de pago:</span><span>{{ $doc['due_date'] && $doc['issue_date'] && $doc['due_date'] > $doc['issue_date'] ? 'Crédito' : 'Contado' }}</span>
        <span>Estado:</span><span>{{ $statusLabel }} · {{ $fiscalLabel }}</span>
    </div>

    <table>
        <thead>
        <tr><th class="n">Cant.</th><th>Unidad</th><th>Descripción</th><th class="n">Valor unitario</th><th class="n">Valor de venta</th></tr>
        </thead>
        <tbody>
        @foreach ($doc['items'] as $item)
            <tr>
                <td class="n">{{ rtrim(rtrim($item['quantity'], '0'), '.') }}</td>
                <td>ZZ (servicio)</td>
                <td>{{ $item['description'] }}@if ($item['period_start'])<br><span class="muted">Periodo: {{ \Illuminate\Support\Carbon::parse($item['period_start'])->format('d/m/Y') }} al {{ \Illuminate\Support\Carbon::parse($item['period_end'])->format('d/m/Y') }}</span>@endif</td>
                <td class="n">{{ $money($item['unit_price_minor']) }}</td>
                <td class="n">{{ $money($item['subtotal_minor']) }}</td>
            </tr>
        @endforeach
        </tbody>
    </table>

    <table class="totals">
        <tr><th>Op. gravada</th><td class="n">{{ $symbol }} {{ $money($doc['taxable_minor']) }}</td></tr>
        @if ($doc['unaffected_minor'] > 0)
            <tr><th>{{ $doc['tax_treatment'] === 'export' ? 'Op. exportación' : 'Op. no gravada' }}</th><td class="n">{{ $symbol }} {{ $money($doc['unaffected_minor']) }}</td></tr>
        @endif
        <tr><th>IGV ({{ rtrim(rtrim((string) $doc['tax_rate_percent'], '0'), '.') }} %)</th><td class="n">{{ $symbol }} {{ $money($doc['tax_minor']) }}</td></tr>
        <tr><th>Importe total</th><td class="n"><strong>{{ $symbol }} {{ $money($doc['total_minor']) }}</strong></td></tr>
        @if (! $draft)
            <tr><th>Saldo pendiente</th><td class="n">{{ $symbol }} {{ $money($invoice->balance_minor) }}</td></tr>
        @endif
    </table>

    <p><strong>{{ $words }}</strong></p>
    @if ($doc['tax_treatment'] === 'export')
        <p class="muted">Operación de exportación de servicios no gravada con el IGV.</p>
    @endif
    @if ($cdr)
        <p class="muted">CDR: {{ $cdr['description'] ?? '' }} · Código {{ $cdr['response_code'] ?? '' }} · Hash {{ $cdr['hash'] ?? '' }}</p>
    @endif
    <p class="muted">Representación impresa de la {{ mb_strtolower($doc['type_label']) }}. @if (! $simulated && ! $draft)Puede consultarla en el portal del cliente.@endif</p>
</div>
</body>
</html>
