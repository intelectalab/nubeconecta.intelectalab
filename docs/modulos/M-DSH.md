# M-DSH · Dashboard ejecutivo y panel de indicadores

> No es módulo de negocio: aplicación del panel que consume la API de los módulos. Usa `dashboard.summary.view` (y `dashboard.search.view` para la búsqueda global) más los permisos de lectura de cada módulo; desde docs/00 §27, el panel de indicadores usa `dashboard.kpi.*`, un permiso de valores por grupo y `dashboard.kpi_target.*`.
> Fuente: `docs/00-requerimientos.md` secciones 3 ("el dashboard no es módulo de backend"), 7 (tres importes), 9, 21 y 27 ("Panel de indicadores (KPI)"); catálogo de indicadores en `docs/14-indicadores.md` (generado desde `database/seeds/kpis.json`); contrato común de nombres.

## 1. Propósito y bloque

Muestra a gerencia y a cada área el estado del negocio. Las tres vistas originales (comercial, financiera y operativa) siguen como tableros de resumen, y el **panel de indicadores** de docs/00 §27 reúne en una sola vista 78 indicadores de ocho grupos (Comercial, CRM, Finanzas, Cobranza, Operación, Soporte, Reclamos y Web) con filtros por periodo, marca, moneda, categoría de servicio y responsable, comparación con el periodo anterior, metas administrables, definición y fórmula de cada indicador, enlace al detalle y exportación.

El dashboard no escribe en las tablas de otros módulos. Para que el panel abra rápido y compare periodos sin recalcular todo, guarda su catálogo (`kpi_definitions`), sus metas (`kpi_targets`) y los valores que calcula un job programado (`kpi_snapshots`).

- **Bloque:** E. Facturación y cobro (épicas "Dashboard ejecutivo" y "Panel de indicadores (KPI)"); requiere que los módulos de B, C, D, E y F existan, y que DOM registre las búsquedas de dominio (`whois_lookups`).
- **Depende de:** CUS, SAL, SRV, ORD, BIL, FIN, HLP, WRK, MON, INV, DOM, LRC, WCN y CFG (ajustes `dashboard.*`, feriados y tipos de cambio).
- **Dependen de él:** ninguno.

## 2. Alcance

**Incluye**
- Tableros de resumen: comerciales (clientes, servicios activos, MRR, ARR, renovaciones, altas y bajas), financieros (facturado, cobrado y reconocido por separado, cobrado por medio de pago, contracargos, costos, margen, cuentas por cobrar por tramos) y operativos (tickets, SLA, tareas vencidas, alertas, nodos, backups, incidentes).
- Panel de indicadores con el catálogo de `docs/14-indicadores.md`: 78 indicadores en ocho grupos, cada uno con código (`KPI-COM-01`…), definición, fórmula exacta sobre el esquema, fuente, frecuencia de cálculo, dimensiones de filtro, dirección deseada (sube o baja), meta administrable y pantalla de detalle.
- Filtros comunes: periodo, marca, moneda (o consolidado en `dashboard.consolidation_currency`), categoría de servicio y responsable; un indicador solo ofrece las dimensiones que admite.
- Comparación con el periodo anterior de igual duración (variación absoluta y porcentual).
- Metas por indicador, marca (o todas) y periodo (mes, trimestre o año) en `kpi_targets`; meta por defecto de los indicadores clave en `dashboard.targets.*`; semáforo según la dirección deseada.
- Cálculo programado (`ComputeKpiSnapshots`) con la frecuencia de cada indicador y recálculo nocturno de meses recientes; recálculo manual de un periodo por el administrador.
- Detalle de cada indicador con definición, fórmula, serie, metas y enlace al listado del módulo dueño con los filtros equivalentes.
- Exportación de valores en cola (reporte `kpi_values`).
- Visibilidad por grupo según el rol: finanzas ve Finanzas y Cobranza; ventas, Comercial, CRM y Web; soporte, Soporte, Operación y Reclamos; documentación, Reclamos; el administrador, todo.

**No incluye**
- Reportes detallados de cada módulo (FIN, SAL, BIL siguen siendo los dueños de sus listados).
- Editar fórmulas desde el panel: el catálogo se cambia en `kpis.json` (con su prueba) y se vuelve a sembrar.
- Escribir en tablas de otros módulos.

## 3. Entidades

| Tabla | Campos clave | Notas |
|---|---|---|
| `kpi_definitions` | code, kpi_group (`commercial`/`crm`/`finance`/`collections`/`operations`/`support`/`complaints`/`web`), name, definition, formula, source_columns, unit (`money`/`count`/`percent`/`days`/`hours`/`minutes`/`score`), direction (`up`/`down`), frequency (`intraday`/`daily`/`monthly`), dimensions (`brand`/`currency`/`product_category`/`owner`), target_setting_key, detail_screen, is_active, sort_order | Sembrada desde `database/seeds/kpis.json`; la aplicación no la borra |
| `kpi_targets` | kpi_definition_id, brand_id, period_type (`month`/`quarter`/`year`), period_start, target_value, target_minor, currency, notes | Una meta por indicador, marca, periodo y moneda |
| `kpi_snapshots` | kpi_definition_id, period_type (`day`/`month`), period_start, period_end, brand_id, currency, product_category_id, owner_user_id, value, value_minor, numerator, denominator, sample_count, is_partial, computed_at | Un valor por periodo y combinación de dimensiones; lo reemplaza el recálculo |

- Endpoints de resumen de los tableros: `/api/v1/admin/customers/summary`, `/admin/services/summary`, `/admin/invoices/summary`, `/admin/finance/summary`, `/admin/tickets/summary`, `/admin/tasks/summary`, `/admin/monitoring/summary`, `/admin/hosting-nodes/summary`.
- Tablas que leen las fórmulas (detalle en docs/14): `subscriptions`, `services`, `customers`, `service_status_history`, `orders`, `leads`, `lead_stage_changes`, `pipeline_stages`, `quotes`, `invoices`, `invoice_items`, `payments`, `payment_allocations`, `payment_promises`, `costs`, `cost_allocations`, `provider_accounts`, `provider_bills`, `domains`, `hosting_nodes`, `migration_items`, `migration_batches`, `backup_runs`, `monitors`, `monitor_results`, `incidents`, `alerts`, `tickets`, `satisfaction_surveys`, `time_entries`, `complaints`, `carts`, `cart_items`, `checkout_sessions`, `whois_lookups`, `web_form_submissions`, `exchange_rates`.

## 4. Casos de uso y flujos

1. **Abrir el panel de indicadores** (P-DSH-04): la vista inicial muestra los grupos que el rol puede ver, con el mes en curso y el anterior como comparación; los filtros se conservan por usuario.
2. **Filtrar:** periodo, marca, moneda, categoría y responsable se aplican a todos los indicadores que admiten esa dimensión; los que no, lo indican en su tarjeta.
3. **Ver el tablero del indicador** (P-DSH-05): clic en un indicador abre su página propia (docs/14 §7.1) con resumen, conciliación, evolución, desgloses recalculados y la tabla de registros que lo forman con búsqueda, filtros, orden, totales y exportación (`GET /admin/kpis/{code}/records`); "Ir al módulo" abre el listado del módulo dueño con los filtros equivalentes.
4. **Fijar metas** (P-DSH-06, admin): crear, editar o borrar una meta por indicador, marca y periodo; las de dinero llevan moneda.
5. **Calcular:** `ComputeKpiSnapshots` corre según la frecuencia de cada indicador (`dashboard.calculation.intraday_minutes`, `dashboard.calculation.daily_time`) y recalcula de noche los últimos `dashboard.calculation.history_months` meses; el administrador puede pedir el recálculo de un periodo.
6. **Exportar:** CSV, Excel o PDF en cola con los filtros aplicados.
7. **Consolidar monedas:** los importes se muestran por moneda y consolidados con el tipo de cambio de la fecha de cada documento.

## 5. Reglas de negocio clave

RN-DSH-001 a RN-DSH-006 (`docs/04`). Cada número proviene de las tablas del módulo dueño con la fórmula publicada en docs/14; el total del listado de detalle coincide con el indicador. Un indicador o grupo sin permiso no se muestra (no se muestra en cero). Facturado, cobrado y reconocido siempre por separado. MRR normaliza cada suscripción activa a su equivalente mensual; ARR es MRR × 12. Las razones se reagregan con numerador y denominador. Sin meta en `kpi_targets` ni en `dashboard.targets.*`, el indicador se muestra "sin meta". Las hojas de prueba del Libro no cuentan.

## 6. Estados

- No maneja estados propios; los indicadores filtran por estados de otros módulos (`services.status`, `invoices.status`, `tickets.status`, `complaints.status`, `carts.status`, `whois_lookups.result`…). Tipos propios: `kpi_definitions.kpi_group`, `kpi_definitions.unit`, `kpi_definitions.direction`, `kpi_definitions.frequency`, `kpi_targets.period_type`, `kpi_snapshots.period_type`.

## 7. Permisos

| Código | Rol por defecto |
|---|---|
| `dashboard.summary.view` | admin |
| `dashboard.kpi.view` | admin, sales, finance, support, documentation |
| `dashboard.kpi.export` | admin, sales, finance, support |
| `dashboard.kpi.update` (activar, ordenar, recalcular) | admin |
| `dashboard.kpi_commercial.view`, `dashboard.kpi_crm.view`, `dashboard.kpi_web.view` | admin, sales |
| `dashboard.kpi_finance.view`, `dashboard.kpi_collections.view` | admin, finance |
| `dashboard.kpi_operations.view`, `dashboard.kpi_support.view` | admin, support |
| `dashboard.kpi_complaints.view` | admin, support, documentation |
| `dashboard.kpi_target.view` | admin, sales, finance, support, documentation |
| `dashboard.kpi_target.create` / `update` / `delete` | admin |

En los tableros de resumen cada tarjeta exige además el permiso de lectura del módulo dueño (`customers.customer.view`, `billing.invoice.view`, `billing.payment.view`, `billing.payment_dispute.view`, `finance.cost.view`, `helpdesk.ticket.view`, `work.task.view`, `monitoring.alert.view`, `inventory.hosting_node.view`).

## 8. Pantallas

### P-DSH-01 · Dashboard comercial
- **Propósito:** conocer el estado comercial del negocio.
- **Rol principal:** admin
- **Campos:** clientes activos, servicios activos por categoría, MRR, ARR, renovaciones próximos 30 días, altas y bajas del periodo, embudo resumido.
- **Filtros:** fecha, marca, país, proveedor, vendedor, estado.
- **Acciones:** Abrir detalle de indicador → `services.service.view`; Guardar filtros → propio usuario.
- **Vacío / error:** indicador sin datos muestra "Sin datos en el periodo"; error de un indicador no bloquea los demás (estado de error por tarjeta).

### P-DSH-02 · Dashboard financiero
- **Propósito:** decidir con datos de facturación, cobro, costos y margen.
- **Rol principal:** admin
- **Campos:** facturado, cobrado y reconocido; cobrado por medio de pago; contracargos abiertos (cantidad e importe, con el más próximo a vencer su plazo de descargos); cuentas por cobrar por tramos 0-30, 31-60, 61-90, más de 90; costos del periodo; margen; consolidado por moneda.
- **Filtros:** fecha, marca, país, proveedor, moneda de consolidación.
- **Acciones:** Abrir antigüedad de deuda → `billing.invoice.view`; Abrir rentabilidad → `finance.cost.view`; Abrir contracargos → `billing.payment_dispute.view`.
- **Vacío / error:** tarjetas de costo y margen ocultas sin permiso; aviso si falta tipo de cambio de alguna fecha.

### P-DSH-03 · Dashboard operativo
- **Propósito:** anticipar problemas de soporte e infraestructura.
- **Rol principal:** support
- **Campos:** tickets abiertos y críticos, tiempo medio de primera respuesta, cumplimiento de SLA, tareas vencidas, alertas abiertas, uso de nodos de hosting (sobre umbral), backups fallidos, incidentes abiertos.
- **Filtros:** fecha, marca, responsable.
- **Acciones:** Abrir bandeja de tickets → `helpdesk.ticket.view`; Abrir alertas → `monitoring.alert.view`; Abrir nodos → `inventory.hosting_node.view`.
- **Vacío / error:** "Sin incidentes abiertos" en verde; error por tarjeta con reintento.

### P-DSH-04 · Panel de indicadores
- **Propósito:** ver en una sola vista la salud comercial, financiera, operativa y de soporte con metas y comparación.
- **Rol principal:** admin
- **Campos:** secciones por grupo (Comercial, CRM, Finanzas, Cobranza, Operación, Soporte, Reclamos, Web) con una tarjeta por indicador: nombre, valor, unidad, periodo anterior, variación con flecha según la dirección deseada, meta y semáforo, marca de "parcial" y hora del último cálculo; aviso de tipo de cambio faltante.
- **Filtros:** periodo (mes, trimestre, año o rango), marca, moneda (o consolidado), categoría de servicio, responsable; comparación con el periodo anterior activable.
- **Acciones:** Ver detalle → `dashboard.kpi.view`; Exportar → `dashboard.kpi.export`; Recalcular periodo → `dashboard.kpi.update`; Administrar metas → `dashboard.kpi_target.view`; Guardar filtros → propio usuario.
- **Vacío / error:** "Sin datos en el periodo" por tarjeta (nunca 0 % con denominador vacío); "sin meta" cuando no hay meta; error de una tarjeta con reintento sin bloquear las demás; los grupos sin permiso no aparecen.

### P-DSH-05 · Detalle de indicador
- **Propósito:** entender qué mide un indicador, cómo se calcula y qué registros lo forman.
- **Rol principal:** admin
- **Campos:** código, nombre, definición, fórmula exacta, fuente (tablas y columnas), unidad, dirección deseada, frecuencia, dimensiones, meta vigente y su origen (`kpi_targets` o `dashboard.targets.*`), serie por día o mes con el periodo anterior, desglose (por marca, canal, tramo, prioridad o etapa, según el indicador).
- **Diseño:** página propia, no ventana emergente (docs/14 §7.1): resumen con valor, comparación, variación, meta, semáforo y número de registros; aviso de conciliación entre el total del listado y el indicador; evolución de 12 periodos; dos desgloses recalculados sobre las filas filtradas; tabla de registros; otros indicadores del grupo.
- **Tabla de registros:** columnas del listado de `detail_screen` más la columna que mide el indicador; búsqueda, filtro por dimensión principal, por estado o resultado y por segunda dimensión; orden por columna; paginación; fila de totales con el indicador recalculado sobre el filtro; enlace a la ficha del cliente o del documento.
- **Filtros:** los mismos del panel más los de la tabla; un clic en una barra del desglose filtra la tabla.
- **Acciones:** Filtrar y ordenar registros → `dashboard.kpi.view` + permiso del grupo + lectura del módulo dueño; Ir al módulo dueño (listado con los filtros equivalentes) → permiso de lectura del módulo dueño; Editar meta → `dashboard.kpi_target.update`; Exportar registros → `dashboard.kpi.export`.
- **Vacío / error:** 403 si el grupo del indicador no está permitido o falta la lectura del módulo dueño; "Sin registros en el periodo" o "Sin registros con estos filtros" con botón para limpiar; serie vacía con "Sin datos en el periodo"; si el total del listado no coincide con el indicador, aviso en rojo y registro del error.

### P-DSH-06 · Metas de indicadores
- **Propósito:** fijar y revisar las metas por indicador, marca y periodo.
- **Rol principal:** admin
- **Columnas:** indicador, grupo, marca (o todas), tipo de periodo, inicio, meta (valor o importe con moneda), meta por defecto del centro de configuración, notas, última modificación.
- **Filtros:** grupo, indicador, marca, periodo.
- **Acciones:** Crear meta → `dashboard.kpi_target.create`; Editar → `dashboard.kpi_target.update`; Eliminar → `dashboard.kpi_target.delete`; Abrir meta por defecto en el centro de configuración → `settings.setting.update`.
- **Vacío / error:** "Sin metas: se usan las metas por defecto"; meta repetida → 409; meta en porcentaje fuera de 0–100 o en dinero sin moneda → 422.

## 9. Eventos y jobs

- No emite ni escucha eventos de dominio: lee las tablas con consultas de solo lectura (réplica si existe).
- **Jobs:** `ComputeKpiSnapshots` (por frecuencia: intradía, diaria y cierre mensual; con recálculo nocturno de `dashboard.calculation.history_months`), en la cola `reports`, con bloqueo por indicador y periodo (`ShouldBeUnique`). Los resúmenes de los tableros pueden cachearse en Redis por organización con expiración corta.

## 10. Integraciones y conectores

- Ninguna; solo la API interna y las tablas de lectura.

## 11. Ajustes administrables

- `billing.exchange_rate.source` (consolidación), `dashboard.consolidation_currency`, `dashboard.expiring_window_days`.
- Frecuencia de cálculo: `dashboard.calculation.daily_time`, `dashboard.calculation.intraday_minutes`, `dashboard.calculation.history_months`.
- Metas por defecto de los indicadores clave: `dashboard.targets.*` (la mayoría por definir con gerencia; `dashboard.targets.complaints_on_time_percent` es 100).
- Lee además `sales.lead.followup_alert_days`, `complaints.alert_days_before`, `inventory.capacity_thresholds` y `helpdesk.sla.default_targets`.

## 12. Historias del backlog

- Indicadores comerciales
- Indicadores financieros
- Indicadores operativos

Épica "Panel de indicadores (KPI)":
- Catálogo de indicadores con definición y fórmula
- Cálculo programado de indicadores
- Panel de indicadores por grupo con filtros y comparación
- Metas administrables por indicador
- Detalle de indicador con enlace al módulo dueño
- Exportación de indicadores
- Indicadores visibles según el grupo del rol

## 13. Criterios de terminado y pruebas obligatorias

- Cada indicador coincide con el total del listado de detalle con los mismos filtros (prueba de integración por indicador, con los datos de demostración).
- Una razón reagregada en un trimestre es igual a la calculada directamente sobre el trimestre; un recálculo no duplica filas de `kpi_snapshots`.
- Usuario sin `finance.cost.view` no recibe costos ni margen en los tableros; usuario sin `dashboard.kpi_finance.view` recibe 403 en `/admin/kpi-values/finance` y no ve el grupo en el catálogo ni en la exportación.
- Facturado, cobrado y reconocido difieren correctamente en un escenario con factura anual pagada a medias.
- Consolidación usa el tipo de cambio de la fecha del documento; sin tipo de cambio la tarjeta lo avisa.
- Meta en `kpi_targets` gana a `dashboard.targets.*`; sin ninguna, "sin meta".
- Las hojas de prueba del Libro no cuentan en Reclamos.
- `make verify` pasa `tools/verificar_kpis.py` (catálogo, fórmulas contra el esquema, metas y pantallas).

## 14. Preguntas abiertas

- Valores de las metas por defecto (`dashboard.targets.*` en `null`): con gerencia (`docs/11`, D-34).
- La definición de MRR (normalización mensual) y de abandono (cliente sin servicios activos al cierre) se fijan en docs/14 siguiendo la práctica habitual.

## Anexo: nombres fuera del contrato

- Endpoints de resumen `/api/v1/admin/<recurso>/summary` en cada módulo.
- Por docs/00 §27: tablas `kpi_definitions`, `kpi_targets`, `kpi_snapshots`; semilla `database/seeds/kpis.json`; verificador `tools/verificar_kpis.py`; permisos `dashboard.kpi.*`, los ocho de valores por grupo y `dashboard.kpi_target.*`; endpoints `/admin/kpis`, `/admin/kpis/{code}`, `/admin/kpis/{code}/records`, `/admin/kpis/{code}/records/exports`, `/admin/kpis/exports`, `/admin/kpis/recalculations`, `/admin/kpi-values/<grupo>` y `/admin/kpi-targets`; reporte `kpi_values` en `exports.report`; job `ComputeKpiSnapshots`.
- Historia del backlog (docs/00 §27): «Tablero propio por indicador con registros y filtros».
