/**
 * Vista «wp» (#wp) — WordPress y shortcodes (prototipo vWp, l.2472-2518, y
 * ampliación [hub_whois]/[hub_servidores], l.3256-3280).
 * Parámetros: #wp/<pestaña> o #wp/generador/<shortcode>.
 */
import { useEffect, useState } from 'react';
import { useApp } from '../../app/context';
import type { ViewProps } from '../../app/routes';
import { useViewState } from '../../app/storage';
import { PageHead, Tabs } from '../../components/ui';
import { FORMS, SCDEF, type BrandId } from '../../data';
import WpSitios from './web-config/WpSitios';
import WpGenerador from './web-config/WpGenerador';
import WpWidget from './web-config/WpWidget';
import WpFormularios from './web-config/WpFormularios';
import { WpContacto, WpLegales } from './web-config/WpContactoLegales';
import type { ScVals } from './web-config/wpData';

type Tab = 'sitios' | 'generador' | 'widget' | 'formularios' | 'contacto' | 'legales';
const TABS: Tab[] = ['sitios', 'generador', 'widget', 'formularios', 'contacto', 'legales'];
const TAB_LABEL: Record<Tab, string> = { widget: 'Widget embebible', sitios: 'Sitios conectados', generador: 'Generador de shortcodes', formularios: 'Formularios', contacto: 'Contacto por marca', legales: 'Documentos legales' };

export default function WpView({ param }: ViewProps) {
  const { brand } = useApp();
  const gb: BrandId = brand === 'all' ? 'ap' : brand;
  const [tab, setTab] = useViewState<Tab>('wp.tab', 'sitios');
  const [scName, setScName] = useViewState('wp.scName', 'hub_planes');
  const [scVals, setScVals] = useViewState<ScVals>('wp.scVals', {});
  const [scBrand, setScBrand] = useViewState<BrandId>('wp.scBrand', gb);
  const [formSel, setFormSel] = useViewState('wp.formSel', 'contacto');
  const [ctBrand, setCtBrand] = useViewState<BrandId>('wp.ctBrand', gb);
  const [legBrand, setLegBrand] = useViewState<BrandId>('wp.legBrand', gb);

  /* Parámetro de ruta: pestaña o generador/<shortcode> */
  useEffect(() => {
    if (!param) return;
    const [t, sc] = param.split('/');
    if ((TABS as string[]).includes(t)) setTab(t as Tab);
    if (t === 'generador' && sc && SCDEF[sc]) setScName(sc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [param]);
  /* El filtro global de marca fija la marca de las pestañas por marca */
  useEffect(() => {
    if (brand === 'all') return;
    setScBrand(brand);
    setCtBrand(brand);
    setLegBrand(brand);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand]);

  const [nSites, setNSites] = useState<number | null>(null);
  return (
    <>
      <PageHead
        crumbs={[['Web', 'wp'], ['WordPress y shortcodes', 'wp']]}
        title="WordPress y shortcodes"
        sub="Las webs públicas viven en WordPress; aquí se conectan los sitios y se generan los shortcodes que muestran datos del sistema."
      />
      <section className="card">
        <Tabs<Tab>
          label="Secciones de WordPress"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'sitios', label: 'Sitios conectados', count: nSites ?? undefined },
            { id: 'generador', label: 'Generador de shortcodes', count: Object.keys(SCDEF).length },
            { id: 'widget', label: 'Widget embebible' },
            { id: 'formularios', label: 'Formularios', count: FORMS.length },
            { id: 'contacto', label: 'Contacto por marca' },
            { id: 'legales', label: 'Documentos legales' },
          ]}
        />
        <div role="tabpanel" aria-label={TAB_LABEL[tab]}>
          {tab === 'sitios' ? <WpSitios onCount={setNSites} /> : null}
          {tab === 'generador' ? <WpGenerador name={scName} setName={setScName} vals={scVals} setVals={setScVals} brand={scBrand} setBrand={setScBrand} /> : null}
          {tab === 'widget' ? <WpWidget /> : null}
          {tab === 'formularios' ? <WpFormularios sel={formSel} setSel={setFormSel} /> : null}
          {tab === 'contacto' ? <WpContacto brand={ctBrand} setBrand={setCtBrand} /> : null}
          {tab === 'legales' ? <WpLegales brand={legBrand} setBrand={setLegBrand} /> : null}
        </div>
      </section>
    </>
  );
}
