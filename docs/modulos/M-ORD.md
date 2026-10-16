# M-ORD · Orders (pedidos y aprovisionamiento)

> Módulo de código `app/Modules/Orders` · clave de permiso `orders` · código `ORD`.
> Fuente: `docs/00-requerimientos.md` secciones 6 (capacidades), 10 (idempotencia y máquinas de estado), 21 ("Del WhatsApp al sistema"), 24 (conversión), 25 (compra en línea de servicios simples), 26 (webs en WordPress y página de agradecimiento) y 27 (entradas desde `[hub_whois]` y `[hub_servidores]`); contrato común de nombres.

## 1. Propósito y bloque

Registra el pedido del cliente nuevo o de un servicio adicional desde ventas y lo lleva por aprobación, validación de pago, aprovisionamiento, pruebas y activación, notificando en cada paso. El aprovisionamiento es automático cuando el conector lo permite y manual asistido cuando no, con reintentos controlados y revisión humana.

Desde docs/00 §25 también lleva la **compra en línea** de los productos marcados "venta en línea" (hosting compartido, dominios, SSL, correo): carrito desde la web de cualquier marca, dominio a registrar, transferir o propio, cupón, cuenta y términos en el sistema central, pago con tarjeta, PayPal o voucher y, con el pago validado, el pedido, la factura y el aprovisionamiento automáticos. El resto de productos sigue por ventas ("Solicitar cotización").

- **Bloque:** D. Ventas.
- **Depende de:** SAL, CUS, CAT, CTR, SRV, INV (y demás módulos técnicos por interfaz), DOM (disponibilidad y registro), BIL (pago, cupones, factura), WCN (sitio WordPress de origen, aceptación de documentos legales, página de agradecimiento), WRK (tareas), AUT.
- **Dependen de él:** SRV (activación), BIL (factura inicial), PRT (pago de la compra y mis pedidos), DSH.

## 2. Alcance

**Incluye**
- Pedido de cliente nuevo desde ventas (reemplaza el aviso por WhatsApp) y pedido desde la conversión de prospecto o cotización.
- Líneas del pedido desde catálogo (incluye paquetes: un servicio por componente).
- Máquina de estados con revisión humana, validación de pago y autorización como estados reales.
- Notificación a finanzas, soporte y, si el servicio es complejo, a documentación; creación de tareas de soporte.
- Bloqueo de activación si un producto "requiere contrato" y no hay contrato vigente.
- Aprovisionamiento por línea: automático vía conector (con `capabilities()`) o manual con tareas y lista de verificación; cada intento en `provisioning_runs`.
- Reintentos controlados (máximo 3 en la cola `provisioning`), verificación previa de existencia del recurso y paso a revisión humana.
- Detección diaria de inconsistencias: servicios sin facturar, servicios sin contrato y recursos sin cliente; cada hallazgo puede generar tarea.
- Compra en línea (docs/00 §25): carrito público por marca de origen con plan y ciclo, dominio (registrar con consulta de disponibilidad, transferir o propio), cupón y total en PEN o USD; compra confirmada con sesión (`checkout_sessions`) con verificación de correo, captcha, términos, límite de compras de cliente nuevo y revisión manual de compras atípicas; pago con tarjeta, PayPal o voucher; con el pago validado, pedido `online`, factura, cuenta en el nodo con capacidad, registro del dominio y correo de bienvenida.
- Aviso de carrito abandonado solo a quien aceptó comunicaciones comerciales.
- Entradas al carrito desde los shortcodes de docs/00 §27: `[hub_whois]` (dominio a registrar o transferir según `cart_items.domain_action`, con la marca y el sitio de origen; la disponibilidad se vuelve a consultar antes de cobrar) y `[hub_servidores]` (plan, ciclo, sistema operativo en `cart_items.config` y complementos como líneas hijas con `parent_item_id`; el carrito recalcula los precios y su total coincide con el del configurador, RN-WCN-019).

**No incluye**
- Compra en línea de productos sin la marca "venta en línea" (VPS, cloud, SaaS, servicios con contrato): muestran "Solicitar cotización" y entran al CRM (SAL).
- Antifraude externo o puntuación de riesgo de terceros: los controles son los de docs/00 §25 (correo verificado, captcha, límite de cliente nuevo y revisión manual).
- Tarjetas guardadas o cobro recurrente automático.
- Emisión de la factura (BIL) y validación del pago (finanzas en BIL).
- Implementación de conectores (bloque H en cada módulo técnico).

## 3. Entidades

| Tabla | Campos clave | Notas |
|---|---|---|
| `orders` | number, customer_id, brand_id, quote_id, lead_id, status, currency, total_minor, contract_id, invoice_id, requested_by, approved_by, approved_at, payment_validated_at, activated_at, idempotency_key, notes, channel (`sales`/`online`), checkout_session_id | Una máquina de estados; un pedido por compra en línea |
| `order_items` | order_id, product_id, plan_id, bundle_parent_item_id, quantity, unit_price_minor, service_id, config (nodo, servidor, registrador) | Un servicio por línea |
| `provisioning_runs` | order_item_id, attempt, connector, operation, status, idempotency_key, request, external_id, started_at, finished_at, last_error, error_class (`transient`/`credentials`/`validation`/`unknown`) | Un intento por fila |
| `carts` | brand_id, wp_site_id, token_hash, customer_id, user_id, currency, status (`open`/`abandoned`/`converted`/`expired`), coupon_id, subtotal_minor, discount_minor, tax_minor, total_minor, contact_email, attribution, last_activity_at, abandoned_at, abandoned_notice_sent_at, expires_at, converted_at | Anónimo hasta iniciar sesión |
| `cart_items` | cart_id, product_id, plan_id, parent_item_id, quantity, unit_price_minor, currency, domain_name, domain_action (`register`/`transfer`/`existing`), availability_checked_at, config | Precio leído del catálogo |
| `checkout_sessions` | cart_id, customer_id, user_id, brand_id, idempotency_key, status (`open`/`manual_review`/`awaiting_payment`/`awaiting_validation`/`paid`/`completed`/`expired`/`cancelled`), currency, total_minor, snapshot, terms_contract_id, terms_accepted_at, email_verified_at, captcha_verified_at, risk_flags, review_reason, reviewed_by, reviewed_at, payment_method_id, payment_id, order_id, expires_at, paid_at, completed_at | Una compra en curso por carrito; un pedido por compra |

## 4. Casos de uso y flujos

1. **Registrar pedido** (ventas): cliente (nuevo o existente), productos y planes, nodo sugerido (INV), notas → `draft`.
2. **Aprobar** (`approved`): notifica a finanzas (factura inicial) y a soporte; si algún producto requiere contrato, crea o enlaza contrato y avisa a documentación.
3. **Validar pago** (`payment_validated`): al recibir `PaymentValidated` de la factura del pedido (o aprobación explícita del administrador para clientes con crédito).
4. **Aprovisionar** (`provisioning`): por línea, consulta `capabilities()`; automático → crea `provisioning_run` con clave de idempotencia y llama al conector; manual → crea tareas con lista de verificación en WRK y espera su cierre.
5. **Fallo:** error transitorio → reintento con espera; tras 3 intentos o error no transitorio → `manual_review` con alerta; antes de cada reintento de creación se consulta al proveedor si el recurso ya existe.
6. **Probar** (`testing`): soporte verifica sitio, correo y accesos; lista de verificación.
7. **Activar** (`active`): requiere contrato `signed_active` si aplica; SRV activa servicios, envía bienvenida y emite eventos.
8. **Cancelar** (`cancelled`) en cualquier estado previo a `active`, con motivo; `failed` cuando se abandona tras revisión.
9. **Detección de inconsistencias:** job diario genera la lista y permite crear tareas.
10. **Compra en línea** (flujo J de `docs/03`):
    1. En la web WordPress de la marca el visitante elige plan y ciclo en un shortcode del plugin (`[hub_planes]`, `[hub_boton_contratar]`) → carrito del sistema central (`carts`, marca de origen y sitio `wp_site_id`).
    2. Configura el dominio: registrar (consulta de disponibilidad al registrador en el momento), transferir o usar uno propio.
    3. Revisa el carrito, aplica un cupón y ve el total en soles o dólares (precios de `plan_prices` y `domain_tld_prices` de la marca).
    4. Crea su cuenta o inicia sesión en el sistema central (correo verificado, captcha) y acepta la versión vigente de los términos (queda en `legal_acceptances` con la compra) → `checkout_sessions` en `open`, o en `manual_review` si supera el límite de cliente nuevo o una regla de `orders.online.manual_review_rules`.
    5. Paga con tarjeta o PayPal (`awaiting_payment`) o sube el voucher (`awaiting_validation`); el pago se valida por webhook firmado o por finanzas.
    6. Con el pago validado (`paid`), el job `CompletePaidCheckout` crea el pedido `online` (aprobado por el sistema), emite la factura con la marca de origen, aplica el pago y sigue la máquina de pedidos: cuenta de hosting en el nodo con capacidad, registro o transferencia del dominio, correo de bienvenida (`completed`).
    7. El cliente vuelve a la página de agradecimiento del sitio WordPress de origen (`wp_sites.thank_you_url`) con el código del pedido, el importe y la moneda, una sola vez por compra.
11. **Revisión manual de compras atípicas:** finanzas o admin aprueban (`open`, el cliente recibe el enlace para pagar) o rechazan (`cancelled`) antes de cualquier cobro.
12. **Carrito abandonado:** `DetectAbandonedCarts` marca abandonados los carritos sin actividad (`orders.online.abandoned_cart_after_hours`) y envía un único aviso solo si el contacto aceptó comunicaciones comerciales.

## 5. Reglas de negocio clave

Cada transición valida permiso, registra auditoría y emite evento; "revisión humana", "validación de pago" y "autorización" son estados reales. Crear un pedido y cada aprovisionamiento exigen `Idempotency-Key`; un reintento no crea dos recursos. Un pedido no pasa a `active` si contiene productos "requiere contrato" sin contrato vigente. Un pago reportado no valida el pedido: solo el pago validado por finanzas. Las escrituras en proveedores solo se reintentan con clave de idempotencia o consultando antes el estado. Sin capacidad del conector, nunca se falla: se crea tarea manual asistida y el pedido queda esperando acción manual. En la compra en línea (RN-ORD-001 a RN-ORD-016): solo productos con `sellable_online` de la marca; precio siempre del catálogo; dominio a registrar solo tras consultar la disponibilidad; correo verificado, captcha y términos antes de pagar; una compra genera un solo pedido; el pedido y la factura nacen con el pago validado (nunca con un voucher `reported`); las compras atípicas se revisan antes de cobrar; el aviso de carrito abandonado exige consentimiento; confirmar exige aceptar la versión vigente de los términos de la marca y de cada tipo de servicio del carrito (`legal_acceptances`, WCN) y la compra en línea no se activa sin documentos legales vigentes ni Libro de Reclamaciones habilitado (LRC); al completar la compra el cliente vuelve una sola vez a la página de agradecimiento del sitio WordPress de origen con el pedido, el importe y la moneda, donde los píxeles de WordPress registran la conversión.

## 6. Estados

- `orders.status`: `draft`, `approved`, `payment_validated`, `provisioning`, `testing`, `active`, `manual_review`, `failed`, `cancelled`.
  - `draft → approved → payment_validated → provisioning → testing → active`; `provisioning → manual_review → provisioning|failed`; `* (antes de active) → cancelled`.
- `provisioning_runs.status`: `running`, `succeeded`, `failed`.
- `carts.status`: `open`, `abandoned`, `converted`, `expired` (máquina 22 de `docs/03`).
- `checkout_sessions.status`: `open`, `manual_review`, `awaiting_payment`, `awaiting_validation`, `paid`, `completed`, `expired`, `cancelled` (máquina 23 de `docs/03`).

## 7. Permisos

| Código | Rol por defecto |
|---|---|
| `orders.order.view` | admin, sales, finance, support, documentation |
| `orders.order.create` / `update` (incluye cancelar, con confirmación) | admin, sales |
| `orders.order.approve` | admin, sales (aprobación comercial) |
| `orders.order.export` | admin, sales, finance |
| `orders.provisioning_run.view` | admin, support |
| `orders.provisioning_run.create` (reintentar / ejecutar) | admin, support |
| `orders.cart.view` | admin, sales, finance |
| `orders.checkout_session.view` | admin, sales, finance, support |
| `orders.checkout_session.approve` (aprobar o rechazar compras atípicas) | admin, finance |
| `orders.checkout_session.update` (reintentar la creación del pedido de una compra pagada) | admin, finance |
| `portal.order.create` / `portal.order.view` | customer_admin; customer_user si su administrador se lo otorga (ver) |

El carrito, el alta de cuenta y la consulta de disponibilidad son públicos (`/public/carts`, `/public/accounts`, `/public/domain-availability`), con límites por IP y captcha.

El paso a `payment_validated` lo provoca `billing.payment.validate` en BIL; la excepción manual requiere `orders.order.approve` del administrador.

## 8. Pantallas

### P-ORD-01 · Pedidos
- **Propósito:** seguir todos los pedidos y su estado.
- **Rol principal:** sales
- **Columnas:** número, cliente, marca, total y moneda, estado, requiere contrato (estado del contrato), factura y estado de pago, creado por, días en el estado.
- **Filtros:** estado, marca, vendedor, requiere contrato, en revisión manual.
- **Acciones:** Nuevo pedido → `orders.order.create`; Exportar → `orders.order.export`.
- **Vacío / error:** vacío con botón crear; error de carga con reintento.

### P-ORD-02 · Nuevo pedido
- **Propósito:** registrar un cliente nuevo y su pedido en un solo asistente.
- **Rol principal:** sales
- **Campos:** paso 1 cliente (buscar o crear con duplicados); paso 2 productos/planes/paquetes, precio, ciclo, moneda; paso 3 destino sugerido (nodo con capacidad, registrador) y notas para soporte; resumen con avisos (requiere contrato, sin contacto de facturación).
- **Filtros:** no aplica.
- **Acciones:** Guardar borrador → `orders.order.create`; Enviar a aprobación → `orders.order.update`.
- **Vacío / error:** 422 por paso; aviso si el producto requiere contrato; doble clic protegido por `Idempotency-Key`.

### P-ORD-03 · Detalle de pedido
- **Propósito:** ver la línea de tiempo del pedido y operar sus transiciones.
- **Rol principal:** support
- **Campos:** línea de estados con fecha y actor, líneas con modo de aprovisionamiento y servicio creado, intentos de aprovisionamiento con error clasificado, tareas manuales, contrato, factura y pago, notificaciones enviadas.
- **Filtros:** línea.
- **Acciones:** Aprobar → `orders.order.approve`; Iniciar aprovisionamiento → `orders.provisioning_run.create`; Marcar pruebas superadas → `orders.order.update`; Activar → `orders.order.update`; Cancelar → `orders.order.update`.
- **Vacío / error:** solo transiciones válidas visibles; "Activar" deshabilitado con explicación si falta contrato vigente; 409 si el estado cambió.

### P-ORD-04 · Revisión manual
- **Propósito:** recuperar pedidos con fallos de aprovisionamiento.
- **Rol principal:** support
- **Columnas:** pedido, línea, conector, operación, intentos, último error y clase, existe en el proveedor (resultado de la verificación), desde cuándo.
- **Filtros:** conector, clase de error.
- **Acciones:** Reintentar → `orders.provisioning_run.create`; Pasar a manual (crear tareas) → `orders.order.update`; Vincular recurso existente → `orders.order.update`; Marcar fallido → `orders.order.update`.
- **Vacío / error:** "Sin pedidos en revisión"; reintentar sin clave de idempotencia nueva → 409.

### P-ORD-05 · Detección de inconsistencias
- **Propósito:** cerrar fugas de ingresos.
- **Rol principal:** admin
- **Columnas:** tipo (servicio sin facturar, sin contrato, recurso sin cliente, cuenta no registrada, dominio huérfano), entidad, cliente, detectado el, tarea.
- **Filtros:** tipo, marca, con/sin tarea.
- **Acciones:** Crear tarea → `work.task.create`; Abrir entidad → según módulo; Exportar → `orders.order.export`.
- **Vacío / error:** "Sin inconsistencias hoy"; muestra fecha de la última corrida y si falló.

### P-ORD-06 · Carritos
- **Propósito:** ver carritos abiertos, abandonados y convertidos para seguimiento comercial.
- **Rol principal:** sales
- **Columnas:** marca de origen, sitio, cliente (si inició sesión), líneas, total y moneda, cupón, estado, última actividad, aviso de abandono enviado, consentimiento comercial.
- **Filtros:** marca, estado, con cliente, rango de fechas.
- **Acciones:** Abrir detalle → `orders.cart.view`; Crear prospecto desde el carrito → `sales.lead.create`.
- **Vacío / error:** "Sin carritos en el periodo"; el correo se muestra enmascarado si no hay consentimiento.

### P-ORD-07 · Compras en línea y revisión manual
- **Propósito:** seguir las compras en línea y decidir las atípicas antes del cobro.
- **Rol principal:** finance
- **Columnas:** cliente, marca, total, estado, motivos de revisión, correo verificado, medio de pago, pago, pedido, días en el estado.
- **Filtros:** estado (en revisión, esperando pago, esperando validación, pagada sin pedido), marca, cliente nuevo.
- **Acciones:** Aprobar compra → `orders.checkout_session.approve`; Rechazar compra → `orders.checkout_session.approve`; Reintentar creación del pedido → `orders.checkout_session.update`; Validar voucher → `billing.payment.validate`.
- **Vacío / error:** "Sin compras en revisión"; aprobar sin motivo → 422; una compra pagada sin pedido tras el job resaltada con alerta.

### P-ORD-08 · Carrito y configuración del dominio
- **Propósito:** que el visitante arme su compra desde la web de cualquier marca.
- **Rol principal:** público
- **Campos:** plan y ciclo, dominio (registrar con verificador de disponibilidad y sugerencias, transferir con código, usar uno propio), complementos en venta en línea, cupón, moneda, subtotal, descuento, impuestos y total.
- **Filtros:** no aplica.
- **Acciones:** Agregar al carrito → público; Aplicar cupón → público; Continuar con la cuenta → público.
- **Vacío / error:** "Tu carrito está vacío" con enlace a planes; dominio no disponible con sugerencias; registrador sin respuesta → "No pudimos verificar el dominio, intenta de nuevo" (nunca se da por disponible).

### P-ORD-09 · Crear cuenta o iniciar sesión
- **Propósito:** identificar al cliente en el sistema central sin perder el carrito ni la marca de origen.
- **Rol principal:** público
- **Campos:** nombre o razón social, correo, contraseña, teléfono, país, documento (RUC, DNI u otro), aceptación de privacidad, consentimiento comercial opcional, captcha; o inicio de sesión.
- **Filtros:** no aplica.
- **Acciones:** Crear cuenta → público; Iniciar sesión → público; Reenviar correo de verificación → público.
- **Vacío / error:** correo o documento ya registrado → invita a iniciar sesión; captcha inválido → 422; límite por IP → 429.

### P-ORD-10 · Confirmación y pago de la compra
- **Propósito:** aceptar términos y pagar la compra en el sistema central.
- **Rol principal:** customer_admin
- **Campos:** resumen congelado, términos vigentes de la marca y de cada tipo de servicio del carrito (con versión y enlace al texto), estado del correo verificado, medios de pago con recargo (tarjeta, PayPal, transferencia), formulario de la pasarela, carga del voucher, estado de la compra.
- **Filtros:** no aplica.
- **Acciones:** Aceptar términos y confirmar → `portal.order.create`; Pagar con tarjeta → `portal.order.create`; Pagar con PayPal → `portal.order.create`; Enviar voucher → `portal.order.create`; Cancelar compra → `portal.order.create`.
- **Vacío / error:** correo sin verificar → pago bloqueado con aviso; compra en revisión → mensaje "Estamos revisando tu pedido"; pago rechazado → vuelve a `open` con el motivo; doble envío protegido por `Idempotency-Key`.

### P-ORD-11 · Mis pedidos
- **Propósito:** que el cliente vea sus pedidos y en qué paso está cada uno.
- **Rol principal:** customer_admin
- **Columnas:** número, fecha, canal, total, estado, factura, servicios creados.
- **Filtros:** estado.
- **Acciones:** Ver detalle → `portal.order.view`; Pagar compra pendiente → `portal.order.create`.
- **Vacío / error:** "Aún no tienes pedidos"; sin notas internas ni intentos de aprovisionamiento.

## 9. Eventos y jobs

- **Emite:** `OrderCreated`, `OrderApproved`, `OrderPaymentValidated`, `OrderProvisioningRequested`, `ProvisioningFailed`, `OrderManualReviewRequired`, `OrderActivated`, `OrderCancelled`, `InconsistencyDetected`.
- **Escucha:** `PaymentValidated` (BIL), `ContractSigned` (CTR), `TaskCompleted` (WRK, tareas manuales), `HostingAccountCreated` (INV), `LeadWon` (SAL).
- **Jobs:** `RunProvisioning` (cola `provisioning`, 3 reintentos); `DetectOrphans` (diario: servicios sin facturar, sin contrato, recursos sin cliente; consolida hallazgos de INV, DOM, CLD).
- **Compra en línea — emite:** `CartCreated`, `CartAbandoned`, `CartRecovered`, `CartConverted`, `CartExpired`, `CheckoutSessionStarted`, `CheckoutSessionReviewRequired`, `CheckoutSessionApproved`, `CheckoutSessionPaymentStarted`, `CheckoutSessionPaymentReported`, `CheckoutSessionPaymentFailed`, `CheckoutSessionPaid`, `CheckoutSessionCompleted`, `CheckoutSessionExpired`, `CheckoutSessionCancelled`. **Escucha:** `PaymentCheckoutApproved`, `PaymentCheckoutDeclined`, `PaymentValidated`, `PaymentRejected` (BIL) de pagos enlazados a una compra. **Jobs:** `CompletePaidCheckout` (cola `critical`), `ExpireCheckoutSessions` (cada 15 minutos; consulta la pasarela antes de vencer), `DetectAbandonedCarts` (cada hora).

## 10. Integraciones y conectores

- Conectores por interfaz de los módulos técnicos: `HostingConnector` (crear cuenta), `RegistrarConnector` (registrar/renovar), y los que declaren capacidad de alta.
- Sin capacidad: tareas manuales en WRK con plantilla por producto.
- `RegistrarConnector::checkAvailability` y `register` (DOM; `docs/08`, ficha 31) para el verificador de la web y el registro tras el pago; sin API, el registro queda como tarea asistida y el pedido en `manual_review`.
- Pasarela de tarjetas y PayPal (BIL) con intentos enlazados a la compra (`payment_checkouts.checkout_session_id`); captcha del proveedor de `orders.online.captcha_provider`.

## 11. Ajustes administrables

- El máximo de reintentos (3) es de la cola `provisioning` (docs/00, sección 10). Lee `system.daily_jobs_time` para `DetectOrphans`.
- Compra en línea: `orders.online.enabled`, `orders.online.new_customer_max_open_checkouts`, `orders.online.new_customer_window_days`, `orders.online.manual_review_rules`, `orders.online.checkout_expiry_hours`, `orders.online.voucher_validation_alert_hours`, `orders.online.cart_expiry_days`, `orders.online.abandoned_cart_after_hours`, `orders.online.abandoned_cart_notice_enabled`, `orders.online.captcha_provider`, `orders.online.domain_check_limit_per_ip_per_hour`.
- Lee `complaints.response_days` (LRC) y los documentos legales vigentes de la marca (WCN) para permitir activar la compra en línea de una marca.

## 12. Historias del backlog

- Flujo de pedido completo
- Aprovisionamiento manual o automático
- Reintentos controlados y revisión humana
- Detección de inconsistencias
- Pedido de cliente nuevo desde ventas
- Conversión a cliente y pedido
- Conversión de cotización a contrato y pedido
- Productos marcados para venta en línea
- Carrito con plan, ciclo y cupón
- Configuración del dominio con consulta de disponibilidad
- Cuenta, verificación de correo y aceptación de términos
- Pago de la compra con tarjeta, PayPal o voucher
- Pedido, factura y aprovisionamiento tras el pago validado
- Controles antifraude de la compra en línea
- Revisión manual de compras atípicas
- Aviso de carrito abandonado con consentimiento
- Solicitar cotización para productos sin venta en línea
- Aceptación registrada de la versión vigente de los términos
- Página de agradecimiento con conversión tras la compra

## 13. Criterios de terminado y pruebas obligatorias

- E2E (Playwright) del flujo completo de pedido de cliente nuevo hasta `active`.
- Un reintento de creación de cuenta de hosting no crea dos cuentas (prueba obligatoria del kit).
- Tras 3 intentos fallidos el pedido pasa a `manual_review` y se alerta.
- Pedido con producto "requiere contrato" sin contrato vigente no puede activarse.
- El pedido notifica a finanzas y crea las tareas de soporte al aprobarse.
- Un pago reportado no mueve el pedido a `payment_validated`.
- E2E de la compra en línea: web de una marca distinta de AlojamientoPlus → carrito con hosting y dominio nuevo → cuenta → pago con tarjeta simulado → pedido `online`, factura con la marca de origen, cuenta en el nodo con capacidad, dominio registrado (simulado) y correo de bienvenida.
- Una compra pagada genera un solo pedido aunque el webhook llegue dos veces o el job se reintente (`orders.checkout_session_id` único).
- Un voucher `reported` no crea pedido ni factura; al validarlo sí.
- Una compra que supera el límite de cliente nuevo o una regla de revisión queda en `manual_review` sin crear intento de pago.
- Un producto sin `sellable_online` no entra al carrito (422) y la web lo muestra con "Solicitar cotización".
- El aviso de carrito abandonado no se envía sin consentimiento comercial y se envía una sola vez.
- Confirmar una compra sin aceptar la versión vigente de los términos → 422; la compra deja una fila en `legal_acceptances` por versión aceptada.
- `orders.online.enabled` no se activa para una marca sin términos y privacidad vigentes o con `complaints.response_days` en `null`.
- Al completar la compra, el cliente vuelve a la página de agradecimiento del sitio WordPress de origen con el pedido, el importe y la moneda una sola vez; el carrito y el portal no cargan scripts de terceros.
- La página de confirmación emite un solo `purchase` con el importe y la moneda del pedido aunque se recargue, y solo a integraciones con consentimiento.

## 14. Preguntas abiertas

- Si un cliente con crédito puede pasar a aprovisionamiento antes del pago validado (excepción del administrador): el kit no lo prohíbe ni lo define (derivada).
- Montos y reglas de revisión manual de compras en línea y servicio de captcha (`docs/11`, D-24 y D-26).
- Qué hacer si llega un pago aprobado para una compra ya vencida (propuesta del kit: se reabre la compra y sigue a `paid`; si el carrito cambió de precio, finanzas decide con alerta).
