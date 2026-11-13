/**
 * Dominios de clientes contra la API real (M-DOM): tiles de resumen, listado con filtros y cursor,
 * registro de dominios, renovación, renovación automática y detalle con contactos editables.
 * Se usa como página #dominios y embebido en la ficha del cliente (`customerId`).
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { isProblem, type Domain, type DomainFilters, type DomainHolder, type DomainInput } from '@hub/api';
import { useApp } from '../../../app/context';
import { useViewState } from '../../../app/storage';
import { Icon } from '../../../components/Icon';
import { Modal } from '../../../components/Modal';
import { EmptyState, Note, PageHead, SearchBox, Select, StatLine, Toolbar } from '../../../components/ui';
import { errorText, fieldErrors, isUuid, useCan, useLoad } from '../clientes/shared';
import { DomTable } from '../operacion/DomTable';
import { DomainDetail } from './DomainDetail';
import { CustomerField, RegistrarField } from './DomainFields';
import { domainsApi, useRegistrarAccounts } from './shared';

const PER = 25;
const NF = new Intl.NumberFormat('es-PE');

export default function DomainList({ param, customerId }: { param?: string | null; customerId?: string }) {
  const embedded = !!customerId;
  const can = useCan();
  const ns = embedded ? `dom.c.${customerId}` : 'dom.api';
  const [q, setQ] = useViewState(`${ns}.q`, '');
  const [reg, setReg] = useViewState(`${ns}.reg`, '');
  const [tit, setTit] = useViewState(`${ns}.tit`, '');
  const [d30, setD30] = useViewState(`${ns}.30`, false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(isUuid(param) ? param : null);
  const [creating, setCreating] = useState(false);
  const registrars = useRegistrarAccounts();

  useEffect(() => {
    if (!param) return;
    if (isUuid(param)) setOpenId(param);
    else setQ(param);
    setCursor(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [param]);

  const filter = useMemo<DomainFilters>(() => ({ search: q.trim() || undefined, provider_account_id: reg || undefined, holder: tit as DomainHolder | '', expiring_30d: d30 || undefined, customer_id: customerId }), [q, reg, tit, d30, customerId]);
  const res = useLoad(() => domainsApi.list({ filter, size: PER, cursor }), [filter, cursor]);
  const summary = useLoad(() => (embedded ? Promise.resolve(null) : domainsApi.summary()), [embedded]);
  const rows = res.data?.data ?? [];
  const meta = res.data?.meta;
  const filtered = !!(q || reg || tit || d30);

  const reloadAll = () => {
    res.reload();
    summary.reload();
  };
  const upd = <T,>(f: (v: T) => void) => (v: T) => {
    f(v);
    setCursor(null);
  };
  const clear = () => {
    setQ('');
    setReg('');
    setTit('');
    setD30(false);
    setCursor(null);
  };
  const s = summary.data;
  const dash = (n: number | undefined) => (n === undefined ? '—' : NF.format(n));

  return (
    <>
      {embedded ? null : (
        <PageHead
          crumbs={[['Operación', 'dominios'], ['Dominios']]}
          title="Dominios"
          sub="Fecha real del registrador y fecha comercial comunicada al cliente."
          actions={
            can('domains.domain.create') ? (
              <button type="button" className="btn primary" onClick={() => setCreating(true)}>
                <Icon name="plus" size="sm" />
                Registrar dominio
              </button>
            ) : undefined
          }
        />
      )}
      {embedded ? null : (
        <div className="card" style={{ marginBottom: 16 }}>
          {summary.error ? (
            <div className="card-b">
              <Note kind="warn" icon="tri" role="alert">
                No se pudo cargar el resumen: {errorText(summary.error)}{' '}
                <button type="button" className="btn sm" onClick={summary.reload}>Reintentar</button>
              </Note>
            </div>
          ) : (
            <StatLine
              items={[
                { label: 'Dominios', value: dash(s?.total) },
                { label: 'Expiran en 30 días', value: dash(s?.expiring_30d), tone: 'high' },
                { label: 'Vencidos (en gracia)', value: dash(s?.expired), tone: 'danger' },
                { label: 'Titular: empresa', value: dash(s?.holder_company) },
                { label: 'Sin renovación automática', value: dash(s?.no_auto_renew) },
              ]}
            />
          )}
        </div>
      )}
      <section className="card">
        {embedded ? <div className="card-h"><h2 className="sec">Dominios</h2></div> : null}
        <Toolbar count={res.loading ? 'Cargando…' : `${rows.length}${meta?.has_more ? '+' : ''} en esta página`}>
          <SearchBox value={q} onChange={upd(setQ)} placeholder="Dominio…" label="Buscar dominios" />
          {embedded ? null : registrars.denied ? null : (
            <Select value={reg} onChange={upd(setReg)} label="Registrador" options={[['', 'Todos los registradores'], ...registrars.options.map((o): [string, string] => [o.id, o.label])]} />
          )}
          <Select value={tit} onChange={upd(setTit)} label="Titular" options={[['', 'Cualquier titular'], ['company', 'Empresa'], ['customer', 'Cliente']]} />
          <label className="check">
            <input type="checkbox" checked={d30} onChange={(e) => upd(setD30)(e.target.checked)} />
            Expiran en 30 días
          </label>
          {embedded && can('domains.domain.create') ? (
            <button type="button" className="btn sm" onClick={() => setCreating(true)}>
              <Icon name="plus" size="sm" />
              Registrar dominio
            </button>
          ) : null}
        </Toolbar>
        {res.error ? (
          <div className="card-b">
            <Note kind="warn" icon="tri" role="alert">
              No se pudo cargar el listado: {errorText(res.error)}{' '}
              <button type="button" className="btn sm" onClick={res.reload}>Reintentar</button>
            </Note>
          </div>
        ) : !res.data && res.loading ? (
          <div className="card-b">Cargando dominios…</div>
        ) : !rows.length ? (
          <EmptyState
            title={filtered ? 'Sin dominios que coincidan' : 'Sin dominios'}
            text={filtered ? 'Ningún dominio coincide con los filtros.' : embedded ? 'Este cliente no tiene dominios registrados con nosotros.' : 'Aún no hay dominios registrados.'}
            action={filtered ? <button type="button" className="btn sm" onClick={clear}>Limpiar filtros</button> : undefined}
          />
        ) : (
          <>
            <DomTable list={rows} compact={embedded} onOpen={(d) => setOpenId(d.id)} onChanged={reloadAll} onConflict={reloadAll} />
            <div className="card-b" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn sm" disabled={res.loading || !meta?.prev_cursor} onClick={() => setCursor(meta?.prev_cursor ?? null)}>
                <Icon name="cl" size="sm" />
                Anterior
              </button>
              <button type="button" className="btn sm" disabled={res.loading || !meta?.next_cursor} onClick={() => setCursor(meta?.next_cursor ?? null)}>
                Siguiente
                <Icon name="cr" size="sm" />
              </button>
            </div>
          </>
        )}
      </section>
      {openId ? <DomainDetail id={openId} onClose={() => setOpenId(null)} onChanged={reloadAll} /> : null}
      {creating ? (
        <NewDomainDialog
          customerId={customerId}
          registrars={registrars}
          onClose={() => setCreating(false)}
          onCreated={(d) => {
            setCreating(false);
            setCursor(null);
            reloadAll();
            setOpenId(d.id);
          }}
        />
      ) : null}
    </>
  );
}

function NewDomainDialog({ customerId, registrars, onClose, onCreated }: { customerId?: string; registrars: ReturnType<typeof useRegistrarAccounts>; onClose: () => void; onCreated: (d: Domain) => void }) {
  const { toast } = useApp();
  const [name, setName] = useState('');
  const [customer, setCustomer] = useState(customerId ?? '');
  const [account, setAccount] = useState('');
  const [holder, setHolder] = useState<DomainHolder>('customer');
  const [expires, setExpires] = useState('');
  const [auto, setAuto] = useState('1');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [errs, setErrs] = useState<Record<string, string>>({});

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setMessage('');
    setErrs({});
    const n = name.trim().toLowerCase();
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(n)) {
      setMessage('Ingrese un dominio válido (ej. empresa.com.pe).');
      return;
    }
    const input: DomainInput = {
      name: n,
      holder,
      customer_id: customer || null,
      provider_account_id: account || null,
      registry_expires_at: expires || null,
      auto_renew: auto === '1',
    };
    setBusy(true);
    try {
      const d = await domainsApi.create(input);
      toast('Dominio registrado', d.name);
      onCreated(d);
    } catch (e) {
      setErrs(fieldErrors(e));
      setMessage(isProblem(e) && e.status === 422 ? 'Revise los campos marcados.' : errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const err = (k: string) => (errs[k] ? <span className="err" role="alert">{errs[k]}</span> : null);

  return (
    <Modal open wide onClose={onClose} title="Registrar dominio" sub="Alta manual de un dominio de cliente." bare>
      <form className="modal-b" onSubmit={(e) => void submit(e)}>
        <div className="form-grid">
          <label className="field full">Dominio*<input className="input mono" required placeholder="ejemplo.pe" value={name} onChange={(e) => setName(e.target.value)} />{err('name')}</label>
          <CustomerField value={customer} disabled={!!customerId} onChange={setCustomer} error={err('customer_id')} />
          <RegistrarField value={account} onChange={setAccount} registrars={registrars} error={err('provider_account_id')} />
          <label className="field">Titular
            <select className="select" value={holder} onChange={(e) => setHolder(e.target.value as DomainHolder)}>
              <option value="customer">Cliente</option>
              <option value="company">Empresa</option>
            </select>
            {err('holder')}
          </label>
          <label className="field">Vence (real)<input className="input" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />{err('registry_expires_at')}</label>
          <label className="field">Renovación automática
            <select className="select" value={auto} onChange={(e) => setAuto(e.target.value)}>
              <option value="1">Sí</option>
              <option value="0">No</option>
            </select>
          </label>
        </div>
        <div className="err" role="alert">{message}</div>
        <div className="modal-f">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Registrando…' : 'Registrar'}</button>
        </div>
      </form>
    </Modal>
  );
}
