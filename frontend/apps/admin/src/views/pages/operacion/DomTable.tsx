/**
 * Tabla de dominios compartida por «Dominios» y la ficha 360 (domTable del prototipo l.1806),
 * con las acciones autoRen y renewDom.
 */
import { useState } from 'react';
import { isProblem, type Domain as ApiDomain } from '@hub/api';
import { useApp } from '../../../app/context';
import { Modal } from '../../../components/Modal';
import { ClientLink, Chip, DayChip, Switch } from '../../../components/ui';
import { href } from '../../../app/routeMeta';
import { domainsApi, fDay as fDate, HOLDER_LABEL } from '../dominios/shared';
import { errorText, useCan } from '../clientes/shared';
import { Icon } from '../../../components/Icon';
import { addD, diffD, fD, TODAY } from '../../../data';
import type { Domain } from '../../../data';

export function useDomainActions() {
  const { dialogs, toast, refresh } = useApp();
  const toggleAuto = (d: Domain) => {
    d.auto = !d.auto;
    toast(`Renovación automática ${d.auto ? 'activada' : 'desactivada'}`, d.d, 'info');
    refresh();
  };
  const renew = (d: Domain) => {
    dialogs.confirm({
      title: 'Renovar dominio',
      body: (
        <p style={{ margin: 0 }}>
          Renovar <b className="mono">{d.d}</b> por 1 año en {d.reg}. Nueva fecha real: <b>{fD(addD(d.real, 365))}</b> · comercial: <b>{fD(addD(d.com, 365))}</b>.
        </p>
      ),
      okLabel: 'Renovar',
      onOk: () => {
        d.real = addD(d.real, 365);
        d.com = addD(d.com, 365);
        toast('Dominio renovado', `${d.d} · vence ${fD(d.real)}`);
        refresh();
      },
    });
  };
  return { toggleAuto, renew };
}

export function MockDomTable({ list, compact }: { list: Domain[]; compact?: boolean }) {
  const { toggleAuto, renew } = useDomainActions();
  return (
    <div className="tw">
      <table className="t">
        <thead>
          <tr>
            <th>Dominio</th>
            {compact ? null : <th>Cliente</th>}
            <th>Registrador</th>
            <th>Vence (real)</th>
            <th>Vence (comercial)</th>
            <th>Titular</th>
            <th>Renov. automática</th>
            <th>Días restantes</th>
            <th className="r">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {list.map((d) => (
            <tr key={d.id}>
              <td className="mono strong nw">{d.d}</td>
              {compact ? null : (
                <td>
                  <ClientLink cid={d.cid} />
                </td>
              )}
              <td className="nw">{d.reg}</td>
              <td className="num nw">{fD(d.real)}</td>
              <td className="num nw">
                <span title="Fecha que se comunica al cliente (15 días antes de la real)">{fD(d.com)}</span>
              </td>
              <td>
                <Chip kind={d.tit === 'Empresa' ? 'info' : 'outline'} icon={d.tit === 'Empresa' ? 'building' : 'user'}>
                  {d.tit}
                </Chip>
              </td>
              <td>
                <Switch checked={d.auto} onChange={() => toggleAuto(d)} label={`Renovación automática de ${d.d}`} />
              </td>
              <td>
                <DayChip n={diffD(d.real, TODAY)} />
              </td>
              <td className="r">
                <button type="button" className="btn sm" onClick={() => renew(d)}>
                  <Icon name="refresh" size="sm" />
                  Renovar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Tabla con filas reales (M-DOM) ---------- */

/** Acciones de fila reales: renovar (POST renew) y renovación automática (PATCH). */
export function useDomainRowActions(onChanged: (d: ApiDomain) => void, onConflict: () => void) {
  const { toast } = useApp();
  const [renewing, setRenewing] = useState<ApiDomain | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const handle = (e: unknown, title: string) => {
    if (isProblem(e) && e.code === 'version_conflict') {
      onConflict();
      toast('Dominio modificado por otra persona', 'Se recargó la lista con los datos actuales; vuelva a intentarlo.', 'info');
    } else toast(title, errorText(e), 'err');
  };

  const toggleAuto = async (d: ApiDomain) => {
    setBusy(d.id);
    try {
      const u = await domainsApi.update(d.id, d.version, { auto_renew: !d.auto_renew });
      toast(`Renovación automática ${u.auto_renew ? 'activada' : 'desactivada'}`, u.name, 'info');
      onChanged(u);
    } catch (e) {
      handle(e, 'No se pudo cambiar la renovación automática');
    } finally {
      setBusy(null);
    }
  };

  const renewDialog = renewing ? (
    <RenewDialog
      domain={renewing}
      onClose={() => setRenewing(null)}
      onDone={(u) => {
        setRenewing(null);
        onChanged(u);
      }}
      onError={(e) => {
        setRenewing(null);
        handle(e, 'No se pudo renovar el dominio');
      }}
    />
  ) : null;
  return { toggleAuto, renew: setRenewing, busy, renewDialog };
}

function RenewDialog({ domain, onClose, onDone, onError }: { domain: ApiDomain; onClose: () => void; onDone: (d: ApiDomain) => void; onError: (e: unknown) => void }) {
  const { toast } = useApp();
  const [years, setYears] = useState('1');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const u = await domainsApi.renew(domain.id, Number(years), domain.version);
      toast('Dominio renovado', `${u.name} · vence ${fDate(u.registry_expires_at)}`);
      onDone(u);
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Renovar dominio"
      sub={domain.name}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn primary" disabled={busy} onClick={() => void submit()}>{busy ? 'Renovando…' : 'Renovar'}</button>
        </>
      }
    >
      <p style={{ marginTop: 0 }}>Vence actualmente el <b>{fDate(domain.registry_expires_at)}</b>. La renovación extiende la fecha real del registrador.</p>
      <label className="field">Años<select className="select" value={years} onChange={(e) => setYears(e.target.value)}>{['1', '2', '3', '5'].map((y) => <option key={y} value={y}>{y}</option>)}</select></label>
    </Modal>
  );
}

export function DomTable({ list, compact, onOpen, onChanged, onConflict }: { list: ApiDomain[]; compact?: boolean; onOpen: (d: ApiDomain) => void; onChanged: (d: ApiDomain) => void; onConflict: () => void }) {
  const can = useCan();
  const canUpdate = can('domains.domain.update');
  const { toggleAuto, renew, busy, renewDialog } = useDomainRowActions(onChanged, onConflict);
  return (
    <div className="tw">
      <table className="t">
        <thead>
          <tr>
            <th>Dominio</th>
            {compact ? null : <th>Cliente</th>}
            <th>Registrador</th>
            <th>Vence (real)</th>
            <th>Vence (comercial)</th>
            <th>Titular</th>
            <th>Renov. automática</th>
            <th>Días restantes</th>
            <th className="r">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {list.map((d) => (
            <tr key={d.id}>
              <td className="nw">
                <button type="button" className="rowlink mono strong" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left' }} onClick={() => onOpen(d)}>{d.name}</button>
              </td>
              {compact ? null : <td>{d.customer ? <a className="rowlink" href={href('cliente', d.customer.id)}>{d.customer.name}</a> : '—'}</td>}
              <td className="nw" title={d.registrar?.account_label}>
                {d.registrar ? <>{d.registrar.name}<div className="sub">{d.registrar.account_label}</div></> : '—'}
              </td>
              <td className="num nw">{fDate(d.registry_expires_at)}</td>
              <td className="num nw">
                <span title="Fecha que se comunica al cliente (del servicio asociado)">{fDate(d.commercial_due_date)}</span>
              </td>
              <td>
                <Chip kind={d.holder === 'company' ? 'info' : 'outline'} icon={d.holder === 'company' ? 'building' : 'user'}>{HOLDER_LABEL[d.holder]}</Chip>
              </td>
              <td>
                <Switch checked={d.auto_renew} disabled={!canUpdate || busy === d.id} onChange={() => void toggleAuto(d)} label={`Renovación automática de ${d.name}`} />
              </td>
              <td>{d.days_remaining === null ? '—' : <DayChip n={d.days_remaining} />}</td>
              <td className="r nw">
                <button type="button" className="btn sm" onClick={() => onOpen(d)}>Ver</button>{' '}
                {canUpdate ? <button type="button" className="btn sm" onClick={() => renew(d)}><Icon name="refresh" size="sm" />Renovar</button> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {renewDialog}
    </div>
  );
}
