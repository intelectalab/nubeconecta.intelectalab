/**
 * Acciones de negocio compartidas entre pantallas (diálogos del prototipo
 * l.1897 invDetail y l.3291-3350 payDlg/newClientDlg/newTicketDlg).
 *
 *   const act = useActions();
 *   act.openInvoice('F001-00018240');   // modal de detalle del comprobante
 *   act.payDialog(cid, invId?);         // registrar pago (comisión PayPal como línea aparte)
 *   act.newClient();                    // alta de cliente -> abre su ficha
 *   act.newTicket(cid?);                // alta de ticket
 *   act.openTicket('TK-26410');         // navega a #tickets/TK-26410
 *   act.fakeDownload('F001-…');         // toast de descarga simulada
 */
import { useCallback, useMemo } from 'react';
import { DualMoney } from '../components/Money';
import { BrandTag, Chip, Kv, Note, StatusChip, SunatChip } from '../components/ui';
import { Icon } from '../components/Icon';
import { addClient, addTicket, BRANDS, CBY, clients, COUNTRIES, fClients, findClient, IBY, saldo, SEV, SLA } from '../data/db';
import { fD, money, moneyRaw, TODAY } from '../data/format';
import type { BrandId, Cur, Invoice, Sev } from '../data/types';
import { useApp } from './context';

/** <datalist id="dlClients"> con los clientes de la marca activa (para inputs con list="dlClients"). */
export function ClientDatalist() {
  const { brand, dataVersion } = useApp();
  const list = useMemo(() => fClients(brand), [brand, dataVersion]);
  return (
    <datalist id="dlClients">
      {list.map((c) => (
        <option key={c.id} value={c.name} />
      ))}
    </datalist>
  );
}

function InvoiceBody({ v }: { v: Invoice }) {
  const c = CBY[v.cid];
  const m = (x: number) => moneyRaw(x, v.cur);
  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <StatusChip status={v.status} />
        <SunatChip s={v.sunat} />
        <Chip kind="outline">{v.cur === 'PEN' ? 'Soles' : 'Dólares'}</Chip>
        <BrandTag brand={c.brand} />
      </div>
      {v.sunat === 'Rechazada' ? (
        <Note kind="warn" icon="tri">
          SUNAT rechazó el comprobante: código 2800 — el tipo de documento del adquiriente no coincide. Corrija los datos del cliente y reenvíe.
        </Note>
      ) : null}
      <Kv
        items={[
          ['Emisión', fD(v.issue)],
          ['Vencimiento', fD(v.due)],
          ...(v.ref ? ([['Referencia', <span className="mono">{v.ref}</span>]] as [string, JSX.Element][]) : []),
          ['Medio de pago', v.method || '—'],
        ]}
      />
      <div className="tw" style={{ border: '1px solid var(--border)', borderRadius: 8 }}>
        <table className="t lines">
          <thead>
            <tr>
              <th>Descripción</th>
              <th className="r">Cant.</th>
              <th className="r">P. unit.</th>
              <th className="r">Importe</th>
            </tr>
          </thead>
          <tbody>
            {v.lines.map((l, i) => (
              <tr key={i} style={l.fee ? { background: 'var(--warn-bg)' } : undefined}>
                <td>
                  {l.d}
                  {l.fee ? (
                    <span className="chip warn" style={{ marginLeft: 4 }}>
                      Línea aparte
                    </span>
                  ) : null}
                </td>
                <td className="r num">{l.q}</td>
                <td className="r num">{m(l.pu)}</td>
                <td className="r num">{m(l.q * l.pu)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="tot num">
        <div>
          <span>Op. gravadas</span>
          <span>{m(v.sub)}</span>
        </div>
        <div>
          <span>IGV {v.igvR ? '18 %' : '(exportación de servicios 0 %)'}</span>
          <span>{m(v.igv)}</span>
        </div>
        <div className="g">
          <span>Total</span>
          <span>{m(v.total)}</span>
        </div>
        <div>
          <span>Pagado</span>
          <span>{m(v.paid)}</span>
        </div>
        <div>
          <span>
            <b>Saldo</b>
          </span>
          <span>
            <b>{m(saldo(v))}</b>
          </span>
        </div>
      </div>
      {v.payments.length ? (
        <div>
          <b style={{ fontSize: 13 }}>Pagos registrados</b>
          <ul className="rows" style={{ marginTop: 6, border: '1px solid var(--border)', borderRadius: 8 }}>
            {v.payments.map((p, i) => (
              <li key={i} style={{ borderTop: i ? undefined : 0 }}>
                <Icon name="card" size="sm" />
                <div className="grow">
                  <b>{p.m || '—'}</b>
                  <small>{fD(p.d)}</small>
                </div>
                <span className="num strong">{m(p.amt)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

export function useActions() {
  const { dialogs, toast, refresh, navigate, brand, cur } = useApp();

  const fakeDownload = useCallback((name: string) => toast('Descarga simulada', `${name}.pdf generado (simulado)`, 'info'), [toast]);

  const payDialog = useCallback(
    (cid: string, invId?: string) => {
      const c = CBY[cid];
      const pend = c.invoices.filter((v) => (v.status === 'Pendiente' || v.status === 'Vencida') && v.type !== 'Nota de crédito');
      if (!pend.length) {
        toast('Sin saldo pendiente', `${c.name} no tiene comprobantes por cobrar.`, 'info');
        return;
      }
      const first = (invId && IBY[invId]) || pend[0];
      dialogs.form({
        title: 'Registrar pago',
        sub: c.name,
        fields: [
          { id: 'inv', label: 'Comprobante', type: 'select', options: pend.map((v) => [v.id, `${v.num} · saldo ${money(saldo(v), v.cur, cur)}`] as [string, string]), value: first.id, full: true },
          { id: 'm', label: 'Medio de pago', type: 'select', options: ['Tarjeta (pasarela local)', 'Transferencia', 'PayPal'], value: 'Transferencia' },
          { id: 'amt', label: `Monto (${first.cur === 'PEN' ? 'S/' : 'US$'})`, type: 'number', step: '0.01', min: 0, value: saldo(first).toFixed(2), req: true },
          { id: 'ref', label: 'Referencia / N.º de operación', ph: 'Ej. 48211907', full: true },
        ],
        pre: <Note>Con PayPal, la comisión se agrega al comprobante como línea aparte «Comisión por medio de pago».</Note>,
        submit: 'Registrar pago',
        validate: (v) => (+v.amt > 0 ? null : 'El monto debe ser mayor que cero.'),
        onSubmit: (v) => {
          const inv = IBY[v.inv];
          let amt = +v.amt;
          if (v.m === 'PayPal' && !inv.lines.some((l) => l.fee)) {
            const fee = +(inv.sub * 0.054 + (inv.cur === 'USD' ? 0.3 : 1.15)).toFixed(2);
            inv.lines.push({ d: 'Comisión por medio de pago (PayPal 5.4 % + tarifa fija)', q: 1, pu: fee, fee: true });
            inv.sub = +(inv.sub + fee).toFixed(2);
            inv.igv = +(inv.sub * inv.igvR).toFixed(2);
            inv.total = +(inv.sub + inv.igv).toFixed(2);
            amt = saldo(inv);
          }
          inv.paid = Math.min(inv.total, +(inv.paid + amt).toFixed(2));
          inv.payments.push({ d: TODAY, m: v.m, amt });
          inv.method = v.m;
          inv.status = saldo(inv) <= 0 ? 'Pagada' : inv.status;
          toast('Pago registrado', `${inv.num} · ${money(amt, inv.cur, cur)} · ${inv.status === 'Pagada' ? 'comprobante cancelado' : 'pago parcial'}`);
          refresh();
        },
      });
    },
    [dialogs, toast, refresh, cur],
  );

  const openInvoice = useCallback(
    (id: string) => {
      const v = IBY[id];
      if (!v) return;
      const c = CBY[v.cid];
      const canPay = saldo(v) > 0 && v.type !== 'Nota de crédito';
      dialogs.open(<InvoiceBody v={v} />, {
        title: (
          <>
            {v.type} <span className="mono">{v.num}</span>
          </>
        ),
        sub: `${c.name} · ${c.doc}`,
        wide: true,
        footer: (
          <>
            {['Rechazada', 'Pendiente', 'Observada'].includes(v.sunat) ? (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  v.sunat = 'Aceptada';
                  dialogs.close();
                  toast('Reenviado a SUNAT', `${v.num} · aceptado (simulado)`);
                  refresh();
                }}
              >
                <Icon name="refresh" size="sm" />
                Reenviar a SUNAT
              </button>
            ) : null}
            <button type="button" className="btn" onClick={() => fakeDownload(v.num)}>
              <Icon name="download" size="sm" />
              PDF / XML
            </button>
            {canPay ? (
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  dialogs.close();
                  window.setTimeout(() => payDialog(v.cid, v.id), 0);
                }}
              >
                <Icon name="card" size="sm" />
                Registrar pago
              </button>
            ) : (
              <button type="button" className="btn" onClick={dialogs.close}>
                Cerrar
              </button>
            )}
          </>
        ),
      });
    },
    [dialogs, toast, refresh, fakeDownload, payDialog],
  );

  const newClient = useCallback(() => {
    dialogs.form({
      title: 'Nuevo cliente',
      fields: [
        { id: 'name', label: 'Razón social o nombre', req: true, full: true, ph: 'Ej. Inversiones Qori S.A.C.' },
        { id: 'doc', label: 'RUC / DNI', req: true, ph: '11 dígitos (RUC) u 8 (DNI)' },
        { id: 'country', label: 'País', type: 'select', options: COUNTRIES.map((c) => c[0]), value: 'Perú' },
        { id: 'brand', label: 'Marca', type: 'select', options: BRANDS.map((b) => [b.id, b.n] as [string, string]), value: brand === 'all' ? 'ap' : brand },
        { id: 'cur', label: 'Moneda', type: 'select', options: [['PEN', 'Soles (S/)'], ['USD', 'Dólares (US$)']], value: 'PEN' },
        { id: 'contact', label: 'Contacto', ph: 'Nombre y apellido' },
        { id: 'email', label: 'Correo', type: 'email', ph: 'contacto@empresa.pe' },
      ],
      submit: 'Crear cliente',
      validate: (v) => (/^\d{8}$|^\d{11}$/.test(v.doc) ? (findClient(v.name) ? 'Ya existe un cliente con ese nombre.' : null) : 'El documento debe tener 8 (DNI) u 11 dígitos (RUC).'),
      onSubmit: (v) => {
        const c = addClient({
          name: v.name, person: v.doc.length === 8, country: v.country, brand: v.brand as BrandId, status: 'Activo',
          doc: (v.doc.length === 11 ? 'RUC ' : 'DNI ') + v.doc, cur: v.cur as Cur, since: TODAY, exec: 'Lucía Paredes',
          contact: v.contact || '—', phone: '—', email: v.email || '—',
        });
        toast('Cliente creado', `${v.name} · ${c.id}`);
        refresh();
        navigate('cliente', c.id);
      },
    });
  }, [dialogs, brand, toast, refresh, navigate]);

  const newTicket = useCallback(
    (cid?: string) => {
      dialogs.form({
        title: 'Nuevo ticket',
        pre: <ClientDatalist />,
        fields: [
          { id: 'c', label: 'Cliente', req: true, full: true, value: cid ? CBY[cid].name : '', ph: 'Escriba para buscar…', list: 'dlClients' },
          { id: 'sub', label: 'Asunto', req: true, full: true },
          { id: 'prio', label: 'Prioridad', type: 'select', options: (Object.keys(SEV) as Sev[]).map((k) => [k, `${SEV[k].l} · ${SLA[k].res} h`] as [string, string]), value: 'media' },
          { id: 'ch', label: 'Canal', type: 'select', options: ['Portal', 'Correo', 'WhatsApp', 'Teléfono'], value: 'WhatsApp' },
        ],
        submit: 'Crear ticket',
        validate: (v) => (findClient(v.c) ? null : 'Seleccione un cliente existente de la lista.'),
        onSubmit: (v) => {
          const c = findClient(v.c) || clients[0];
          const t = addTicket({ sub: v.sub, cid: c.id, prio: v.prio as Sev, ch: v.ch });
          toast('Ticket creado', `${t.id} · SLA ${SLA[t.prio].res} h`);
          refresh();
        },
      });
    },
    [dialogs, toast, refresh],
  );

  const openTicket = useCallback((id: string) => navigate('tickets', id), [navigate]);

  return useMemo(() => ({ openInvoice, payDialog, newClient, newTicket, openTicket, fakeDownload }), [openInvoice, payDialog, newClient, newTicket, openTicket, fakeDownload]);
}

/** Re-export para vistas que muestran totales por moneda. */
export { DualMoney };
