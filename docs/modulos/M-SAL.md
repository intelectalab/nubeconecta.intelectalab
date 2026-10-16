# M-SAL · Sales (CRM básico, canales de captación, WhatsApp, mailing y cotizaciones)

> Módulo de código `app/Modules/Sales` · clave de permiso `sales` · código `SAL`.
> Fuente: `docs/00-requerimientos.md` secciones 21 ("Del WhatsApp al sistema") y 24; contrato común de nombres.

## 1. Propósito y bloque

Saca las ventas del WhatsApp: registra prospectos con su canal de origen, los mueve por un embudo administrable con seguimientos y los convierte en cliente y pedido con un clic. Incluye los canales de captación (formularios web, WhatsApp Business, Meta, mailing, referidos) y las cotizaciones versionadas.

- **Bloque:** D. Ventas.
- **Depende de:** B (CUS, CAT), BRD, CFG, AUT (notificaciones), IDN.
- **Dependen de él:** ORD (pedido desde la conversión), CTR (contrato desde la cotización), HLP (tickets creados desde WhatsApp), FIN (comisiones de afiliados como costo).

## 2. Alcance

**Incluye**
- Prospectos con nombre, empresa, contacto, servicio de interés, marca y canal de origen; detección de duplicados contra clientes existentes.
- Embudo con etapas administrables (por defecto: nuevo, contactado, propuesta enviada, negociación, ganado, perdido con motivo obligatorio).
- Actividades y seguimientos con fecha y recordatorio; alerta de prospectos sin seguimiento en N días.
- Conversión de prospecto ganado a cliente y pedido; aviso a finanzas, soporte y, si el servicio es complejo, a documentación.
- Oportunidades sobre clientes actuales (renovaciones y ventas adicionales sugeridas desde el mapa de servicios), modeladas como prospectos con `customer_id`.
- Tablero de ventas: embudo por etapa, seguimientos del día y valor estimado por moneda.
- Canales de captación administrables; formularios insertables por marca con clave y anti-spam; formularios de Facebook e Instagram por webhook; referidos con enlace por cliente; registro manual por canal.
- Bandeja compartida de WhatsApp Business: desde una conversación se crea prospecto, ticket o se vincula a cliente; la marca se deduce del número.
- Listas de mailing sincronizadas con Elastic Email por marca, servicio y estado; bajas y rebotes recibidos.
- Reglas de asignación por marca o canal con aviso inmediato al asignado.
- Reporte por canal (recibidos, convertidos, tiempo de conversión, monto facturado).
- Cotizaciones con cargos únicos y recurrentes, en PEN o USD, plantilla PDF por marca e idioma, vigencia, versiones, envío por correo, aceptación o rechazo, conversión a contrato o pedido.
- Afiliados: enlace de referido y cálculo de comisiones por producto y periodo.
- Webs en WordPress (docs/00 §25 y §26): los formularios del constructor de WCN con destino prospecto crean el prospecto con su canal, responsable o reglas de asignación, página, campaña, UTM y consentimiento; "Solicitar cotización" de los productos sin venta en línea envía al CRM con el producto de interés, la página y la marca de origen; el asistente con IA crea prospectos con canal `assistant` y la conversación enlazada; el administrador de un carrito abandonado puede convertirlo en prospecto. Los `lead_forms` siguen para landings externas e inserción por script; las conversiones de marketing las registran los píxeles de WordPress.
- CRM con vista de lista y vista Kanban (docs/00 §26): los mismos prospectos y filtros en ambas; en el Kanban las tarjetas se arrastran entre etapas y cada cambio queda en `lead_stage_changes` con usuario, origen y fecha.

**No incluye**
- Envío de campañas de mailing (se hacen en Elastic Email; el sistema solo sincroniza listas).
- Carrito, compra en línea y sus controles (ORD, docs/00 §25: la tienda en línea ya no se descarta y se limita a servicios simples); los servicios complejos siguen por cotización y contrato en SAL.
- Contratos (CTR) y pedidos (ORD); SAL los crea por sus interfaces.

## 3. Entidades

| Tabla | Campos clave | Notas |
|---|---|---|
| `lead_channels` | code, name, kind (`web_form`/`whatsapp`/`mailing`/`social`/`referral`/`call`/`event`/`assistant`/`other`), is_active | Administrables |
| `lead_forms` | brand_id, lead_channel_id, name, public_key, allowed_origins, fields (jsonb), antispam (jsonb), success_message | Endpoint `/api/v1/public/lead-forms/{key}/submissions` |
| `pipeline_stages` | name (i18n), sort_order, probability, outcome | Etapas administrables |
| `lead_stage_changes` | lead_id, from_stage_id, to_stage_id, source (`board_drag`/`form`/`created`/`conversion`/`automation`/`api`), changed_by, note | Solo inserción; historial de etapas |
| `leads` | code, name, company_name, email, phone, interest_product_id, brand_id, lead_channel_id, pipeline_stage_id, status, owner_id, customer_id, estimated_amount_minor, currency, lost_reason, attribution (jsonb: página, campaña, UTM, formulario de Meta, número de WhatsApp), referral_link_id, next_follow_up_at | `customer_id` lleno = oportunidad sobre cliente actual |
| `lead_activities` | lead_id, type (`call`/`whatsapp`/`email`/`meeting`/`note`/`follow_up`), due_at, completed_at, notes, assigned_to | Recordatorios |
| `assignment_rules` | brand_id, lead_channel_id, assignee_ids, strategy (`fixed`/`round_robin`), priority, is_active | |
| `referral_links` | customer_id, code, commission_rate, is_active | Enlace de referido |
| `whatsapp_numbers` | brand_id, phone_number, provider_phone_id, is_active | La marca se deduce del número |
| `whatsapp_conversations` | whatsapp_number_id, contact_phone, customer_id, lead_id, ticket_id, assigned_to, status, last_message_at | Bandeja compartida |
| `whatsapp_messages` | conversation_id, direction, body, file_id, external_message_id, template_name, occurred_at, status | `external_id` único |
| `mailing_lists` | brand_id, name, criteria (jsonb: marca, servicio, estado), provider_list_id, last_synced_at | |
| `mailing_list_members` | mailing_list_id, contact_id, email, status (`subscribed`/`unsubscribed`/`bounced`/`complained`) | |
| `quotes` | number, lead_id, customer_id, brand_id, currency, status, valid_until, current_version, accepted_at, rejection_reason | |
| `quote_versions` | quote_id, version_number, locale, terms, one_time_total_minor, tax_minor, recurring_total_minor, pdf_file_id | Una fila por cambio |
| `quote_items` | quote_version_id, product_id, plan_id, description, charge_type (`one_time`/`recurring`), cycle, quantity, unit_price_minor, discount_minor | |

## 4. Casos de uso y flujos

1. **Prospecto desde formulario web:** POST público con clave del formulario → validación anti-spam → se crea el lead con marca, página, campaña y UTM → la regla de asignación elige vendedor → aviso inmediato.
2. **Prospecto desde WhatsApp:** llega un mensaje (webhook) → se agrega a la conversación del número → ventas pulsa "Crear prospecto", "Crear ticket" o "Vincular a cliente".
3. **Prospecto desde Meta:** webhook de Lead Ads → lead con página, formulario y campaña.
4. **Seguimiento:** el vendedor registra actividades; el job diario alerta los prospectos sin actividad en `sales.lead.followup_alert_days`.
5. **Mover en el embudo:** en la vista de lista con el selector de etapa o en el Kanban arrastrando la tarjeta (`POST /admin/leads/{id}/move-stage` con `source = board_drag`); cada cambio se registra en `lead_stage_changes`; al soltar en "perdido" se exige motivo y en "ganado" se abre la conversión; si se cancela, la tarjeta vuelve a su columna.
6. **Cotizar:** crear cotización (cargos únicos y recurrentes) → cada edición crea versión → generar PDF con plantilla de la marca e idioma → enviar por correo → registrar aceptación o rechazo; al vencer `valid_until` pasa a `expired`.
7. **Convertir:** prospecto ganado → crea cliente (CUS) si no existe y pedido (ORD) con las líneas de la cotización aceptada, sin volver a digitar; si algún producto "requiere contrato", crea borrador de contrato (CTR) y avisa a documentación.
8. **Oportunidad sobre cliente actual:** job diario recorre el mapa de servicios (por ejemplo, hosting sin SSL ni correo) y renovaciones próximas, y crea sugerencias como prospectos con `customer_id`.
9. **Mailing:** job sincroniza listas con Elastic Email; bajas y rebotes vuelven por webhook y actualizan miembros y consentimiento (CUS).
10. **Afiliados:** el cliente comparte su enlace; los prospectos que entran con ese código quedan atribuidos; la liquidación por periodo calcula la comisión sobre facturas pagadas de los productos con regla.

## 5. Reglas de negocio clave

Todo prospecto guarda su canal de origen, automático cuando el canal lo permite. Perder exige motivo. La conversión conserva líneas, precios y condiciones de la cotización aceptada. Una cotización enviada no se edita: cualquier cambio crea una nueva versión y conserva el historial; solo la última versión puede aceptarse. Una cotización en una sola moneda (PEN o USD). El consentimiento de comunicaciones se respeta en todos los canales comerciales: una baja en Elastic Email o en el portal bloquea el envío en los demás. Las reglas de asignación se evalúan por prioridad; sin regla aplicable, el prospecto queda sin asignar y se avisa al administrador. La liquidación de comisiones solo considera facturas pagadas y no liquida dos veces la misma factura. El formulario público acepta solo los orígenes permitidos y aplica límite de peticiones. La lista y el Kanban muestran los mismos prospectos con los mismos permisos; cada cambio de etapa queda en un historial que no se edita (RN-SAL-010, RN-SAL-011).

## 6. Estados

- `leads.status`: `open`, `won`, `lost` (la etapa fina vive en `pipeline_stages`).
- `quotes.status`: `draft`, `sent`, `accepted`, `rejected`, `expired`.
- `whatsapp_conversations.status` y `mailing_list_members.status`: ver anexo.

## 7. Permisos

| Código | Rol por defecto |
|---|---|
| `sales.lead.view` / `create` / `update` / `delete` / `export` | admin, sales |
| `sales.lead_activity.create` / `update` | admin, sales |
| `sales.quote.view` / `create` / `update` / `delete` / `export` | admin, sales |
| `sales.quote.update` (registrar aceptación o rechazo) | admin, sales |
| `sales.pipeline_stage.view` / `update` | admin |
| `sales.assignment_rule.view` / `create` / `update` / `delete` | admin |
| `sales.lead_channel.view` / `create` / `update` | admin |
| `sales.lead_form.view` / `create` / `update` / `delete` | admin |
| `sales.whatsapp_conversation.view` / `update` | admin, sales, support |
| `sales.whatsapp_message.create` | admin, sales, support |
| `sales.mailing_list.view` / `create` / `update` | admin, sales |
| `sales.referral_link.view` / `create` / `update` | admin, sales |

## 8. Pantallas

### P-SAL-01 · Tablero de ventas
- **Propósito:** ver el embudo como Kanban por etapa, los seguimientos del día y el valor estimado por moneda.
- **Rol principal:** sales
- **Columnas:** tarjetas por etapa (prospecto, empresa, valor, moneda, días en etapa, próximo seguimiento); panel lateral de seguimientos del día y prospectos sin seguimiento.
- **Filtros:** marca, canal, vendedor, moneda, rango de fechas.
- **Acciones:** Arrastrar a otra etapa → `sales.lead.update`; Nuevo prospecto → `sales.lead.create`; Marcar seguimiento hecho → `sales.lead_activity.update`; Cambiar a vista de lista → `sales.lead.view`.
- **Vacío / error:** etapa sin tarjetas muestra "Sin prospectos"; al soltar en "perdido" abre diálogo con motivo obligatorio y en "ganado" la conversión (si se cancela, la tarjeta vuelve); error de concurrencia 409 devuelve la tarjeta a su columna y la recarga.

### P-SAL-02 · Prospectos
- **Propósito:** vista de lista de prospectos y oportunidades sobre clientes (la misma información que el Kanban).
- **Rol principal:** sales
- **Columnas:** número, nombre, empresa, servicio de interés, marca, canal, etapa, estado, responsable, valor, próximo seguimiento, cliente vinculado.
- **Filtros:** estado, etapa, marca, canal, responsable, sin seguimiento, solo oportunidades sobre clientes.
- **Acciones:** Nuevo prospecto → `sales.lead.create`; Cambiar etapa → `sales.lead.update`; Reasignar → `sales.lead.update`; Ver historial de etapas → `sales.lead.view`; Cambiar a Kanban → `sales.lead.view`; Exportar → `sales.lead.export`.
- **Vacío / error:** vacío con botón crear y enlace a configurar formularios; error de carga con reintento.

### P-SAL-03 · Detalle de prospecto
- **Propósito:** trabajar un prospecto: actividades, cotizaciones y conversión.
- **Rol principal:** sales
- **Campos:** datos del prospecto, origen (página, campaña, UTM, formulario, número), posibles duplicados con clientes, línea de actividades, cotizaciones, conversación de WhatsApp enlazada.
- **Filtros:** tipo de actividad.
- **Acciones:** Registrar actividad → `sales.lead_activity.create`; Crear cotización → `sales.quote.create`; Convertir a cliente y pedido → `sales.lead.update` (más `customers.customer.create` y `orders.order.create`); Marcar perdido → `sales.lead.update`; Vincular a cliente existente → `sales.lead.update`.
- **Vacío / error:** sin actividades: invita a registrar la primera; 422 al convertir sin cotización aceptada ni productos elegidos.

### P-SAL-04 · Bandeja compartida de WhatsApp
- **Propósito:** atender las conversaciones de los números de WhatsApp Business de cada marca.
- **Rol principal:** sales
- **Columnas:** lista de conversaciones (número de la marca, contacto, cliente/prospecto/ticket vinculado, asignado, último mensaje, no leídos); panel de mensajes.
- **Filtros:** marca/número, asignado, sin vincular, abiertas/cerradas.
- **Acciones:** Responder → `sales.whatsapp_message.create`; Crear prospecto → `sales.lead.create`; Crear ticket → `helpdesk.ticket.create`; Vincular a cliente → `sales.whatsapp_conversation.update`; Asignar → `sales.whatsapp_conversation.update`; Cerrar → `sales.whatsapp_conversation.update`.
- **Vacío / error:** "No hay conversaciones"; fuera de la ventana de 24 horas solo permite plantillas aprobadas (aviso visible); error de entrega mostrado en el mensaje.

### P-SAL-05 · Cotizaciones
- **Propósito:** listar cotizaciones y su estado.
- **Rol principal:** sales
- **Columnas:** número, versión vigente, cliente o prospecto, marca, moneda, total, vigencia, estado, enviada el.
- **Filtros:** estado, marca, moneda, vendedor, por vencer.
- **Acciones:** Nueva cotización → `sales.quote.create`; Duplicar → `sales.quote.create`; Exportar → `sales.quote.export`.
- **Vacío / error:** vacío con botón crear; error de carga con reintento.

### P-SAL-06 · Editor de cotización
- **Propósito:** armar la propuesta con cargos únicos y recurrentes y gestionar versiones, envío y aceptación.
- **Rol principal:** sales
- **Campos:** cliente o prospecto, marca, idioma, moneda, vigencia, líneas (producto/plan o libre, tipo de cargo, ciclo, cantidad, precio, descuento), términos, totales con impuesto; historial de versiones.
- **Filtros:** no aplica.
- **Acciones:** Guardar nueva versión → `sales.quote.update`; Vista previa PDF → `sales.quote.view`; Enviar por correo → `sales.quote.update`; Registrar aceptación o rechazo → `sales.quote.update`; Convertir a contrato → `contracts.contract.create`; Convertir a pedido → `orders.order.create`.
- **Vacío / error:** sin líneas no permite enviar; versión no vigente en solo lectura; 409 si otra persona guardó una versión más nueva.

### P-SAL-07 · Canales y formularios de captación
- **Propósito:** administrar canales y los formularios insertables de cada marca.
- **Rol principal:** admin
- **Columnas:** canal, tipo, activo; formularios con marca, campos, clave pública, orígenes permitidos, prospectos recibidos.
- **Filtros:** tipo de canal, marca.
- **Acciones:** Crear canal → `sales.lead_channel.create`; Crear formulario → `sales.lead_form.create`; Copiar código de inserción → `sales.lead_form.view`; Rotar clave → `sales.lead_form.update`; Desactivar → `sales.lead_form.update`.
- **Vacío / error:** vacío con explicación de cómo insertar el formulario; 422 si el origen permitido no es una URL válida.

### P-SAL-08 · Etapas del embudo y reglas de asignación
- **Propósito:** configurar etapas y el reparto automático de prospectos.
- **Rol principal:** admin
- **Columnas:** etapas (orden, nombre, probabilidad, ganado/perdido); reglas (prioridad, marca, canal, asignado, estrategia, activa).
- **Filtros:** activas.
- **Acciones:** Editar etapas → `sales.pipeline_stage.update`; Crear regla → `sales.assignment_rule.create`; Editar regla → `sales.assignment_rule.update`; Borrar regla → `sales.assignment_rule.delete`.
- **Vacío / error:** sin reglas: aviso "los prospectos quedarán sin asignar"; 409 al borrar una etapa con prospectos (pide etapa destino).

### P-SAL-09 · Listas de mailing
- **Propósito:** definir listas por marca, servicio y estado y ver su sincronización con Elastic Email.
- **Rol principal:** sales
- **Columnas:** lista, marca, criterio, miembros, bajas, rebotes, última sincronización, estado de la última corrida.
- **Filtros:** marca.
- **Acciones:** Crear lista → `sales.mailing_list.create`; Editar criterio → `sales.mailing_list.update`; Sincronizar ahora → `sales.mailing_list.update`.
- **Vacío / error:** sin conector configurado muestra aviso y enlace a la cuenta de proveedor; error de sincronización con detalle del `sync_run`.

### P-SAL-10 · Referidos y comisiones
- **Propósito:** administrar enlaces de referido y liquidar comisiones por periodo.
- **Rol principal:** sales
- **Columnas:** cliente que refiere, código, productos con comisión, porcentaje, prospectos atribuidos, convertidos, comisión del periodo.
- **Filtros:** periodo, cliente, liquidado/pendiente.
- **Acciones:** Crear enlace → `sales.referral_link.create`; Editar regla → `sales.referral_link.update`; Liquidar periodo (registra costo en FIN) → `finance.cost.create`; Exportar → `sales.lead.export`.
- **Vacío / error:** "Sin referidos en el periodo"; 409 si el periodo ya fue liquidado.

### P-SAL-11 · Reporte por canal
- **Propósito:** medir prospectos, conversiones, tiempo de conversión y facturación por canal.
- **Rol principal:** admin
- **Columnas:** canal, marca, prospectos recibidos, convertidos, tasa, tiempo medio de conversión, monto facturado por moneda.
- **Filtros:** periodo, marca, canal.
- **Acciones:** Exportar → `sales.lead.export`; Abrir detalle de prospectos → `sales.lead.view`.
- **Vacío / error:** "Sin datos en el periodo"; error de carga con reintento.

### P-SAL-12 · Oportunidades sobre clientes actuales
- **Propósito:** revisar ventas adicionales y renovaciones sugeridas desde el mapa de servicios.
- **Rol principal:** sales
- **Columnas:** cliente, sugerencia (por ejemplo, "hosting sin SSL"), servicio o proyecto de origen, valor estimado, fecha de detección.
- **Filtros:** tipo de sugerencia, marca, responsable.
- **Acciones:** Convertir en oportunidad → `sales.lead.create`; Descartar → `sales.lead.update`.
- **Vacío / error:** "Sin sugerencias"; aviso si el cliente no tiene mapa registrado.

## 9. Eventos y jobs

- **Emite:** `LeadCreated`, `LeadAssigned`, `LeadStageChanged`, `LeadWon`, `LeadLost`, `QuoteSent`, `QuoteAccepted`, `QuoteRejected`, `QuoteExpired`, `WhatsappMessageReceived`, `MailingUnsubscribed`, `ReferralCommissionSettled`.
- **Escucha:** `CommunicationConsentChanged` (CUS) para actualizar miembros de listas; `AiConversationHandedOff` (AIA) para asignar el prospecto derivado por el asistente; `CartAbandoned` (ORD) para el reporte por canal; `InvoicePaid` (BIL) para atribuir monto facturado al canal y a comisiones; `ServiceMapChanged` (MAP) para recalcular sugerencias.
- **Jobs:** `AlertStaleLeads` (diario); `ExpireQuotes` (diario); `SuggestCustomerOpportunities` (diario); `SyncMailingLists` (diario y bajo demanda, cola `sync`).

## 10. Integraciones y conectores

- WhatsApp Business Platform (plantillas aprobadas, webhook de mensajes).
- Meta Lead Ads (Facebook e Instagram) por webhook en `/api/v1/webhooks/meta`.
- Elastic Email (listas, bajas y rebotes).
- Correo saliente para envío de cotizaciones (AUT).

## 11. Ajustes administrables

- `sales.lead.followup_alert_days`
- `sales.quote.validity_days`
- `sales.referral_commission_percent` (nivel producto)

## 12. Historias del backlog

- Cotizaciones con cargos únicos y recurrentes
- Conversión de cotización a contrato y pedido
- Registro de prospectos con origen
- Embudo de ventas por etapas
- Seguimientos y recordatorios
- Conversión a cliente y pedido
- Oportunidades sobre clientes actuales
- Tablero de ventas
- Formularios para landing y webs por marca
- Bandeja compartida de WhatsApp
- Sincronización de listas con Elastic Email
- Formularios de Facebook e Instagram
- Referidos y registro manual por canal
- Consentimiento de comunicaciones
- Reporte por canal
- Asignación automática de prospectos
- Afiliados y comisiones
- Solicitar cotización para productos sin venta en línea
- Derivación a una persona o a WhatsApp
- Destino del envío: prospecto, ticket o correo

Épica "CRM lista y Kanban":
- Vista de lista de prospectos con filtros
- Kanban de prospectos arrastrable por etapa
- Historial de cambios de etapa

## 13. Criterios de terminado y pruebas obligatorias

- Formulario público con clave inválida → 401; desde origen no permitido → 403; envío repetido idéntico en segundos → un solo prospecto.
- Prospecto con correo de un cliente existente muestra el duplicado.
- Mover a "perdido" sin motivo → 422.
- Editar una cotización enviada crea versión nueva; aceptar una versión anterior → 409.
- Conversión: el pedido creado tiene las mismas líneas, precios, moneda y condiciones de la cotización aceptada.
- El mismo mensaje de WhatsApp recibido dos veces (mismo `external_id`) se registra una vez.
- Un contacto con baja en Elastic Email no recibe envíos comerciales por WhatsApp.
- Regla de asignación por marca asigna y notifica al vendedor en el mismo flujo.
- Liquidar dos veces el mismo periodo → 409.
- Un prospecto creado por el asistente lleva canal `assistant`, marca, página y conversación enlazada, y se asigna con las reglas de la marca.
- "Solicitar cotización" desde la web de otra marca registra esa marca como origen del prospecto.
- Arrastrar una tarjeta crea la fila de `lead_stage_changes` con `board_drag` y el usuario; el historial no admite `UPDATE`; la lista y el Kanban con el mismo filtro muestran los mismos prospectos.

## 14. Preguntas abiertas

- Reglas de comisión de afiliados (porcentaje por producto, sobre qué monto, plazo de atribución del enlace): el kit las nombra pero no las define (derivada).
- Servicio de firma electrónica que se integrará al convertir cotización en contrato (docs/00, sección 14; afecta a CTR).

## Anexo: nombres fuera del contrato

- `whatsapp_conversations.status`: `open`, `closed`.
- `mailing_list_members.status`: `subscribed`, `unsubscribed`, `bounced`, `complained`.
- Ruta de webhook entrante `/api/v1/webhooks/meta`.
- Tabla `lead_stage_changes` y endpoint `GET /admin/leads/{id}/stage-changes` (docs/00 §26).
