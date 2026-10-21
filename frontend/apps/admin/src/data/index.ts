/**
 * Punto de entrada de los datos mock. Importe desde '../../data' (o la ruta
 * relativa equivalente):
 *
 *   import { clients, CBY, invoices, saldo, fD, TODAY, diffD } from '../../data';
 *
 * Módulos:
 *  - types    : interfaces (Client, Service, Domain, Invoice, …)
 *  - format   : fechas, números, moneda, colores (puros)
 *  - rng      : generador determinista (no usar en render)
 *  - db       : datasets generados (clients, services, domains, invoices, vouchers,
 *               commits, tickets, leads, NODES, RECL, LEGAL, PACC, CPROJ, LICS,
 *               CERTS, QUOTES, CONTRACTS, ORDERS, VAULT, TASKS…) y filtros por marca
 *  - catalog  : HPLANS, VPLANS, ADDONS, TLDS, BUNDLES, CATS
 *  - config   : ROLES, SEC, MODS, PERM, USERS, RLS
 *  - ops      : MONS, INCS, BKS, RESTS, COSTR, series de Inicio
 *  - web      : SITES, WPS, SCDEF, PROMOS, SCUSE, CONTACT, FORMS, APP (apariencia)
 *  - kpi      : KD, KBY, KG y motor de cálculo (kVal, kPrev, kSpark…)
 */
export * from './types';
export * from './format';
export { seededRng, kHash } from './rng';
export * from './db';
export * from './catalog';
export * from './config';
export * from './ops';
export * from './web';
export * from './kpi';
