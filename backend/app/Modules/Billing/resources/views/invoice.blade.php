@php
    /** Representación impresa del comprobante (franja MVP). Importes en céntimos formateados sin flotantes. */
    $money = fn (int $v): string => number_format(intdiv($v, 100), 0, '.', ',').'.'.str_pad((string) ($v % 100), 2, '0', STR_PAD_LEFT);
    $docLabel = fn (?string $t): string => ['ruc' => 'RUC', 'dni' => 'DNI', 'ce' => 'CE', 'passport' => 'PASAPORTE', 'foreign_tax_id' => 'DOC. TRIB. EXTRANJERO', 'other' => 'DOC.'][$t ?? ''] ?? 'DOC.';
    $currencyName = $doc['currency'] === 'USD' ? 'Dólares americanos (USD)' : 'Soles (PEN)';
    $symbol = $doc['currency'] === 'USD' ? 'US$' : 'S/';
    $draft = $invoice->status === 'draft';
    $statusLabel = ['draft' => 'Borrador', 'issued' => 'Emitido', 'partially_paid' => 'Pagado parcialmente', 'paid' => 'Pagado', 'overdue' => 'Vencido', 'void' => 'Anulado'][$invoice->status] ?? $invoice->status;
    $fiscalLabel = ['not_applicable' => 'Sin envío', 'pending' => 'Pendiente de envío a SUNAT', 'accepted' => 'Aceptado por SUNAT', 'rejected' => 'Rechazado', 'voided' => 'Dado de baja'][$invoice->fiscal_status] ?? $invoice->fiscal_status;
    $statusTone = ['paid' => 'ok', 'issued' => 'info', 'partially_paid' => 'warn', 'overdue' => 'bad', 'void' => 'bad', 'draft' => 'mut'][$invoice->status] ?? 'mut';
    $cdr = $invoice->custom['einvoice']['cdr'] ?? null;
    $credit = $doc['due_date'] && $doc['issue_date'] && $doc['due_date'] > $doc['issue_date'];
@endphp
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{ $doc['type_label'] }} {{ $doc['full_number'] ?? 'Borrador' }}</title>
<style>
    :root { --ink: #1f2937; --soft: #6b7280; --line: #e5e7eb; --accent: #1f3b63; --accent-soft: #eef2f7; --paper: #ffffff; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 12.5px; line-height: 1.5; color: var(--ink); background: #f3f4f6; margin: 0; padding: 24px; }
    .sheet { max-width: 820px; margin: 0 auto; background: var(--paper); border: 1px solid var(--line); border-top: 5px solid var(--accent); border-radius: 10px; padding: 28px 32px 24px; }
    .head { display: flex; justify-content: space-between; gap: 20px; align-items: flex-start; }
    .issuer-name { font-size: 17px; font-weight: 700; color: var(--accent); letter-spacing: .2px; }
    .issuer-meta { color: var(--soft); font-size: 11.5px; margin-top: 3px; }
    .docbox { border: 1.5px solid var(--accent); border-radius: 8px; padding: 10px 18px; text-align: center; min-width: 230px; }
    .docbox .ruc { font-size: 11.5px; color: var(--soft); letter-spacing: .3px; }
    .docbox .type { display: block; font-size: 14px; font-weight: 700; color: var(--accent); margin: 3px 0; text-transform: uppercase; }
    .docbox .num { font-size: 15px; font-weight: 700; letter-spacing: .5px; }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: .2px; }
    .badge.ok { background: #e7f6ec; color: #136c34; } .badge.info { background: #e8effb; color: #1f3b63; }
    .badge.warn { background: #fef3e2; color: #92540a; } .badge.bad { background: #fdecec; color: #a01919; } .badge.mut { background: #eef0f2; color: #555; }
    .banner { border-radius: 8px; padding: 9px 14px; margin: 14px 0; font-weight: 700; text-align: center; font-size: 12px; }
    .banner.draft { background: #fffbeb; color: #92540a; border: 1px dashed #b45309; }
    .banner.sim { background: #eef5ff; color: #1f3b63; border: 1px dashed #2f5b8f; }
    .banner.void { background: #fdecec; color: #a01919; border: 1px dashed #b91c1c; }
    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 18px 0 4px; }
    .party { border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; }
    .party h4 { margin: 0 0 8px; font-size: 10.5px; text-transform: uppercase; letter-spacing: .6px; color: var(--soft); font-weight: 700; }
    .kv { display: grid; grid-template-columns: auto 1fr; gap: 3px 10px; }
    .kv dt { color: var(--soft); white-space: nowrap; } .kv dd { margin: 0; font-weight: 600; }
    table.items { width: 100%; border-collapse: collapse; margin-top: 18px; font-size: 12px; }
    table.items thead th { background: var(--accent); color: #fff; padding: 8px 10px; text-align: left; font-size: 11px; letter-spacing: .3px; }
    table.items tbody td { padding: 8px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
    table.items tbody tr:nth-child(even) td { background: #fafbfc; }
    .n { text-align: right; white-space: nowrap; }
    .mono { font-variant-numeric: tabular-nums; }
    .foot { display: flex; justify-content: space-between; gap: 24px; margin-top: 18px; align-items: flex-start; }
    .words { flex: 1; }
    .words .lbl { color: var(--soft); font-size: 10.5px; text-transform: uppercase; letter-spacing: .5px; }
    .words .amt { font-weight: 700; margin-top: 2px; }
    table.totals { width: 300px; border-collapse: collapse; }
    table.totals th { text-align: left; color: var(--soft); font-weight: 600; padding: 5px 8px; }
    table.totals td { text-align: right; padding: 5px 8px; white-space: nowrap; }
    table.totals tr.total th, table.totals tr.total td { background: var(--accent-soft); color: var(--accent); font-size: 14px; font-weight: 700; border-radius: 6px; }
    table.totals tr.due th, table.totals tr.due td { border-top: 1px solid var(--line); }
    .notes { margin-top: 18px; border-top: 1px solid var(--line); padding-top: 12px; color: var(--soft); font-size: 11px; }
    .notes p { margin: 4px 0; }
    @media print {
        body { background: #fff; padding: 0; }
        .sheet { border: 0; border-top: 4px solid var(--accent); border-radius: 0; max-width: none; padding: 0 8px; }
        .party, table.items tbody td, table.totals tr.due th { border-color: #ccc; }
    }
</style>
</head>
<body>
<div class="sheet">
    <div class="head">
        <div>
            <div class="issuer-name">{{ $doc['issuer']['legal_name'] }}</div>
            @if ($doc['issuer']['brand'])<div class="issuer-meta">Marca: {{ $doc['issuer']['brand'] }}</div>@endif
            <div class="issuer-meta">{{ $doc['issuer']['address'] ?? 'Domicilio fiscal no registrado' }}</div>
        </div>
        <div class="docbox">
            <div class="ruc">RUC {{ $doc['issuer']['tax_id'] }}</div>
            <span class="type">{{ mb_strtoupper($doc['type_label']) }}</span>
            <div class="num">{{ $doc['full_number'] ?? 'SIN NUMERAR' }}</div>
        </div>
    </div>

    @if ($draft)
        <div class="banner draft">BORRADOR — sin serie ni número, sin valor fiscal.</div>
    @endif
    @if ($simulated)
        <div class="banner sim">SIMULACIÓN — Comprobante procesado por el conector de prueba. No fue enviado a SUNAT ni a un OSE/PSE y no tiene validez tributaria.</div>
    @endif
    @if ($invoice->status === 'void')
        <div class="banner void">ANULADO el {{ $invoice->voided_at?->format('d/m/Y') }}</div>
    @endif

    <div class="parties">
        <div class="party">
            <h4>Cliente</h4>
            <dl class="kv">
                <dt>Razón social</dt><dd>{{ $doc['customer']['legal_name'] }}</dd>
                <dt>{{ $docLabel($doc['customer']['tax_id_type']) }}</dt><dd>{{ $doc['customer']['tax_id'] ?? '—' }}</dd>
                <dt>Dirección</dt><dd>{{ $doc['customer']['address'] ?? '—' }}</dd>
            </dl>
        </div>
        <div class="party">
            <h4>Comprobante</h4>
            <dl class="kv">
                <dt>Emisión</dt><dd>{{ $doc['issue_date'] ? \Illuminate\Support\Carbon::parse($doc['issue_date'])->format('d/m/Y') : '—' }}</dd>
                <dt>Vencimiento</dt><dd>{{ $doc['due_date'] ? \Illuminate\Support\Carbon::parse($doc['due_date'])->format('d/m/Y') : '—' }}</dd>
                <dt>Moneda</dt><dd>{{ $currencyName }}</dd>
                <dt>Forma de pago</dt><dd>{{ $credit ? 'Crédito' : 'Contado' }}</dd>
                <dt>Estado</dt><dd><span class="badge {{ $statusTone }}">{{ $statusLabel }}</span> <span class="issuer-meta">{{ $fiscalLabel }}</span></dd>
            </dl>
        </div>
    </div>

    <table class="items">
        <thead>
        <tr><th class="n">Cant.</th><th>Unidad</th><th>Descripción</th><th class="n">Valor unitario</th><th class="n">Valor de venta</th></tr>
        </thead>
        <tbody>
        @foreach ($doc['items'] as $item)
            <tr>
                <td class="n mono">{{ rtrim(rtrim($item['quantity'], '0'), '.') }}</td>
                <td>ZZ (servicio)</td>
                <td>{{ $item['description'] }}@if ($item['period_start'])<br><span class="issuer-meta">Periodo: {{ \Illuminate\Support\Carbon::parse($item['period_start'])->format('d/m/Y') }} al {{ \Illuminate\Support\Carbon::parse($item['period_end'])->format('d/m/Y') }}</span>@endif</td>
                <td class="n mono">{{ $money($item['unit_price_minor']) }}</td>
                <td class="n mono">{{ $money($item['subtotal_minor']) }}</td>
            </tr>
        @endforeach
        </tbody>
    </table>

    <div class="foot">
        <div class="words">
            <div class="lbl">Son</div>
            <div class="amt">{{ $words }}</div>
        </div>
        <table class="totals">
            <tr><th>Op. gravada</th><td class="mono">{{ $symbol }} {{ $money($doc['taxable_minor']) }}</td></tr>
            @if ($doc['unaffected_minor'] > 0)
                <tr><th>{{ $doc['tax_treatment'] === 'export' ? 'Op. exportación' : 'Op. no gravada' }}</th><td class="mono">{{ $symbol }} {{ $money($doc['unaffected_minor']) }}</td></tr>
            @endif
            <tr><th>IGV ({{ rtrim(rtrim((string) $doc['tax_rate_percent'], '0'), '.') }} %)</th><td class="mono">{{ $symbol }} {{ $money($doc['tax_minor']) }}</td></tr>
            <tr class="total"><th>Importe total</th><td class="mono">{{ $symbol }} {{ $money($doc['total_minor']) }}</td></tr>
            @if (! $draft)
                <tr class="due"><th>Saldo pendiente</th><td class="mono">{{ $symbol }} {{ $money($invoice->balance_minor) }}</td></tr>
            @endif
        </table>
    </div>

    <div class="notes">
        @if ($doc['tax_treatment'] === 'export')
            <p>Operación de exportación de servicios no gravada con el IGV.</p>
        @endif
        @if ($cdr)
            <p>CDR: {{ $cdr['description'] ?? '' }} · Código {{ $cdr['response_code'] ?? '' }} · Hash {{ $cdr['hash'] ?? '' }}</p>
        @endif
        <p>Representación impresa de la {{ mb_strtolower($doc['type_label']) }}.@if (! $simulated && ! $draft) Puede consultarla en el portal del cliente.@endif</p>
    </div>
</div>
</body>
</html>
