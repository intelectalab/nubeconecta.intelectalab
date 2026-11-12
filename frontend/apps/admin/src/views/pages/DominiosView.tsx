/**
 * Vista «dominios» (#dominios/<búsqueda>) — dominios de clientes (vDominios del prototipo l.1808).
 */
import { useEffect, useMemo } from 'react';
import { ClientDatalist } from '../../app/actions';
import { useApp } from '../../app/context';
import { useViewState } from '../../app/storage';
import type { ViewProps } from '../../app/routes';
import { Icon } from '../../components/Icon';
import { EmptyState, PageHead, Pager, SearchBox, Select, StatLine, Toolbar } from '../../components/ui';
import { addD, CBY, diffD, domains, fD, fDom, findClient, NF0, norm, plural, TODAY } from '../../data';
import type { Domain } from '../../data';
import { MockDomTable as DomTable } from './operacion/DomTable';
import { LIVE } from './clientes/shared';
import DomainList from './dominios/DomainList';

const PER = 25;
const REGS = ['Namecheap', 'NameSilo', 'PoloDomains'];

export default function DominiosView(props: ViewProps) {
  return LIVE ? <DomainList param={props.param} /> : <DominiosDemoView {...props} />;
}

function DominiosDemoView({ param }: ViewProps) {
  const { brand, dataVersion, dialogs, toast, refresh } = useApp();
  const [q, setQ] = useViewState('dom.q', '');
  const [reg, setReg] = useViewState('dom.reg', '');
  const [tit, setTit] = useViewState('dom.tit', '');
  const [d30, setD30] = useViewState('dom.30', false);
  const [page, setPage] = useViewState('dom.page', 0);

  useEffect(() => {
    if (param) {
      setQ(param);
      setPage(0);
    }
  }, [param, setQ, setPage]);

  const all = useMemo(() => fDom(brand), [brand, dataVersion]);
  const rows = useMemo(() => {
    const n = norm(q);
    return all
      .filter((d) => (!n || d.d.includes(n) || norm(CBY[d.cid].name).includes(n)) && (!reg || d.reg === reg) && (!tit || d.tit === tit) && (!d30 || diffD(d.real, TODAY) <= 30))
      .sort((a, b) => a.real.getTime() - b.real.getTime());
  }, [all, q, reg, tit, d30, dataVersion]);
  const pages = Math.max(1, Math.ceil(rows.length / PER));
  const pg = Math.min(page, pages - 1);
  const e30 = all.filter((d) => {
    const n = diffD(d.real, TODAY);
    return n >= 0 && n <= 30;
  }).length;

  const upd =
    <T,>(f: (v: T) => void) =>
    (v: T) => {
      f(v);
      setPage(0);
    };
  const clear = () => {
    setQ('');
    setReg('');
    setTit('');
    setD30(false);
    setPage(0);
  };

  const newDomain = () =>
    dialogs.form({
      title: 'Registrar dominio',
      fields: [
        { id: 'd', label: 'Dominio', req: true, ph: 'ejemplo.pe' },
        { id: 'c', label: 'Cliente', req: true, ph: 'Escriba para buscar…', list: 'dlClients' },
        { id: 'reg', label: 'Registrador', type: 'select', options: ['PoloDomains', 'Namecheap', 'NameSilo'], value: 'Namecheap' },
        { id: 'tit', label: 'Titular', type: 'select', options: ['Cliente', 'Empresa'], value: 'Cliente' },
        { id: 'y', label: 'Años', type: 'select', options: ['1', '2', '3', '5'], value: '1' },
        { id: 'auto', label: 'Renovación automática', type: 'select', options: [['1', 'Sí'], ['0', 'No']], value: '1' },
      ],
      submit: 'Registrar',
      validate: (v) =>
        !/^[a-z0-9-]+(\.[a-z]{2,}){1,2}$/i.test(v.d.trim())
          ? 'Ingrese un dominio válido (ej. empresa.com.pe).'
          : domains.some((x) => x.d === v.d.trim().toLowerCase())
            ? 'Ese dominio ya está registrado.'
            : !findClient(v.c)
              ? 'Seleccione un cliente existente.'
              : null,
      onSubmit: (v) => {
        const c = findClient(v.c);
        if (!c) return;
        const real = addD(TODAY, 365 * +v.y);
        const d: Domain = { id: 'DM-' + (domains.length + 1), d: v.d.trim().toLowerCase(), cid: c.id, reg: v.reg, real, com: addD(real, -15), tit: v.tit as Domain['tit'], auto: v.auto === '1', ns: 'ns1/ns2.alojamientoplus.pe' };
        domains.unshift(d);
        c.domains.unshift(d);
        setQ(d.d);
        setPage(0);
        toast('Dominio registrado', `${d.d} · vence ${fD(real)}`);
        refresh();
      },
    });

  return (
    <>
      <ClientDatalist />
      <PageHead
        crumbs={[['Operación', 'dominios'], ['Dominios']]}
        title="Dominios"
        sub="Fecha real del registrador y fecha comercial comunicada al cliente (15 días antes)."
        actions={
          <button type="button" className="btn primary" onClick={newDomain}>
            <Icon name="plus" size="sm" />
            Registrar dominio
          </button>
        }
      />
      <div className="card" style={{ marginBottom: 16 }}>
        <StatLine
          items={[
            { label: 'Dominios', value: NF0.format(all.length) },
            { label: 'Expiran en 30 días', value: e30, tone: 'high' },
            { label: 'Vencidos (en gracia)', value: all.filter((d) => diffD(d.real, TODAY) < 0).length, tone: 'danger' },
            { label: 'Titular: empresa', value: all.filter((d) => d.tit === 'Empresa').length },
            { label: 'Sin renovación automática', value: all.filter((d) => !d.auto).length },
          ]}
        />
      </div>
      <section className="card">
        <Toolbar count={plural(rows.length, 'dominio', 'dominios')}>
          <SearchBox value={q} onChange={upd(setQ)} placeholder="Dominio o cliente…" label="Buscar dominios" />
          <Select value={reg} onChange={upd(setReg)} label="Registrador" options={[['', 'Todos los registradores'], ...REGS.map((r): [string, string] => [r, r])]} />
          <Select value={tit} onChange={upd(setTit)} label="Titular" options={[['', 'Cualquier titular'], ['Empresa', 'Empresa'], ['Cliente', 'Cliente']]} />
          <label className="check">
            <input type="checkbox" checked={d30} onChange={(e) => upd(setD30)(e.target.checked)} />
            Expiran en 30 días
          </label>
        </Toolbar>
        {rows.length ? (
          <>
            <DomTable list={rows.slice(pg * PER, (pg + 1) * PER)} />
            <Pager page={pg} total={rows.length} per={PER} onPage={setPage} />
          </>
        ) : (
          <EmptyState
            title="Sin dominios"
            text="Ningún dominio coincide con los filtros."
            action={
              <button type="button" className="btn sm" onClick={clear}>
                Limpiar filtros
              </button>
            }
          />
        )}
      </section>
    </>
  );
}
