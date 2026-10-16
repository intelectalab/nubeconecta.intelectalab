# M-PRT · Portal del cliente (por marca)

> No es módulo de backend: aplicación React `apps/portal` que consume `/api/v1/portal/...`. Usa los permisos `portal.*` de `permissions.json` (declarados en la API del portal) con los roles `customer_admin` y `customer_user`, siempre filtrados por la organización del cliente; `portal` no es un módulo de backend del contrato.
> Fuente: `docs/00-requerimientos.md` secciones 5 (campos internos, alcance por registro), 8, 9 (pantallas del portal), 15, 16, 21 (panel solo consulta, interruptores, pagos), 24 y 25 (sistema central, compra en línea, asistente, respaldos); contrato común de nombres.

## 1. Propósito y bloque

Da al cliente, bajo la marca que contrató, una vista de consulta de sus proyectos y servicios con consumo, dominios, facturas, pagos, tickets, contratos y documentos, más las acciones permitidas: pagar en línea o enviar voucher, abrir tickets, entrar a su cPanel con un clic, operaciones de dominio con confirmación y acciones con interruptor. Desde docs/00 §25 el portal vive en el sistema central de alojamientoplus.com (subdominio en `system.central_domains`) para todas las marcas, recibe la marca de origen de cada web, lleva el pago de la compra en línea, el asistente con IA y las solicitudes de restauración con el informe de respaldos. Nunca muestra datos internos ni de otra organización.

- **Bloque:** G. Portal del cliente.
- **Depende de:** C (mapa, dominios, correo, SaaS), E (facturas y pagos), F (tickets, base de conocimientos, mantenimientos, restauraciones); además IDN, BRD, CUS, SRV, CTR, AUT, ORD (compra en línea), WCN (documentos legales por aceptar, datos de contacto de la marca, enlace a la ayuda en WordPress) y AIA (asistente).
- **Dependen de él:** ninguno.

## 2. Alcance

**Incluye**
- Acceso seguro: inicio de sesión, MFA opcional y recomendado, recuperación, sesiones y dispositivos; roles por organización.
- Tema, logo, dominio y catálogo de la marca; un cliente con varias marcas ve sus servicios según las reglas de acceso (cada servicio con su marca de origen).
- Resumen, proyectos y servicios con consumo (etiqueta pública y métricas públicas), vencimientos y características básicas.
- Dominios con fechas comerciales y operaciones: contactos, DNS (si el interruptor está activo), cambio de titular y transferencia de salida con confirmación por correo.
- Acceso directo a cPanel con sesión temporal (sin contraseña).
- Solicitud de reinicio de servidor (si el interruptor está activo) con aprobación de soporte.
- Facturas con descarga de PDF/XML, pago en línea con tarjeta de crédito o débito mediante la pasarela local (una o varias facturas, formulario alojado por la pasarela, 3-D Secure, PEN y USD) o con PayPal, mostrando el recargo antes de confirmar, envío de voucher de transferencia; pagos reportados y su estado; estado de cuenta.
- Tickets: abrir, responder, adjuntar, ver estado; solicitudes de alta, ampliación y cancelación (crean ticket u oportunidad).
- Contratos y documentos (versiones enviadas o firmadas, actas, facturas de proveedor adjuntas a refacturación), aceptación de términos.
- Contactos y usuarios de la organización; datos de facturación (cambios fiscales auditados); consentimiento de comunicaciones.
- Notificaciones del portal; mantenimientos e incidentes que le afectan; base de conocimientos pública.
- Páginas públicas de confirmación de operación de dominio y de enlace de un solo uso.
- Sistema central multimarca (docs/00 §25): el cliente que llega desde la web de otra marca ve la identidad que fija `portal.central_identity` de esa marca (por defecto, AlojamientoPlus con la marca de origen en el encabezado); la marca de origen queda en la sesión.
- Compra en línea: confirmación y pago de la compra (tarjeta, PayPal o voucher) y "Mis pedidos" (pantallas P-ORD-10 y P-ORD-11 de M-ORD).
- Asistente con IA de la marca, con lectura de sus propios servicios (P-AIA-07 de M-AIA).
- Respaldos: informe de respaldos por servicio y solicitudes de restauración de sitio, base de datos o buzón con aprobación de soporte (P-PRT-23).
- Textos legales (docs/00 §25): al publicarse una versión nueva de los términos de su marca o de un tipo de servicio que tiene activo, el cliente la ve y la acepta en su siguiente ingreso (P-PRT-24); la aceptación queda en `legal_acceptances`. El pie del portal enlaza los textos legales vigentes, la política de privacidad con su canal de solicitudes de datos personales y el Libro de Reclamaciones de la marca (LRC).
- La base de conocimientos muestra los artículos públicos del sistema y enlaza a la base de conocimientos de la marca en WordPress (`web_connector.kb_url`).

**No incluye**
- Costos, márgenes, nombre del proveedor (salvo ajuste), notas internas, accesos o credenciales.
- Crear buzones u otras acciones de cPanel desde el portal (se hacen dentro de cPanel).
- El carrito y el alta de cuenta (públicos, M-ORD); tarjetas guardadas o cobro automático recurrente.
- Ejecutar restauraciones sin aprobación de soporte o acciones sobre servicios desde el asistente.
- Píxeles y etiquetas de marketing: el sistema no los administra ni los carga en el portal ni en el carrito; los gestiona cada sitio WordPress con sus propios plugins (RN-ORD-016, docs/00 §26).
- Seguridad de la cuenta según la política administrable (docs/00 §26): contraseña con las reglas vigentes, segundo factor por aplicación o por código al correo (obligatorio si la política lo exige para el tipo de usuario cliente o su rol) y dispositivos de confianza.
- Formularios propios para datos de tarjeta: los datos los escribe el cliente en el formulario de la pasarela y nunca pasan por el portal ni por la API.

## 3. Entidades

- Sin tablas propias. Lee y escribe por la API del portal (recursos distintos a los del panel) sobre: `customers`, `contacts`, `communication_consents`, `users`, `user_sessions`, `client_projects`, `project_components`, `component_metrics`, `services`, `domains`, `domain_contacts`, `domain_operations`, `mail_services`, `seat_licenses`, `ssl_certificates`, `saas_instances`, `invoices`, `invoice_items`, `payments`, `payment_methods`, `payment_checkouts`, `provider_bills` (solo el archivo adjunto), `tickets`, `ticket_messages`, `kb_articles`, `contracts`, `contract_versions`, `contract_signatures`, `maintenance_windows`, `incidents` (resumen público), `notification_deliveries` (canal portal), `customer_action_flags`, `one_time_links` y, por docs/00 §25: `checkout_sessions`, `orders` (vista del cliente), `restore_requests`, `backup_policies` y `backup_runs` (informe sin datos internos), `ai_conversations` y `ai_messages`, `legal_documents` y `legal_document_versions` (vigentes) y `legal_acceptances` (solo inserción).

## 4. Casos de uso y flujos

1. **Entrar:** el dominio resuelve la marca; inicio de sesión con MFA si el usuario lo activó.
2. **Consultar servicios y consumo:** proyectos con componentes visibles, etiqueta pública, último valor de consumo y su fecha, estado y vencimiento comercial.
3. **Entrar a cPanel:** botón visible si el interruptor está activo → `POST /portal/services/{id}/cpanel-session` → redirección con sesión temporal; queda registrado.
4. **Pagar con tarjeta:** factura o selección de facturas de la misma moneda → "Pagar con tarjeta" → se muestra el total con el recargo → confirmar → `POST /portal/payments/card-checkouts` → formulario de la pasarela (redirección o embebido) con 3-D Secure → regreso a P-PRT-22, que consulta `GET /portal/payments/card-checkouts/{id}`: "en proceso" hasta el webhook, luego aprobado (facturas pagadas) o rechazado con el motivo y opción de reintentar.
4b. **Pagar con PayPal:** factura → "Pagar" → se muestra el recargo del medio → confirmar → PayPal → regreso; el pago aparece "en proceso" hasta el webhook de captura.
5. **Enviar voucher:** factura → "Ya transferí" → importe, fecha, comprobante → pago `reported` visible como "pendiente de validación".
6. **Operación de dominio:** formulario → aviso de impacto → correo de confirmación al titular → seguimiento del estado.
7. **Reiniciar servidor:** solicitud → ticket de aprobación → resultado notificado.
8. **Ticket:** abrir con servicio afectado, responder, adjuntar; ver estado y SLA público (sin notas internas).
9. **Solicitud de alta, ampliación o cancelación:** formulario que crea ticket u oportunidad.
10. **Administrar usuarios y contactos** (cliente administrador) y datos de facturación.
11. **Pagar una compra en línea:** al llegar desde la web WordPress de la marca con el carrito, el cliente confirma, acepta términos y paga (M-ORD, flujo J de `docs/03`).
12. **Pedir una restauración:** Respaldos → servicio → tipo y fecha entre los puntos disponibles → confirmar sobrescritura → solicitud `requested` con ticket; seguimiento en el ticket y en la solicitud (flujo K de `docs/03`).
13. **Conversar con el asistente:** preguntas sobre sus servicios en solo lectura; para cualquier acción, el asistente abre un ticket.

## 5. Reglas de negocio clave

Cada consulta se filtra por la organización del cliente; un identificador ajeno responde 404. Los recursos de la API del portal son clases distintas a las del panel y no contienen costos, márgenes, notas internas, accesos ni proveedor (salvo `portal.show_provider_name` habilitado para ese cliente o servicio). El panel es de consulta: las únicas acciones son las listadas y las de interruptor solo aparecen si están activas a nivel general o para el cliente. El recargo del medio de pago se muestra antes de pagar. El pago con tarjeta se confirma solo con el webhook de la pasarela, no con el regreso del navegador, y el portal nunca recibe datos de tarjeta. Un voucher enviado no reactiva servicios hasta que finanzas lo valide. Las operaciones de dominio de riesgo requieren confirmación por correo. Los cambios fiscales quedan auditados. Ningún botón sin comportamiento: una función no habilitada no aparece.

## 6. Estados

- Muestra (con etiquetas para el cliente): `services.status`, `invoices.status`, `invoices.fiscal_status`, `payments.status`, `payment_checkouts.status`, `tickets.status`, `domain_operations.status`, `contracts.status`, `incidents.status`, `checkout_sessions.status`, `orders.status`, `restore_requests.status`, `ai_conversations.status`.

## 7. Permisos

| Acción en el portal | Permiso (con política de organización) | Roles |
|---|---|---|
| Ver servicios, proyectos y consumo | `portal.service.view` | customer_admin, customer_user |
| Ver dominios | `portal.domain.view` | customer_admin, customer_user |
| Operaciones de dominio | `portal.domain_operation.create` | customer_admin |
| Acceso a cPanel | `portal.cpanel_session.create` + interruptor `cpanel_login` (soporte usa `inventory.hosting_account.login` desde el panel; ver `docs/05-permisos-y-roles.md`) | customer_admin, customer_user |
| Solicitar reinicio | `portal.server_action.create` + interruptor `server_reboot` | customer_admin |
| Ver facturas y descargar | `portal.invoice.view` | customer_admin; customer_user según permiso |
| Pagar (tarjeta o PayPal) o enviar voucher | `portal.payment.create`; ver el resultado del pago con tarjeta: `portal.payment.view` | customer_admin; customer_user según permiso |
| Tickets | `portal.ticket.view`, `portal.ticket.create` | customer_admin, customer_user |
| Contratos y documentos | `portal.contract.view`; aceptar o firmar: `portal.contract.update` | customer_admin |
| Contactos y usuarios | `portal.contact.view` / `create` / `update` / `delete`; `portal.user.view` / `create` / `delete` | customer_admin |
| Datos de facturación | `portal.account.update` (`PATCH /portal/me/billing-profile`) | customer_admin |
| Consentimiento | `portal.consent.update` | cada contacto sobre sí mismo |
| Confirmar y pagar una compra en línea | `portal.order.create`; ver compras y pedidos: `portal.order.view` | customer_admin; customer_user según permiso (ver por defecto) |
| Informe de respaldos | `portal.backup_report.view` (y ajuste `monitoring.backup_report.visible`) | customer_admin, customer_user |
| Solicitudes de restauración | `portal.restore_request.view`; pedir: `portal.restore_request.create`; cancelar: `portal.restore_request.update` | ver: customer_admin, customer_user; pedir y cancelar: customer_admin; customer_user según permiso |
| Asistente con IA | `portal.assistant_conversation.view`, `portal.assistant_conversation.create` | customer_admin, customer_user |
| Ver y aceptar términos y condiciones vigentes | `portal.legal_document.view`, `portal.legal_acceptance.create` | customer_admin, customer_user |

## 8. Pantallas

### P-PRT-01 · Inicio de sesión del portal
- **Propósito:** autenticar al cliente con la marca correspondiente.
- **Rol principal:** customer_user
- **Campos:** correo, contraseña, código TOTP (si está activo), recuperar contraseña; logo y colores de la marca.
- **Filtros:** no aplica.
- **Acciones:** Ingresar → público; Recuperar contraseña → público.
- **Vacío / error:** credenciales inválidas con mensaje genérico; bloqueo temporal por intentos.

### P-PRT-02 · Resumen
- **Propósito:** ver de un vistazo servicios, próximos vencimientos, facturas pendientes, tickets abiertos y avisos.
- **Rol principal:** customer_admin
- **Campos:** tarjetas: servicios activos, próximos vencimientos, saldo pendiente, tickets abiertos, mantenimientos próximos, notificaciones recientes.
- **Filtros:** marca (si tiene servicios de varias).
- **Acciones:** Pagar pendiente → `portal.payment.create`; Nuevo ticket → `portal.ticket.create`.
- **Vacío / error:** cliente sin servicios: mensaje de bienvenida y contacto; error por tarjeta sin romper la página.

### P-PRT-03 · Mis proyectos y servicios
- **Propósito:** ver lo contratado agrupado por proyecto, con consumo y vencimiento.
- **Rol principal:** customer_user
- **Columnas:** proyecto, componente (etiqueta pública), estado, consumo (último valor y fecha), vencimiento comercial, renovación automática.
- **Filtros:** proyecto, estado, tipo.
- **Acciones:** Ver detalle → `portal.service.view`; Solicitar ampliación → `portal.ticket.create`.
- **Vacío / error:** "Aún no hay servicios registrados en tu cuenta"; componentes sin sincronización muestran "Actualizado el …".

### P-PRT-04 · Detalle de servicio
- **Propósito:** ver características, consumo y acciones permitidas de un servicio.
- **Rol principal:** customer_user
- **Campos:** etiqueta pública, plan, características básicas, consumo (espacio usado y disponible, tráfico, buzones, usuarios), estado, vencimiento, facturas relacionadas, licencias (correo), certificado (vigente hasta), proveedor solo si el ajuste lo permite.
- **Filtros:** no aplica.
- **Acciones:** Entrar a cPanel → `portal.cpanel_session.create`; Solicitar reinicio de servidor → `portal.server_action.create`; Abrir ticket sobre este servicio → `portal.ticket.create`; Solicitar cancelación → `portal.ticket.create`.
- **Vacío / error:** botones de interruptor ocultos si están apagados; error de sesión de cPanel con mensaje y opción de abrir ticket.

### P-PRT-05 · Mis dominios
- **Propósito:** ver dominios y sus vencimientos comerciales.
- **Rol principal:** customer_user
- **Columnas:** dominio, vencimiento, renovación automática, titular, estado, operación en curso.
- **Filtros:** vence en N días.
- **Acciones:** Ver detalle → `portal.domain.view`; Renovar (pagar factura) → `portal.payment.create`.
- **Vacío / error:** "Sin dominios registrados"; error de carga con reintento.

### P-PRT-06 · Detalle de dominio y operaciones
- **Propósito:** actualizar contactos, nameservers, solicitar cambio de titular o transferencia.
- **Rol principal:** customer_admin
- **Campos:** fechas, nameservers, contactos, bloqueo; formularios por operación con aviso de impacto; historial de solicitudes con estado.
- **Filtros:** no aplica.
- **Acciones:** Cambiar contactos → `portal.domain_operation.create`; Cambiar servidores DNS → `portal.domain_operation.create`; Solicitar cambio de titular → `portal.domain_operation.create`; Solicitar transferencia de salida → `portal.domain_operation.create`; Cancelar solicitud → `portal.domain_operation.create`.
- **Vacío / error:** operación no permitida por la extensión no aparece; transferencia en periodo de bloqueo o con deuda: mensaje con el motivo y la fecha desde la que estará disponible.

### P-PRT-07 · Facturas
- **Propósito:** descargar comprobantes y ver qué está pendiente.
- **Rol principal:** customer_admin
- **Columnas:** tipo, serie-número, emisión, vencimiento, moneda, total, saldo, estado, estado fiscal.
- **Filtros:** estado, rango de fechas, marca.
- **Acciones:** Descargar PDF/XML → `portal.invoice.view`; Pagar → `portal.payment.create`; Pagar seleccionadas con tarjeta (misma moneda) → `portal.payment.create`; Descargar estado de cuenta → `portal.invoice.view`.
- **Vacío / error:** "No tienes facturas"; error de descarga con reintento.

### P-PRT-08 · Detalle de factura y pago
- **Propósito:** pagar en línea o reportar una transferencia.
- **Rol principal:** customer_admin
- **Campos:** líneas, totales, saldo, factura de proveedor adjunta (refacturación), medios disponibles con recargo calculado, cuentas bancarias para transferencia, formulario de voucher (importe, fecha, comprobante).
- **Filtros:** no aplica.
- **Acciones:** Pagar con tarjeta (tras ver recargo) → `portal.payment.create`; Pagar con PayPal (tras ver recargo) → `portal.payment.create`; Enviar voucher → `portal.payment.create`; Descargar → `portal.invoice.view`.
- **Vacío / error:** factura pagada sin botones de pago; el botón de tarjeta solo aparece si el medio está activo para esa moneda; pago PayPal cancelado vuelve con mensaje; voucher con archivo inválido → 422.

### P-PRT-09 · Pagos y vouchers
- **Propósito:** seguir el estado de los pagos enviados.
- **Rol principal:** customer_admin
- **Columnas:** fecha, medio, importe, estado (pendiente de validación, validado, rechazado con motivo, reembolsado, en contracargo), facturas aplicadas, saldo a favor.
- **Filtros:** estado, rango de fechas.
- **Acciones:** Ver comprobante enviado → `portal.payment.view`.
- **Vacío / error:** "Sin pagos registrados"; error de carga con reintento.

### P-PRT-10 · Tickets
- **Propósito:** listar las solicitudes de soporte de la organización.
- **Rol principal:** customer_user
- **Columnas:** número, asunto, servicio, estado, prioridad, última respuesta.
- **Filtros:** estado, servicio.
- **Acciones:** Nuevo ticket → `portal.ticket.create`; Abrir → `portal.ticket.view`.
- **Vacío / error:** "Sin tickets"; sugerencias de la base de conocimientos.

### P-PRT-11 · Detalle o nuevo ticket
- **Propósito:** abrir, responder y seguir un ticket.
- **Rol principal:** customer_user
- **Campos:** asunto, servicio o dominio afectado, prioridad sugerida, descripción, adjuntos; conversación pública, estado.
- **Filtros:** no aplica.
- **Acciones:** Crear → `portal.ticket.create`; Responder → `portal.ticket.create`; Reabrir → `portal.ticket.create`; Responder encuesta → `portal.ticket.create`.
- **Vacío / error:** adjunto inválido o muy grande → 422; ticket cerrado ofrece reabrir dentro del plazo.

### P-PRT-12 · Contratos y documentos
- **Propósito:** consultar contratos, adendas, actas y documentos, y aceptar términos.
- **Rol principal:** customer_admin
- **Columnas:** documento, tipo, estado, vigencia, firmado el, descarga.
- **Filtros:** tipo, estado.
- **Acciones:** Descargar → `portal.contract.view`; Aceptar términos → `portal.contract.update`.
- **Vacío / error:** "Sin documentos"; aceptar una versión no vigente → 409.

### P-PRT-13 · Contactos y usuarios
- **Propósito:** que el cliente administrador gestione personas y accesos de su empresa.
- **Rol principal:** customer_admin
- **Columnas:** nombre, correo, roles de contacto, acceso al portal (rol), MFA activo, último acceso.
- **Filtros:** con acceso.
- **Acciones:** Agregar contacto → `portal.contact.create`; Editar → `portal.contact.update`; Dar o quitar acceso → `portal.user.create`; Eliminar → `portal.contact.delete`.
- **Vacío / error:** no permite quitarse a sí mismo el último rol de administrador (409); aviso si no hay contacto de facturación.

### P-PRT-14 · Datos de facturación
- **Propósito:** mantener vigentes los datos fiscales y de facturación.
- **Rol principal:** customer_admin
- **Campos:** razón social, documento, dirección fiscal, correo de facturación, moneda preferida (solo lectura si hay facturas abiertas).
- **Filtros:** no aplica.
- **Acciones:** Guardar (queda auditado) → `customers.customer.update`.
- **Vacío / error:** documento inválido → 422; aviso de que el cambio aplica a comprobantes futuros.

### P-PRT-15 · Notificaciones y preferencias
- **Propósito:** ver avisos recibidos en el portal y gestionar comunicaciones comerciales.
- **Rol principal:** customer_user
- **Columnas:** fecha, tipo, mensaje, leído; preferencias de comunicaciones comerciales por canal.
- **Filtros:** no leídas, tipo.
- **Acciones:** Marcar leído → `portal.notification.update`; Cambiar consentimiento → `portal.consent.update`.
- **Vacío / error:** "Sin notificaciones"; aviso de que los avisos de facturación y soporte se siguen enviando.

### P-PRT-16 · Mantenimientos e incidentes
- **Propósito:** saber si hay mantenimientos o incidentes que afectan sus servicios.
- **Rol principal:** customer_user
- **Columnas:** tipo, título, servicios afectados (etiqueta pública), inicio, fin, estado, resumen público.
- **Filtros:** próximos, en curso, historial.
- **Acciones:** Ver detalle → `portal.maintenance.view`.
- **Vacío / error:** "No hay mantenimientos ni incidentes que afecten tus servicios".

### P-PRT-17 · Seguridad de la cuenta
- **Propósito:** contraseña, MFA y sesiones del usuario del portal.
- **Rol principal:** customer_user
- **Campos:** cambio de contraseña con las reglas vigentes, segundo factor (aplicación TOTP o código al correo, según la política), códigos de recuperación, dispositivos de confianza, sesiones y dispositivos.
- **Filtros:** no aplica.
- **Acciones:** Cambiar contraseña → propio usuario; Activar MFA → propio usuario; Desactivar TOTP → propio usuario; Quitar dispositivo de confianza → propio usuario; Cerrar sesión remota → `identity.session.delete`.
- **Vacío / error:** contraseña que no cumple la política rechazada con la regla; TOTP o código al correo inválido; si la política lo exige, no se puede desactivar el último método.

### P-PRT-18 · Solicitudes de servicio
- **Propósito:** pedir alta, ampliación o cancelación sin escribir un correo.
- **Rol principal:** customer_admin
- **Campos:** tipo de solicitud, servicio (para ampliación o cancelación), producto de interés (alta), detalle.
- **Filtros:** no aplica.
- **Acciones:** Enviar solicitud (crea ticket u oportunidad) → `portal.ticket.create`.
- **Vacío / error:** 422 si falta el servicio en ampliación o cancelación; confirmación con número de ticket.

### P-PRT-19 · Base de conocimientos
- **Propósito:** resolver dudas con artículos públicos de la marca.
- **Rol principal:** customer_user
- **Campos:** buscador, categorías públicas, artículo, enlace a la base de conocimientos de la marca en WordPress.
- **Filtros:** categoría, idioma.
- **Acciones:** Buscar → `portal.kb_article.view`; Abrir ticket desde el artículo → `portal.ticket.create`.
- **Vacío / error:** búsqueda sin resultados ofrece abrir ticket.

### P-PRT-20 · Confirmación de operación de dominio
- **Propósito:** que el titular confirme por correo una operación de riesgo.
- **Rol principal:** público
- **Campos:** dominio, operación, detalle del cambio, aviso de impacto.
- **Filtros:** no aplica.
- **Acciones:** Confirmar → público (token de un solo uso); Rechazar → público (token de un solo uso).
- **Vacío / error:** token vencido o usado: mensaje y contacto con soporte.

### P-PRT-21 · Enlace de un solo uso
- **Propósito:** entregar al cliente un acceso o código de autorización de forma segura.
- **Rol principal:** público
- **Campos:** aviso previo ("se mostrará una sola vez"), valor revelado, botón copiar.
- **Filtros:** no aplica.
- **Acciones:** Mostrar acceso → público (token de un solo uso).
- **Vacío / error:** enlace usado, vencido o revocado: mensaje sin revelar nada.

### P-PRT-22 · Pago con tarjeta
- **Propósito:** confirmar el total con recargo, abrir el formulario de la pasarela y ver el resultado al volver.
- **Rol principal:** customer_admin
- **Campos:** facturas seleccionadas, moneda, saldo, recargo del medio, total a pagar, marcas aceptadas; formulario de la pasarela (redirección o embebido; sus campos son de la pasarela, no del portal); al volver: estado del intento (en proceso, aprobado, rechazado con motivo, vencido).
- **Filtros:** no aplica.
- **Acciones:** Confirmar y pagar → `portal.payment.create`; Volver a intentar (crea un intento nuevo) → `portal.payment.create`; Ver comprobante → `portal.invoice.view`.
- **Vacío / error:** facturas de monedas distintas → 422; factura ya pagada → 409; "Estamos confirmando tu pago" mientras no llega el webhook (consulta periódica con límite); rechazo con el motivo traducido; la página nunca muestra ni pide datos de tarjeta fuera del formulario de la pasarela.

### P-PRT-23 · Respaldos y restauraciones
- **Propósito:** que el cliente vea cómo se respaldan sus servicios y pida una restauración.
- **Rol principal:** customer_admin
- **Campos:** por servicio: responsable del respaldo, frecuencia, retención, último respaldo exitoso, puntos de restauración disponibles; restauraciones realizadas y en curso con su estado y ticket; formulario de solicitud (servicio, tipo: sitio, base de datos o buzón; objeto; fecha; confirmación de sobrescritura; mensaje).
- **Filtros:** servicio, estado de la solicitud.
- **Acciones:** Solicitar restauración → `portal.restore_request.create`; Cancelar solicitud → `portal.restore_request.update`; Ver ticket → `portal.ticket.view`.
- **Vacío / error:** "Este servicio no tiene respaldos a cargo de la empresa" si la responsabilidad es del cliente o del proveedor; sin confirmación de sobrescritura → 422; ya hay una solicitud abierta del mismo objeto → 409; nunca muestra nodo, herramienta, ubicación ni proveedor.

### P-PRT-24 · Términos por aceptar
- **Propósito:** que el cliente acepte la versión vigente de los términos de su marca y de los servicios que tiene activos.
- **Rol principal:** customer_admin
- **Campos:** por documento: título, versión, vigente desde, resumen de cambios, texto completo y enlace a la versión anterior; casilla de aceptación.
- **Filtros:** no aplica.
- **Acciones:** Aceptar → `portal.legal_acceptance.create`; Descargar PDF → `portal.legal_document.view`.
- **Vacío / error:** sin pendientes no aparece; versión reemplazada mientras se leía → 422 y se muestra la nueva; se muestra al iniciar sesión hasta aceptar (las demás pantallas siguen disponibles en consulta).

## 9. Eventos y jobs

- No emite eventos propios: las acciones del portal llaman a la API y los módulos emiten (`PaymentReported`, `PaymentCheckoutCreated`, `TicketCreated`, `DomainOperationRequested`, etc.).
- Sin jobs propios.

## 10. Integraciones y conectores

- Pasarela de tarjetas local (formulario alojado o embebido de la pasarela, vía BIL; el portal solo carga el script oficial de la pasarela en P-PRT-22, ver `docs/10`, sección 10).
- PayPal (checkout desde el portal, vía BIL).
- WHM (sesión temporal de cPanel, vía INV).
- API de Claude (asistente, vía AIA) y herramienta de respaldos de los nodos (restauraciones, vía MON).
- Ninguna directa.

## 11. Ajustes administrables

- `portal.show_provider_name` (false; nivel cliente; columna por servicio)
- `billing.payment_fee.show_before_payment`, `billing.card_gateway.currencies`, `billing.card_gateway.accepted_brands`, `billing.card_gateway.checkout_expiry_minutes`
- `portal.actions.cpanel_login.enabled` (true), `portal.actions.usage_view.enabled` (true), `portal.actions.dns_change.enabled` (false), `portal.actions.server_reboot.enabled` (false)
- `security.mfa.required_for_customers`, `security.session_duration_hours`
- `helpdesk.auto_close.waiting_customer_days` (texto del aviso de cierre)
- `portal.central_identity` (por marca), `system.central_domains`, `monitoring.backup_report.visible` (nivel cliente), `monitoring.restore.customer_target_kinds`, `assistant.enabled` (por marca)

## 12. Historias del backlog

- Acceso seguro al portal
- Mis servicios, dominios y renovaciones
- Facturas y registro de pagos
- Tickets desde el portal
- Solicitudes de alta, ampliación y cancelación
- Datos de facturación y contactos
- Acceso directo a cPanel
- Interruptores de acciones del cliente
- Reinicio de servidor con aprobación
- Portal personalizado por marca
- Pago en línea desde el panel
- Voucher de transferencia desde el panel
- Pago con PayPal desde el portal
- Pago con tarjeta mediante pasarela local
- Proveedor oculto por defecto
- Vista del cliente del mapa
- Enlaces al sistema central con marca de origen
- Identidad del sistema central por marca
- Pago de la compra con tarjeta, PayPal o voucher
- Asistente en el portal con los servicios del cliente
- Solicitud de restauración desde el portal
- Informe de respaldos para el cliente
- Aceptación registrada de la versión vigente de los términos
- Dispositivos de confianza

## 13. Criterios de terminado y pruebas obligatorias

- Un usuario de cliente no accede a datos de otra organización cambiando el identificador (prueba obligatoria del kit, recorrida en todos los endpoints del portal).
- Ninguna respuesta del portal contiene costos, márgenes, notas internas, credenciales ni proveedor (con el ajuste por defecto).
- Un voucher enviado deja el pago "pendiente de validación" y el servicio sigue suspendido hasta la validación.
- El recargo de PayPal y el de la tarjeta se muestran antes de confirmar y coinciden con la línea del comprobante.
- Volver de la pasarela a la página de éxito sin webhook no marca la factura como pagada; un rechazo deja las facturas pendientes y permite un intento nuevo.
- Ninguna petición ni respuesta del portal contiene datos de tarjeta; las páginas de pago solo cargan el script oficial de la pasarela.
- Con el interruptor de DNS apagado, el formulario no aparece y la API responde 403.
- El portal aplica tema, logo y dominio de la marca; un cliente con dos marcas ve cada servicio con su marca.
- E2E (Playwright): pago con voucher y validación; pago con tarjeta en el entorno de pruebas de la pasarela (aprobado y rechazado); pago con PayPal (sandbox); ticket desde el portal; cambio de contactos con confirmación por correo.
- WCAG 2.1 AA y navegación por teclado en formularios de pago y tickets.
- Un cliente que llega desde www.servercreativo.com ve la identidad que fija `portal.central_identity` de esa marca y su marca de origen queda en el prospecto, cliente, pedido y factura.
- El informe de respaldos y las solicitudes de restauración no exponen nodo, herramienta, ubicación, id externo ni proveedor; una restauración pedida desde el portal no se ejecuta sin aprobación de soporte.
- El asistente del portal solo responde con datos del cliente de la sesión (prueba con identificadores de otro cliente).
- Al publicarse términos nuevos, el cliente los ve pendientes y su aceptación queda en `legal_acceptances` con la versión exacta; aceptar una versión reemplazada → 422.
- Ninguna página ni respuesta del portal incluye scripts de marketing o analítica.
- La ayuda del portal muestra los artículos públicos de la marca y el enlace a su base de conocimientos en WordPress.

## 14. Preguntas abiertas

- Reglas de transferencia y cambio de titular de .pe, .cl, .mx y .co: hasta documentarlas, esas operaciones no se ofrecen en el portal (docs/00, sección 14).
- Subdominios definitivos del sistema central e identidad visual para clientes de otras marcas (`docs/11`, D-19 y D-20).

## Anexo: nombres fuera del contrato

- Espacio de permisos `portal.*` (por ejemplo `portal.cpanel_session.create`, `portal.server_action.create`, `portal.domain_operation.create`), tomado de `permissions.json`; la clave `portal` no figura en la tabla de módulos del contrato.
