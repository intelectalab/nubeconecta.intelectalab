# Módulo Catalog (M-CAT) — franja MVP

Alcance de la demostración del 23-10-2026 (flujo Cliente → Catálogo → Pedido). Doc: `docs/modulos/M-CAT.md`.

## Hecho

- CRUD admin sobre `ResourceController` (cursor, `filter[x]`, `version`, auditoría `<entidad>.created|updated|deleted`):
  - `/api/v1/admin/product-categories` (`catalog.product_category.*`): las de sistema no se borran ni cambian de tipo; con productos o subcategorías → 409.
  - `/api/v1/admin/products` (`catalog.product.*`): marca (`brand_id` NULL = todas), venta en línea (`sellable_online`) o por cotización, activo/inactivo, `q`; el detalle trae `plans.prices` y `listings`; con pedidos o servicios no se borra (409 `product_in_use`).
  - `/api/v1/admin/plans` (`catalog.plan.*`): ciclos del esquema; costo solo con `finance.cost.view`.
  - `/api/v1/admin/plan-prices` (`catalog.plan_price.*`): PEN/USD con vigencia; el alta cierra la vigencia abierta anterior, superposición → 409 `price_overlap`, precio vigente no se edita ni borra → 409 `price_in_effect` (RN-CAT-002).
  - `/api/v1/admin/product-listings` (`catalog.product_listing.*`): ficha por marca; es lo que publica `/public/wp/catalog` (mismas tablas que WebConnector).
- `PriceResolver::current($planId, $currency)`: interfaz pública para ORD/BIL.
- `php artisan hub:demo:catalog [--brand=alojamientoplus]`: catálogo del prototipo (hosting, reseller, VPS, dedicados, dominios, combos y GENPROD) en la marca AlojamientoPlus, códigos `demo-*`, idempotente, se niega en `production`. Crea la marca si no existe y la tasa IGV 18 % en `tax_rates` si falta. La descripción de cada producto indica que es dato del prototipo.

## Pendiente

- **Precio por hora**: el esquema no tiene ciclo `hourly` (`plans.cycle`); se usa `one_time` con `limits.billing_unit = hour` y la cantidad del pedido son las horas. Decidir (D-xx) si se agrega el ciclo al esquema.
- Aviso a clientes antes de la siguiente renovación por cambio de precio (RN-CAT-002) y ajuste masivo (P-CAT-04).
- Fichas técnicas `hosting_package_specs`/`vps_plan_specs` (el demo guarda WHM y proveedor en `products.custom`), `product_addons`, `bundle_items` (los combos del demo son productos simples con `limits.items`), `domain_extensions`/`domain_tld_prices` (los dominios del demo son productos anuales), `service_types`.
- Invalidación de la caché de las webs: hecha para planes y precios (`Events/PlanChanged`, `Events/PlanPriceChanged` → WebConnector `InvalidateCatalogSites`, alcance `plan`, claves = código del plan; nombres fuera del contrato de M-CAT §9). Pendiente para productos, fichas por marca y paquetes, y para precios programados (hoy avisa al registrarlos, no al entrar en vigencia).
- Nombres i18n (`products.name` es texto), exportación (`catalog.product.export`), costos del prototipo (no se cargaron: la moneda del costo no está clara).
- Panel: `frontend/apps/admin/src/views/pages/catalogo/` conecta listado por categoría, alta/edición de producto y plan con precios PEN/USD y activar/desactivar. Pendiente en el panel: fichas técnicas, complementos, paquetes, dominios, fichas por marca y shortcodes (siguen solo en modo demo, `TODO(catalog)`); buscador paginado de planes en pedidos (hoy hasta 100 productos).
