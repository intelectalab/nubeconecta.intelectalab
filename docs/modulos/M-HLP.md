# M-HLP · Helpdesk (tickets, SLA, base de conocimientos y encuestas)

> Módulo de código `app/Modules/Helpdesk` · clave de permiso `helpdesk` · código `HLP`.
> Fuente: `docs/00-requerimientos.md` secciones 4, 6 (correo entrante, WhatsApp), 10 (CheckSlaBreaches), 15 (impacto), 21 ("Soporte trabaja con tickets"), 22 (#14), 23 (SLA), 26 (bandeja de soporte completa) y 27 (editor de textos enriquecido e indicadores de soporte); contrato común de nombres.

## 1. Propósito y bloque

Registra como ticket todo pedido de cliente, llegue por portal, correo, WhatsApp o teléfono, con tipo, prioridad, enlace al servicio o activo afectado, SLA medido en horario hábil y conversión a tareas. Incluye la base de conocimientos interna y pública y las encuestas de satisfacción.

- **Bloque:** F. Soporte.
- **Depende de:** CUS, SRV, MAP (impacto), CFG (horario, feriados), AUT (notificaciones, correo entrante), IDN.
- **Dependen de él:** WRK (tareas desde tickets), PRT (tickets y artículos públicos), MON (incidentes enlazan tickets), INV (solicitudes de reinicio), DSH.

## 2. Alcance

**Incluye**
- Tickets con tipos y estados configurables (sobre la lista canónica del contrato), prioridad, canal de origen, departamento y categoría, marca, responsable, enlace polimórfico a cliente, servicio, servidor, dominio, plataforma o componente.
- Alta rápida (help desk mínimo): cliente, servicio, canal de origen, prioridad.
- Tickets por correo: un correo entrante crea o actualiza el ticket; adjuntos guardados; prevención de bucles de respuestas automáticas.
- Tickets desde WhatsApp (bandeja compartida de SAL) y desde el portal.
- Notas internas que nunca llegan al portal ni al correo; respuestas predefinidas (plantillas de AUT con `notification_templates.category = canned_reply`); adjuntos con retención administrable.
- Respuestas de tickets, respuestas predefinidas y artículos de la base de conocimientos escritos con el editor de textos enriquecido común (AUT, docs/00 §27), con HTML saneado; los artículos guardan su historial en `rich_text_versions`. El correo saliente lleva el HTML saneado y su versión en texto plano.
- Indicadores del grupo Soporte del panel de DSH (tickets abiertos, primera respuesta, solución, SLA, satisfacción, carga por técnico y reaperturas; docs/14).
- SLA por prioridad, sobrescribible por producto o contrato; reloj en horario de atención con feriados de Perú, pausado en "esperando cliente" y "esperando proveedor"; alertas al 75 % y al incumplir con destinatarios configurables.
- Asignación automática por reglas (departamento, categoría, marca) y escalamiento entre niveles 1, 2 y 3.
- Conversión de ticket en tarea(s) enlazadas; cerrar las tareas permite resolver el ticket.
- Impacto: al abrir un ticket sobre un componente se muestran los componentes que dependen de él.
- Cierre automático de tickets en "esperando cliente" tras N días con aviso previo al cliente.
- Encuesta de satisfacción al resolver; resultados por técnico y periodo.
- Base de conocimientos con categorías, versiones, permisos (interno/público) y búsqueda; artículos públicos en el portal.
- Solicitudes del cliente (alta, ampliación, cancelación, reinicio de servidor, privacidad) como tipos de ticket.
- Tickets creados por el asistente con IA (canal `assistant`, conversación enlazada) y tickets de solicitudes de restauración (MON), que reciben la evidencia al cerrarse (docs/00 §25).
- Artículos públicos y publicados de la base de conocimientos como fuente del asistente de cada marca (AIA); un artículo interno nunca se usa como fuente.
- El blog y la base de conocimientos de las webs viven en WordPress (docs/00 §26) y no se copian al sistema: la ayuda del portal muestra los artículos públicos de `kb_articles` y enlaza a la base de conocimientos de la marca (`web_connector.kb_url`); los artículos internos para soporte se escriben en el sistema (RN-HLP-008).
- Bandeja de soporte completa (docs/00 §26): filtros por estado, prioridad, asignado, departamento, cliente, marca y SLA; detalle con la conversación con el cliente y las notas internas en orden; asignación y reasignación con aviso; SLA visible; vinculación con servicios, dominios, servidores y componentes del mismo cliente (RN-HLP-009, RN-HLP-010).
- Tickets creados por formularios de la web con destino ticket (WCN, canal `web_form`).
- Tickets del Libro de Reclamaciones y de las solicitudes de datos personales (LRC): tipo `complaint` o `request`, canal `web_form`, con el vencimiento del plazo legal como fecha de solución.

**No incluye**
- Incidentes de monitoreo (MON) y problemas (WRK); se enlazan con tickets.
- Bandeja de WhatsApp en sí (SAL); HLP recibe el ticket creado desde ella.

## 3. Entidades

| Tabla | Campos clave | Notas |
|---|---|---|
| `sla_policies` | name, scope_type (`global`/`product`/`contract`), scope_id, business_calendar | |
| `sla_targets` | sla_policy_id, priority, first_response_minutes, resolution_minutes | Valores iniciales del kit |
| `tickets` | number, customer_id, contact_id, brand_id, type, status, priority, channel (`email`/`portal`/`whatsapp`/`phone`/`internal`/`monitoring`/`assistant`/`web_form`), department, category, level (1/2/3), assignee_id, subject, sla_policy_id, first_response_due_at, first_responded_at, resolution_due_at, resolved_at, closed_at, sla_paused_since, sla_paused_minutes, sla_breached, last_customer_activity_at | |
| `ticket_messages` | ticket_id, author_type (`staff`/`customer`/`system`), author_user_id, author_contact_id, body, is_internal, external_message_id, in_reply_to, channel | `is_internal` nunca al portal |
| `ticket_links` | ticket_id, linkable_type (`service`/`domain`/`server`/`saas_instance`/`project_component`/`resource`/`hosting_account`/`incident`/`problem`/`change_request`/`task`), linkable_id | Polimórfico |
| `kb_categories` | name (i18n), parent_id, visibility (`internal`/`public`), sort_order | |
| `kb_articles` | kb_category_id, title, body, locale, visibility, status, version, brand_id, published_at, created_by | Historial por versión en auditoría |
| `satisfaction_surveys` | ticket_id, contact_id, sent_at, answered_at, score, comment | |

## 4. Casos de uso y flujos

1. **Alta rápida:** soporte crea ticket con cliente, servicio, canal (por ejemplo WhatsApp) y prioridad; se calcula SLA y se asigna por reglas.
2. **Correo entrante:** IMAP o webhook de entrada → si `In-Reply-To` o número en asunto coincide, agrega mensaje; si no, crea ticket; respuestas automáticas (encabezados `Auto-Submitted`, `Precedence`) no crean ni reabren tickets.
3. **Responder:** mensaje público (va al portal y al correo) o nota interna, con el editor enriquecido; respuestas predefinidas insertables con sus variables resueltas (cliente, ticket, servicio).
4. **SLA:** `CheckSlaBreaches` cada 5 minutos calcula tiempo hábil consumido; al 75 % alerta; al incumplir alerta y marca `sla_breached`; en `waiting_customer`/`waiting_provider` el reloj se pausa.
5. **Escalar:** cambiar nivel o pasar a `escalated` con notificación al responsable del nivel.
6. **Convertir en tarea:** crea una o varias tareas en WRK enlazadas; al cerrar todas, se habilita "Resolver".
7. **Impacto:** si el ticket se enlaza a un componente, se muestra la lista aguas abajo (MAP).
8. **Resolver y encuesta:** al pasar a `resolved` se envía la encuesta; `closed` tras confirmación o tiempo.
9. **Cierre automático:** ticket en `waiting_customer` N días → aviso previo al cliente → cierre.
10. **Reinicio de servidor (portal):** ticket tipo reinicio enlazado al servidor; soporte aprueba y INV ejecuta; resultado notificado.
11. **Base de conocimientos:** crear artículo, publicar interno o público, versionar; búsqueda en panel y portal.

## 5. Reglas de negocio clave

Todo pedido de cliente se registra como ticket aunque llegue por WhatsApp. Las notas internas nunca llegan al portal ni al correo. El SLA corre solo en horario de atención, descuenta feriados de Perú y se pausa en "esperando cliente" y "esperando proveedor"; la política más específica (contrato, producto, general) gana. Las alertas de SLA se envían una vez por umbral. Un correo de respuesta automática no crea ni reabre tickets. Un ticket con tareas abiertas no puede resolverse. Un cliente solo ve los tickets de su organización. Los adjuntos se conservan según `helpdesk.attachments.retention_months`. Los artículos internos nunca se exponen en la API del portal.

## 6. Estados

- `tickets.status`: `new`, `open`, `in_progress`, `waiting_customer`, `waiting_provider`, `escalated`, `resolved`, `closed`, `reopened`.
- `tickets.priority`: `critical`, `high`, `medium`, `low`.
- `kb_articles.status`: ver anexo.

## 7. Permisos

| Código | Rol por defecto |
|---|---|
| `helpdesk.ticket.view` | admin, support, sales, finance (los de facturación), documentation (lectura); temp_technician (asignados); cliente sobre los suyos |
| `helpdesk.ticket.create` | todo el personal (en el portal, `customer_admin` y `customer_user` usan `portal.ticket.create`) |
| `helpdesk.ticket.update` (estado, asignación, prioridad) | admin, support |
| `inventory.server.execute` (aprobar y ejecutar solicitudes de reinicio; permiso de INV) | admin, support |
| `helpdesk.ticket.export` | admin, support |
| `helpdesk.ticket_message.view` | admin, support, sales y finance sobre los tickets que ven |
| `helpdesk.ticket_message.create` (mensajes y notas internas) | admin, support, sales, finance; cliente (mensajes públicos, en el portal) |
| `helpdesk.ticket_link.view` / `create` / `delete` | admin, support |
| `helpdesk.sla_policy.view` / `update` | admin |
| `helpdesk.kb_article.view` | todo el personal; público (artículos públicos) |
| `helpdesk.kb_article.create` / `update` / `delete` | admin, support |
| `helpdesk.satisfaction_survey.view` | admin |

## 8. Pantallas

### P-HLP-01 · Bandeja de tickets
- **Propósito:** atender y priorizar tickets con su SLA.
- **Rol principal:** support
- **Columnas:** número, asunto, cliente, tipo, prioridad, estado, canal, departamento, nivel, responsable, vence primera respuesta, vence solución, tiempo restante, % SLA consumido, servicios vinculados, último mensaje.
- **Filtros:** estado, prioridad, responsable (mis tickets / sin asignar), departamento, canal, tipo, cliente, marca, en riesgo de SLA, incumplidos; filtros guardados.
- **Acciones:** Nuevo ticket → `helpdesk.ticket.create`; Asignar o reasignar → `helpdesk.ticket.update`; Cambiar estado → `helpdesk.ticket.update`; Exportar → `helpdesk.ticket.export`.
- **Vacío / error:** "No hay tickets en esta vista"; error de carga con reintento.

### P-HLP-02 · Alta rápida de ticket
- **Propósito:** registrar en segundos un pedido llegado por WhatsApp, teléfono u otro canal.
- **Rol principal:** support
- **Campos:** cliente (búsqueda), contacto, servicio o activo, canal de origen, tipo, prioridad, asunto, descripción, adjuntos.
- **Filtros:** no aplica.
- **Acciones:** Crear → `helpdesk.ticket.create`; Crear y convertir en tarea → `work.task.create`.
- **Vacío / error:** 422 si falta cliente o asunto; aviso si el servicio elegido está suspendido.

### P-HLP-03 · Detalle de ticket
- **Propósito:** conversar con el cliente, colaborar internamente y resolver con contexto.
- **Rol principal:** support
- **Campos:** conversación (público e interno diferenciados), datos del ticket, SLA con cuenta regresiva y pausas, enlaces (servicio, dominio, servidor, componente), impacto aguas abajo, tareas enlazadas, incidente o problema, historial, encuesta.
- **Filtros:** mostrar/ocultar notas internas.
- **Acciones:** Responder al cliente → `helpdesk.ticket_message.create`; Nota interna (`POST /admin/tickets/{id}/internal-notes`) → `helpdesk.ticket_message.create`; Asignar o reasignar → `helpdesk.ticket.update`; Vincular servicio → `helpdesk.ticket_link.create`; Insertar respuesta predefinida → `helpdesk.ticket_message.create`; Insertar imagen en la respuesta → `automation.rich_text.create`; Cambiar estado o prioridad → `helpdesk.ticket.update`; Escalar → `helpdesk.ticket.update`; Convertir en tarea → `work.task.create`; Aprobar solicitud de reinicio → `inventory.server.execute`; Vincular a problema → `work.problem.update`.
- **Vacío / error:** "Resolver" deshabilitado con explicación si hay tareas abiertas; aviso visual permanente cuando se redacta una nota interna; 409 si otro usuario respondió.

### P-HLP-04 · Políticas de SLA
- **Propósito:** administrar tiempos de primera respuesta y solución por prioridad, producto o contrato.
- **Rol principal:** admin
- **Columnas:** política, alcance (general/producto/contrato), prioridad, primera respuesta, solución, solo horario hábil, estados que pausan.
- **Filtros:** alcance.
- **Acciones:** Crear política → `helpdesk.sla_policy.update`; Editar tiempos → `helpdesk.sla_policy.update`; Editar horario y feriados → `settings.business_hours.update`.
- **Vacío / error:** nunca vacío (seeder con valores iniciales); 422 si la solución es menor que la primera respuesta.

### P-HLP-05 · Base de conocimientos
- **Propósito:** buscar y administrar artículos internos y públicos.
- **Rol principal:** support
- **Columnas:** título, categoría, visibilidad, idioma, marcas, estado, versión, última edición.
- **Filtros:** categoría, visibilidad, estado, idioma, búsqueda de texto.
- **Acciones:** Nuevo artículo → `helpdesk.kb_article.create`; Editar → `helpdesk.kb_article.update`; Archivar → `helpdesk.kb_article.delete`.
- **Vacío / error:** "Sin artículos" con botón crear; búsqueda sin resultados sugiere crear artículo.

### P-HLP-06 · Editor de artículo
- **Propósito:** redactar, versionar y publicar un artículo.
- **Rol principal:** support
- **Campos:** título, cuerpo con el editor de textos enriquecido (tablas, imágenes propias, enlaces), categoría, visibilidad, idioma, marcas, historial de versiones con comparación (`rich_text_versions`).
- **Filtros:** versión.
- **Acciones:** Guardar borrador → `helpdesk.kb_article.update`; Publicar → `helpdesk.kb_article.update`; Restaurar versión → `automation.rich_text_version.create`.
- **Vacío / error:** advertencia al publicar como público un artículo de categoría interna; 409 por edición concurrente.

### P-HLP-07 · Encuestas de satisfacción
- **Propósito:** medir satisfacción por técnico y periodo.
- **Rol principal:** admin
- **Columnas:** técnico, tickets resueltos, encuestas enviadas, respondidas, puntaje promedio, comentarios.
- **Filtros:** periodo, técnico, marca.
- **Acciones:** Ver ticket → `helpdesk.ticket.view`; Exportar → `helpdesk.ticket.export`.
- **Vacío / error:** "Sin respuestas en el periodo"; error de carga con reintento.

## 9. Eventos y jobs

- **Emite:** `TicketCreated`, `TicketAssigned`, `TicketStatusChanged`, `TicketEscalated`, `TicketSlaAtRisk`, `TicketSlaBreached`, `TicketResolved`, `TicketApproved`, `SatisfactionSurveyAnswered`.
- **Escucha:** `InboundEmailReceived` (AUT), `WhatsappTicketRequested` (SAL), `TaskCompleted` (WRK), `IncidentOpened` (MON, tickets de clientes afectados), `AiConversationHandedOff` (AIA, ticket desde el portal), `RestoreRequested` y `RestoreRequestCompleted` (MON, ticket de la restauración y su evidencia), `ComplaintReceived` y `PrivacyRequestReceived` (LRC, ticket con el plazo legal), `WebFormSubmissionReceived` (WCN, ticket desde un formulario de la web con destino ticket).
- **Jobs:** `CheckSlaBreaches` (cada 5 minutos); `AutoCloseInactiveTickets` (diario, con aviso previo); `PurgeExpiredAttachments` (diario).

## 10. Integraciones y conectores

- Correo entrante por IMAP o webhook de entrada (por buzón y marca).
- Correo saliente (Elastic Email) para respuestas y encuestas.
- WhatsApp Business (vía SAL).

## 11. Ajustes administrables

- `helpdesk.auto_close.waiting_customer_days` (7)
- `helpdesk.auto_close_notice_days`
- `helpdesk.attachments.retention_months` (12)
- `helpdesk.sla.warning_percent` (75)
- `helpdesk.sla.alert_recipients`
- `helpdesk.ticket_types`, `helpdesk.departments`, `helpdesk.categories` (listas configurables)
- Horario de atención y feriados (CFG)

## 12. Historias del backlog

- Tickets con tipos, estados y prioridades
- Tickets por correo
- SLA con alertas
- Notas internas, respuestas predefinidas y adjuntos
- Asignación automática y escalamiento
- Convertir ticket en tarea
- Encuesta de satisfacción
- Base de conocimientos
- Help desk mínimo para soporte
- Cierre automático de tickets inactivos
- SLA por prioridad, producto y contrato
- Horario de atención y feriados
- Alertas de SLA
- Herramientas del asistente: plan, dominio, prospecto y ticket
- Aprobación y ejecución de restauraciones con evidencia
- Constancia y ticket con plazo del reclamo
- Destino del envío: prospecto, ticket o correo

Épica "Editor de textos enriquecido" (lado de HLP):
- Editor enriquecido en contratos, documentos legales y ayuda
- Plantillas de correo, avisos y respuestas predefinidas con editor

Épica "Bandeja de soporte completa":
- Bandeja de tickets con filtros y SLA visible
- Detalle del ticket con conversación y notas internas
- Asignación y reasignación de tickets
- Vinculación del ticket con servicios

## 13. Criterios de terminado y pruebas obligatorias

- SLA: ticket crítico abierto viernes 17:30 con horario 9-18 y lunes feriado vence su solución el martes a la hora correspondiente; en `waiting_customer` el reloj no avanza.
- Alerta al 75 % y al incumplir, una sola vez cada una.
- Una nota interna no aparece en la API del portal ni en el correo saliente (prueba sobre ambas salidas).
- Un correo con `Auto-Submitted: auto-replied` no crea ni reabre tickets.
- Resolver con tareas abiertas → 409.
- Un cliente no ve tickets de otra organización (404).
- Cierre automático envía el aviso previo y cierra a los N días; una respuesta del cliente en medio lo cancela.
- Valores iniciales de SLA cargados por seeder: crítica 1h/4h, alta 4h/1 día, media 8h/3 días, baja 1 día/5 días.
- Un ticket creado por el asistente lleva canal `assistant` y la conversación enlazada; un artículo `internal` nunca aparece como fuente del asistente.
- Una nota interna con autor cliente → rechazada por la base; agregar una nota interna no cambia `first_responded_at` ni pausa el SLA.
- Vincular un servicio de otro cliente → 422; la ficha del servicio lista los tickets vinculados.
- Reasignar queda en auditoría y avisa al nuevo responsable.
- El ticket de una hoja del Libro de Reclamaciones vence en la misma fecha que la hoja.
- Una respuesta o un artículo con `<script>` o `onerror` se guardan saneados; una respuesta predefinida con una variable desconocida → 422.

## 14. Preguntas abiertas

- Valores iniciales del SLA a confirmar por gerencia antes de la puesta en marcha (docs/00, sección 14; se cargan en el panel).
- Departamentos y niveles de escalamiento 1, 2 y 3 con un solo usuario de soporte: quién atiende cada nivel (derivada).

## Anexo: nombres fuera del contrato

- `kb_articles.status`: `draft`, `published`, `archived`.
- Valor `web_form` de `tickets.channel` (docs/00 §25 y §26); endpoints `POST /admin/tickets/{id}/internal-notes` y `GET /admin/tickets/{id}/links` y permiso `helpdesk.ticket_link.view` (docs/00 §26).
- Columnas `tickets.channel`, `department`, `category`, `level`, `approval_status`.
