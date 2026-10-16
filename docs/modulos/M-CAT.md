# M-CAT · Catalog (productos, planes, complementos, paquetes y precios de dominios)

> Módulo de código `app/Modules/Catalog` · clave de permiso `catalog` · código `CAT`.
> Fuente: `docs/00-requerimientos.md` secciones 4, 7, 21, 22 (#6, #7, #8), 23, 25 ("Administración de paquetes de hosting, VPS y dominios" y "Compra en línea de servicios simples") 26 ("Catálogo completo y servicios personalizados") y 27 (`[hub_servidores]` y descripciones con editor enriquecido); contrato común de nombres.

## 1. Propósito y bloque

Define qué se vende: productos por marca con planes, precios por moneda y ciclo, costo interno, complementos y paquetes, más los precios de dominios por extensión y registrador. Cada producto declara su regla de aprovisionamiento, si requiere contrato y si califica como exportación de servicios. Desde docs/00 §26 el catálogo es **completo por categorías** (hosting compartido, reseller, VPS, servidores dedicados, cloud, dominios, SSL, correo corporativo con cPanel, Google Workspace y Microsoft 365, páginas web, tiendas virtuales, Moodle, licencias, soporte y mantenimiento, desarrollo a medida y personalizados) y el administrador crea **tipos de servicio personalizados** sin programar, que aparecen al instante en las webs de WordPress por shortcode.

- **Bloque:** B. Núcleo comercial.
- **Depende de:** BRD, CFG, IDN; PRV para el proveedor y costo de referencia.
- **Dependen de él:** SRV, SAL (cotizaciones), ORD (aprovisionamiento y carrito), BIL (impuestos y líneas), DOM (precios por extensión), FIN, WCN (API de lectura del plugin, generador de shortcodes e invalidación de caché de las webs), MAP (componente que crea un servicio personalizado), WRK (tareas plantilla de entrega), AIA (recomendación de planes).
- **También depende de:** INV (nodo preferido de un paquete de hosting).

## 2. Alcance

**Incluye**
- Categorías del catálogo completo (`product_categories.kind`): tipos fijos iniciales no borrables, una raíz por tipo, y categorías personalizadas; cada una con su `shortcode_type` para `[hub_planes tipo="..."]`.
- Productos por marca, con tipo de cobro (único o recurrente), regla de aprovisionamiento (manual o conector), marca "requiere contrato", condición gravado o exportación, plantilla de bienvenida.
- Planes con ciclo (mensual, trimestral, semestral, anual, personalizado), límites (jsonb) y costo interno de referencia con proveedor.
- Precios por plan, moneda (PEN/USD) y vigencia; programación de cambios de precio con aviso al cliente antes de la siguiente renovación (ajuste masivo).
- Complementos por producto y paquetes combinados (hosting + dominio + SSL + correo) con precio de paquete distinto a la suma; un paquete genera un servicio por componente.
- Políticas por producto: días de aviso, suspensión, cancelación y SLA, como sobrescrituras de ajustes a nivel producto (CFG) y política de SLA (HLP).
- Precios de dominios por extensión y registrador: costo, precio de venta por moneda y margen mínimo con alerta.
- Marca "venta en línea" por producto (`products.sellable_online`, docs/00 §25): hosting compartido, dominios, SSL y correo se compran desde la web de la marca; el resto muestra "Solicitar cotización". El catálogo público por marca (`GET /public/catalog`) expone solo planes activos con precio vigente, sin costos ni proveedor; ese precio es el que se factura.
- Paquetes de hosting: ficha comercial por marca (`product_listings`: nombre por marca, venta en línea sí o no, orden, destacado y vigencia), ficha técnica (`hosting_package_specs`: espacio, ancho de banda, cuentas de correo, bases de datos, sitios, paquete de WHM asociado y nodo preferido), precios por ciclo en soles y dólares y complementos.
- Planes VPS y servidores dedicados: ficha técnica (`vps_plan_specs`: CPU, procesador, RAM, disco y tipo de disco, transferencia, sistemas operativos, ubicación, administrado o no, proveedor y plan de origen) con su costo por ciclo en `plans` y complementos (`product_addons`: respaldos, licencia cPanel, IP adicional) con precios por ciclo y moneda; se muestran en la web con `[hub_servidores]` y su configurador (docs/00 §27).
- Descripciones de productos y de tipos de servicio personalizados escritas con el editor de textos enriquecido (AUT), saneadas y con historial (`rich_text_versions`, campo `description`).
- Dominios por extensión (`domain_extensions`): registrador por defecto, costos de registro, renovación y transferencia y precio de venta por moneda en `domain_tld_prices`, margen mínimo con alerta, reglas de la extensión (`tld_rules`, DOM), venta en línea sí o no, destacado y orden en el buscador de dominios de la web.
- Paquetes combinados hosting + dominio + SSL + correo con precio propio, vendibles en línea cuando todos sus componentes lo son.
- Todo cambio de precio queda con fecha de vigencia y aviso previo a los clientes con servicios o dominios activos; las webs WordPress muestran el catálogo publicado al instante (aviso de invalidación de WCN a los sitios de la marca).
- Tipos de servicio personalizados (`service_types`, `service_type_fields`): identidad (nombre, categoría existente o nueva, descripción, icono, marcas donde se ofrece); campos propios de tipo texto, número, lista, fecha, archivo o casilla, que pide el cliente al contratar o completa soporte; precio y ciclo (único o recurrente, ciclos, precios en soles y dólares) en su producto y planes, con costo y proveedor opcionales; lista de tareas plantilla de entrega y contrato obligatorio o no; tipo de componente que crea en el mapa de servicios; qué datos ve el cliente en el portal; venta en línea o solo por cotización; shortcode disponible al instante.
- Catálogo por categoría para el plugin de WordPress (`GET /public/wp/catalog/categories` y `/public/wp/catalog/plans`, WCN): planes vigentes de la marca, incluidos los personalizados, sin costos ni proveedor.

**No incluye**
- Servicios contratados por cliente (SRV).
- Cupones y descuentos (BIL).
- Carrito y compra en línea (ORD) y su presentación en la web (WordPress, por los shortcodes de WCN); CAT solo marca qué se vende en línea y fija el precio.
- SEO de los planes y datos estructurados de producto: viven en WordPress (Rank Math o Yoast).
- Valores de los campos propios en cada servicio (SRV, `service_field_values`).

## 3. Entidades

| Tabla | Campos clave | Notas |
|---|---|---|
| `product_categories` | code, name (i18n), parent_id, kind, shortcode_type, is_system, sort_order | Una raíz por tipo fijo; las nuevas son `custom` |
| `products` | code, category_id, brand_id, name (i18n), description, billing_type (`one_time`/`recurring`), provisioning_rule (jsonb: modo, conector, procedimiento), requires_contract, export_eligible (`taxed`/`export`), welcome_template_id, is_active, sellable_online, service_type_id, custom | `sellable_online`: venta en línea; `service_type_id`: tipo personalizado |
| `plans` | product_id, code, name, cycle, tax_code, limits (jsonb), cost_minor, cost_currency, is_active | Costo de referencia |
| `plan_prices` | plan_id, currency (`PEN`/`USD`), price_minor, setup_fee_minor, effective_from, effective_to, customers_notified_at | Vigencias no superpuestas |
| `product_addons` | product_id, addon_product_id, is_required | |
| `bundle_items` | bundle_plan_id, item_plan_id, quantity | Un servicio por componente |
| `domain_tld_prices` | tld, provider_id, operation (`register`/`renew`/`transfer`/`restore`), years, cost_minor, cost_currency, price_minor, currency, effective_from, effective_to, domain_extension_id, customers_notified_at | Vigencias con aviso del precio de renovación |
| `domain_extensions` | tld, default_registrar_id, min_margin_percent, sellable_online, allows_transfer_in, is_featured, sort_order, is_active | Una por extensión |
| `product_listings` | product_id, brand_id, display_name, tagline, highlights, sellable_online, is_featured, sort_order, visible_from, visible_until, deleted_at | Ficha por marca; venta en línea solo si además `products.sellable_online` |
| `hosting_package_specs` | product_id, disk_mb, bandwidth_mb, email_accounts, databases, websites, whm_package, preferred_node_id, extra_resources | Una por producto; paquete de WHM obligatorio |
| `vps_plan_specs` | product_id, vcpu, ram_mb, disk_gb, transfer_gb, os_options, is_managed, location, cpu_model, disk_type (`ssd`/`nvme`/`hdd`), provider_id, provider_plan_ref | Una por producto (VPS o dedicado); plan de origen obligatorio |
| `service_types` | code, name, description, icon, category_id, brand_ids, status (`draft`/`active`/`archived`), sale_mode (`online`/`quote_only`), requires_contract, default_provider_id, component_kind, delivery_tasks, portal_fields, activated_at, archived_at | Tipo de servicio personalizado |
| `service_type_fields` | service_type_id, key, label, help_text, field_type (`text`/`number`/`select`/`date`/`file`/`checkbox`), options, validation, is_required, filled_by (`customer`/`staff`), position, is_active | El tipo de un campo no cambia |

## 4. Casos de uso y flujos

1. **Crear producto:** marca, categoría, tipo de cobro, regla de aprovisionamiento, requiere contrato, gravado/exportación; luego planes y precios por moneda.
2. **Definir paquete:** producto tipo paquete con `bundle_items`; al contratarlo, SRV crea un servicio por componente con el reparto del precio del paquete.
3. **Políticas por producto:** desde el producto se abren las sobrescrituras de ajustes nivel producto (días de aviso, suspensión, exención) y se elige la política de SLA.
4. **Ajuste masivo de precios:** elegir productos/planes, porcentaje o nuevo precio y fecha efectiva → el sistema calcula los servicios afectados y programa el aviso a cada cliente antes de su siguiente renovación → el nuevo precio aplica a la renovación siguiente a la fecha efectiva.
5. **Precios de dominios:** mantener costo y precio por extensión y registrador; si el costo sube (manual o leído del registrador) y el margen cae bajo el mínimo, se crea una alerta para finanzas.
6. **Alta de un paquete de hosting en venta en línea** (ventas y finanzas): producto y planes por ciclo → ficha técnica con paquete de WHM y nodo preferido (`PUT /admin/products/{id}/hosting-spec`) → precios en PEN y USD con vigencia → ficha por marca con nombre, orden, destacado y venta en línea → las webs WordPress de la marca lo muestran al instante (flujo M de `docs/03`).
7. **Plan VPS:** ficha técnica con proveedor y plan de origen (`PUT /admin/products/{id}/vps-spec`); su costo por ciclo vive en `plans` y solo lo ve finanzas; complementos de respaldos, licencia cPanel e IP adicional como `product_addons`.
8. **Extensión de dominio:** crear la extensión con registrador por defecto y margen mínimo; cargar costos y precios de registro, renovación y transferencia; marcarla en venta en línea y destacarla en el verificador; programar cambios de precio con aviso (`POST /admin/domain-extensions/{id}/price-change`).
9. **Crear un servicio personalizado** (admin): en P-CAT-09 define identidad, categoría (o crea una nueva de tipo `custom`), marcas, campos propios, tareas plantilla de entrega, contrato obligatorio, componente del mapa, datos visibles en el portal y modo de venta → crea su producto con planes, precios y costo opcional (`POST /admin/service-types/{id}/products`) → lo activa: aparece en el generador de shortcodes y en `[hub_planes tipo="<código>"]` sin cambios en el plugin (flujo P de `docs/03`).
10. **Contratar un servicio personalizado:** en el carrito o la cotización se piden los campos `filled_by = customer`; al activar el servicio, soporte completa los `staff` y se crean las tareas de entrega y el componente del mapa (SRV, WRK, MAP).
11. **Catálogo completo:** el seeder crea las categorías de tipo fijo (`is_system`) con su `shortcode_type` (equivalencias en `docs/13`, sección 8: `hosting`, `reseller`, `vps`, `dedicado`, `cloud`, `ssl`, `correo`, `web`, `tienda`, `moodle`, `licencia`, `soporte`, `desarrollo`); el administrador agrega subcategorías o categorías personalizadas y ordena el catálogo.

## 5. Reglas de negocio clave

Los precios nunca se guardan sin moneda y solo existen PEN y USD; el costo del proveedor admite cualquier moneda ISO 4217. Las vigencias de precio de un plan no se superponen. Un cambio de precio no altera facturas ya emitidas ni suscripciones hasta su siguiente renovación, y siempre va precedido del aviso al cliente. Un producto "requiere contrato" impide activar el servicio hasta que el contrato esté `signed_active`. La condición de exportación se marca por producto y por cliente; el IGV se omite solo si ambos califican. Un producto con servicios no se borra: se desactiva. El margen de dominio se calcula convirtiendo costo a la moneda del precio con el tipo de cambio del día. Reglas del alcance de docs/00 §25, §26 y §27: RN-CAT-001 a RN-CAT-013 (`docs/04`): qué se muestra como contratable en cada marca, vigencias y aviso de cambios de precio, paquete de WHM y nodo preferido, plan de origen del VPS oculto al público, margen mínimo por extensión, aviso inmediato de invalidación a las webs, categorías fijas del catálogo completo, activación de tipos de servicio personalizados, valores de campos coherentes con su tipo, entrega con tareas y componente del mapa, datos visibles en el portal, quién administra los tipos y la ficha de servidores con complementos para `[hub_servidores]`.

## 6. Estados

- `service_types.status`: `draft`, `active`, `archived` (máquina 27 de `docs/03`).
- Productos, planes y precios usan `is_active` y vigencias.

## 7. Permisos

| Código | Rol por defecto |
|---|---|
| `catalog.product.view` | todo el personal |
| `catalog.product.create` / `update` / `delete` / `export` | admin |
| `catalog.plan.view` / `create` / `update` | admin |
| `catalog.plan_price.view` / `create` / `update` | admin, finance |
| `catalog.domain_tld_price.view` / `create` / `update` | admin, finance |
| `catalog.product_category.create` / `update` | admin |
| `catalog.product_listing.view` / `create` / `update` / `delete` | admin, sales |
| `catalog.hosting_package_spec.view` / `update` | admin, sales |
| `catalog.vps_plan_spec.view` / `update` | admin, sales |
| `catalog.domain_extension.view` / `create` / `update` | admin, sales |
| `catalog.domain_extension.delete` | admin |
| `catalog.service_type.view` | todo el personal |
| `catalog.service_type.create` / `update` / `delete` | admin |

Costos (`cost_minor`) visibles solo con `finance.cost.view`.

## 8. Pantallas

### P-CAT-01 · Productos
- **Propósito:** listar el catálogo por marca y categoría.
- **Rol principal:** admin
- **Columnas:** código, producto, marca, categoría, tipo de cobro, requiere contrato, gravado/exportación, planes, precio desde (PEN/USD), servicios activos, activo.
- **Filtros:** marca, categoría, tipo de cobro, requiere contrato, activo.
- **Acciones:** Crear producto → `catalog.product.create`; Exportar → `catalog.product.export`; Ajuste masivo de precios → `catalog.plan_price.create`.
- **Vacío / error:** vacío con botón crear; error de carga con reintento.

### P-CAT-02 · Detalle de producto
- **Propósito:** configurar producto, planes, precios, complementos, paquete y políticas.
- **Rol principal:** admin
- **Campos:** datos generales (descripción con el editor de textos enriquecido e historial de versiones), regla de aprovisionamiento (manual o conector con procedimiento), requiere contrato, gravado/exportación, plantilla de bienvenida, SLA; pestañas planes y precios (por moneda y vigencia), complementos, componentes del paquete, políticas (sobrescrituras de ajustes nivel producto), costos (con permiso).
- **Filtros:** vigencia de precios.
- **Acciones:** Guardar → `catalog.product.update`; Agregar plan → `catalog.plan.create`; Programar precio → `catalog.plan_price.create`; Editar políticas → `settings.setting.update`; Desactivar → `catalog.product.update`.
- **Vacío / error:** plan sin precio en ninguna moneda muestra advertencia y no se puede usar en cotizaciones; 422 por vigencias superpuestas; 409 al borrar con servicios.

### P-CAT-03 · Precios de dominios por extensión
- **Propósito:** mantener costo, precio y margen por extensión y registrador.
- **Rol principal:** finance
- **Columnas:** extensión, registrador, operación, costo y moneda, precio y moneda, margen %, margen mínimo, vigente desde, alerta.
- **Filtros:** extensión, registrador, bajo margen mínimo.
- **Acciones:** Agregar precio → `catalog.domain_tld_price.create`; Editar → `catalog.domain_tld_price.update`; Exportar → `catalog.product.export`.
- **Vacío / error:** "Sin precios para esta extensión" con botón agregar; fila resaltada cuando el margen está bajo el mínimo.

### P-CAT-04 · Ajuste masivo de precios
- **Propósito:** cambiar precios de varios planes y avisar a los clientes antes de su renovación.
- **Rol principal:** finance
- **Campos:** productos/planes, moneda, tipo de ajuste (porcentaje o nuevo precio), fecha efectiva, plantilla de aviso; vista previa de servicios afectados con precio actual, nuevo, próxima renovación y fecha del aviso.
- **Filtros:** marca, producto.
- **Acciones:** Vista previa → `catalog.plan_price.view`; Confirmar y programar avisos → `catalog.plan_price.create`.
- **Vacío / error:** "Ningún servicio afectado"; advertencia si alguna renovación cae antes del plazo mínimo de aviso (esos servicios aplican el cambio en la renovación siguiente).

### P-CAT-05 · Fichas por marca
- **Propósito:** decidir qué se vende en las webs de cada marca, con qué nombre y en qué orden.
- **Rol principal:** sales
- **Columnas:** marca, producto, nombre en la marca, venta en línea, destacado, orden, vigencia, precio vigente (PEN/USD).
- **Filtros:** marca, categoría, venta en línea, vigentes.
- **Acciones:** Crear ficha → `catalog.product_listing.create`; Editar → `catalog.product_listing.update`; Reordenar → `catalog.product_listing.update`; Dar de baja → `catalog.product_listing.delete`.
- **Vacío / error:** "Esta marca aún no muestra productos"; venta en línea sin precio vigente o sin ficha técnica → 422 con el motivo.

### P-CAT-06 · Ficha técnica de hosting o VPS
- **Propósito:** describir los recursos del paquete y cómo se aprovisiona.
- **Rol principal:** sales
- **Campos:** hosting: espacio, ancho de banda, correos, bases de datos, sitios, paquete de WHM, nodo preferido con su capacidad; VPS o dedicado: CPU, procesador, RAM, disco y tipo de disco, transferencia, sistemas operativos, ubicación, administrado, proveedor y plan de origen (costo solo con `finance.cost.view`); complementos que ofrece el configurador de `[hub_servidores]`.
- **Filtros:** no aplica.
- **Acciones:** Guardar ficha de hosting → `catalog.hosting_package_spec.update`; Guardar ficha VPS o dedicado → `catalog.vps_plan_spec.update`; Copiar shortcode → `web_connector.shortcode.view`.
- **Vacío / error:** paquete de WHM vacío o plan de origen vacío → 422; nodo preferido cerrado a cuentas nuevas → advertencia.

### P-CAT-07 · Extensiones de dominio
- **Propósito:** administrar las extensiones que se venden, su registrador, costos, precios y margen.
- **Rol principal:** sales
- **Columnas:** extensión, registrador por defecto, costo y precio de registro, renovación y transferencia por moneda, margen y margen mínimo, venta en línea, destacada, orden, alerta de margen.
- **Filtros:** venta en línea, bajo margen, registrador.
- **Acciones:** Crear extensión → `catalog.domain_extension.create`; Editar → `catalog.domain_extension.update`; Programar cambio de precios con aviso → `catalog.domain_tld_price.update`; Dar de baja → `catalog.domain_extension.delete`.
- **Vacío / error:** extensión repetida → 409; venta en línea sin precio de registro y renovación en la moneda → 422.

### P-CAT-08 · Tipos de servicio personalizados
- **Propósito:** ver los servicios que la empresa vende además del catálogo estándar y su estado.
- **Rol principal:** admin
- **Columnas:** código, nombre, categoría, marcas, venta (en línea o cotización), contrato obligatorio, componente del mapa, productos, servicios activos, estado.
- **Filtros:** categoría, marca, estado, modo de venta.
- **Acciones:** Crear tipo → `catalog.service_type.create`; Editar → `catalog.service_type.update`; Activar → `catalog.service_type.update`; Archivar → `catalog.service_type.update`; Copiar shortcode → `web_connector.shortcode.view`.
- **Vacío / error:** "Sin servicios personalizados: crea el primero (por ejemplo, Landing page)"; activar sin marcas o sin producto con precio → 422 con el motivo.

### P-CAT-09 · Editor de tipo de servicio
- **Propósito:** crear un servicio nuevo sin programar.
- **Rol principal:** admin
- **Campos:** identidad (nombre por idioma, código, categoría existente o nueva, descripción con el editor de textos enriquecido, icono, marcas); campos propios (tipo, etiqueta, ayuda, opciones, validación, obligatorio, lo pide el cliente o lo completa soporte, orden); precio y ciclo (producto, planes, precios en soles y dólares; costo y proveedor opcionales, visibles con `finance.cost.view`); entrega (tareas plantilla, contrato obligatorio); mapa de servicios (tipo de componente); portal (campos visibles); venta (en línea o solo cotización).
- **Filtros:** no aplica.
- **Acciones:** Guardar → `catalog.service_type.update`; Guardar campos → `catalog.service_type.update`; Crear producto con planes y precios → `catalog.product.create`; Activar → `catalog.service_type.update`.
- **Vacío / error:** lista sin opciones → error por campo; cambiar el tipo de un campo con valores → 409 con la opción de desactivarlo; venta en línea sin producto en venta en línea → 422.

### P-CAT-10 · Categorías del catálogo
- **Propósito:** ordenar el catálogo completo y crear categorías propias.
- **Rol principal:** admin
- **Columnas:** nombre, tipo, tipo de shortcode, categoría padre, productos, tipos personalizados, de sistema, orden.
- **Filtros:** tipo, de sistema.
- **Acciones:** Crear categoría → `catalog.product_category.create`; Editar → `catalog.product_category.update`; Reordenar → `catalog.product_category.update`; Dar de baja → `catalog.product_category.delete`.
- **Vacío / error:** dar de baja o cambiar el tipo de una categoría del sistema → 409; tipo de shortcode repetido → 409.

## 9. Eventos y jobs

- **Emite:** `ProductCreated`, `PlanPriceScheduled`, `PriceChangeNoticeDue`, `DomainMarginBelowMinimum`.
- **Emite además:** `ServiceTypeCreated`, `ServiceTypeActivated`, `ServiceTypeArchived`.
- **Invalida:** la caché del plugin en las webs WordPress de la marca (WCN, `wp_cache_invalidations`) al cambiar un precio vigente, una ficha, la marca "venta en línea" o el estado de un tipo de servicio.
- **Escucha:** `ExchangeRateUpdated` (BIL) para recalcular márgenes; `DomainCostChanged` (DOM, desde el registrador).
- **Jobs:** `SendPriceChangeNotices` (diario); `CheckDomainMargins` (diario).

## 10. Integraciones y conectores

- Ninguna directa; los costos de dominio pueden actualizarse desde los conectores de registrador (DOM).

## 11. Ajustes administrables

- `billing.price_change.notice_days`
- `catalog.domain_prices.min_margin_percent` (por defecto del margen mínimo cuando la fila no lo define)
- Nivel `product` de: `domains.customer_notice_days`, `services.suspension.days_after_due`, `services.termination.days_after_suspension`, `services.suspension.exempt`, secuencia de cobranza.

## 12. Historias del backlog

- Productos, categorías y planes
- Complementos y paquetes combinados
- Políticas por producto
- Precios de dominios por extensión
- Ajuste masivo de precios con aviso
- Producto y cliente gravado o exportación de servicios
- Productos marcados para venta en línea
- Paquetes de hosting con recursos, paquete WHM y nodo preferido
- Planes VPS con proveedor y plan de origen
- Dominios por extensión con costos, precios y margen mínimo
- Ficha comercial por marca: nombre, orden, destacado y vigencia
- Paquete combinado de hosting, dominio, SSL y correo en la web
- Cambios de precio con vigencia y aviso al cliente
- Catálogo publicado al instante en la web

Épica "Servicios personalizados":
- Tipos de servicio personalizados sin programar
- Campos propios del servicio con tipos validados
- Precio, ciclo, costo y proveedor del servicio personalizado
- Entrega con tareas plantilla y contrato obligatorio
- Componente del mapa y datos visibles en el portal
- Venta en línea o por cotización con shortcode inmediato

Épica "Catálogo completo por categorías":
- Categorías fijas del catálogo completo
- Correo corporativo con cPanel, Google Workspace y Microsoft 365
- Páginas web, tiendas virtuales, Moodle y licencias en el catálogo
- Soporte, mantenimiento y desarrollo a medida en el catálogo
- Catálogo por categoría para el plugin

Épica "Shortcodes de WHOIS y servidores" (lado de CAT):
- Shortcode de servidores VPS y dedicados
- Configurador de complementos con precio en vivo

## 13. Criterios de terminado y pruebas obligatorias

- Un paquete de 4 componentes contratado crea 4 servicios cuyo precio suma el precio del paquete sin perder céntimos.
- Un precio programado no cambia la factura de una renovación anterior a la fecha efectiva.
- Un aviso de cambio de precio se envía una sola vez por servicio (clave de deduplicación).
- Margen de dominio bajo el mínimo genera una alerta para finanzas.
- Sin `finance.cost.view`, la API del panel no devuelve `cost_minor`.
- Productos "requiere contrato" quedan marcados y SRV/ORD lo respetan (prueba de integración con ORD).
- Ficha repetida por producto y marca, extensión repetida → rechazadas; paquete sin WHM y VPS sin plan de origen → rechazados.
- El catálogo público y el portal no devuelven paquete de WHM, nodo preferido, proveedor, plan de origen ni costos.
- Guardar una ficha o un precio vigente encola un aviso de invalidación para cada sitio WordPress activo de la marca.
- Un tipo de servicio activado aparece en `[hub_planes tipo="<código>"]` sin cambiar el plugin; uno archivado deja de venderse y sus servicios conservan campos y valores.
- Un valor de campo propio de otro tipo o una opción inexistente → rechazados; cambiar el tipo de un campo con valores → rechazado; una segunda categoría raíz del mismo tipo → rechazada.
- El portal muestra solo los campos de `portal_fields` de un servicio personalizado, sin costo ni proveedor.
- Un producto sin `sellable_online` no aparece como contratable en el catálogo público ni entra al carrito; el precio del catálogo público es igual al de `plan_prices` vigente de la marca y moneda.
- El catálogo público no expone `cost_minor`, proveedor ni planes inactivos (prueba de serialización).
- `GET /public/wp/servers` solo devuelve planes de `vps` y `dedicated_server` con ficha y precio vigente en la moneda pedida, con sus complementos y sin proveedor, plan de origen ni costo; un tipo de disco fuera de la lista → rechazado.

## 14. Preguntas abiertas

- Qué productos califican como exportación de servicios y qué productos están alcanzados por detracción, según el contador (docs/00, sección 14).
- Lista final de tipos de servicio personalizados iniciales y sus campos (se cargan desde el panel, no en el código).

## Anexo: nombres fuera del contrato

- Tablas `service_types` y `service_type_fields`, columnas `product_categories.kind`, `shortcode_type`, `is_system` y `products.service_type_id` (docs/00 §26); permiso `catalog.service_type.*`; endpoints `/admin/service-types/...`.
- Por docs/00 §27: columnas `vps_plan_specs.location`, `cpu_model` y `disk_type`; endpoint `GET /public/wp/servers` (lo expone WCN con los datos de CAT).
