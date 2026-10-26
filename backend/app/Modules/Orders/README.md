# Módulo Orders (M-ORD) — franja MVP

Alcance de la demostración del 23-10-2026. Doc: `docs/modulos/M-ORD.md`, máquina 7 de `docs/03-maquinas-de-estado.md`.

## Hecho

- `GET /api/v1/admin/orders` (`orders.order.view`): filtros `status`, `customer_id`, `brand_id`, `currency`, `created_from`, `created_to`, `q` (número o cliente), cursor.
- `POST /api/v1/admin/orders` (`orders.order.create`, `Idempotency-Key` obligatoria): cliente existente y activo (Customers), líneas de planes activos del catálogo de la marca; precio unitario congelado de `plan_prices` vigente en la moneda del pedido (por defecto la del cliente); cargo de instalación como línea aparte si existe; correlativo `PED-000123`; `OrderCreated`.
- Totales en céntimos sin flotantes (`OrderTotals`): línea = cantidad × precio (half-up), IGV sobre la base gravada del total con la tasa vigente de `tax_rates` (RN-BIL-023/026); líneas de producto `export_eligible` a cliente `tax_treatment = export` sin IGV (RN-BIL-008). Solo se guarda `orders.total_minor`; `subtotal_minor`, `tax_minor` y `tax_rate_percent` se derivan de las líneas (`order_items.config.tax`).
- `POST …/{id}/approve` (`orders.order.approve`, Idempotency-Key): `draft → approved`, `approved_by/at`, `OrderApproved` (para SRV y BIL: ids de líneas, total, moneda, marca, `requiresContract`).
- `POST …/{id}/cancel` (`orders.order.update`, Idempotency-Key, `reason` obligatorio, va a la auditoría): `draft|approved → cancelled`, `OrderCancelled`. Otra transición → 409 `invalid_transition`; `version` opcional → 409 `version_conflict`.
- `GET …/{id}`: ficha con líneas y resumen del cliente.

## Pendiente

- Estados `payment_validated` → `active` (oyente de BIL, aprovisionamiento, pruebas, revisión manual), `provisioning_runs`, carritos y compra en línea.
- Edición de un borrador (líneas y notas), exportación, alta desde cotización/prospecto, nodo sugerido.
- Contrato obligatorio al aprobar: docs/03 lo exige para productos "requiere contrato" y M-ORD §4 dice "crea o enlaza"; CTR no existe, hoy se aprueba y `OrderApproved.requiresContract` lo informa (decisión D-xx pendiente).
- Quién aprueba: M-ORD §7 dice admin y sales; docs/03 §7 dice admin o finance; roles.json hoy solo admin. Decisión D-xx pendiente (no se cambió roles.json).
- Columna para el motivo de anulación (hoy solo en `audit_events.metadata`), y subtotal/impuesto persistidos en `orders` si BIL los necesita.
- `tax_rates` la administrará BIL; el demo (`hub:demo:catalog`) siembra IGV 18 %.
- Al aprobar, Services crea los servicios (`order_items.service_id`) y Billing el comprobante en borrador (ver sus README). Al anular (`OrderCancelled`, revisión 22-10), Services cancela los servicios `pending` del pedido y Billing descarta el borrador o anula el comprobante emitido sin pagos. El pedido no pasa a `active` al activar los servicios (pendiente).
- Panel: `frontend/apps/admin/src/views/pages/pedidos/` conecta listado con filtros y cursor, alta para un cliente real con planes del catálogo y ficha con aprobar/anular. Pendiente: edición de borradores, vista previa de totales en el servidor (hoy solo subtotal estimado sin IGV antes de crear), y los pasos de servicio/factura/pago (`TODO(services)`, `TODO(billing)`).
