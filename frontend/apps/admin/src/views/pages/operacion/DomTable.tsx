/**
 * Tabla de dominios compartida por «Dominios» y la ficha 360 (domTable del prototipo l.1806),
 * con las acciones autoRen y renewDom.
 */
import { useApp } from '../../../app/context';
import { ClientLink, Chip, DayChip, Switch } from '../../../components/ui';
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

export function DomTable({ list, compact }: { list: Domain[]; compact?: boolean }) {
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
