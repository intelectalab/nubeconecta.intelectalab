# 14 — Indicadores (KPI)

Catálogo del panel de indicadores de docs/00 §27: qué mide cada indicador, con qué fórmula exacta sobre las tablas y columnas de `database/schema.sql`, cada cuánto se calcula, por qué dimensiones se filtra, hacia dónde se quiere que vaya, dónde se fija su meta y qué pantalla abre su detalle. La fuente es `database/seeds/kpis.json` (la carga el seeder en `kpi_definitions`); el catálogo de la sección 9 se genera desde ese archivo con `python3 tools/verificar_kpis.py render` y `make verify` comprueba que coincidan. Módulo: DSH (`docs/modulos/M-DSH.md`); pantallas P-DSH-04 a P-DSH-06.

## 1. Alcance

- Ocho grupos: Comercial (`commercial`), CRM (`crm`), Finanzas (`finance`), Cobranza (`collections`), Operación (`operations`), Soporte (`support`), Reclamos (`complaints`) y Web (`web`), con 78 indicadores.
- Filtros comunes: periodo, marca, moneda, categoría de servicio y responsable; comparación con el periodo anterior de igual duración.
- Metas administrables por indicador, marca y periodo (`kpi_targets`), con meta por defecto en el centro de configuración para los indicadores clave (`dashboard.targets.*`).
- Cada indicador muestra su definición y su fórmula (P-DSH-05), enlaza al listado del módulo dueño con los filtros equivalentes y se exporta (`POST /admin/kpis/exports`).
- El dashboard no escribe en las tablas de otros módulos: lee, calcula y guarda el resultado en `kpi_snapshots`.

## 2. Convenciones de las fórmulas

Las fórmulas se escriben en SQL abreviado sobre nombres reales del esquema, sin alias. Marcadores y funciones auxiliares (las implementa el servicio de cálculo del módulo DSH, con pruebas propias):

| Elemento | Significado |
|---|---|
| `:inicio`, `:fin` | Inicio (00:00) y fin (23:59:59) del periodo filtrado, en la zona horaria de la organización |
| `:fin_anterior` | Fin del periodo anterior de igual duración (comparación) |
| `:hoy`, `:ahora` | Fecha y momento del cálculo |
| `mensualizar(importe, ciclo)` | Divide el importe entre los meses del ciclo: `monthly` 1, `quarterly` 3, `semiannual` 6, `annual` 12, `biennial` 24, `triennial` 36 |
| `a_moneda(importe, moneda, fecha)` | Convierte a la moneda del indicador con `exchange_rates` de esa fecha (o del mes); sin tipo de cambio para una fecha, el valor queda incompleto y la tarjeta lo avisa |
| `dias_en_periodo(a, b, :inicio, :fin)` y `dias(a, b)` | Días de [a, b] que caen dentro del periodo y días totales de [a, b] |
| `tramo(días)` | Tramos de antigüedad: por vencer, 0–30, 31–60, 61–90, más de 90 |
| `sumar_dias_habiles(fecha, n)` | Suma días hábiles con `holidays` y `business_hours` (igual que el plazo del Libro) |
| `COUNT(x WHERE condición)` | Conteo filtrado (`COUNT(*) FILTER (WHERE …)` en PostgreSQL) |
| `KPI-XXX-NN` | Valor de otro indicador del catálogo con los mismos filtros |

Reglas comunes:
- **Dinero.** Los importes salen de columnas `_minor` con su `currency`. Filtrando por moneda se suman solo documentos de esa moneda; sin filtro se consolidan en `dashboard.consolidation_currency` con `a_moneda` y la tarjeta indica la fecha del tipo de cambio. Facturado, cobrado y reconocido se muestran siempre por separado.
- **Hojas de prueba.** Los indicadores de Reclamos excluyen `complaints.is_test`.
- **Bajas lógicas.** Se excluyen filas con `deleted_at`.
- **Razones.** Se guardan numerador y denominador (`kpi_snapshots.numerator`, `kpi_snapshots.denominator`) para reagregar periodos sin promediar promedios; con denominador 0 el valor es `NULL` y la tarjeta muestra "Sin datos en el periodo", nunca 0 %.
- **Tiempos.** Los tiempos de tickets e incidentes son calendario; el SLA en horario hábil sigue en `tickets.sla_breached`.

## 3. Dimensiones de filtro

| Dimensión (`kpi_definitions.dimensions`) | Columna según el grupo |
|---|---|
| `brand` (marca) | `services.brand_id`, `orders.brand_id`, `invoices.brand_id`, `leads.brand_id`, `quotes.brand_id`, `tickets.brand_id`, `complaints.brand_id`, `carts.brand_id`, `whois_lookups.brand_id`, `web_form_submissions.brand_id`; dominios por `domains.service_id` |
| `currency` (moneda) | `currency` del documento (`subscriptions`, `invoices`, `payments`, `leads`, `orders`, `carts`, `payment_promises`); costos por `a_moneda` |
| `product_category` (categoría) | `products.category_id` del producto del servicio, de la línea del pedido o de la línea del comprobante |
| `owner` (responsable) | `customers.account_manager_id` (comercial, finanzas, cobranza y servicios), `leads.owner_id` y `quotes.owner_id` (CRM), `tickets.assignee_id` (soporte), `incidents.owner_id` y `migration_batches.owner_id` (operación) |

Un indicador sin una dimensión no ofrece ese filtro (no se muestra el filtro deshabilitado). El filtro de periodo aplica a todos.

## 4. Cálculo y frecuencia

- El job `ComputeKpiSnapshots` calcula cada indicador activo según su `frequency`: `intraday` cada `dashboard.calculation.intraday_minutes`, `daily` a la hora `dashboard.calculation.daily_time`, y `monthly` al cierre de cada mes. Cada noche recalcula además los últimos `dashboard.calculation.history_months` meses para recoger notas de crédito, pagos validados tarde y reaperturas.
- Escribe una fila de `kpi_snapshots` por indicador, periodo (`day` o `month`) y combinación de dimensiones; el periodo en curso queda con `is_partial`. Un recálculo reemplaza la fila (clave única con `NULLS NOT DISTINCT`), nunca duplica.
- El panel combina días y meses para cualquier rango: suma importes y conteos, y para razones divide la suma de numeradores entre la suma de denominadores.
- El administrador puede pedir el recálculo de un periodo (`POST /admin/kpis/recalculations`); queda en auditoría.
- Un error al calcular un indicador no detiene los demás: el indicador conserva el último valor con la marca de hora de su cálculo y se crea una alerta `sync_failure`.

## 5. Metas y semáforo

1. Meta en `kpi_targets` para el indicador, la marca y el periodo (mes, trimestre o año); si el filtro es "todas las marcas", la de `brand_id` nulo.
2. Si no hay, la key de `kpi_definitions.target_setting_key` (`dashboard.targets.*`).
3. Si también es `null`, el indicador se muestra "sin meta" y sin semáforo; nunca se inventa una meta (RN-DSH-004).

Con meta, la tarjeta se muestra en verde si el valor cumple según la dirección deseada (`up`: valor ≥ meta; `down`: valor ≤ meta) y en rojo si no; la comparación con el periodo anterior se muestra como variación absoluta y porcentual con la flecha según la dirección deseada.

## 6. Permisos por grupo

| Grupo | Permiso de valores | Roles del sistema |
|---|---|---|
| Comercial, CRM, Web | `dashboard.kpi_commercial.view`, `dashboard.kpi_crm.view`, `dashboard.kpi_web.view` | `admin`, `sales` |
| Finanzas, Cobranza | `dashboard.kpi_finance.view`, `dashboard.kpi_collections.view` | `admin`, `finance` |
| Operación, Soporte | `dashboard.kpi_operations.view`, `dashboard.kpi_support.view` | `admin`, `support` |
| Reclamos | `dashboard.kpi_complaints.view` | `admin`, `support`, `documentation` |

El catálogo y el detalle (`dashboard.kpi.view`) solo devuelven indicadores de los grupos que el usuario puede ver; exportar exige además `dashboard.kpi.export`; metas, `dashboard.kpi_target.*` (crear, editar y borrar solo `admin`). Un indicador de un grupo sin permiso no aparece (no se muestra en cero). Los roles personalizados reciben estos permisos desde la matriz.

## 7. API

| Operación | Ruta | Permiso |
|---|---|---|
| Catálogo de indicadores visibles | `GET /admin/kpis` | `dashboard.kpi.view` |
| Definición, fórmula y serie de un indicador | `GET /admin/kpis/{code}` | `dashboard.kpi.view` + permiso del grupo |
| Activar, desactivar u ordenar | `PATCH /admin/kpis/{code}` | `dashboard.kpi.update` |
| Valores de un grupo con filtros y comparación | `GET /admin/kpi-values/{grupo}` (`commercial`, `crm`, `finance`, `collections`, `operations`, `support`, `complaints`, `web`) | El del grupo: `dashboard.kpi_commercial.view`, `dashboard.kpi_crm.view`, `dashboard.kpi_finance.view`, `dashboard.kpi_collections.view`, `dashboard.kpi_operations.view`, `dashboard.kpi_support.view`, `dashboard.kpi_complaints.view` o `dashboard.kpi_web.view` |
| Recalcular un periodo | `POST /admin/kpis/recalculations` | `dashboard.kpi.update` |
| Exportar valores (CSV, Excel o PDF, en cola) | `POST /admin/kpis/exports` (reporte `kpi_values`) | `dashboard.kpi.export` |
| Registros del indicador (tablero propio), con búsqueda, filtros de tabla, orden, paginación y desglose `group_by` | `GET /admin/kpis/{code}/records` | `dashboard.kpi.view` + permiso del grupo + lectura del módulo dueño |
| Exportar los registros del indicador (en cola) | `POST /admin/kpis/{code}/records/exports` (reporte `kpi_records`) | `dashboard.kpi.export` + permiso del grupo + lectura del módulo dueño |
| Metas | `GET`/`POST /admin/kpi-targets`, `PATCH`/`DELETE /admin/kpi-targets/{id}` | `dashboard.kpi_target.*` |

Parámetros de filtro: `period_start`, `period_end`, `brand_id`, `currency`, `product_category_id`, `owner_user_id`, `compare` (`previous_period`).

## 7.1 Tablero propio de cada indicador

Cada tarjeta del panel abre una página propia del indicador (P-DSH-05, ruta del panel `#/kpi/{code}`), no una ventana emergente. La página es un tablero completo:

1. **Encabezado:** nombre, grupo, definición, accesos a la fórmula, a la meta, al módulo dueño y a la exportación; selector para saltar a otro indicador de los grupos permitidos.
2. **Filtros del panel:** periodo (mes, trimestre, año o rango), comparación, marca, moneda, categoría y responsable; cambian la página completa y se conservan al volver al panel.
3. **Resumen:** valor, periodo de comparación, variación, meta, semáforo, número de registros y, con filtros de tabla, el valor recalculado sobre el filtro.
4. **Conciliación visible:** un aviso confirma que el total del listado (conteo, suma, promedio, proporción, margen o razón, según la fórmula) coincide con el indicador; si no coincide se muestra en rojo y se registra como error.
5. **Evolución:** serie de 12 periodos con la comparación y la meta.
6. **Desgloses:** el indicador recalculado por su dimensión principal (marca, canal, etapa, prioridad, tramo, nodo, extensión, etc.) y por una segunda columna (estado, resultado, marca o país); un clic en una barra filtra la tabla.
7. **Tabla de registros:** las filas que forman el indicador con búsqueda, filtro por dimensión, por estado o resultado y por segunda dimensión, orden por cualquier columna, paginación, fila de totales con el valor del indicador sobre el filtro, enlace a la ficha del cliente o del documento y exportación (CSV, Excel o PDF en cola, reporte `kpi_records`).
8. **Otros indicadores del grupo** al pie, para navegar sin volver al panel.

Reglas: los indicadores de razón (proporción, promedio, margen, conversión) se recalculan sobre las filas del filtro con la misma fórmula, nunca promediando porcentajes; los de infraestructura compartida (nodos, respaldos, disponibilidad, incidentes) indican que no se separan por marca; las búsquedas WHOIS no muestran la IP del visitante.

## 8. Pruebas obligatorias

- Cada indicador coincide con el total del listado de detalle con los mismos filtros (prueba de integración por indicador, con datos de demostración): `meta.total_value` de `GET /admin/kpis/{code}/records` sin filtros de tabla es igual al valor de `/admin/kpi-values/{grupo}`.
- Con un filtro de tabla, `meta.total_value` y cada valor de `meta.breakdown` se calculan con la fórmula del indicador sobre esas filas (una proporción no es el promedio de proporciones).
- Un usuario sin lectura del módulo dueño recibe 403 en `/admin/kpis/{code}/records` aunque vea el valor del indicador.
- Una razón reagregada en un trimestre es igual a la calculada directamente sobre el trimestre.
- Un usuario sin el permiso de un grupo no recibe sus valores (403 en `/admin/kpi-values/{grupo}`) ni lo ve en el catálogo ni en la exportación.
- Con meta `null` en `kpi_targets` y en `dashboard.targets.*`, el indicador se muestra "sin meta".
- Las hojas de prueba del Libro no cuentan en Reclamos.
- `make verify` ejecuta `tools/verificar_kpis.py`: códigos, grupos, fórmulas contra el esquema, metas contra `settings.json`, pantallas de detalle y este catálogo.

## 9. Catálogo

<!-- kpi-catalog:start -->
| Código | Indicador | Grupo | Unidad | Dirección | Frecuencia | Meta por defecto | Detalle |
|---|---|---|---|---|---|---|---|
| KPI-COM-01 | Ingreso recurrente mensual (MRR) | Comercial | dinero | sube | `daily` | — | P-SRV-01 |
| KPI-COM-02 | Ingreso recurrente anual (ARR) | Comercial | dinero | sube | `daily` | — | P-SRV-01 |
| KPI-COM-03 | Crecimiento del ingreso recurrente | Comercial | porcentaje | sube | `monthly` | `dashboard.targets.mrr_growth_percent` | P-SRV-01 |
| KPI-COM-04 | Clientes activos | Comercial | cantidad | sube | `daily` | — | P-CUS-01 |
| KPI-COM-05 | Clientes nuevos | Comercial | cantidad | sube | `daily` | — | P-CUS-01 |
| KPI-COM-06 | Clientes perdidos | Comercial | cantidad | baja | `monthly` | — | P-CUS-01 |
| KPI-COM-07 | Tasa de abandono de clientes | Comercial | porcentaje | baja | `monthly` | `dashboard.targets.churn_rate_percent` | P-CUS-01 |
| KPI-COM-08 | Ingreso promedio por cliente | Comercial | dinero | sube | `monthly` | — | P-CUS-01 |
| KPI-COM-09 | Valor de vida del cliente | Comercial | dinero | sube | `monthly` | — | P-FIN-03 |
| KPI-COM-10 | Ventas por canal | Comercial | dinero | sube | `daily` | — | P-SAL-11 |
| KPI-COM-11 | Ventas por marca | Comercial | dinero | sube | `daily` | — | P-ORD-01 |
| KPI-COM-12 | Ventas en línea frente a cotización | Comercial | porcentaje | sube | `monthly` | — | P-ORD-01 |
| KPI-CRM-01 | Valor del embudo por etapa | CRM | dinero | sube | `intraday` | — | P-SAL-01 |
| KPI-CRM-02 | Valor ponderado del embudo | CRM | dinero | sube | `intraday` | — | P-SAL-01 |
| KPI-CRM-03 | Tasa de conversión de prospectos | CRM | porcentaje | sube | `monthly` | `dashboard.targets.lead_conversion_percent` | P-SAL-02 |
| KPI-CRM-04 | Tasa de conversión por etapa | CRM | porcentaje | sube | `monthly` | — | P-SAL-01 |
| KPI-CRM-05 | Tasa de conversión por canal | CRM | porcentaje | sube | `monthly` | — | P-SAL-11 |
| KPI-CRM-06 | Ciclo de venta promedio | CRM | días | baja | `monthly` | — | P-SAL-02 |
| KPI-CRM-07 | Prospectos sin seguimiento | CRM | cantidad | baja | `intraday` | — | P-SAL-02 |
| KPI-CRM-08 | Tasa de aceptación de cotizaciones | CRM | porcentaje | sube | `monthly` | — | P-SAL-05 |
| KPI-FIN-01 | Facturado | Finanzas | dinero | sube | `daily` | — | P-FIN-04 |
| KPI-FIN-02 | Cobrado | Finanzas | dinero | sube | `daily` | — | P-FIN-04 |
| KPI-FIN-03 | Reconocido | Finanzas | dinero | sube | `daily` | — | P-FIN-04 |
| KPI-FIN-04 | Días promedio de cobro | Finanzas | días | baja | `monthly` | `dashboard.targets.days_sales_outstanding` | P-BIL-12 |
| KPI-FIN-05 | Deuda por antigüedad | Finanzas | dinero | baja | `daily` | — | P-BIL-12 |
| KPI-FIN-06 | Deuda vencida sobre cartera | Finanzas | porcentaje | baja | `daily` | `dashboard.targets.overdue_debt_percent` | P-BIL-12 |
| KPI-FIN-07 | Margen bruto por servicio | Finanzas | porcentaje | sube | `monthly` | `dashboard.targets.gross_margin_percent` | P-FIN-03 |
| KPI-FIN-08 | Margen bruto por proveedor | Finanzas | dinero | sube | `monthly` | — | P-FIN-03 |
| KPI-FIN-09 | Margen bruto por cliente | Finanzas | dinero | sube | `monthly` | — | P-FIN-03 |
| KPI-FIN-10 | Costos de proveedores | Finanzas | dinero | baja | `monthly` | — | P-FIN-01 |
| KPI-FIN-11 | Refacturación | Finanzas | dinero | sube | `monthly` | — | P-BIL-11 |
| KPI-FIN-12 | Facturas de proveedor por refacturar | Finanzas | cantidad | baja | `daily` | — | P-BIL-11 |
| KPI-FIN-13 | Comisiones de medios de pago | Finanzas | dinero | baja | `monthly` | — | P-BIL-13 |
| KPI-FIN-14 | Recargos por mora | Finanzas | dinero | baja | `monthly` | — | P-BIL-02 |
| KPI-COB-01 | Facturas por vencer | Cobranza | cantidad | baja | `daily` | — | P-BIL-01 |
| KPI-COB-02 | Facturas vencidas | Cobranza | cantidad | baja | `intraday` | — | P-BIL-01 |
| KPI-COB-03 | Monto vencido | Cobranza | dinero | baja | `daily` | — | P-BIL-12 |
| KPI-COB-04 | Compromisos de pago cumplidos | Cobranza | cantidad | sube | `daily` | — | P-BIL-10 |
| KPI-COB-05 | Tasa de cumplimiento de compromisos | Cobranza | porcentaje | sube | `monthly` | `dashboard.targets.promise_kept_percent` | P-BIL-10 |
| KPI-COB-06 | Compromisos de pago incumplidos | Cobranza | cantidad | baja | `daily` | — | P-BIL-10 |
| KPI-COB-07 | Suspensiones por mora | Cobranza | cantidad | baja | `daily` | — | P-SRV-01 |
| KPI-COB-08 | Reactivaciones tras pago | Cobranza | cantidad | sube | `daily` | — | P-SRV-01 |
| KPI-COB-09 | Vouchers por validar | Cobranza | cantidad | baja | `intraday` | — | P-BIL-08 |
| KPI-COB-10 | Antigüedad del voucher más antiguo por validar | Cobranza | horas | baja | `intraday` | — | P-BIL-08 |
| KPI-OPE-01 | Servicios por vencer | Operación | cantidad | baja | `daily` | — | P-SRV-03 |
| KPI-OPE-02 | Tasa de renovación | Operación | porcentaje | sube | `monthly` | `dashboard.targets.renewal_rate_percent` | P-SRV-03 |
| KPI-OPE-03 | Dominios por vencer | Operación | cantidad | baja | `daily` | — | P-DOM-03 |
| KPI-OPE-04 | Uso de disco de nodos de hosting | Operación | porcentaje | baja | `intraday` | `dashboard.targets.node_usage_max_percent` | P-INV-01 |
| KPI-OPE-05 | Uso de cuentas de nodos de hosting | Operación | porcentaje | baja | `daily` | — | P-INV-01 |
| KPI-OPE-06 | Respaldos exitosos | Operación | porcentaje | sube | `daily` | `dashboard.targets.backup_success_percent` | P-MON-06 |
| KPI-OPE-07 | Disponibilidad | Operación | porcentaje | sube | `intraday` | `dashboard.targets.availability_percent` | P-MON-01 |
| KPI-OPE-08 | Incidentes | Operación | cantidad | baja | `daily` | — | P-MON-03 |
| KPI-OPE-09 | Tiempo medio de resolución de incidentes | Operación | horas | baja | `monthly` | — | P-MON-03 |
| KPI-OPE-10 | Avance de la migración | Operación | porcentaje | sube | `daily` | — | P-INV-08 |
| KPI-OPE-11 | Alertas abiertas | Operación | cantidad | baja | `intraday` | — | P-MON-08 |
| KPI-SOP-01 | Tickets abiertos | Soporte | cantidad | baja | `intraday` | — | P-HLP-01 |
| KPI-SOP-02 | Tiempo de primera respuesta | Soporte | minutos | baja | `daily` | `dashboard.targets.first_response_minutes` | P-HLP-01 |
| KPI-SOP-03 | Tiempo de solución | Soporte | horas | baja | `daily` | — | P-HLP-01 |
| KPI-SOP-04 | Cumplimiento de SLA | Soporte | porcentaje | sube | `daily` | `dashboard.targets.sla_compliance_percent` | P-HLP-01 |
| KPI-SOP-05 | Satisfacción del cliente | Soporte | porcentaje | sube | `daily` | `dashboard.targets.csat_percent` | P-HLP-07 |
| KPI-SOP-06 | Puntaje promedio de satisfacción | Soporte | puntaje 1–5 | sube | `daily` | — | P-HLP-07 |
| KPI-SOP-07 | Carga por técnico | Soporte | cantidad | baja | `intraday` | — | P-HLP-01 |
| KPI-SOP-08 | Tickets reabiertos | Soporte | porcentaje | baja | `monthly` | — | P-HLP-01 |
| KPI-REC-01 | Reclamos recibidos | Reclamos | cantidad | baja | `daily` | — | P-LRC-01 |
| KPI-REC-02 | Quejas recibidas | Reclamos | cantidad | baja | `daily` | — | P-LRC-01 |
| KPI-REC-03 | Respondidos dentro del plazo | Reclamos | porcentaje | sube | `daily` | `dashboard.targets.complaints_on_time_percent` | P-LRC-01 |
| KPI-REC-04 | Próximos a vencer | Reclamos | cantidad | baja | `intraday` | — | P-LRC-01 |
| KPI-REC-05 | Vencidos sin respuesta | Reclamos | cantidad | baja | `intraday` | — | P-LRC-01 |
| KPI-REC-06 | Tiempo promedio de respuesta | Reclamos | días | baja | `monthly` | — | P-LRC-01 |
| KPI-WEB-01 | Pedidos en línea | Web | cantidad | sube | `daily` | — | P-ORD-07 |
| KPI-WEB-02 | Carritos abandonados | Web | porcentaje | baja | `daily` | `dashboard.targets.cart_abandonment_percent` | P-ORD-06 |
| KPI-WEB-03 | Carritos recuperados | Web | cantidad | sube | `daily` | — | P-ORD-06 |
| KPI-WEB-04 | Conversión de la compra en línea por marca | Web | porcentaje | sube | `daily` | — | P-ORD-07 |
| KPI-WEB-05 | Búsquedas de dominio | Web | cantidad | sube | `daily` | — | P-DOM-08 |
| KPI-WEB-06 | Registros de dominio en línea | Web | cantidad | sube | `daily` | — | P-ORD-07 |
| KPI-WEB-07 | Conversión de búsqueda a registro | Web | porcentaje | sube | `monthly` | — | P-DOM-08 |
| KPI-WEB-08 | Consultas frenadas por abuso | Web | cantidad | baja | `daily` | — | P-DOM-08 |
| KPI-WEB-09 | Envíos de formularios derivados | Web | cantidad | sube | `daily` | — | P-WCN-06 |

### Comercial (`commercial`, 12 indicadores)

#### KPI-COM-01 · Ingreso recurrente mensual (MRR)

- **Nombre en inglés:** Monthly recurring revenue (MRR)
- **Definición:** Ingreso que generan cada mes las suscripciones vigentes al cierre del periodo, llevadas a su equivalente mensual.
- **Fórmula:**

  ```text
  SUM(mensualizar(subscriptions.price_minor * subscriptions.quantity, subscriptions.cycle)) FROM subscriptions JOIN services ON services.id = subscriptions.service_id WHERE subscriptions.status = 'active' AND subscriptions.starts_on <= :fin AND (subscriptions.ends_on IS NULL OR subscriptions.ends_on > :fin)
  ```

- **Fuente:** `services.id`, `subscriptions.cycle`, `subscriptions.ends_on`, `subscriptions.price_minor`, `subscriptions.quantity`, `subscriptions.service_id`, `subscriptions.starts_on`, `subscriptions.status`
- **Unidad y dirección deseada:** dinero (`money`); sube (`up`)
- **Frecuencia de cálculo:** `daily`, diaria (dashboard.calculation.daily_time)
- **Dimensiones de filtro:** periodo, marca (`brand`), moneda (`currency`), categoría (`product_category`), responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-SRV-01 · Servicios activos con suscripción vigente

#### KPI-COM-02 · Ingreso recurrente anual (ARR)

- **Nombre en inglés:** Annual recurring revenue (ARR)
- **Definición:** Ingreso recurrente mensual llevado a un año.
- **Fórmula:**

  ```text
  KPI-COM-01 * 12
  ```

- **Fuente:** otros indicadores del catálogo
- **Unidad y dirección deseada:** dinero (`money`); sube (`up`)
- **Frecuencia de cálculo:** `daily`, diaria (dashboard.calculation.daily_time)
- **Dimensiones de filtro:** periodo, marca (`brand`), moneda (`currency`), categoría (`product_category`), responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-SRV-01 · Servicios activos con suscripción vigente

#### KPI-COM-03 · Crecimiento del ingreso recurrente

- **Nombre en inglés:** Recurring revenue growth
- **Definición:** Variación porcentual del ingreso recurrente mensual frente al cierre del periodo anterior.
- **Fórmula:**

  ```text
  (KPI-COM-01(:fin) - KPI-COM-01(:fin_anterior)) / KPI-COM-01(:fin_anterior) * 100
  ```

- **Fuente:** otros indicadores del catálogo
- **Unidad y dirección deseada:** porcentaje (`percent`); sube (`up`)
- **Frecuencia de cálculo:** `monthly`, mensual, al cierre (dashboard.calculation.daily_time del día 1)
- **Dimensiones de filtro:** periodo, marca (`brand`), moneda (`currency`), categoría (`product_category`), responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; si no hay, `dashboard.targets.mrr_growth_percent` (null: por definir)
- **Detalle:** P-SRV-01 · Altas, bajas y cambios de precio del periodo

#### KPI-COM-04 · Clientes activos

- **Nombre en inglés:** Active customers
- **Definición:** Clientes con al menos un servicio activo al cierre del periodo.
- **Fórmula:**

  ```text
  COUNT(DISTINCT customers.id) FROM customers JOIN services ON services.customer_id = customers.id WHERE customers.status = 'active' AND customers.deleted_at IS NULL AND services.status = 'active' AND services.activated_at <= :fin
  ```

- **Fuente:** `customers.deleted_at`, `customers.id`, `customers.status`, `services.activated_at`, `services.customer_id`, `services.status`
- **Unidad y dirección deseada:** cantidad (`count`); sube (`up`)
- **Frecuencia de cálculo:** `daily`, diaria (dashboard.calculation.daily_time)
- **Dimensiones de filtro:** periodo, marca (`brand`), categoría (`product_category`), responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-CUS-01 · Clientes activos

#### KPI-COM-05 · Clientes nuevos

- **Nombre en inglés:** New customers
- **Definición:** Clientes cuyo primer servicio se activó dentro del periodo.
- **Fórmula:**

  ```text
  COUNT(customers.id) FROM customers WHERE (SELECT MIN(services.activated_at) FROM services WHERE services.customer_id = customers.id) BETWEEN :inicio AND :fin
  ```

- **Fuente:** `customers.id`, `services.activated_at`, `services.customer_id`
- **Unidad y dirección deseada:** cantidad (`count`); sube (`up`)
- **Frecuencia de cálculo:** `daily`, diaria (dashboard.calculation.daily_time)
- **Dimensiones de filtro:** periodo, marca (`brand`), categoría (`product_category`), responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-CUS-01 · Clientes con primer servicio activado en el periodo

#### KPI-COM-06 · Clientes perdidos

- **Nombre en inglés:** Lost customers
- **Definición:** Clientes que dieron de baja su último servicio activo dentro del periodo.
- **Fórmula:**

  ```text
  COUNT(DISTINCT services.customer_id) FROM service_status_history JOIN services ON services.id = service_status_history.service_id WHERE service_status_history.to_status IN ('terminated','cancelled') AND service_status_history.occurred_at BETWEEN :inicio AND :fin AND NOT EXISTS (servicio del mismo cliente con services.status = 'active' al :fin)
  ```

- **Fuente:** `service_status_history.occurred_at`, `service_status_history.service_id`, `service_status_history.to_status`, `services.customer_id`, `services.id`, `services.status`
- **Unidad y dirección deseada:** cantidad (`count`); baja (`down`)
- **Frecuencia de cálculo:** `monthly`, mensual, al cierre (dashboard.calculation.daily_time del día 1)
- **Dimensiones de filtro:** periodo, marca (`brand`), categoría (`product_category`), responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-CUS-01 · Clientes sin servicios activos al cierre

#### KPI-COM-07 · Tasa de abandono de clientes

- **Nombre en inglés:** Customer churn rate
- **Definición:** Porcentaje de los clientes activos al inicio del periodo que se perdieron durante el periodo.
- **Fórmula:**

  ```text
  KPI-COM-06 / KPI-COM-04(:inicio) * 100
  ```

- **Fuente:** otros indicadores del catálogo
- **Unidad y dirección deseada:** porcentaje (`percent`); baja (`down`)
- **Frecuencia de cálculo:** `monthly`, mensual, al cierre (dashboard.calculation.daily_time del día 1)
- **Dimensiones de filtro:** periodo, marca (`brand`), categoría (`product_category`), responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; si no hay, `dashboard.targets.churn_rate_percent` (null: por definir)
- **Detalle:** P-CUS-01 · Clientes perdidos del periodo

#### KPI-COM-08 · Ingreso promedio por cliente

- **Nombre en inglés:** Average revenue per customer
- **Definición:** Ingreso recurrente mensual dividido entre los clientes activos.
- **Fórmula:**

  ```text
  KPI-COM-01 / KPI-COM-04
  ```

- **Fuente:** otros indicadores del catálogo
- **Unidad y dirección deseada:** dinero (`money`); sube (`up`)
- **Frecuencia de cálculo:** `monthly`, mensual, al cierre (dashboard.calculation.daily_time del día 1)
- **Dimensiones de filtro:** periodo, marca (`brand`), moneda (`currency`), categoría (`product_category`), responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-CUS-01 · Clientes activos ordenados por ingreso recurrente

#### KPI-COM-09 · Valor de vida del cliente

- **Nombre en inglés:** Customer lifetime value
- **Definición:** Margen que deja en promedio un cliente durante su permanencia: ingreso promedio por margen bruto entre la tasa de abandono. Sin abandono en el periodo no se calcula.
- **Fórmula:**

  ```text
  KPI-COM-08 * (KPI-FIN-07 / 100) / (KPI-COM-07 / 100)  -- NULL si KPI-COM-07 = 0
  ```

- **Fuente:** otros indicadores del catálogo
- **Unidad y dirección deseada:** dinero (`money`); sube (`up`)
- **Frecuencia de cálculo:** `monthly`, mensual, al cierre (dashboard.calculation.daily_time del día 1)
- **Dimensiones de filtro:** periodo, marca (`brand`), moneda (`currency`), categoría (`product_category`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-FIN-03 · Rentabilidad por cliente

#### KPI-COM-10 · Ventas por canal

- **Nombre en inglés:** Sales by channel
- **Definición:** Importe de los pedidos activados en el periodo según el canal de captación del prospecto que los originó; sin prospecto, compra en línea o venta directa.
- **Fórmula:**

  ```text
  SUM(orders.total_minor) FROM orders LEFT JOIN leads ON leads.id = orders.lead_id WHERE orders.status = 'active' AND orders.activated_at BETWEEN :inicio AND :fin GROUP BY COALESCE(leads.lead_channel_id, orders.channel)
  ```

- **Fuente:** `leads.id`, `leads.lead_channel_id`, `orders.activated_at`, `orders.channel`, `orders.lead_id`, `orders.status`, `orders.total_minor`
- **Unidad y dirección deseada:** dinero (`money`); sube (`up`)
- **Frecuencia de cálculo:** `daily`, diaria (dashboard.calculation.daily_time)
- **Dimensiones de filtro:** periodo, marca (`brand`), moneda (`currency`), categoría (`product_category`), responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-SAL-11 · Pedidos activados por canal

#### KPI-COM-11 · Ventas por marca

- **Nombre en inglés:** Sales by brand
- **Definición:** Importe de los pedidos activados en el periodo por marca de origen.
- **Fórmula:**

  ```text
  SUM(orders.total_minor) FROM orders WHERE orders.status = 'active' AND orders.activated_at BETWEEN :inicio AND :fin GROUP BY orders.brand_id
  ```

- **Fuente:** `orders.activated_at`, `orders.brand_id`, `orders.status`, `orders.total_minor`
- **Unidad y dirección deseada:** dinero (`money`); sube (`up`)
- **Frecuencia de cálculo:** `daily`, diaria (dashboard.calculation.daily_time)
- **Dimensiones de filtro:** periodo, marca (`brand`), moneda (`currency`), categoría (`product_category`), responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-ORD-01 · Pedidos activados por marca

#### KPI-COM-12 · Ventas en línea frente a cotización

- **Nombre en inglés:** Online versus quoted sales
- **Definición:** Participación de la compra en línea en las ventas del periodo; el resto son ventas por cotización o registradas por ventas.
- **Fórmula:**

  ```text
  SUM(orders.total_minor WHERE orders.channel = 'online') / SUM(orders.total_minor) * 100 FROM orders WHERE orders.status = 'active' AND orders.activated_at BETWEEN :inicio AND :fin  -- desglose: online, con orders.quote_id, resto
  ```

- **Fuente:** `orders.activated_at`, `orders.channel`, `orders.quote_id`, `orders.status`, `orders.total_minor`
- **Unidad y dirección deseada:** porcentaje (`percent`); sube (`up`)
- **Frecuencia de cálculo:** `monthly`, mensual, al cierre (dashboard.calculation.daily_time del día 1)
- **Dimensiones de filtro:** periodo, marca (`brand`), categoría (`product_category`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-ORD-01 · Pedidos por canal (online o sales) y con cotización

### CRM (`crm`, 8 indicadores)

#### KPI-CRM-01 · Valor del embudo por etapa

- **Nombre en inglés:** Pipeline value by stage
- **Definición:** Importe estimado de los prospectos abiertos, por etapa del embudo.
- **Fórmula:**

  ```text
  SUM(leads.estimated_amount_minor) FROM leads JOIN pipeline_stages ON pipeline_stages.id = leads.pipeline_stage_id WHERE leads.status = 'open' AND leads.deleted_at IS NULL GROUP BY pipeline_stages.sort_order
  ```

- **Fuente:** `leads.deleted_at`, `leads.estimated_amount_minor`, `leads.pipeline_stage_id`, `leads.status`, `pipeline_stages.id`, `pipeline_stages.sort_order`
- **Unidad y dirección deseada:** dinero (`money`); sube (`up`)
- **Frecuencia de cálculo:** `intraday`, durante el día (dashboard.calculation.intraday_minutes)
- **Dimensiones de filtro:** periodo, marca (`brand`), moneda (`currency`), responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-SAL-01 · Tablero Kanban con los mismos filtros

#### KPI-CRM-02 · Valor ponderado del embudo

- **Nombre en inglés:** Weighted pipeline value
- **Definición:** Importe estimado de los prospectos abiertos multiplicado por la probabilidad de su etapa.
- **Fórmula:**

  ```text
  SUM(leads.estimated_amount_minor * pipeline_stages.probability / 100) FROM leads JOIN pipeline_stages ON pipeline_stages.id = leads.pipeline_stage_id WHERE leads.status = 'open' AND leads.deleted_at IS NULL
  ```

- **Fuente:** `leads.deleted_at`, `leads.estimated_amount_minor`, `leads.pipeline_stage_id`, `leads.status`, `pipeline_stages.id`, `pipeline_stages.probability`
- **Unidad y dirección deseada:** dinero (`money`); sube (`up`)
- **Frecuencia de cálculo:** `intraday`, durante el día (dashboard.calculation.intraday_minutes)
- **Dimensiones de filtro:** periodo, marca (`brand`), moneda (`currency`), responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-SAL-01 · Tablero Kanban con los mismos filtros

#### KPI-CRM-03 · Tasa de conversión de prospectos

- **Nombre en inglés:** Lead conversion rate
- **Definición:** Prospectos ganados entre prospectos cerrados (ganados más perdidos) en el periodo.
- **Fórmula:**

  ```text
  COUNT(DISTINCT lead_stage_changes.lead_id WHERE pipeline_stages.outcome = 'won') / COUNT(DISTINCT lead_stage_changes.lead_id WHERE pipeline_stages.outcome IN ('won','lost')) * 100 FROM lead_stage_changes JOIN pipeline_stages ON pipeline_stages.id = lead_stage_changes.to_stage_id WHERE lead_stage_changes.created_at BETWEEN :inicio AND :fin
  ```

- **Fuente:** `lead_stage_changes.created_at`, `lead_stage_changes.lead_id`, `lead_stage_changes.to_stage_id`, `pipeline_stages.id`, `pipeline_stages.outcome`
- **Unidad y dirección deseada:** porcentaje (`percent`); sube (`up`)
- **Frecuencia de cálculo:** `monthly`, mensual, al cierre (dashboard.calculation.daily_time del día 1)
- **Dimensiones de filtro:** periodo, marca (`brand`), responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; si no hay, `dashboard.targets.lead_conversion_percent` (null: por definir)
- **Detalle:** P-SAL-02 · Prospectos ganados y perdidos del periodo

#### KPI-CRM-04 · Tasa de conversión por etapa

- **Nombre en inglés:** Stage conversion rate
- **Definición:** Por cada etapa, porcentaje de los prospectos que entraron en ella en el periodo y pasaron a una etapa posterior.
- **Fórmula:**

  ```text
  COUNT(DISTINCT lead_stage_changes.lead_id que pasan a una etapa con pipeline_stages.sort_order mayor) / COUNT(DISTINCT lead_stage_changes.lead_id con lead_stage_changes.to_stage_id = etapa) * 100 WHERE lead_stage_changes.created_at BETWEEN :inicio AND :fin GROUP BY lead_stage_changes.to_stage_id
  ```

- **Fuente:** `lead_stage_changes.created_at`, `lead_stage_changes.lead_id`, `lead_stage_changes.to_stage_id`, `pipeline_stages.sort_order`
- **Unidad y dirección deseada:** porcentaje (`percent`); sube (`up`)
- **Frecuencia de cálculo:** `monthly`, mensual, al cierre (dashboard.calculation.daily_time del día 1)
- **Dimensiones de filtro:** periodo, marca (`brand`), responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-SAL-01 · Historial de etapas del periodo

#### KPI-CRM-05 · Tasa de conversión por canal

- **Nombre en inglés:** Conversion rate by channel
- **Definición:** Tasa de conversión de prospectos agrupada por canal de captación.
- **Fórmula:**

  ```text
  KPI-CRM-03 GROUP BY leads.lead_channel_id (lead_channels.kind)
  ```

- **Fuente:** `lead_channels.kind`, `leads.lead_channel_id`
- **Unidad y dirección deseada:** porcentaje (`percent`); sube (`up`)
- **Frecuencia de cálculo:** `monthly`, mensual, al cierre (dashboard.calculation.daily_time del día 1)
- **Dimensiones de filtro:** periodo, marca (`brand`), responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-SAL-11 · Reporte por canal

#### KPI-CRM-06 · Ciclo de venta promedio

- **Nombre en inglés:** Average sales cycle
- **Definición:** Días promedio entre el alta del prospecto y su conversión en cliente.
- **Fórmula:**

  ```text
  AVG(leads.converted_at::date - leads.created_at::date) FROM leads WHERE leads.status = 'won' AND leads.converted_at BETWEEN :inicio AND :fin
  ```

- **Fuente:** `leads.converted_at`, `leads.created_at`, `leads.status`
- **Unidad y dirección deseada:** días (`days`); baja (`down`)
- **Frecuencia de cálculo:** `monthly`, mensual, al cierre (dashboard.calculation.daily_time del día 1)
- **Dimensiones de filtro:** periodo, marca (`brand`), responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-SAL-02 · Prospectos ganados del periodo

#### KPI-CRM-07 · Prospectos sin seguimiento

- **Nombre en inglés:** Leads without follow-up
- **Definición:** Prospectos abiertos con el seguimiento vencido o sin actividad desde hace más de sales.lead.followup_alert_days días.
- **Fórmula:**

  ```text
  COUNT(leads.id) FROM leads WHERE leads.status = 'open' AND leads.deleted_at IS NULL AND (leads.next_follow_up_at < :ahora OR (leads.next_follow_up_at IS NULL AND COALESCE(leads.last_activity_at, leads.created_at) < :ahora - sales.lead.followup_alert_days))
  ```

- **Fuente:** `leads.created_at`, `leads.deleted_at`, `leads.id`, `leads.last_activity_at`, `leads.next_follow_up_at`, `leads.status`
- **Unidad y dirección deseada:** cantidad (`count`); baja (`down`)
- **Frecuencia de cálculo:** `intraday`, durante el día (dashboard.calculation.intraday_minutes)
- **Dimensiones de filtro:** periodo, marca (`brand`), responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-SAL-02 · Prospectos con seguimiento vencido

#### KPI-CRM-08 · Tasa de aceptación de cotizaciones

- **Nombre en inglés:** Quote acceptance rate
- **Definición:** Cotizaciones aceptadas en el periodo entre cotizaciones enviadas en el periodo.
- **Fórmula:**

  ```text
  COUNT(quotes.id WHERE quotes.status = 'accepted' AND quotes.accepted_at BETWEEN :inicio AND :fin) / COUNT(quotes.id WHERE quotes.sent_at BETWEEN :inicio AND :fin) * 100 FROM quotes WHERE quotes.deleted_at IS NULL
  ```

- **Fuente:** `quotes.accepted_at`, `quotes.deleted_at`, `quotes.id`, `quotes.sent_at`, `quotes.status`
- **Unidad y dirección deseada:** porcentaje (`percent`); sube (`up`)
- **Frecuencia de cálculo:** `monthly`, mensual, al cierre (dashboard.calculation.daily_time del día 1)
- **Dimensiones de filtro:** periodo, marca (`brand`), responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-SAL-05 · Cotizaciones enviadas y aceptadas

### Finanzas (`finance`, 14 indicadores)

#### KPI-FIN-01 · Facturado

- **Nombre en inglés:** Invoiced
- **Definición:** Importe de comprobantes emitidos en el periodo (facturas, boletas y notas de débito) menos notas de crédito.
- **Fórmula:**

  ```text
  SUM(CASE WHEN invoices.type = 'credit_note' THEN -invoices.total_minor ELSE invoices.total_minor END) FROM invoices WHERE invoices.status NOT IN ('draft','void') AND invoices.issue_date BETWEEN :inicio AND :fin
  ```

- **Fuente:** `invoices.issue_date`, `invoices.status`, `invoices.total_minor`, `invoices.type`
- **Unidad y dirección deseada:** dinero (`money`); sube (`up`)
- **Frecuencia de cálculo:** `daily`, diaria (dashboard.calculation.daily_time)
- **Dimensiones de filtro:** periodo, marca (`brand`), moneda (`currency`), responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-FIN-04 · Comprobantes emitidos del periodo

#### KPI-FIN-02 · Cobrado

- **Nombre en inglés:** Collected
- **Definición:** Pagos validados en el periodo aplicados a comprobantes.
- **Fórmula:**

  ```text
  SUM(payment_allocations.amount_minor) FROM payment_allocations JOIN payments ON payments.id = payment_allocations.payment_id WHERE payments.status = 'validated' AND payments.validated_at BETWEEN :inicio AND :fin
  ```

- **Fuente:** `payment_allocations.amount_minor`, `payment_allocations.payment_id`, `payments.id`, `payments.status`, `payments.validated_at`
- **Unidad y dirección deseada:** dinero (`money`); sube (`up`)
- **Frecuencia de cálculo:** `daily`, diaria (dashboard.calculation.daily_time)
- **Dimensiones de filtro:** periodo, marca (`brand`), moneda (`currency`), responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-FIN-04 · Pagos validados del periodo

#### KPI-FIN-03 · Reconocido

- **Nombre en inglés:** Recognized revenue
- **Definición:** Ingreso devengado en el periodo: cada línea se reparte por días entre el inicio y el fin del servicio que factura; una línea sin periodo se reconoce en la fecha de emisión.
- **Fórmula:**

  ```text
  SUM(invoice_items.subtotal_minor * dias_en_periodo(invoice_items.period_start, invoice_items.period_end, :inicio, :fin) / dias(invoice_items.period_start, invoice_items.period_end)) FROM invoice_items JOIN invoices ON invoices.id = invoice_items.invoice_id WHERE invoices.status NOT IN ('draft','void')
  ```

- **Fuente:** `invoice_items.invoice_id`, `invoice_items.period_end`, `invoice_items.period_start`, `invoice_items.subtotal_minor`, `invoices.id`, `invoices.status`
- **Unidad y dirección deseada:** dinero (`money`); sube (`up`)
- **Frecuencia de cálculo:** `daily`, diaria (dashboard.calculation.daily_time)
- **Dimensiones de filtro:** periodo, marca (`brand`), moneda (`currency`), categoría (`product_category`), responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-FIN-04 · Facturado, cobrado y reconocido

#### KPI-FIN-04 · Días promedio de cobro

- **Nombre en inglés:** Days sales outstanding
- **Definición:** Días promedio entre la emisión y el pago total de los comprobantes pagados en el periodo.
- **Fórmula:**

  ```text
  AVG(invoices.paid_at::date - invoices.issue_date) FROM invoices WHERE invoices.status = 'paid' AND invoices.paid_at BETWEEN :inicio AND :fin
  ```

- **Fuente:** `invoices.issue_date`, `invoices.paid_at`, `invoices.status`
- **Unidad y dirección deseada:** días (`days`); baja (`down`)
- **Frecuencia de cálculo:** `monthly`, mensual, al cierre (dashboard.calculation.daily_time del día 1)
- **Dimensiones de filtro:** periodo, marca (`brand`), moneda (`currency`), responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; si no hay, `dashboard.targets.days_sales_outstanding` (null: por definir)
- **Detalle:** P-BIL-12 · Comprobantes pagados del periodo

#### KPI-FIN-05 · Deuda por antigüedad

- **Nombre en inglés:** Receivables aging
- **Definición:** Saldo pendiente de comprobantes emitidos por tramo de días desde el vencimiento: por vencer, 0 a 30, 31 a 60, 61 a 90 y más de 90.
- **Fórmula:**

  ```text
  SUM(invoices.balance_minor) FROM invoices WHERE invoices.status IN ('issued','partially_paid','overdue') GROUP BY tramo(:hoy - invoices.due_date)
  ```

- **Fuente:** `invoices.balance_minor`, `invoices.due_date`, `invoices.status`
- **Unidad y dirección deseada:** dinero (`money`); baja (`down`)
- **Frecuencia de cálculo:** `daily`, diaria (dashboard.calculation.daily_time)
- **Dimensiones de filtro:** periodo, marca (`brand`), moneda (`currency`), responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-BIL-12 · Estado de cuenta y antigüedad de deuda

#### KPI-FIN-06 · Deuda vencida sobre cartera

- **Nombre en inglés:** Overdue share of receivables
- **Definición:** Porcentaje del saldo por cobrar que ya venció.
- **Fórmula:**

  ```text
  SUM(invoices.balance_minor WHERE invoices.due_date < :hoy) / SUM(invoices.balance_minor) * 100 FROM invoices WHERE invoices.status IN ('issued','partially_paid','overdue')
  ```

- **Fuente:** `invoices.balance_minor`, `invoices.due_date`, `invoices.status`
- **Unidad y dirección deseada:** porcentaje (`percent`); baja (`down`)
- **Frecuencia de cálculo:** `daily`, diaria (dashboard.calculation.daily_time)
- **Dimensiones de filtro:** periodo, marca (`brand`), moneda (`currency`), responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; si no hay, `dashboard.targets.overdue_debt_percent` (null: por definir)
- **Detalle:** P-BIL-12 · Comprobantes vencidos

#### KPI-FIN-07 · Margen bruto por servicio

- **Nombre en inglés:** Gross margin by service
- **Definición:** Ingreso facturado por servicio menos el costo distribuido a ese servicio, sobre el ingreso; los costos se convierten a la moneda del indicador con el tipo de cambio de su mes.
- **Fórmula:**

  ```text
  (SUM(invoice_items.subtotal_minor) - SUM(a_moneda(cost_allocations.amount_minor, cost_allocations.cost_currency, costs.period_month))) / SUM(invoice_items.subtotal_minor) * 100 FROM invoice_items JOIN cost_allocations ON cost_allocations.service_id = invoice_items.service_id JOIN costs ON costs.id = cost_allocations.cost_id WHERE costs.period_month BETWEEN :inicio AND :fin GROUP BY invoice_items.service_id
  ```

- **Fuente:** `cost_allocations.amount_minor`, `cost_allocations.cost_currency`, `cost_allocations.cost_id`, `cost_allocations.service_id`, `costs.id`, `costs.period_month`, `invoice_items.service_id`, `invoice_items.subtotal_minor`
- **Unidad y dirección deseada:** porcentaje (`percent`); sube (`up`)
- **Frecuencia de cálculo:** `monthly`, mensual, al cierre (dashboard.calculation.daily_time del día 1)
- **Dimensiones de filtro:** periodo, marca (`brand`), moneda (`currency`), categoría (`product_category`)
- **Meta administrable:** `kpi_targets` por marca y periodo; si no hay, `dashboard.targets.gross_margin_percent` (null: por definir)
- **Detalle:** P-FIN-03 · Rentabilidad por servicio

#### KPI-FIN-08 · Margen bruto por proveedor

- **Nombre en inglés:** Gross margin by provider
- **Definición:** Ingreso de los servicios que usan cuentas de un proveedor menos los costos de ese proveedor en el periodo.
- **Fórmula:**

  ```text
  SUM(invoice_items.subtotal_minor) - SUM(a_moneda(cost_allocations.amount_minor, cost_allocations.cost_currency, costs.period_month)) FROM costs JOIN provider_accounts ON provider_accounts.id = costs.provider_account_id JOIN cost_allocations ON cost_allocations.cost_id = costs.id JOIN invoice_items ON invoice_items.service_id = cost_allocations.service_id WHERE costs.period_month BETWEEN :inicio AND :fin GROUP BY provider_accounts.provider_id
  ```

- **Fuente:** `cost_allocations.amount_minor`, `cost_allocations.cost_currency`, `cost_allocations.cost_id`, `cost_allocations.service_id`, `costs.id`, `costs.period_month`, `costs.provider_account_id`, `invoice_items.service_id`, `invoice_items.subtotal_minor`, `provider_accounts.id`, `provider_accounts.provider_id`
- **Unidad y dirección deseada:** dinero (`money`); sube (`up`)
- **Frecuencia de cálculo:** `monthly`, mensual, al cierre (dashboard.calculation.daily_time del día 1)
- **Dimensiones de filtro:** periodo, marca (`brand`), moneda (`currency`), categoría (`product_category`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-FIN-03 · Rentabilidad por proveedor

#### KPI-FIN-09 · Margen bruto por cliente

- **Nombre en inglés:** Gross margin by customer
- **Definición:** Ingreso facturado al cliente menos los costos distribuidos a sus servicios en el periodo.
- **Fórmula:**

  ```text
  SUM(invoice_items.subtotal_minor) - SUM(a_moneda(cost_allocations.amount_minor, cost_allocations.cost_currency, costs.period_month)) FROM services JOIN invoice_items ON invoice_items.service_id = services.id JOIN cost_allocations ON cost_allocations.service_id = services.id JOIN costs ON costs.id = cost_allocations.cost_id WHERE costs.period_month BETWEEN :inicio AND :fin GROUP BY services.customer_id
  ```

- **Fuente:** `cost_allocations.amount_minor`, `cost_allocations.cost_currency`, `cost_allocations.cost_id`, `cost_allocations.service_id`, `costs.id`, `costs.period_month`, `invoice_items.service_id`, `invoice_items.subtotal_minor`, `services.customer_id`, `services.id`
- **Unidad y dirección deseada:** dinero (`money`); sube (`up`)
- **Frecuencia de cálculo:** `monthly`, mensual, al cierre (dashboard.calculation.daily_time del día 1)
- **Dimensiones de filtro:** periodo, marca (`brand`), moneda (`currency`), categoría (`product_category`), responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-FIN-03 · Rentabilidad por cliente

#### KPI-FIN-10 · Costos de proveedores

- **Nombre en inglés:** Provider costs
- **Definición:** Costos recurrentes, únicos y de licencias de proveedores del periodo, convertidos a la moneda del indicador.
- **Fórmula:**

  ```text
  SUM(a_moneda(costs.amount_minor, costs.cost_currency, costs.period_month)) FROM costs WHERE costs.kind IN ('provider_recurring','provider_one_time','license') AND costs.period_month BETWEEN :inicio AND :fin
  ```

- **Fuente:** `costs.amount_minor`, `costs.cost_currency`, `costs.kind`, `costs.period_month`
- **Unidad y dirección deseada:** dinero (`money`); baja (`down`)
- **Frecuencia de cálculo:** `monthly`, mensual, al cierre (dashboard.calculation.daily_time del día 1)
- **Dimensiones de filtro:** periodo, moneda (`currency`), categoría (`product_category`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-FIN-01 · Costos del periodo

#### KPI-FIN-11 · Refacturación

- **Nombre en inglés:** Rebilling
- **Definición:** Importe refacturado a clientes por consumos de proveedores (líneas de refacturación de comprobantes emitidos).
- **Fórmula:**

  ```text
  SUM(invoice_items.total_minor) FROM invoice_items JOIN invoices ON invoices.id = invoice_items.invoice_id WHERE invoice_items.kind = 'rebilling' AND invoices.status NOT IN ('draft','void') AND invoices.issue_date BETWEEN :inicio AND :fin
  ```

- **Fuente:** `invoice_items.invoice_id`, `invoice_items.kind`, `invoice_items.total_minor`, `invoices.id`, `invoices.issue_date`, `invoices.status`
- **Unidad y dirección deseada:** dinero (`money`); sube (`up`)
- **Frecuencia de cálculo:** `monthly`, mensual, al cierre (dashboard.calculation.daily_time del día 1)
- **Dimensiones de filtro:** periodo, marca (`brand`), moneda (`currency`), responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-BIL-11 · Facturas de proveedor refacturadas

#### KPI-FIN-12 · Facturas de proveedor por refacturar

- **Nombre en inglés:** Provider bills pending rebilling
- **Definición:** Facturas de proveedor asignadas a un cliente que siguen pendientes de refacturar.
- **Fórmula:**

  ```text
  COUNT(provider_bills.id) FROM provider_bills WHERE provider_bills.status = 'pending' AND provider_bills.customer_id IS NOT NULL
  ```

- **Fuente:** `provider_bills.customer_id`, `provider_bills.id`, `provider_bills.status`
- **Unidad y dirección deseada:** cantidad (`count`); baja (`down`)
- **Frecuencia de cálculo:** `daily`, diaria (dashboard.calculation.daily_time)
- **Dimensiones de filtro:** periodo
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-BIL-11 · Facturas de proveedor pendientes

#### KPI-FIN-13 · Comisiones de medios de pago

- **Nombre en inglés:** Payment method fees
- **Definición:** Comisiones cobradas por los medios de pago (pasarela, PayPal, Global66, bancos) sobre los pagos validados en el periodo.
- **Fórmula:**

  ```text
  SUM(payments.fee_minor) FROM payments WHERE payments.status = 'validated' AND payments.validated_at BETWEEN :inicio AND :fin GROUP BY payments.payment_method_id
  ```

- **Fuente:** `payments.fee_minor`, `payments.payment_method_id`, `payments.status`, `payments.validated_at`
- **Unidad y dirección deseada:** dinero (`money`); baja (`down`)
- **Frecuencia de cálculo:** `monthly`, mensual, al cierre (dashboard.calculation.daily_time del día 1)
- **Dimensiones de filtro:** periodo, moneda (`currency`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-BIL-13 · Pagos validados por medio de pago

#### KPI-FIN-14 · Recargos por mora

- **Nombre en inglés:** Late fees
- **Definición:** Recargos por mora facturados en el periodo.
- **Fórmula:**

  ```text
  SUM(invoice_items.total_minor) FROM invoice_items JOIN invoices ON invoices.id = invoice_items.invoice_id WHERE invoice_items.kind = 'late_fee' AND invoices.status NOT IN ('draft','void') AND invoices.issue_date BETWEEN :inicio AND :fin
  ```

- **Fuente:** `invoice_items.invoice_id`, `invoice_items.kind`, `invoice_items.total_minor`, `invoices.id`, `invoices.issue_date`, `invoices.status`
- **Unidad y dirección deseada:** dinero (`money`); baja (`down`)
- **Frecuencia de cálculo:** `monthly`, mensual, al cierre (dashboard.calculation.daily_time del día 1)
- **Dimensiones de filtro:** periodo, marca (`brand`), moneda (`currency`), responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-BIL-02 · Comprobantes con recargo por mora

### Cobranza (`collections`, 10 indicadores)

#### KPI-COB-01 · Facturas por vencer

- **Nombre en inglés:** Invoices due soon
- **Definición:** Comprobantes emitidos con saldo cuyo vencimiento cae dentro de la ventana dashboard.expiring_window_days.
- **Fórmula:**

  ```text
  COUNT(invoices.id) FROM invoices WHERE invoices.status IN ('issued','partially_paid') AND invoices.due_date BETWEEN :hoy AND :hoy + dashboard.expiring_window_days
  ```

- **Fuente:** `invoices.due_date`, `invoices.id`, `invoices.status`
- **Unidad y dirección deseada:** cantidad (`count`); baja (`down`)
- **Frecuencia de cálculo:** `daily`, diaria (dashboard.calculation.daily_time)
- **Dimensiones de filtro:** periodo, marca (`brand`), moneda (`currency`), responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-BIL-01 · Bandeja diaria: por vencer

#### KPI-COB-02 · Facturas vencidas

- **Nombre en inglés:** Overdue invoices
- **Definición:** Comprobantes vencidos con saldo.
- **Fórmula:**

  ```text
  COUNT(invoices.id) FROM invoices WHERE invoices.status = 'overdue'
  ```

- **Fuente:** `invoices.id`, `invoices.status`
- **Unidad y dirección deseada:** cantidad (`count`); baja (`down`)
- **Frecuencia de cálculo:** `intraday`, durante el día (dashboard.calculation.intraday_minutes)
- **Dimensiones de filtro:** periodo, marca (`brand`), moneda (`currency`), responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-BIL-01 · Bandeja diaria: vencidas

#### KPI-COB-03 · Monto vencido

- **Nombre en inglés:** Overdue amount
- **Definición:** Saldo de los comprobantes vencidos.
- **Fórmula:**

  ```text
  SUM(invoices.balance_minor) FROM invoices WHERE invoices.status = 'overdue'
  ```

- **Fuente:** `invoices.balance_minor`, `invoices.status`
- **Unidad y dirección deseada:** dinero (`money`); baja (`down`)
- **Frecuencia de cálculo:** `daily`, diaria (dashboard.calculation.daily_time)
- **Dimensiones de filtro:** periodo, marca (`brand`), moneda (`currency`), responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-BIL-12 · Antigüedad de deuda vencida

#### KPI-COB-04 · Compromisos de pago cumplidos

- **Nombre en inglés:** Payment promises kept
- **Definición:** Compromisos de pago resueltos como cumplidos en el periodo.
- **Fórmula:**

  ```text
  COUNT(payment_promises.id) FROM payment_promises WHERE payment_promises.status = 'kept' AND payment_promises.resolved_at BETWEEN :inicio AND :fin
  ```

- **Fuente:** `payment_promises.id`, `payment_promises.resolved_at`, `payment_promises.status`
- **Unidad y dirección deseada:** cantidad (`count`); sube (`up`)
- **Frecuencia de cálculo:** `daily`, diaria (dashboard.calculation.daily_time)
- **Dimensiones de filtro:** periodo, moneda (`currency`), responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-BIL-10 · Compromisos cumplidos

#### KPI-COB-05 · Tasa de cumplimiento de compromisos

- **Nombre en inglés:** Promise kept rate
- **Definición:** Compromisos cumplidos entre compromisos resueltos (cumplidos más incumplidos) en el periodo.
- **Fórmula:**

  ```text
  COUNT(payment_promises.id WHERE payment_promises.status = 'kept') / COUNT(payment_promises.id WHERE payment_promises.status IN ('kept','broken')) * 100 FROM payment_promises WHERE payment_promises.resolved_at BETWEEN :inicio AND :fin
  ```

- **Fuente:** `payment_promises.id`, `payment_promises.resolved_at`, `payment_promises.status`
- **Unidad y dirección deseada:** porcentaje (`percent`); sube (`up`)
- **Frecuencia de cálculo:** `monthly`, mensual, al cierre (dashboard.calculation.daily_time del día 1)
- **Dimensiones de filtro:** periodo, moneda (`currency`), responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; si no hay, `dashboard.targets.promise_kept_percent` (null: por definir)
- **Detalle:** P-BIL-10 · Compromisos resueltos

#### KPI-COB-06 · Compromisos de pago incumplidos

- **Nombre en inglés:** Payment promises broken
- **Definición:** Compromisos de pago resueltos como incumplidos en el periodo.
- **Fórmula:**

  ```text
  COUNT(payment_promises.id) FROM payment_promises WHERE payment_promises.status = 'broken' AND payment_promises.resolved_at BETWEEN :inicio AND :fin
  ```

- **Fuente:** `payment_promises.id`, `payment_promises.resolved_at`, `payment_promises.status`
- **Unidad y dirección deseada:** cantidad (`count`); baja (`down`)
- **Frecuencia de cálculo:** `daily`, diaria (dashboard.calculation.daily_time)
- **Dimensiones de filtro:** periodo, moneda (`currency`), responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-BIL-10 · Compromisos incumplidos

#### KPI-COB-07 · Suspensiones por mora

- **Nombre en inglés:** Suspensions for non-payment
- **Definición:** Servicios suspendidos por la secuencia de cobranza en el periodo.
- **Fórmula:**

  ```text
  COUNT(service_status_history.id) FROM service_status_history WHERE service_status_history.to_status = 'suspended' AND service_status_history.trigger_source = 'dunning' AND service_status_history.occurred_at BETWEEN :inicio AND :fin
  ```

- **Fuente:** `service_status_history.id`, `service_status_history.occurred_at`, `service_status_history.to_status`, `service_status_history.trigger_source`
- **Unidad y dirección deseada:** cantidad (`count`); baja (`down`)
- **Frecuencia de cálculo:** `daily`, diaria (dashboard.calculation.daily_time)
- **Dimensiones de filtro:** periodo, marca (`brand`), categoría (`product_category`), responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-SRV-01 · Servicios suspendidos por mora

#### KPI-COB-08 · Reactivaciones tras pago

- **Nombre en inglés:** Reactivations after payment
- **Definición:** Servicios suspendidos que volvieron a activo por un pago validado en el periodo.
- **Fórmula:**

  ```text
  COUNT(service_status_history.id) FROM service_status_history WHERE service_status_history.from_status = 'suspended' AND service_status_history.to_status = 'active' AND service_status_history.trigger_source = 'payment' AND service_status_history.occurred_at BETWEEN :inicio AND :fin
  ```

- **Fuente:** `service_status_history.from_status`, `service_status_history.id`, `service_status_history.occurred_at`, `service_status_history.to_status`, `service_status_history.trigger_source`
- **Unidad y dirección deseada:** cantidad (`count`); sube (`up`)
- **Frecuencia de cálculo:** `daily`, diaria (dashboard.calculation.daily_time)
- **Dimensiones de filtro:** periodo, marca (`brand`), categoría (`product_category`), responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-SRV-01 · Servicios reactivados

#### KPI-COB-09 · Vouchers por validar

- **Nombre en inglés:** Vouchers awaiting validation
- **Definición:** Pagos reportados con voucher que finanzas aún no valida ni rechaza.
- **Fórmula:**

  ```text
  COUNT(payments.id) FROM payments WHERE payments.status = 'reported' AND payments.proof_file_id IS NOT NULL
  ```

- **Fuente:** `payments.id`, `payments.proof_file_id`, `payments.status`
- **Unidad y dirección deseada:** cantidad (`count`); baja (`down`)
- **Frecuencia de cálculo:** `intraday`, durante el día (dashboard.calculation.intraday_minutes)
- **Dimensiones de filtro:** periodo, moneda (`currency`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-BIL-08 · Validación de vouchers

#### KPI-COB-10 · Antigüedad del voucher más antiguo por validar

- **Nombre en inglés:** Oldest pending voucher age
- **Definición:** Horas que lleva esperando el voucher reportado más antiguo.
- **Fórmula:**

  ```text
  MAX(:ahora - payments.created_at) FROM payments WHERE payments.status = 'reported' AND payments.proof_file_id IS NOT NULL
  ```

- **Fuente:** `payments.created_at`, `payments.proof_file_id`, `payments.status`
- **Unidad y dirección deseada:** horas (`hours`); baja (`down`)
- **Frecuencia de cálculo:** `intraday`, durante el día (dashboard.calculation.intraday_minutes)
- **Dimensiones de filtro:** periodo, moneda (`currency`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-BIL-08 · Validación de vouchers, más antiguos primero

### Operación (`operations`, 11 indicadores)

#### KPI-OPE-01 · Servicios por vencer

- **Nombre en inglés:** Services due for renewal
- **Definición:** Servicios activos cuyo vencimiento comercial cae dentro de la ventana dashboard.expiring_window_days.
- **Fórmula:**

  ```text
  COUNT(services.id) FROM services WHERE services.status = 'active' AND services.commercial_due_date BETWEEN :hoy AND :hoy + dashboard.expiring_window_days
  ```

- **Fuente:** `services.commercial_due_date`, `services.id`, `services.status`
- **Unidad y dirección deseada:** cantidad (`count`); baja (`down`)
- **Frecuencia de cálculo:** `daily`, diaria (dashboard.calculation.daily_time)
- **Dimensiones de filtro:** periodo, marca (`brand`), categoría (`product_category`), responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-SRV-03 · Panel de renovaciones

#### KPI-OPE-02 · Tasa de renovación

- **Nombre en inglés:** Renewal rate
- **Definición:** Servicios con vencimiento comercial en el periodo que siguen activos al cierre, entre todos los que vencían.
- **Fórmula:**

  ```text
  COUNT(services.id WHERE services.status = 'active') / COUNT(services.id) * 100 FROM services WHERE services.commercial_due_date BETWEEN :inicio AND :fin AND services.deleted_at IS NULL
  ```

- **Fuente:** `services.commercial_due_date`, `services.deleted_at`, `services.id`, `services.status`
- **Unidad y dirección deseada:** porcentaje (`percent`); sube (`up`)
- **Frecuencia de cálculo:** `monthly`, mensual, al cierre (dashboard.calculation.daily_time del día 1)
- **Dimensiones de filtro:** periodo, marca (`brand`), categoría (`product_category`), responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; si no hay, `dashboard.targets.renewal_rate_percent` (null: por definir)
- **Detalle:** P-SRV-03 · Renovaciones del periodo

#### KPI-OPE-03 · Dominios por vencer

- **Nombre en inglés:** Domains expiring soon
- **Definición:** Dominios activos cuyo vencimiento en el registro cae dentro de la ventana dashboard.expiring_window_days.
- **Fórmula:**

  ```text
  COUNT(domains.id) FROM domains WHERE domains.status = 'active' AND domains.deleted_at IS NULL AND domains.registry_expires_at BETWEEN :hoy AND :hoy + dashboard.expiring_window_days
  ```

- **Fuente:** `domains.deleted_at`, `domains.id`, `domains.registry_expires_at`, `domains.status`
- **Unidad y dirección deseada:** cantidad (`count`); baja (`down`)
- **Frecuencia de cálculo:** `daily`, diaria (dashboard.calculation.daily_time)
- **Dimensiones de filtro:** periodo, marca (`brand`), responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-DOM-03 · Dominios por vencer

#### KPI-OPE-04 · Uso de disco de nodos de hosting

- **Nombre en inglés:** Hosting node disk usage
- **Definición:** Mayor porcentaje de disco usado entre los nodos de hosting activos (el detalle muestra cada nodo contra sus umbrales).
- **Fórmula:**

  ```text
  MAX(hosting_nodes.disk_used_mb * 100.0 / hosting_nodes.disk_quota_mb) FROM hosting_nodes WHERE hosting_nodes.status = 'active' AND hosting_nodes.disk_quota_mb > 0
  ```

- **Fuente:** `hosting_nodes.disk_quota_mb`, `hosting_nodes.disk_used_mb`, `hosting_nodes.status`
- **Unidad y dirección deseada:** porcentaje (`percent`); baja (`down`)
- **Frecuencia de cálculo:** `intraday`, durante el día (dashboard.calculation.intraday_minutes)
- **Dimensiones de filtro:** periodo
- **Meta administrable:** `kpi_targets` por marca y periodo; si no hay, `dashboard.targets.node_usage_max_percent` (null: null usa el primer umbral de inventory)
- **Detalle:** P-INV-01 · Nodos de hosting por uso

#### KPI-OPE-05 · Uso de cuentas de nodos de hosting

- **Nombre en inglés:** Hosting node account usage
- **Definición:** Cuentas usadas sobre el límite de cuentas de los nodos de hosting activos.
- **Fórmula:**

  ```text
  SUM(hosting_nodes.accounts_used) * 100.0 / SUM(hosting_nodes.accounts_limit) FROM hosting_nodes WHERE hosting_nodes.status = 'active' AND hosting_nodes.accounts_limit > 0
  ```

- **Fuente:** `hosting_nodes.accounts_limit`, `hosting_nodes.accounts_used`, `hosting_nodes.status`
- **Unidad y dirección deseada:** porcentaje (`percent`); baja (`down`)
- **Frecuencia de cálculo:** `daily`, diaria (dashboard.calculation.daily_time)
- **Dimensiones de filtro:** periodo
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-INV-01 · Nodos de hosting por cuentas

#### KPI-OPE-06 · Respaldos exitosos

- **Nombre en inglés:** Successful backups
- **Definición:** Respaldos terminados con éxito entre respaldos terminados en el periodo (exitosos, fallidos y parciales).
- **Fórmula:**

  ```text
  COUNT(backup_runs.id WHERE backup_runs.status = 'succeeded') / COUNT(backup_runs.id WHERE backup_runs.status IN ('succeeded','failed','partial')) * 100 FROM backup_runs WHERE backup_runs.finished_at BETWEEN :inicio AND :fin
  ```

- **Fuente:** `backup_runs.finished_at`, `backup_runs.id`, `backup_runs.status`
- **Unidad y dirección deseada:** porcentaje (`percent`); sube (`up`)
- **Frecuencia de cálculo:** `daily`, diaria (dashboard.calculation.daily_time)
- **Dimensiones de filtro:** periodo
- **Meta administrable:** `kpi_targets` por marca y periodo; si no hay, `dashboard.targets.backup_success_percent` (null: por definir)
- **Detalle:** P-MON-06 · Backups fallidos y parciales

#### KPI-OPE-07 · Disponibilidad

- **Nombre en inglés:** Availability
- **Definición:** Chequeos con resultado arriba entre todos los chequeos de los monitores activos en el periodo.
- **Fórmula:**

  ```text
  COUNT(monitor_results.id WHERE monitor_results.status = 'up') / COUNT(monitor_results.id) * 100 FROM monitor_results JOIN monitors ON monitors.id = monitor_results.monitor_id WHERE monitors.is_active AND monitor_results.checked_at BETWEEN :inicio AND :fin
  ```

- **Fuente:** `monitor_results.checked_at`, `monitor_results.id`, `monitor_results.monitor_id`, `monitor_results.status`, `monitors.id`, `monitors.is_active`
- **Unidad y dirección deseada:** porcentaje (`percent`); sube (`up`)
- **Frecuencia de cálculo:** `intraday`, durante el día (dashboard.calculation.intraday_minutes)
- **Dimensiones de filtro:** periodo
- **Meta administrable:** `kpi_targets` por marca y periodo; si no hay, `dashboard.targets.availability_percent` (null: por definir)
- **Detalle:** P-MON-01 · Monitores por disponibilidad

#### KPI-OPE-08 · Incidentes

- **Nombre en inglés:** Incidents
- **Definición:** Incidentes iniciados en el periodo, por severidad.
- **Fórmula:**

  ```text
  COUNT(incidents.id) FROM incidents WHERE incidents.started_at BETWEEN :inicio AND :fin GROUP BY incidents.severity
  ```

- **Fuente:** `incidents.id`, `incidents.severity`, `incidents.started_at`
- **Unidad y dirección deseada:** cantidad (`count`); baja (`down`)
- **Frecuencia de cálculo:** `daily`, diaria (dashboard.calculation.daily_time)
- **Dimensiones de filtro:** periodo, responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-MON-03 · Incidentes del periodo

#### KPI-OPE-09 · Tiempo medio de resolución de incidentes

- **Nombre en inglés:** Mean time to resolve incidents
- **Definición:** Horas promedio entre el inicio y la resolución de los incidentes resueltos en el periodo.
- **Fórmula:**

  ```text
  AVG(incidents.resolved_at - incidents.started_at) FROM incidents WHERE incidents.status = 'resolved' AND incidents.resolved_at BETWEEN :inicio AND :fin
  ```

- **Fuente:** `incidents.resolved_at`, `incidents.started_at`, `incidents.status`
- **Unidad y dirección deseada:** horas (`hours`); baja (`down`)
- **Frecuencia de cálculo:** `monthly`, mensual, al cierre (dashboard.calculation.daily_time del día 1)
- **Dimensiones de filtro:** periodo, responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-MON-03 · Incidentes resueltos

#### KPI-OPE-10 · Avance de la migración

- **Nombre en inglés:** Migration progress
- **Definición:** Cuentas verificadas o cerradas entre las cuentas de los lotes de migración vigentes.
- **Fórmula:**

  ```text
  COUNT(migration_items.id WHERE migration_items.status IN ('verified','closed')) / COUNT(migration_items.id) * 100 FROM migration_items JOIN migration_batches ON migration_batches.id = migration_items.migration_batch_id WHERE migration_batches.status <> 'cancelled'
  ```

- **Fuente:** `migration_batches.id`, `migration_batches.status`, `migration_items.id`, `migration_items.migration_batch_id`, `migration_items.status`
- **Unidad y dirección deseada:** porcentaje (`percent`); sube (`up`)
- **Frecuencia de cálculo:** `daily`, diaria (dashboard.calculation.daily_time)
- **Dimensiones de filtro:** periodo, responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-INV-08 · Tablero de avance de migración

#### KPI-OPE-11 · Alertas abiertas

- **Nombre en inglés:** Open alerts
- **Definición:** Alertas abiertas o reconocidas sin resolver, por severidad.
- **Fórmula:**

  ```text
  COUNT(alerts.id) FROM alerts WHERE alerts.status IN ('open','acknowledged') GROUP BY alerts.severity
  ```

- **Fuente:** `alerts.id`, `alerts.severity`, `alerts.status`
- **Unidad y dirección deseada:** cantidad (`count`); baja (`down`)
- **Frecuencia de cálculo:** `intraday`, durante el día (dashboard.calculation.intraday_minutes)
- **Dimensiones de filtro:** periodo
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-MON-08 · Alertas abiertas

### Soporte (`support`, 8 indicadores)

#### KPI-SOP-01 · Tickets abiertos

- **Nombre en inglés:** Open tickets
- **Definición:** Tickets sin resolver ni cerrar, por prioridad.
- **Fórmula:**

  ```text
  COUNT(tickets.id) FROM tickets WHERE tickets.status NOT IN ('resolved','closed') AND tickets.deleted_at IS NULL GROUP BY tickets.priority
  ```

- **Fuente:** `tickets.deleted_at`, `tickets.id`, `tickets.priority`, `tickets.status`
- **Unidad y dirección deseada:** cantidad (`count`); baja (`down`)
- **Frecuencia de cálculo:** `intraday`, durante el día (dashboard.calculation.intraday_minutes)
- **Dimensiones de filtro:** periodo, marca (`brand`), responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-HLP-01 · Bandeja de tickets abiertos

#### KPI-SOP-02 · Tiempo de primera respuesta

- **Nombre en inglés:** First response time
- **Definición:** Minutos promedio entre la creación del ticket y la primera respuesta del personal, en tickets respondidos en el periodo.
- **Fórmula:**

  ```text
  AVG(tickets.first_responded_at - tickets.created_at) FROM tickets WHERE tickets.first_responded_at BETWEEN :inicio AND :fin
  ```

- **Fuente:** `tickets.created_at`, `tickets.first_responded_at`
- **Unidad y dirección deseada:** minutos (`minutes`); baja (`down`)
- **Frecuencia de cálculo:** `daily`, diaria (dashboard.calculation.daily_time)
- **Dimensiones de filtro:** periodo, marca (`brand`), responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; si no hay, `dashboard.targets.first_response_minutes` (null: null usa el objetivo de primera respuesta de cada prioridad en helpdesk)
- **Detalle:** P-HLP-01 · Tickets respondidos en el periodo

#### KPI-SOP-03 · Tiempo de solución

- **Nombre en inglés:** Resolution time
- **Definición:** Horas promedio entre la creación y la solución, descontando el tiempo en pausa del SLA, en tickets resueltos en el periodo.
- **Fórmula:**

  ```text
  AVG(tickets.resolved_at - tickets.created_at - tickets.sla_paused_minutes) FROM tickets WHERE tickets.resolved_at BETWEEN :inicio AND :fin
  ```

- **Fuente:** `tickets.created_at`, `tickets.resolved_at`, `tickets.sla_paused_minutes`
- **Unidad y dirección deseada:** horas (`hours`); baja (`down`)
- **Frecuencia de cálculo:** `daily`, diaria (dashboard.calculation.daily_time)
- **Dimensiones de filtro:** periodo, marca (`brand`), responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-HLP-01 · Tickets resueltos en el periodo

#### KPI-SOP-04 · Cumplimiento de SLA

- **Nombre en inglés:** SLA compliance
- **Definición:** Tickets resueltos en el periodo sin incumplir el SLA, entre todos los resueltos.
- **Fórmula:**

  ```text
  COUNT(tickets.id WHERE NOT tickets.sla_breached) / COUNT(tickets.id) * 100 FROM tickets WHERE tickets.resolved_at BETWEEN :inicio AND :fin
  ```

- **Fuente:** `tickets.id`, `tickets.resolved_at`, `tickets.sla_breached`
- **Unidad y dirección deseada:** porcentaje (`percent`); sube (`up`)
- **Frecuencia de cálculo:** `daily`, diaria (dashboard.calculation.daily_time)
- **Dimensiones de filtro:** periodo, marca (`brand`), responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; si no hay, `dashboard.targets.sla_compliance_percent` (null: por definir)
- **Detalle:** P-HLP-01 · Tickets con SLA incumplido

#### KPI-SOP-05 · Satisfacción del cliente

- **Nombre en inglés:** Customer satisfaction
- **Definición:** Encuestas respondidas con 4 o 5 entre encuestas respondidas en el periodo.
- **Fórmula:**

  ```text
  COUNT(satisfaction_surveys.id WHERE satisfaction_surveys.score >= 4) / COUNT(satisfaction_surveys.id) * 100 FROM satisfaction_surveys JOIN tickets ON tickets.id = satisfaction_surveys.ticket_id WHERE satisfaction_surveys.answered_at BETWEEN :inicio AND :fin
  ```

- **Fuente:** `satisfaction_surveys.answered_at`, `satisfaction_surveys.id`, `satisfaction_surveys.score`, `satisfaction_surveys.ticket_id`, `tickets.id`
- **Unidad y dirección deseada:** porcentaje (`percent`); sube (`up`)
- **Frecuencia de cálculo:** `daily`, diaria (dashboard.calculation.daily_time)
- **Dimensiones de filtro:** periodo, marca (`brand`), responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; si no hay, `dashboard.targets.csat_percent` (null: por definir)
- **Detalle:** P-HLP-07 · Encuestas del periodo

#### KPI-SOP-06 · Puntaje promedio de satisfacción

- **Nombre en inglés:** Average satisfaction score
- **Definición:** Promedio de puntaje (1 a 5) de las encuestas respondidas en el periodo.
- **Fórmula:**

  ```text
  AVG(satisfaction_surveys.score) FROM satisfaction_surveys WHERE satisfaction_surveys.answered_at BETWEEN :inicio AND :fin
  ```

- **Fuente:** `satisfaction_surveys.answered_at`, `satisfaction_surveys.score`
- **Unidad y dirección deseada:** puntaje 1–5 (`score`); sube (`up`)
- **Frecuencia de cálculo:** `daily`, diaria (dashboard.calculation.daily_time)
- **Dimensiones de filtro:** periodo, marca (`brand`), responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-HLP-07 · Encuestas del periodo

#### KPI-SOP-07 · Carga por técnico

- **Nombre en inglés:** Workload per technician
- **Definición:** Tickets abiertos asignados a cada técnico; el detalle suma las horas registradas en el periodo.
- **Fórmula:**

  ```text
  COUNT(tickets.id) FROM tickets WHERE tickets.status NOT IN ('resolved','closed') AND tickets.deleted_at IS NULL GROUP BY tickets.assignee_id  -- detalle: SUM(time_entries.minutes) / 60 GROUP BY time_entries.user_id
  ```

- **Fuente:** `tickets.assignee_id`, `tickets.deleted_at`, `tickets.id`, `tickets.status`, `time_entries.minutes`, `time_entries.user_id`
- **Unidad y dirección deseada:** cantidad (`count`); baja (`down`)
- **Frecuencia de cálculo:** `intraday`, durante el día (dashboard.calculation.intraday_minutes)
- **Dimensiones de filtro:** periodo, marca (`brand`), responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-HLP-01 · Bandeja por técnico

#### KPI-SOP-08 · Tickets reabiertos

- **Nombre en inglés:** Reopened tickets
- **Definición:** Reaperturas de tickets resueltos en el periodo, sobre los tickets resueltos.
- **Fórmula:**

  ```text
  SUM(tickets.reopened_count) / COUNT(tickets.id) * 100 FROM tickets WHERE tickets.resolved_at BETWEEN :inicio AND :fin
  ```

- **Fuente:** `tickets.id`, `tickets.reopened_count`, `tickets.resolved_at`
- **Unidad y dirección deseada:** porcentaje (`percent`); baja (`down`)
- **Frecuencia de cálculo:** `monthly`, mensual, al cierre (dashboard.calculation.daily_time del día 1)
- **Dimensiones de filtro:** periodo, marca (`brand`), responsable (`owner`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-HLP-01 · Tickets reabiertos

### Reclamos (`complaints`, 6 indicadores)

#### KPI-REC-01 · Reclamos recibidos

- **Nombre en inglés:** Claims received
- **Definición:** Hojas del Libro de Reclamaciones de tipo reclamo registradas en el periodo (sin hojas de prueba).
- **Fórmula:**

  ```text
  COUNT(complaints.id) FROM complaints WHERE complaints.complaint_type = 'claim' AND NOT complaints.is_test AND complaints.received_at BETWEEN :inicio AND :fin
  ```

- **Fuente:** `complaints.complaint_type`, `complaints.id`, `complaints.is_test`, `complaints.received_at`
- **Unidad y dirección deseada:** cantidad (`count`); baja (`down`)
- **Frecuencia de cálculo:** `daily`, diaria (dashboard.calculation.daily_time)
- **Dimensiones de filtro:** periodo, marca (`brand`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-LRC-01 · Libro de Reclamaciones: reclamos

#### KPI-REC-02 · Quejas recibidas

- **Nombre en inglés:** Grievances received
- **Definición:** Hojas del Libro de Reclamaciones de tipo queja registradas en el periodo (sin hojas de prueba).
- **Fórmula:**

  ```text
  COUNT(complaints.id) FROM complaints WHERE complaints.complaint_type = 'grievance' AND NOT complaints.is_test AND complaints.received_at BETWEEN :inicio AND :fin
  ```

- **Fuente:** `complaints.complaint_type`, `complaints.id`, `complaints.is_test`, `complaints.received_at`
- **Unidad y dirección deseada:** cantidad (`count`); baja (`down`)
- **Frecuencia de cálculo:** `daily`, diaria (dashboard.calculation.daily_time)
- **Dimensiones de filtro:** periodo, marca (`brand`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-LRC-01 · Libro de Reclamaciones: quejas

#### KPI-REC-03 · Respondidos dentro del plazo

- **Nombre en inglés:** Answered on time
- **Definición:** Hojas cuyo plazo vence en el periodo y se respondieron a más tardar en su fecha de vencimiento, entre todas las que vencían.
- **Fórmula:**

  ```text
  COUNT(complaints.id WHERE complaints.answered_at IS NOT NULL AND complaints.answered_at <= complaints.due_at) / COUNT(complaints.id) * 100 FROM complaints WHERE NOT complaints.is_test AND complaints.due_at BETWEEN :inicio AND :fin
  ```

- **Fuente:** `complaints.answered_at`, `complaints.due_at`, `complaints.id`, `complaints.is_test`
- **Unidad y dirección deseada:** porcentaje (`percent`); sube (`up`)
- **Frecuencia de cálculo:** `daily`, diaria (dashboard.calculation.daily_time)
- **Dimensiones de filtro:** periodo, marca (`brand`)
- **Meta administrable:** `kpi_targets` por marca y periodo; si no hay, `dashboard.targets.complaints_on_time_percent` (defecto 100)
- **Detalle:** P-LRC-01 · Hojas que vencían en el periodo

#### KPI-REC-04 · Próximos a vencer

- **Nombre en inglés:** Due soon
- **Definición:** Hojas sin responder cuyo plazo vence dentro del mayor aviso de complaints.alert_days_before (días hábiles).
- **Fórmula:**

  ```text
  COUNT(complaints.id) FROM complaints WHERE complaints.status IN ('received','in_progress') AND NOT complaints.is_test AND complaints.due_at BETWEEN :ahora AND sumar_dias_habiles(:ahora, MAX(complaints.alert_days_before))
  ```

- **Fuente:** `complaints.due_at`, `complaints.id`, `complaints.is_test`, `complaints.status`
- **Unidad y dirección deseada:** cantidad (`count`); baja (`down`)
- **Frecuencia de cálculo:** `intraday`, durante el día (dashboard.calculation.intraday_minutes)
- **Dimensiones de filtro:** periodo, marca (`brand`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-LRC-01 · Hojas por vencer

#### KPI-REC-05 · Vencidos sin respuesta

- **Nombre en inglés:** Overdue without answer
- **Definición:** Hojas sin responder cuyo plazo ya venció.
- **Fórmula:**

  ```text
  COUNT(complaints.id) FROM complaints WHERE complaints.status IN ('received','in_progress') AND NOT complaints.is_test AND complaints.due_at < :ahora
  ```

- **Fuente:** `complaints.due_at`, `complaints.id`, `complaints.is_test`, `complaints.status`
- **Unidad y dirección deseada:** cantidad (`count`); baja (`down`)
- **Frecuencia de cálculo:** `intraday`, durante el día (dashboard.calculation.intraday_minutes)
- **Dimensiones de filtro:** periodo, marca (`brand`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-LRC-01 · Hojas vencidas

#### KPI-REC-06 · Tiempo promedio de respuesta

- **Nombre en inglés:** Average response time
- **Definición:** Días promedio entre el registro de la hoja y su respuesta, en hojas respondidas en el periodo.
- **Fórmula:**

  ```text
  AVG(complaints.answered_at::date - complaints.received_at::date) FROM complaints WHERE NOT complaints.is_test AND complaints.answered_at BETWEEN :inicio AND :fin
  ```

- **Fuente:** `complaints.answered_at`, `complaints.is_test`, `complaints.received_at`
- **Unidad y dirección deseada:** días (`days`); baja (`down`)
- **Frecuencia de cálculo:** `monthly`, mensual, al cierre (dashboard.calculation.daily_time del día 1)
- **Dimensiones de filtro:** periodo, marca (`brand`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-LRC-01 · Hojas respondidas

### Web (`web`, 9 indicadores)

#### KPI-WEB-01 · Pedidos en línea

- **Nombre en inglés:** Online orders
- **Definición:** Pedidos generados por compras en línea pagadas en el periodo.
- **Fórmula:**

  ```text
  COUNT(orders.id) FROM orders WHERE orders.channel = 'online' AND orders.created_at BETWEEN :inicio AND :fin
  ```

- **Fuente:** `orders.channel`, `orders.created_at`, `orders.id`
- **Unidad y dirección deseada:** cantidad (`count`); sube (`up`)
- **Frecuencia de cálculo:** `daily`, diaria (dashboard.calculation.daily_time)
- **Dimensiones de filtro:** periodo, marca (`brand`), moneda (`currency`), categoría (`product_category`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-ORD-07 · Compras en línea

#### KPI-WEB-02 · Carritos abandonados

- **Nombre en inglés:** Abandoned carts
- **Definición:** Carritos marcados como abandonados en el periodo entre carritos creados en el periodo.
- **Fórmula:**

  ```text
  COUNT(carts.id WHERE carts.status = 'abandoned' AND carts.abandoned_at BETWEEN :inicio AND :fin) / COUNT(carts.id WHERE carts.created_at BETWEEN :inicio AND :fin) * 100 FROM carts
  ```

- **Fuente:** `carts.abandoned_at`, `carts.created_at`, `carts.id`, `carts.status`
- **Unidad y dirección deseada:** porcentaje (`percent`); baja (`down`)
- **Frecuencia de cálculo:** `daily`, diaria (dashboard.calculation.daily_time)
- **Dimensiones de filtro:** periodo, marca (`brand`), moneda (`currency`)
- **Meta administrable:** `kpi_targets` por marca y periodo; si no hay, `dashboard.targets.cart_abandonment_percent` (null: por definir)
- **Detalle:** P-ORD-06 · Carritos abandonados

#### KPI-WEB-03 · Carritos recuperados

- **Nombre en inglés:** Recovered carts
- **Definición:** Carritos que fueron abandonados y luego terminaron en compra dentro del periodo.
- **Fórmula:**

  ```text
  COUNT(carts.id) FROM carts WHERE carts.abandoned_at IS NOT NULL AND carts.status = 'converted' AND carts.converted_at BETWEEN :inicio AND :fin
  ```

- **Fuente:** `carts.abandoned_at`, `carts.converted_at`, `carts.id`, `carts.status`
- **Unidad y dirección deseada:** cantidad (`count`); sube (`up`)
- **Frecuencia de cálculo:** `daily`, diaria (dashboard.calculation.daily_time)
- **Dimensiones de filtro:** periodo, marca (`brand`), moneda (`currency`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-ORD-06 · Carritos recuperados

#### KPI-WEB-04 · Conversión de la compra en línea por marca

- **Nombre en inglés:** Online checkout conversion by brand
- **Definición:** Compras completadas entre carritos creados en el periodo, por marca.
- **Fórmula:**

  ```text
  COUNT(checkout_sessions.id WHERE checkout_sessions.status = 'completed' AND checkout_sessions.completed_at BETWEEN :inicio AND :fin) / COUNT(carts.id WHERE carts.created_at BETWEEN :inicio AND :fin) * 100 GROUP BY carts.brand_id
  ```

- **Fuente:** `carts.brand_id`, `carts.created_at`, `carts.id`, `checkout_sessions.completed_at`, `checkout_sessions.id`, `checkout_sessions.status`
- **Unidad y dirección deseada:** porcentaje (`percent`); sube (`up`)
- **Frecuencia de cálculo:** `daily`, diaria (dashboard.calculation.daily_time)
- **Dimensiones de filtro:** periodo, marca (`brand`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-ORD-07 · Compras en línea por marca

#### KPI-WEB-05 · Búsquedas de dominio

- **Nombre en inglés:** Domain searches
- **Definición:** Consultas de disponibilidad, WHOIS y sugerencias atendidas desde las webs (sin las frenadas por límite o captcha).
- **Fórmula:**

  ```text
  COUNT(whois_lookups.id) FROM whois_lookups WHERE whois_lookups.result NOT IN ('rate_limited','captcha_required') AND whois_lookups.created_at BETWEEN :inicio AND :fin GROUP BY whois_lookups.query_kind
  ```

- **Fuente:** `whois_lookups.created_at`, `whois_lookups.id`, `whois_lookups.query_kind`, `whois_lookups.result`
- **Unidad y dirección deseada:** cantidad (`count`); sube (`up`)
- **Frecuencia de cálculo:** `daily`, diaria (dashboard.calculation.daily_time)
- **Dimensiones de filtro:** periodo, marca (`brand`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-DOM-08 · Consultas WHOIS de la web

#### KPI-WEB-06 · Registros de dominio en línea

- **Nombre en inglés:** Online domain registrations
- **Definición:** Dominios a registrar incluidos en carritos convertidos en compra en el periodo.
- **Fórmula:**

  ```text
  COUNT(cart_items.id) FROM cart_items JOIN carts ON carts.id = cart_items.cart_id WHERE cart_items.domain_action = 'register' AND carts.status = 'converted' AND carts.converted_at BETWEEN :inicio AND :fin
  ```

- **Fuente:** `cart_items.cart_id`, `cart_items.domain_action`, `cart_items.id`, `carts.converted_at`, `carts.id`, `carts.status`
- **Unidad y dirección deseada:** cantidad (`count`); sube (`up`)
- **Frecuencia de cálculo:** `daily`, diaria (dashboard.calculation.daily_time)
- **Dimensiones de filtro:** periodo, marca (`brand`), moneda (`currency`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-ORD-07 · Compras con registro de dominio

#### KPI-WEB-07 · Conversión de búsqueda a registro

- **Nombre en inglés:** Search to registration conversion
- **Definición:** Registros de dominio en línea entre dominios distintos consultados y encontrados disponibles en el periodo.
- **Fórmula:**

  ```text
  KPI-WEB-06 / COUNT(DISTINCT whois_lookups.domain_name WHERE whois_lookups.result = 'available' AND whois_lookups.created_at BETWEEN :inicio AND :fin) * 100
  ```

- **Fuente:** `whois_lookups.created_at`, `whois_lookups.domain_name`, `whois_lookups.result`
- **Unidad y dirección deseada:** porcentaje (`percent`); sube (`up`)
- **Frecuencia de cálculo:** `monthly`, mensual, al cierre (dashboard.calculation.daily_time del día 1)
- **Dimensiones de filtro:** periodo, marca (`brand`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-DOM-08 · Consultas disponibles y registros

#### KPI-WEB-08 · Consultas frenadas por abuso

- **Nombre en inglés:** Lookups blocked for abuse
- **Definición:** Consultas de dominio rechazadas por el límite por visitante o que exigieron captcha.
- **Fórmula:**

  ```text
  COUNT(whois_lookups.id) FROM whois_lookups WHERE whois_lookups.result IN ('rate_limited','captcha_required') AND whois_lookups.created_at BETWEEN :inicio AND :fin
  ```

- **Fuente:** `whois_lookups.created_at`, `whois_lookups.id`, `whois_lookups.result`
- **Unidad y dirección deseada:** cantidad (`count`); baja (`down`)
- **Frecuencia de cálculo:** `daily`, diaria (dashboard.calculation.daily_time)
- **Dimensiones de filtro:** periodo, marca (`brand`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-DOM-08 · Consultas frenadas

#### KPI-WEB-09 · Envíos de formularios derivados

- **Nombre en inglés:** Routed form submissions
- **Definición:** Envíos de formularios de las webs derivados a prospecto, ticket o correo en el periodo.
- **Fórmula:**

  ```text
  COUNT(web_form_submissions.id) FROM web_form_submissions WHERE web_form_submissions.status = 'routed' AND web_form_submissions.routed_at BETWEEN :inicio AND :fin
  ```

- **Fuente:** `web_form_submissions.id`, `web_form_submissions.routed_at`, `web_form_submissions.status`
- **Unidad y dirección deseada:** cantidad (`count`); sube (`up`)
- **Frecuencia de cálculo:** `daily`, diaria (dashboard.calculation.daily_time)
- **Dimensiones de filtro:** periodo, marca (`brand`)
- **Meta administrable:** `kpi_targets` por marca y periodo; sin meta por defecto en el centro de configuración
- **Detalle:** P-WCN-06 · Envíos de formularios
<!-- kpi-catalog:end -->
