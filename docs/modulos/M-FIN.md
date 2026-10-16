# M-FIN · Finance (costos, distribución y rentabilidad)

> Módulo de código `app/Modules/Finance` · clave de permiso `finance` · código `FIN`.
> Fuente: `docs/00-requerimientos.md` secciones 4, 7 (tres importes), 17 (costo de nodos), 20 (reparto SaaS), 21 (comisión real como gasto) y 22 (#12); contrato común de nombres.

## 1. Propósito y bloque

Registra el costo real de cada recurso por periodo (reseller, VPS, cuenta cloud, dominio, licencias, comisiones de pasarela, horas de soporte) y lo reparte entre los servicios que lo usan, para medir rentabilidad por cliente, servicio, proveedor, país, marca y técnico. Separa facturado, cobrado y reconocido, y proyecta la caja.

- **Bloque:** E. Facturación y cobro.
- **Depende de:** BIL (facturado y cobrado), INV, CLD, SAA (datos de uso), SRV, PRV, WRK (horas), CFG.
- **Dependen de él:** DSH (indicadores financieros), CUS (pestaña de rentabilidad), SAL (comisiones de afiliados registradas como costo).

## 2. Alcance

**Incluye**
- Registro de costos por recurso o cuenta de proveedor y periodo, con moneda original (cualquier ISO 4217); carga manual o desde conectores y facturas de proveedor; comisiones reales de pasarela (en el pago con tarjeta, estimadas al validar el pago y reemplazadas por la real al conciliar la liquidación de la pasarela, RN-BIL-063); horas de soporte valorizadas; comisiones de afiliados.
- Distribución de costos compartidos con métodos: por recursos, porcentaje, consumo y manual; la suma repartida iguala el costo sin perder céntimos.
- Reparto del costo de arquitectura compartida entre instancias SaaS por usuarios activos, almacenamiento o porcentaje fijo.
- Reparto del costo de nodos propios entre sus clientes.
- Reportes de rentabilidad por cliente, servicio, proveedor, país y marca, filtrables por periodo y moneda y exportables.
- Ingreso facturado, cobrado y reconocido (prorrateado en el periodo del servicio).
- Proyección de caja basada en suscripciones activas y costos por vencer.
- Rentabilidad por técnico y horas registradas contra facturadas.

**No incluye**
- Emisión de documentos y pagos (BIL).
- Contabilidad general, libros electrónicos o asientos (fuera de alcance; el contador externo exporta).

## 3. Entidades

| Tabla | Campos clave | Notas |
|---|---|---|
| `costs` | kind (`provider_recurring`/`provider_one_time`/`license`/`payment_fee`/`other`), resource_id, provider_account_id, provider_bill_id, payment_id, period_month (mes), amount_minor, cost_currency, description, allocation_method (`resources`/`percentage`/`usage`/`manual`/`none`) | Moneda original |
| `cost_allocations` | cost_id, service_id, saas_instance_id, amount_minor, cost_currency, basis | Suma = costo |

## 4. Casos de uso y flujos

1. **Cargar costo:** finanzas registra costo del periodo por recurso o cuenta (o se crea desde una factura de proveedor, un pago con comisión o horas de WRK). La comisión de un pago con tarjeta se crea con `costs.kind = payment_fee` y `payment_id`, y BIL la corrige al conciliar la liquidación; un reembolso o contracargo no borra la comisión ya cobrada por la pasarela.
2. **Distribuir:** elegir método; por recursos (servicios enlazados al recurso), porcentaje (definido por servicio), consumo (métricas de MAP/SAA) o manual; vista previa; confirmar; el algoritmo de reparto asigna el residuo de redondeo para que la suma sea exacta.
3. **Rentabilidad:** ingreso reconocido del periodo menos costos asignados, por dimensión; conversión con `exchange_rates` a la fecha del documento.
4. **Tres importes:** facturado (documentos emitidos), cobrado (pagos validados aplicados; un contracargo descuenta lo cobrado en la fecha en que ocurre), reconocido (prorrateo diario del periodo de servicio de cada línea).
5. **Proyección de caja:** próximas facturas por suscripciones activas y costos por vencer de cuentas de proveedor y recursos.
6. **Horas:** horas registradas por técnico (WRK) contra horas facturadas o descontadas de bolsas.

## 5. Reglas de negocio clave

La suma de un reparto iguala exactamente el costo, sin perder céntimos (usa el value object de dinero). Los costos conservan su moneda original; los reportes consolidados convierten con el tipo de cambio de la fecha del documento. La comisión real de un medio de pago se registra como gasto aunque se haya trasladado al cliente. El ingreso reconocido se prorratea en el periodo del servicio, no en la fecha de la factura. Un costo ya distribuido solo se puede redistribuir anulando la distribución anterior (queda en auditoría). Costos y márgenes nunca viajan en la API del portal y solo se ven con `finance.cost.view`.

## 6. Estados

- No maneja estados del contrato.

## 7. Permisos

| Código | Rol por defecto |
|---|---|
| `finance.cost.view` | admin, finance, external_accountant (lectura); sales y support no |
| `finance.cost.create` / `update` / `delete` / `export` | admin, finance |
| `finance.cost_allocation.view` / `create` | admin, finance (anular una distribución usa `finance.cost.update`) |
| `finance.profitability.view` | admin, finance, external_accountant (exportar reportes usa `finance.cost.export`) |

## 8. Pantallas

### P-FIN-01 · Costos
- **Propósito:** registrar y revisar costos por recurso y periodo.
- **Rol principal:** finance
- **Columnas:** periodo, origen, recurso o cuenta, proveedor, monto y moneda, método, distribuido (sí/no), descripción.
- **Filtros:** periodo, proveedor, tipo de origen, sin distribuir, moneda.
- **Acciones:** Registrar costo → `finance.cost.create`; Distribuir → `finance.cost_allocation.create`; Exportar → `finance.cost.export`.
- **Vacío / error:** "Sin costos en el periodo"; advertencia de recursos con costo de referencia pero sin costo registrado.

### P-FIN-02 · Distribución de costo
- **Propósito:** repartir un costo compartido entre servicios o instancias.
- **Rol principal:** finance
- **Campos:** costo origen, método, base por servicio/instancia (recursos, porcentaje, consumo o monto manual), vista previa con montos y residuo asignado, total.
- **Filtros:** no aplica.
- **Acciones:** Vista previa → `finance.cost_allocation.view`; Confirmar → `finance.cost_allocation.create`; Anular distribución → `finance.cost.update`.
- **Vacío / error:** porcentajes que no suman 100 → 422; sin servicios enlazados al recurso → mensaje con enlace a INV.

### P-FIN-03 · Rentabilidad
- **Propósito:** margen por cliente, servicio, proveedor, país y marca.
- **Rol principal:** admin
- **Columnas:** dimensión, ingreso reconocido, costo asignado, margen, margen %, moneda de reporte.
- **Filtros:** periodo, moneda de reporte, marca, país, proveedor, cliente.
- **Acciones:** Exportar → `finance.cost.export`; Ver detalle de costos → `finance.cost.view`.
- **Vacío / error:** "Sin datos en el periodo"; aviso si faltan tipos de cambio de alguna fecha.

### P-FIN-04 · Facturado, cobrado y reconocido
- **Propósito:** no confundir caja con ingreso.
- **Rol principal:** finance
- **Columnas:** periodo, facturado, cobrado, reconocido, por moneda y consolidado.
- **Filtros:** periodo, marca, moneda.
- **Acciones:** Exportar → `finance.cost.export`.
- **Vacío / error:** "Sin movimientos"; error de carga con reintento.

### P-FIN-05 · Proyección de caja
- **Propósito:** proyectar ingresos y costos próximos.
- **Rol principal:** admin
- **Columnas:** semana o mes, ingresos esperados (renovaciones), costos por vencer (proveedores, recursos), neto, por moneda.
- **Filtros:** horizonte, marca, moneda.
- **Acciones:** Exportar → `finance.cost.export`.
- **Vacío / error:** "Sin suscripciones activas"; error de carga con reintento.

### P-FIN-06 · Horas y rentabilidad por técnico
- **Propósito:** comparar horas registradas contra facturadas por técnico y cliente.
- **Rol principal:** admin
- **Columnas:** técnico, horas registradas, facturables, facturadas o descontadas de bolsa, no facturadas, costo de horas, ingreso asociado.
- **Filtros:** periodo, técnico, cliente.
- **Acciones:** Exportar → `finance.cost.export`; Ver registros de horas → `work.time_entry.view`.
- **Vacío / error:** "Sin horas registradas"; error de carga con reintento.

## 9. Eventos y jobs

- **Emite:** `CostRecorded`, `CostAllocated`.
- **Escucha:** `PaymentValidated` (BIL, con `fee_minor`) → costo de comisión; `ProviderBillLoaded` (BIL) → costo; `TimeEntryApproved` (WRK) → costo de mano de obra; `ReferralCommissionSettled` (SAL) → costo.
- **Jobs:** `RecognizeRevenue` (diario); `SuggestMonthlyCosts` (mensual, copia costos recurrentes conocidos como borrador).

## 10. Integraciones y conectores

- Costos leídos por conectores: DigitalOcean (facturación), AWS Cost Explorer, Azure Cost Management, exportación de facturación de Google Cloud.
- Tipo de cambio de BIL.

## 11. Ajustes administrables

- `finance.labor_hour_cost` (costo hora por técnico o general)
- `billing.exchange_rate.source`

## 12. Historias del backlog

- Registro de costos por recurso y periodo
- Distribución de costos compartidos
- Reportes de rentabilidad
- Ingreso facturado, cobrado y reconocido
- Proyección de caja y renovaciones
- Reparto del costo de arquitectura compartida
- Conciliación de liquidaciones de la pasarela

## 13. Criterios de terminado y pruebas obligatorias

- Repartir 100.00 entre 3 servicios da 33.34 + 33.33 + 33.33 (suma exacta) en las unidades menores correspondientes.
- Reparto por usuarios activos de 3 instancias SaaS iguala el costo de la arquitectura.
- La comisión real de un pago con tarjeta, al conciliar la liquidación, reemplaza a la estimada en el costo `payment_fee` sin duplicarlo.
- Un pago PayPal validado con comisión genera un costo de comisión.
- Ingreso reconocido de una factura anual se reparte en 12 meses.
- Sin `finance.cost.view`, ninguna respuesta del panel incluye costos ni márgenes; el portal nunca.
- Reporte consolidado usa el tipo de cambio de la fecha del documento.

## 14. Preguntas abiertas

- Costo hora de los técnicos para valorizar horas (derivada; el kit pide rentabilidad por técnico pero no fija cómo se valoriza la hora).

## Anexo: nombres fuera del contrato

- Permiso `finance.profitability.view` sobre una entidad sin tabla (ya existe en `permissions.json`).
- Ajuste `finance.labor_hour_cost`.
