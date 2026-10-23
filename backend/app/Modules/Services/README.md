# Módulo Services (M-SRV) — franja MVP

Alcance de la demostración del 23-10-2026. Doc: `docs/modulos/M-SRV.md`, máquinas 1 y 2 de `docs/03-maquinas-de-estado.md`.

## Hecho

- **Alta desde pedido:** oyente síncrono de `OrderApproved` (`CreateServicesFromOrder`, tras el commit del pedido) crea un servicio `pending` por línea (la de instalación no genera servicio): cliente, marca, producto, plan, código `SRV-000123`, `order_items.service_id`, historial (`service_status_history`, `trigger_source = order`), auditoría y `ServiceCreated`. Idempotente (una línea con servicio se omite).
- **Precio y fechas:** `services.custom.order` guarda el precio congelado de la línea (cantidad, precio unitario en céntimos, moneda), el ciclo y la fecha de inicio (= aprobación, mismo periodo que la factura inicial). `commercial_due_date` = inicio + ciclo (`Support/Cycle`, meses sin desbordar; `one_time` sin vencimiento).
- **Transiciones manuales** (`ServiceLifecycle`, cada una con `Idempotency-Key`, `version` opcional → 409 `version_conflict`, otra transición → 409 `invalid_transition`):
  - `POST /api/v1/admin/services/{id}/activate` (`services.service.update`): `pending → active`. Llama a `Contracts\ServiceProvisioner` (hoy `ManualProvisioner`: sin conector, el personal confirma el recurso), registra `provisioning_runs` y, si el ciclo es recurrente, crea la suscripción `active` en la misma transacción (RN-SRV-001) con el precio congelado y `next_invoice_date` = vencimiento comercial. Producto "requiere contrato" → 409 `contract_required` (CTR no existe). `ServiceActivated`.
  - `…/suspend` y `…/reactivate` (`services.service.suspend`, motivo obligatorio): `active ⇄ suspended`, suscripción `paused`/`active`.
  - `…/cancel` (`services.service.delete`, motivo obligatorio): `pending|active|suspended → cancelled`, suscripción `cancelled`.
- `GET /api/v1/admin/services` (`services.service.view`): filtros `status`, `customer_id`, `brand_id`, `product_id`, `order_id` (servicios del pedido de origen), `due_from`, `due_to`, `q` (código, etiqueta o cliente), cursor. `GET …/{id}`: ficha con suscripción e historial.
- **Portal:** `GET /api/v1/portal/services` y `…/{id}` (`user.type:customer`, `portal.service.view`): solo los del cliente del contacto de la sesión (`Customers\Support\PortalCustomer`); uno ajeno → 404; sin notas internas, pedido ni motivo/origen del historial.
- `HUB_SERVICES_AUTO_ACTIVATE=true` (`hub.services.auto_activate`): activa con el aprovisionamiento manual al aprobar el pedido (modo demostración; los que requieren contrato quedan `pending`).
- Pruebas: `tests/Feature/Services/ServicesTest.php`.

## Pendiente

- Conectores reales de aprovisionamiento (WHM/cPanel, registradores, cloud vía INV), reintentos en cola `provisioning`, tarea manual en WRK cuando el conector no tiene la capacidad, `service_resources`, correo de bienvenida con enlace de un solo uso.
- Docs/03 activa con `OrderActivated` (pedido en `testing`); ORD aún no tiene esos estados: la activación es manual (o automática con el ajuste anterior). El pedido no cambia de estado al activar.
- `terminated` (respaldo + aprobación), `handed_over`, `SuspendOverdueServices`/`ProposeTerminations`, reactivación por `InvoicePaid`/`PaymentValidated` (Cobranza), exenciones, compromisos de pago, interruptores del cliente, modalidades, campos por tipo de servicio, alta manual (P-SRV-01 "nuevo"), panel de renovaciones, exportación, detección de huérfanos.
- `pending → cancelled` por `OrderCancelled` (hoy el pedido solo se anula en `draft|approved` y los servicios `pending` se cancelan a mano).
- El precio congelado vive en `services.custom.order` hasta crear la suscripción: el esquema no tiene columnas de precio en `services` (decidir D-xx si se crea la suscripción ya en `pending`).
- Panel y portal (vistas): solo el cliente `@hub/api` (`services.ts`); las vistas siguen en modo demo (`TODO(services)` en pedidos).
- Nombres fuera del contrato: ninguno (eventos de M-SRV §9).
