/**
 * Mapa de servicios de la ficha 360 (projectsOf y mapSvg del prototipo, l.1718-1760).
 */
import type { KeyboardEvent } from 'react';
import { ICONS } from '../../../components/Icon';
import { addD, diffD, fD, TODAY } from '../../../data';
import type { Client, Cur } from '../../../data';

export type MapSt = 'ok' | 'warn' | 'danger';
export interface MapNode {
  k: string;
  col: number;
  row: number;
  ic: string;
  t: string;
  cli: string;
  sub: string;
  prov: string;
  st: MapSt;
  info: [string, string][];
  cost: string;
  price: string;
}
export interface MapProject {
  n: string;
  d: string;
  nodes: MapNode[];
  edges: [string, string, string][];
}

export function projectsOf(c: Client, money: (v: number, c: Cur) => string): MapProject[] {
  if (c.id === 'CL-1001')
    return [
      {
        n: 'Web de turismo',
        d: 'Sitio público, reservas en línea y comunicaciones',
        nodes: [
          { k: 'dom', col: 0, row: 1, ic: 'globe', t: 'andestravel.pe', cli: 'Dominio', sub: 'PoloDomains', prov: 'PoloDomains', st: 'ok', info: [['Vence (real)', fD(addD(TODAY, 156))], ['Vence (comercial)', fD(addD(TODAY, 141))], ['Titular', 'Empresa']], cost: 'US$ 2.90/mes', price: 'S/ 129/año' },
          { k: 'dns', col: 1, row: 1, ic: 'net', t: 'DNS Route 53', cli: 'DNS administrado', sub: 'AWS · 1 zona', prov: 'AWS', st: 'ok', info: [['Consultas/mes', '2.1 M'], ['Registros', '34'], ['Salud', 'OK']], cost: 'US$ 1.35/mes', price: 'S/ 8/mes' },
          { k: 'cdn', col: 2, row: 0, ic: 'layers', t: 'CDN Bunny.net', cli: 'Red de distribución (CDN)', sub: 'Pull zone andestravel', prov: 'Bunny.net', st: 'ok', info: [['Tráfico/mes', '184 GB'], ['Aciertos de caché', '93 %'], ['PoP principal', 'Lima']], cost: 'US$ 1.84/mes', price: 'S/ 25/mes' },
          { k: 'mail', col: 2, row: 2, ic: 'mail', t: 'Correo cPanel', cli: 'Correo corporativo', sub: 'BH-RES-02', prov: 'BanaHosting (reseller)', st: 'ok', info: [['Buzones', '18'], ['Uso', '7.4 / 20 GB'], ['Registros MX', 'OK']], cost: 'US$ 1.10/mes', price: 'S/ 349/año' },
          { k: 'vps', col: 3, row: 0, ic: 'cpu', t: 'VPS Contabo', cli: 'Servidor virtual (VPS)', sub: 'Cloud VPS 20 · 6 vCPU', prov: 'Contabo', st: 'ok', info: [['CPU', '38 %'], ['RAM', '7.1 / 12 GB'], ['Disco', '61 %'], ['IP', '203.0.113.201']], cost: 'US$ 9.50/mes', price: 'S/ 180/mes' },
          { k: 'wp', col: 4, row: 0, ic: 'box', t: 'WordPress 6.6', cli: 'Sitio web', sub: 'Sitio público + blog', prov: 'En VPS Contabo', st: 'ok', info: [['Plugins', '23 (2 por actualizar)'], ['Último backup', '08/10 02:00'], ['Tiempo de carga', '1.4 s']], cost: 'Incluido', price: 'Incluido' },
          { k: 'app', col: 4, row: 1, ic: 'code', t: 'Motor de reservas', cli: 'Sistema de reservas', sub: 'Sistema a medida (Laravel)', prov: 'Equipo interno · en VPS', st: 'warn', info: [['Cola de trabajos', '312 pendientes'], ['Versión', '2.8.1'], ['Ticket', 'TK-26410']], cost: '6 h/mes', price: 'S/ 540/mes' },
          { k: 'mkt', col: 4, row: 2, ic: 'send', t: 'Elastic Email', cli: 'Envío de correos masivos', sub: 'Mailing y transaccional', prov: 'Elastic Email', st: 'ok', info: [['Envíos/mes', '12,400'], ['Entregabilidad', '98.6 %'], ['Rebotes', '0.9 %']], cost: 'US$ 6.20/mes', price: 'S/ 85/mes' },
        ],
        edges: [['dom', 'dns', 'NS'], ['dns', 'cdn', 'CNAME'], ['dns', 'mail', 'MX'], ['cdn', 'vps', 'origen'], ['vps', 'wp', ''], ['vps', 'app', ''], ['app', 'mkt', 'SMTP']],
      },
      {
        n: 'Correo corporativo',
        d: 'Colaboración y correo del equipo administrativo',
        nodes: [
          { k: 'd2', col: 0, row: 0, ic: 'globe', t: 'andestravelexperience.com', cli: 'Dominio', sub: 'Namecheap', prov: 'Namecheap', st: 'warn', info: [['Vence (real)', fD(addD(TODAY, 19))], ['Vence (comercial)', fD(addD(TODAY, 4))], ['Titular', 'Cliente']], cost: 'US$ 0.95/mes', price: 'S/ 69/año' },
          { k: 'dn2', col: 1, row: 0, ic: 'net', t: 'DNS Route 53', cli: 'DNS administrado', sub: 'AWS · zona compartida', prov: 'AWS', st: 'ok', info: [['Registros', '12']], cost: 'US$ 0.50/mes', price: 'Incluido' },
          { k: 'gw', col: 2, row: 0, ic: 'mail', t: 'Google Workspace', cli: 'Correo y colaboración', sub: 'Business Starter × 14', prov: 'Google Workspace', st: 'ok', info: [['Licencias', '14 / 14'], ['Almacenamiento', '148 / 420 GB'], ['SPF/DKIM', 'OK']], cost: 'US$ 100.80/mes', price: 'S/ 378/mes' },
        ],
        edges: [['d2', 'dn2', 'NS'], ['dn2', 'gw', 'MX']],
      },
    ];
  const ns: MapNode[] = [];
  const es: [string, string, string][] = [];
  const dm = c.domains[0];
  const host = c.services.find((s) => s.t === 'Hosting cPanel' || s.t === 'VPS administrado');
  if (dm) {
    ns.push({ k: 'd', col: 0, row: 1, ic: 'globe', t: dm.d, cli: 'Dominio', sub: dm.reg, prov: dm.reg, st: diffD(dm.real, TODAY) < 15 ? 'warn' : 'ok', info: [['Vence (real)', fD(dm.real)], ['Vence (comercial)', fD(dm.com)], ['Titular', dm.tit]], cost: 'US$ 1.10/mes', price: 'S/ 79/año' });
    ns.push({ k: 'n', col: 1, row: 1, ic: 'net', t: 'DNS', cli: 'DNS administrado', sub: dm.ns, prov: dm.ns === 'Route 53' ? 'AWS' : dm.ns === 'Bunny DNS' ? 'Bunny.net' : 'Propio', st: 'ok', info: [['Servidores', dm.ns]], cost: '—', price: 'Incluido' });
    es.push(['d', 'n', 'NS']);
  }
  if (host) {
    ns.push({
      k: 'h', col: 2, row: 1, ic: host.ic, t: host.t, cli: host.t === 'Hosting cPanel' ? 'Alojamiento web' : 'Servidor virtual', sub: host.node || host.plan, prov: host.prov, st: host.st === 'Activo' ? 'ok' : 'danger',
      info: [['Plan', host.plan], ['Ciclo', host.cy], ['Vence', fD(host.due)]], cost: host.node && host.node.startsWith('BH') ? 'US$ 0.57/mes' : 'US$ 3.20/mes', price: money(host.price, host.cur),
    });
    if (dm) es.push(['n', 'h', 'A']);
  }
  let r = 0;
  c.services
    .filter((s) => s !== host)
    .forEach((s) => {
      ns.push({ k: 's' + r, col: 3, row: r, ic: s.ic, t: s.t, cli: s.t, sub: s.plan, prov: s.prov, st: s.st === 'Activo' ? 'ok' : 'danger', info: [['Ciclo', s.cy], ['Vence', fD(s.due)]], cost: '—', price: money(s.price, s.cur) });
      es.push([host ? 'h' : dm ? 'n' : 's0', 's' + r, s.t.includes('Workspace') || s.t.includes('365') ? 'MX' : '']);
      r++;
    });
  if (!ns.length) return [];
  return [{ n: 'Presencia web', d: 'Componentes contratados', nodes: ns, edges: es.filter((e) => e[0] !== e[1]) }];
}

const stLabel = (s: MapSt) => (s === 'ok' ? 'operativo' : s === 'warn' ? 'requiere atención' : 'con incidencia');
const tr = (t: string, m: number) => (t.length > m ? t.slice(0, m - 1) + '…' : t);
const isDom = (k: string) => k === 'dom' || k === 'd' || k === 'd2';

export function nodeTitle(n: MapNode, clientView: boolean) {
  return clientView ? n.cli : n.t;
}
function nodeSub(n: MapNode, clientView: boolean) {
  return clientView ? (isDom(n.k) ? n.t : n.cli === n.t ? '' : n.t) : n.sub;
}

type SvgIcon = (p: Record<string, unknown>) => JSX.Element;

export function MapSvg({ p, sel, clientView, onSel }: { p: MapProject; sel: string | null; clientView: boolean; onSel: (k: string) => void }) {
  const W = 160, H = 62, CW = 218, RH = 96, P = 20;
  const maxC = Math.max(...p.nodes.map((n) => n.col));
  const maxR = Math.max(2, ...p.nodes.map((n) => n.row));
  const vw = P * 2 + maxC * CW + W;
  const vh = P * 2 + maxR * RH + H;
  const pos: Record<string, { x: number; y: number; n: MapNode }> = Object.fromEntries(p.nodes.map((n) => [n.k, { x: P + n.col * CW, y: P + n.row * RH, n }]));
  const onKey = (e: KeyboardEvent<SVGGElement>, k: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSel(k);
    }
  };
  return (
    <svg viewBox={`0 0 ${vw} ${vh}`} role="group" aria-label={`Diagrama de componentes del proyecto ${p.n}`} style={{ minWidth: Math.min(820, vw), maxWidth: vw * 1.25, width: '100%' }}>
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 10 5 0 10z" fill="var(--brand-line)" />
        </marker>
      </defs>
      {p.edges.map(([a, b, l], i) => {
        const A = pos[a], B = pos[b];
        if (!A || !B) return null;
        let x1: number, y1: number, x2: number, y2: number, d: string;
        if (B.n.col > A.n.col) {
          x1 = A.x + W; y1 = A.y + H / 2; x2 = B.x; y2 = B.y + H / 2;
          const mx = (x1 + x2) / 2;
          d = `M${x1} ${y1}C${mx} ${y1} ${mx} ${y2} ${x2 - 2} ${y2}`;
        } else if (B.n.col < A.n.col) {
          x1 = A.x; y1 = A.y + H / 2; x2 = B.x + W; y2 = B.y + H / 2;
          const mx = (x1 + x2) / 2;
          d = `M${x1} ${y1}C${mx} ${y1} ${mx} ${y2} ${x2 + 2} ${y2}`;
        } else {
          x1 = A.x + W / 2; y1 = A.y + (B.y > A.y ? H : 0); x2 = B.x + W / 2; y2 = B.y + (B.y > A.y ? 0 : H);
          d = `M${x1} ${y1}L${x2} ${y2 + (B.y > A.y ? -2 : 2)}`;
        }
        const lx = (x1 + x2) / 2, ly = (y1 + y2) / 2, w = l.length * 6.6 + 10;
        return (
          <g key={i}>
            <path className="medge" d={d} markerEnd="url(#arr)" />
            {l ? (
              <>
                <rect className="medge-bg" x={lx - w / 2} y={ly - 9} width={w} height={18} rx={4} />
                <text className="medge-l" x={lx} y={ly + 4} textAnchor="middle">
                  {l}
                </text>
              </>
            ) : null}
          </g>
        );
      })}
      {p.nodes.map((n) => {
        const { x, y } = pos[n.k];
        const title = nodeTitle(n, clientView);
        const sub = nodeSub(n, clientView);
        const Ic = ((ICONS as Record<string, unknown>)[n.ic] || ICONS.dot) as SvgIcon;
        return (
          <g key={n.k} className={`mnode${sel === n.k ? ' sel' : ''}`} tabIndex={0} role="button" aria-pressed={sel === n.k} aria-label={`${title}${sub ? ', ' + sub : ''}, estado ${stLabel(n.st)}`} onClick={() => onSel(n.k)} onKeyDown={(e) => onKey(e, n.k)}>
            <title>{`${n.t} — ${n.sub}`}</title>
            <rect className="box" x={x} y={y} width={W} height={H} rx={9} />
            <Ic className="ic" x={x + 10} y={y + 11} width={20} height={20} aria-hidden="true" focusable="false" />
            <text className="t" x={x + 38} y={y + 25}>
              {tr(title, 17)}
            </text>
            {sub ? (
              <text className="s" x={x + 38} y={y + 43}>
                {tr(sub, 20)}
              </text>
            ) : null}
            <circle className={`mdot ${n.st}`} cx={x + W - 11} cy={y + 11} r={4.5} />
          </g>
        );
      })}
    </svg>
  );
}
