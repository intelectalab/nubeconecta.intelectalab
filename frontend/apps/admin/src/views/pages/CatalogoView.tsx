/**
 * Vista «catalogo» (#catalogo y #catalogo/<categoría>) — vCatalogo del
 * prototipo (l.2325) con catLegacy (l.2038), genTable (l.2320), paneles de
 * edición, vista previa del shortcode y asistente de servicio personalizado.
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useApp } from '../../app/context';
import { useViewState } from '../../app/storage';
import type { ViewProps } from '../../app/routes';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/Modal';
import { PageHead } from '../../components/ui';
import { HPLANS, mwBtnCls, mwVars, NF2, plural, SITES, TLDS, VPLANS } from '../../data';
import type { BrandFilter, HostingPlan } from '../../data';
import { allCats, catName, GENPROD, type GenProduct } from './comercial/catalogData';
import { BdSheet, GpSheet, HpSheet, VpSheet } from './comercial/catSheets';
import { bundleRows, Combos, GenTable, hostingRows, HostingTable, TldTable, VpsTable, type CatHandlers } from './comercial/catTables';
import { WizardModal } from './comercial/catWizard';
import { PriceChangeModal, ScBox, type PriceAsk } from './comercial/shared';
import CatalogList from './catalogo/CatalogList';
import { LIVE } from './clientes/shared';

type SheetState = { kind: 'hp' | 'vp' | 'bd' | 'gp'; id: string; cat: string } | null;
type ModalState = { kind: 'sc'; id: string } | { kind: 'prev'; id: string } | { kind: 'wiz'; cat: string } | { kind: 'created'; id: string } | null;

function catCount(id: string, brand: BrandFilter): number {
  if (id === 'hosting' || id === 'reseller') return hostingRows(brand, id).length;
  if (id === 'vps') return VPLANS.length;
  if (id === 'dominios') return TLDS.length;
  if (id === 'combos') return bundleRows(brand).length;
  return GENPROD.filter((g) => g.cat === id).length;
}
const scCode = (g: GenProduct) => `[hub_plan id="${g.id}"${g.sale === 'cotizacion' ? ' accion="cotizar"' : ''}]`;

/** Con backend usa la API real de M-CAT (catalogo/CatalogList); con VITE_DEMO=1, el prototipo. */
export default function CatalogoView(props: ViewProps) {
  return LIVE ? <CatalogList param={props.param} /> : <CatalogoDemoView {...props} />;
}

function CatalogoDemoView({ param }: ViewProps) {
  const { brand, dataVersion, navSeq, toast, refresh } = useApp();
  const [tab, setTab] = useViewState<string>('cat.tab', 'hosting');
  const [sheet, setSheet] = useState<SheetState>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [ask, setAsk] = useState<PriceAsk | null>(null);

  useEffect(() => {
    if (param && allCats().some((c) => c.id === param)) setTab(param);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [param, navSeq]);

  const cats = allCats();
  const T = cats.some((c) => c.id === tab) ? tab : 'hosting';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const counts = useMemo(() => Object.fromEntries(allCats().map((c) => [c.id, catCount(c.id, brand)])), [brand, dataVersion]);

  const h: CatHandlers = {
    edit: (kind, id, cat) => setSheet({ kind, id, cat: cat || T }),
    preview: (id) => setModal({ kind: 'prev', id }),
    shortcode: (id) => setModal({ kind: 'sc', id }),
    wizard: (cat) => setModal({ kind: 'wiz', cat }),
    askPrice: setAsk,
  };

  let body;
  let act = null;
  const addBtn = (label: string, onClick: () => void) => (
    <button type="button" className="btn primary" onClick={onClick}>
      <Icon name="plus" size="sm" />
      {label}
    </button>
  );
  if (T === 'hosting' || T === 'reseller') {
    act = addBtn('Nuevo paquete', () => h.edit('hp', '', T));
    body = <HostingTable brand={brand} cat={T} h={h} />;
  } else if (T === 'vps') {
    act = addBtn('Nuevo plan VPS', () => h.edit('vp', ''));
    body = <VpsTable h={h} />;
  } else if (T === 'dominios') {
    body = <TldTable h={h} />;
  } else if (T === 'combos') {
    act = addBtn('Nuevo combo', () => h.edit('bd', ''));
    body = <Combos brand={brand} h={h} />;
  } else {
    act = (
      <button type="button" className="btn" onClick={() => h.edit('gp', '', T)}>
        <Icon name="plus" size="sm" />
        Agregar producto
      </button>
    );
    body = <GenTable cat={T} h={h} />;
  }

  const closeSheet = () => setSheet(null);
  const closeModal = () => setModal(null);
  const gp = modal && (modal.kind === 'sc' || modal.kind === 'created') ? GENPROD.find((g) => g.id === modal.id) : undefined;
  const pv = modal?.kind === 'prev' ? HPLANS.find((p) => p.id === modal.id) : undefined;

  return (
    <>
      <PageHead
        crumbs={[['Comercial', 'catalogo'], ['Catálogo de productos']]}
        title="Catálogo de productos"
        sub="Todo lo que se vende: se muestra en las webs WordPress mediante shortcodes y se usa en cotizaciones y pedidos."
        actions={
          <>
            {act}
            <button type="button" className="btn primary" onClick={() => h.wizard('')}>
              <Icon name="plus" size="sm" />
              Nuevo servicio personalizado
            </button>
          </>
        }
      />
      <div className="cat-layout">
        <nav className="card cat-nav" aria-label="Categorías del catálogo">
          <div className="cat-sel">
            <label className="field">
              Categoría
              <select className="select" value={T} onChange={(e) => setTab(e.target.value)}>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.n} ({counts[c.id] ?? 0})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <ul className="cat-list">
            {cats.map((c) => (
              <li key={c.id}>
                <button type="button" aria-current={c.id === T} onClick={() => setTab(c.id)}>
                  <span>{c.n}</span>
                  <em>{counts[c.id] ?? 0}</em>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <section className="card" aria-label={catName(T)}>
          <div className="card-h">
            <h2 className="sec">{catName(T)}</h2>
            <span className="sub">{plural(counts[T] ?? 0, 'producto', 'productos')}</span>
          </div>
          {body}
        </section>
      </div>

      {sheet?.kind === 'hp' ? <HpSheet key={'hp' + sheet.id} id={sheet.id} cat={sheet.cat} brand={brand} onClose={closeSheet} askPrice={setAsk} /> : null}
      {sheet?.kind === 'vp' ? <VpSheet key={'vp' + sheet.id} id={sheet.id} onClose={closeSheet} askPrice={setAsk} /> : null}
      {sheet?.kind === 'bd' ? <BdSheet key={'bd' + sheet.id} id={sheet.id} brand={brand} onClose={closeSheet} askPrice={setAsk} /> : null}
      {sheet?.kind === 'gp' ? <GpSheet key={'gp' + sheet.id} id={sheet.id} cat={sheet.cat} onClose={closeSheet} askPrice={setAsk} /> : null}

      <PriceChangeModal ask={ask} onDone={() => setAsk(null)} />

      {modal?.kind === 'wiz' ? (
        <WizardModal
          cat={modal.cat}
          onClose={closeModal}
          onCreated={(n) => {
            setTab(n.cat);
            setModal({ kind: 'created', id: n.id });
            refresh();
            toast('Servicio personalizado creado', `${n.name} · ${n.id}`);
          }}
        />
      ) : null}

      {modal?.kind === 'created' && gp ? <CreatedModal g={gp} onClose={closeModal} /> : null}

      {modal?.kind === 'sc' && gp ? (
        <Modal
          open
          onClose={closeModal}
          title="Shortcode del producto"
          sub={gp.name}
          footer={
            <button type="button" className="btn" onClick={closeModal}>
              Cerrar
            </button>
          }
        >
          <ScBox code={scCode(gp)} />
          <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
            Péguelo en cualquier página de WordPress con el plugin del sistema. {gp.sale === 'cotizacion' ? 'Como es «solo cotización», el botón abre el formulario de cotización.' : 'El botón «Contratar» lleva al carrito del portal.'}
          </p>
        </Modal>
      ) : null}

      {pv ? <PreviewModal p={pv} onClose={closeModal} /> : null}
    </>
  );
}

/* =================== Servicio creado =================== */
function CreatedModal({ g, onClose }: { g: GenProduct; onClose: () => void }) {
  return (
    <Modal
      open
      onClose={onClose}
      title="Servicio creado"
      sub={g.name}
      footer={
        <button type="button" className="btn primary" onClick={onClose}>
          Listo
        </button>
      }
    >
      <div className="note">
        <Icon name="check" size="sm" />
        <span>
          Se agregó a <b>{catName(g.cat)}</b> con {g.fields.length} campos propios y {g.tasks.length} tareas de entrega.
        </span>
      </div>
      <div className="field">
        Shortcode para WordPress
        <ScBox code={scCode(g)} />
      </div>
    </Modal>
  );
}

/* =================== Vista previa del plan en WordPress =================== */
function PlanCard({ p, hl }: { p: HostingPlan; hl: boolean }) {
  const fs = [`${p.disk} GB SSD NVMe`, p.bw ? `${p.bw} GB de transferencia` : 'Transferencia ilimitada', p.mails ? `${p.mails} cuentas de correo` : 'Correo no incluido', `${p.dbs} bases de datos`, `${p.sites} ${p.sites === 1 ? 'sitio' : 'sitios'}`];
  return (
    <div className={`mw-plan${p.feat ? ' destacado' : ''}${hl ? ' hl' : ''}`}>
      {p.feat ? <span className="mw-tag">Más elegido</span> : null}
      <b className="mw-h">{p.name}</b>
      <div className="mw-price">
        <span>S/</span>
        {NF2.format(p.p.PEN.m)}
        <small>/mes</small>
      </div>
      <small className="mw-mut">S/ {NF2.format(p.p.PEN.a)} al año</small>
      <ul>
        {fs.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      <span className={mwBtnCls(p.brand)}>Contratar</span>
    </div>
  );
}
function PreviewModal({ p, onClose }: { p: HostingPlan; onClose: () => void }) {
  const s = SITES.find((x) => x.brand === p.brand) || SITES[0];
  const others = HPLANS.filter((x) => x.brand === p.brand && x.active && x !== p).slice(0, 2);
  const list = [...others.slice(0, 1), p, ...others.slice(1)];
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Vista previa del shortcode"
      sub={`[hub_plan id="${p.id}"] en ${s.host} · así se verá la tarjeta en WordPress`}
      footer={
        <button type="button" className="btn" onClick={onClose}>
          Cerrar
        </button>
      }
    >
      <div className="mw" style={mwVars(p.brand) as CSSProperties}>
        <div className="mw-bar">
          <i />
          <i />
          <i />
          <span>{s.host}/hosting</span>
        </div>
        <section className="mw-sec">
          <div className="mw-plans">
            {list.map((x) => (
              <PlanCard key={x.id} p={x} hl={x === p} />
            ))}
          </div>
        </section>
      </div>
      {!p.online || !p.active ? (
        <div className="note warn">
          <Icon name="tri" size="sm" />
          <span>Este paquete no se muestra en la web porque está {!p.active ? 'inactivo' : 'sin venta en línea'}.</span>
        </div>
      ) : null}
    </Modal>
  );
}

