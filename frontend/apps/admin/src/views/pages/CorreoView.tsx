/**
 * Vista «correo» (#correo) contra la API real: servicios de correo (licencias asignadas
 * frente a facturadas) y certificados SSL. Parámetro opcional: pestaña inicial ('lic' | 'ssl').
 */
import { useEffect, useMemo, useState } from 'react';
import { isProblem, type MailProviderKind, type MailService, type MailServiceFilters, type SslCertificate, type SslFilters } from '@hub/api';
import { useApp } from '../../app/context';
import type { ViewProps } from '../../app/routes';
import { href } from '../../app/routeMeta';
import { useViewState } from '../../app/storage';
import { filterParam, parseFilterParam } from '../../app/filterParam';
import { hub } from '../../auth/client';
import { DataTable, type Column } from '../../components/DataTable';
import { Icon } from '../../components/Icon';
import { Chip, DayChip, EmptyState, Note, PageHead, StatLine, Tabs } from '../../components/ui';
import { BusyButton, NoRows } from './infraestructura/shared';
import { errorText, fDate, useCan, useLoad } from './clientes/shared';

const mailApi = hub.mail;
const PER = 25;

type Tab = 'lic' | 'ssl';

const PROVIDER_LABEL: Record<MailProviderKind, string> = { cpanel: 'cPanel', google_workspace: 'Google Workspace', microsoft_365: 'Microsoft 365', other: 'Otro' };
const SSL_KIND_LABEL: Record<string, string> = { paid: 'De pago', free_auto: 'Gratuito (auto)' };

const customerCell = (c: { id: string; name: string } | null) =>
  c ? (
    <a className="rowlink" href={href('cliente', c.id)}>
      {c.name}
    </a>
  ) : (
    <span className="sub">—</span>
  );

function Pager({ loading, prev, next, onPage }: { loading: boolean; prev: string | null | undefined; next: string | null | undefined; onPage: (c: string | null) => void }) {
  return (
    <div className="card-b" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
      <button type="button" className="btn sm" disabled={loading || !prev} onClick={() => onPage(prev ?? null)}>
        <Icon name="cl" size="sm" />
        Anterior
      </button>
      <button type="button" className="btn sm" disabled={loading || !next} onClick={() => onPage(next ?? null)}>
        Siguiente
        <Icon name="cr" size="sm" />
      </button>
    </div>
  );
}

export default function CorreoView({ param }: ViewProps) {
  const { toast } = useApp();
  const can = useCan();
  const [tab, setTab] = useViewState<Tab>('mail.tab', 'lic');
  const [difOnly, setDifOnly] = useViewState('mail.dif', false);
  const [soonOnly, setSoonOnly] = useViewState('mail.soon', false);
  const [licCursor, setLicCursor] = useState<string | null>(null);
  const [sslCursor, setSslCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (param === 'lic' || param === 'ssl') setTab(param);
    const fl = parseFilterParam(param);
    if (fl?.tab === 'lic' || fl?.tab === 'ssl') setTab(fl.tab);
    if (fl) {
      setDifOnly(fl.dif === '1');
      setSoonOnly(fl.soon === '1');
      setLicCursor(null);
      setSslCursor(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [param, setTab]);

  const licFilter = useMemo<MailServiceFilters>(() => ({ with_difference: difOnly || undefined }), [difOnly]);
  const sslFilter = useMemo<SslFilters>(() => ({ expiring_30d: soonOnly || undefined }), [soonOnly]);
  const summary = useLoad(() => mailApi.summary(), []);
  const lic = useLoad(() => mailApi.services.list({ filter: licFilter, size: PER, cursor: licCursor }), [licFilter, licCursor]);
  const ssl = useLoad(() => mailApi.ssl.list({ filter: sslFilter, size: PER, cursor: sslCursor, sort: 'expires_at' }), [sslFilter, sslCursor]);
  const s = summary.data;
  const denied = [summary.error, lic.error, ssl.error].some((e) => isProblem(e) && e.status === 403);

  const reloadAll = () => {
    summary.reload();
    lic.reload();
    ssl.reload();
  };

  /** Ejecuta una acción write con `version`: toast, recarga y manejo de 409. */
  const act = async (key: string, fn: () => Promise<unknown>, okTitle: string, okSub: string) => {
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      await fn();
      toast(okTitle, okSub);
      reloadAll();
    } catch (e) {
      if (isProblem(e) && e.code === 'version_conflict') {
        toast('Registro modificado por otra persona', 'Se recargó el listado; vuelva a intentarlo.', 'info');
        reloadAll();
      } else toast('No se pudo completar la acción', errorText(e), 'info');
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  };

  const licFix = (l: MailService) =>
    void act(l.id, () => mailApi.services.update(l.id, l.version, { seats_billed: l.seats_used ?? 0 }), 'Licencias cuadradas', `${l.customer?.name ?? l.domain?.name ?? 'Servicio'} · ${l.seats_used ?? 0} licencias`);

  const sslRenew = (c: SslCertificate) => void act(c.id, () => mailApi.ssl.renew(c.id, c.version), 'Certificado renovado', c.domain?.name ?? c.common_name);

  const licCols: Column<MailService>[] = [
    { key: 'cli', header: 'Cliente', minWidth: 180, render: (l) => customerCell(l.customer), sort: (l) => l.customer?.name },
    { key: 'prod', header: 'Producto', render: (l) => PROVIDER_LABEL[l.provider_kind] ?? l.provider_kind, sort: (l) => l.provider_kind },
    { key: 'dom', header: 'Dominio', className: 'mono', render: (l) => l.domain?.name ?? '—', sort: (l) => l.domain?.name },
    { key: 'as', header: 'Asignadas (consola)', align: 'r', className: 'num', render: (l) => l.seats_used ?? '—', sort: (l) => l.seats_used ?? 0 },
    { key: 'bi', header: 'Facturadas', align: 'r', className: 'num', render: (l) => l.seats_billed ?? '—', sort: (l) => l.seats_billed ?? 0 },
    {
      key: 'd',
      header: 'Diferencia',
      sort: (l) => l.seats_difference ?? 0,
      render: (l) => {
        const d = l.seats_difference ?? 0;
        if (d > 0)
          return (
            <Chip kind="danger" icon="tri">
              +{d} sin facturar
            </Chip>
          );
        if (d < 0) return <Chip kind="warn">{-d} facturadas de más</Chip>;
        return (
          <Chip kind="ok" icon="check">
            Cuadra
          </Chip>
        );
      },
    },
    ...(can('mail.mail_service.update')
      ? [
          {
            key: 'act',
            header: 'Acciones',
            align: 'r' as const,
            render: (l: MailService) => {
              const d = l.seats_difference ?? 0;
              return d ? (
                <BusyButton busy={busy[l.id]} busyText="Guardando…" onClick={() => licFix(l)}>
                  {d > 0 ? 'Facturar diferencia' : 'Ajustar facturación'}
                </BusyButton>
              ) : null;
            },
          },
        ]
      : []),
  ];

  const sslCols: Column<SslCertificate>[] = [
    { key: 'd', header: 'Dominio', className: 'mono strong', render: (c) => c.common_name || c.domain?.name || '—', sort: (c) => c.common_name || c.domain?.name },
    { key: 'cli', header: 'Cliente', render: (c) => customerCell(c.customer), sort: (c) => c.customer?.name },
    { key: 'type', header: 'Tipo', className: 'nw', render: (c) => SSL_KIND_LABEL[c.kind] ?? c.kind, sort: (c) => c.kind },
    {
      key: 'exp',
      header: 'Vence',
      className: 'nw num',
      sort: (c) => c.expires_at ?? '',
      render: (c) => (
        <>
          {fDate(c.expires_at)} {c.days_remaining !== null ? <DayChip n={c.days_remaining} /> : null}
        </>
      ),
    },
    { key: 'auto', header: 'Renovación automática', render: (c) => (c.auto_renew ? <Chip kind="ok">Sí</Chip> : <Chip kind="warn">No · manual</Chip>), sort: (c) => (c.auto_renew ? 1 : 0) },
    ...(can('mail.ssl_certificate.update')
      ? [
          {
            key: 'act',
            header: 'Acciones',
            align: 'r' as const,
            render: (c: SslCertificate) => (
              <BusyButton busy={busy[c.id]} busyText="Renovando…" icon="refresh" onClick={() => sslRenew(c)}>
                {c.auto_renew ? 'Forzar renovación' : 'Renovar e instalar'}
              </BusyButton>
            ),
          },
        ]
      : []),
  ];

  const dash = (n: number | undefined) => (n === undefined ? '—' : n);
  const failed = (r: { error: unknown; reload: () => void }, what: string) =>
    r.error ? (
      <div className="card-b">
        <Note kind="warn" icon="tri" role="alert">
          No se pudo cargar {what}: {errorText(r.error)}{' '}
          <button type="button" className="btn sm" onClick={r.reload}>Reintentar</button>
        </Note>
      </div>
    ) : null;

  return (
    <>
      <PageHead crumbs={[['Infraestructura', 'infra'], ['Correo y SSL', 'correo']]} title="Correo y SSL" sub="Licencias de Google Workspace y Microsoft 365 asignadas frente a facturadas, y certificados por vencer." />
      {denied ? (
        <EmptyState title="Sin permiso" text="Su usuario no tiene permiso para ver el módulo Correo y SSL." icon="lock" />
      ) : (
        <>
          {summary.error ? (
            <div className="card" style={{ marginBottom: 16 }}>
              {failed(summary, 'el resumen')}
            </div>
          ) : (
            <StatLine
              items={[
                { label: 'Servicios de correo', value: dash(s?.mail.total), to: 'correo', param: filterParam({ tab: 'lic' }) },
                { label: 'Con diferencia', value: dash(s?.mail.with_difference), tone: s && s.mail.with_difference ? 'danger' : '', to: 'correo', param: filterParam({ tab: 'lic', dif: '1' }) },
                { label: 'Certificados por vencer (30 d)', value: dash(s?.ssl.expiring_30d), tone: 'warn', to: 'correo', param: filterParam({ tab: 'ssl', soon: '1' }) },
              ]}
            />
          )}
          <section className="card">
            <Tabs<Tab>
              label="Secciones"
              value={tab}
              onChange={setTab}
              tabs={[
                { id: 'lic', label: 'Licencias de correo', count: s?.mail.total },
                { id: 'ssl', label: 'Certificados SSL', count: s?.ssl.total },
              ]}
            />
            <div role="tabpanel" aria-label={tab === 'lic' ? 'Licencias de correo' : 'Certificados SSL'}>
              {tab === 'lic' ? (
                <>
                  <div className="toolbar" style={{ padding: '8px 16px' }}>
                    <label className="check">
                      <input type="checkbox" checked={difOnly} onChange={(e) => { setDifOnly(e.target.checked); setLicCursor(null); }} />
                      Solo con diferencia
                    </label>
                  </div>
                  {failed(lic, 'las licencias') ??
                    (!lic.data && lic.loading ? (
                      <div className="card-b">Cargando licencias…</div>
                    ) : (
                      <>
                        <DataTable key="lic" columns={licCols} rows={lic.data?.data ?? []} rowKey={(l) => l.id} empty={<NoRows />} />
                        <Pager loading={lic.loading} prev={lic.data?.meta.prev_cursor} next={lic.data?.meta.next_cursor} onPage={setLicCursor} />
                      </>
                    ))}
                </>
              ) : (
                <>
                  <div className="toolbar" style={{ padding: '8px 16px' }}>
                    <label className="check">
                      <input type="checkbox" checked={soonOnly} onChange={(e) => { setSoonOnly(e.target.checked); setSslCursor(null); }} />
                      Vencen en 30 días
                    </label>
                  </div>
                  {failed(ssl, 'los certificados') ??
                    (!ssl.data && ssl.loading ? (
                      <div className="card-b">Cargando certificados…</div>
                    ) : (
                      <>
                        <DataTable key="ssl" columns={sslCols} rows={ssl.data?.data ?? []} rowKey={(c) => c.id} defaultSort={{ key: 'exp', dir: 1 }} empty={<NoRows />} />
                        <Pager loading={ssl.loading} prev={ssl.data?.meta.prev_cursor} next={ssl.data?.meta.next_cursor} onPage={setSslCursor} />
                      </>
                    ))}
                </>
              )}
            </div>
          </section>
        </>
      )}
    </>
  );
}
