@php
    $statusMap = ['sent' => 'Enviado', 'signed_active' => 'Vigente', 'expired' => 'Vencido', 'terminated' => 'Terminado'];
    $kindMap = ['management' => 'Gestión de servicios', 'hosting' => 'Hosting', 'maintenance' => 'Mantenimiento', 'sla' => 'Acuerdo de nivel de servicio'];
    $status = $statusMap[$c->status] ?? ucfirst((string) $c->status);
    $kind = $kindMap[$c->kind] ?? ucfirst(str_replace('_', ' ', (string) $c->kind));
    $sym = $c->currency === 'USD' ? 'US$' : ($c->currency === 'PEN' ? 'S/' : (string) $c->currency);
    $fmtDate = fn ($d) => $d ? \Illuminate\Support\Carbon::parse($d)->format('d/m/Y') : '—';
    $customer = $c->customer;
    $brand = $c->brand;
@endphp
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Contrato {{ $c->number }}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f1b2e; margin: 0; padding: 32px; background: #f4f6fb; line-height: 1.5; }
  .sheet { max-width: 760px; margin: 0 auto; background: #fff; border: 1px solid #d9e0ec; border-top: 4px solid #0a3fc4; border-radius: 10px; padding: 32px 36px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #e9eef7; padding-bottom: 16px; margin-bottom: 20px; }
  .brand { font-size: 20px; font-weight: 800; color: #0a3fc4; }
  .doc-no { text-align: right; }
  .doc-no .label { font-size: 11px; letter-spacing: .04em; color: #5d6b84; text-transform: uppercase; }
  .doc-no .no { font-size: 18px; font-weight: 800; }
  h1 { font-size: 17px; margin: 0 0 4px; }
  .badge { display: inline-block; font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: 999px; background: #e8f3df; color: #3b6e1c; }
  .badge.warn { background: #fdf3d6; color: #7a5500; }
  .badge.off { background: #eceff5; color: #4b5870; }
  .grid { display: flex; gap: 20px; margin: 20px 0; }
  .card { flex: 1; border: 1px solid #e9eef7; border-radius: 8px; padding: 14px 16px; }
  .card h2 { font-size: 11px; letter-spacing: .04em; text-transform: uppercase; color: #5d6b84; margin: 0 0 8px; }
  .card .v { font-weight: 600; }
  table.terms { width: 100%; border-collapse: collapse; margin-top: 8px; }
  table.terms td { padding: 9px 12px; border-bottom: 1px solid #eef2f8; font-size: 14px; }
  table.terms td.k { color: #5d6b84; width: 46%; }
  table.terms td.v { font-weight: 600; text-align: right; }
  .foot { margin-top: 24px; padding-top: 14px; border-top: 1px solid #e9eef7; font-size: 12px; color: #8a96ab; }
  @media print { body { background: #fff; padding: 0; } .sheet { border: 0; } }
</style>
</head>
<body>
  <div class="sheet">
    <div class="head">
      <div>
        <div class="brand">{{ $brand->name ?? 'NubeConecta' }}</div>
        <h1 style="margin-top:10px">Acuerdo de servicio</h1>
        <span class="badge {{ in_array($c->status, ['expired', 'terminated'], true) ? 'off' : ($c->status === 'sent' ? 'warn' : '') }}">{{ $status }}</span>
      </div>
      <div class="doc-no">
        <div class="label">Contrato N.º</div>
        <div class="no">{{ $c->number }}</div>
        <div style="font-size:12px;color:#8a96ab;margin-top:4px">Versión {{ $c->current_version }}</div>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <h2>Prestador</h2>
        <div class="v">{{ $brand->name ?? 'NubeConecta' }}</div>
      </div>
      <div class="card">
        <h2>Cliente</h2>
        <div class="v">{{ $customer->legal_name ?? $customer->trade_name ?? '—' }}</div>
        @if($customer && $customer->tax_id)<div style="font-size:13px;color:#5d6b84">RUC {{ $customer->tax_id }}</div>@endif
      </div>
    </div>

    <table class="terms">
      <tr><td class="k">Tipo de acuerdo</td><td class="v">{{ $kind }}</td></tr>
      <tr><td class="k">Vigencia</td><td class="v">{{ $fmtDate($c->starts_on) }} — {{ $fmtDate($c->ends_on) }}</td></tr>
      <tr><td class="k">Moneda</td><td class="v">{{ $c->currency ?? '—' }}</td></tr>
      @if($c->management_fee_percent !== null)
      <tr><td class="k">Comisión de gestión</td><td class="v">{{ rtrim(rtrim(number_format((float) $c->management_fee_percent, 3), '0'), '.') }} %</td></tr>
      @endif
      @if($c->management_fee_min_minor !== null)
      <tr><td class="k">Comisión mínima</td><td class="v">{{ $sym }} {{ number_format($c->management_fee_min_minor / 100, 2) }}</td></tr>
      @endif
      @if($c->included_hours !== null)
      <tr><td class="k">Horas incluidas</td><td class="v">{{ rtrim(rtrim(number_format((float) $c->included_hours, 2), '0'), '.') }} h</td></tr>
      @endif
    </table>

    <div class="foot">
      Resumen del contrato generado el {{ now()->format('d/m/Y') }} · Documento informativo de los términos acordados.
    </div>
  </div>
</body>
</html>
