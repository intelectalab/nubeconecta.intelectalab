# M-AUT · Automation (reglas, plantillas, avisos, webhooks, sincronizaciones, importaciones, exportaciones y auditoría)

> Módulo de código `app/Modules/Automation` · clave de permiso `automation` · código `AUT`.
> Fuente: `docs/00-requerimientos.md` secciones 2 (comunicación entre módulos), 6 (sync_runs, webhooks entrantes), 9 (exportación), 10 (colas, idempotencia de notificaciones), 13 (migración desde Excel), 22 (#9, #13), 23 (registro de avisos) y 27 ("Editor de textos enriquecido"); contrato común de nombres.

## 1. Propósito y bloque

Escucha los eventos de dominio de todos los módulos y ejecuta, sin programar, lo que el administrador define (notificar, crear tarea, crear ticket, llamar webhook). Envía todas las notificaciones por correo, portal y WhatsApp con plantillas por marca, idioma, país y servicio, deduplicadas y con registro de entrega; y centraliza webhooks, sincronizaciones, importaciones, exportaciones y la consulta de la auditoría.

Desde docs/00 §27 es también el dueño del **editor de textos enriquecido**: un único componente (negrita, cursiva, listas, enlaces, tablas, imágenes propias, variables insertables y vista previa) que usan todas las pantallas donde el equipo redacta textos, con un saneado único en el backend y el historial de versiones (`rich_text_versions`) de los textos que no tienen versiones propias.

- **Bloque:** A. Cimientos (motor, plantillas, notificaciones, auditoría); importaciones masivas en I; webhooks salientes y API pública en A.
- **Depende de:** IDN, CFG, BRD; escucha a todos los módulos por eventos.
- **Dependen de él:** todos los módulos que notifican, exportan, importan o sincronizan.

## 2. Alcance

**Incluye**
- Motor de reglas por evento: evento, condiciones (jsonb) y acciones (notificar, crear tarea, crear ticket, asignar ticket, llamar webhook); registro de cada ejecución.
- Plantillas de notificación por canal, marca, idioma, país y tipo de servicio, con variables documentadas, vista previa y envío de prueba; también respuestas predefinidas de tickets y plantillas de WhatsApp aprobadas por Meta.
- Envío por correo (Elastic Email, remitente por marca, SPF/DKIM/DMARC), portal (notificaciones in-app) y WhatsApp Business; destinatario por rol de contacto según el tipo de aviso.
- Registro de entregas con estado, rebotes y apertura cuando el canal lo informa; reenvío y aviso manual; deduplicación por evento + destinatario + entidad + periodo.
- Webhooks entrantes: validación de firma, evento crudo en `webhook_events` con identificador externo único, procesamiento en cola.
- Webhooks salientes: endpoints con firma, reintentos y registro de entregas.
- Registro de sincronizaciones (`sync_runs`) de todos los conectores, con inicio, fin, leídos, creados, actualizados y errores; lanzar sincronización manual.
- Importaciones con plantillas CSV por entidad, vista previa, validación fila por fila y reporte de errores descargable (clientes, contactos, servicios, dominios con titular, cuentas de hosting, servidores, cuentas cloud, costos).
- Exportaciones a Excel, CSV y PDF en cola con enlace firmado, permiso `export` del módulo y auditoría.
- Consulta de la auditoría (`audit_events`, tabla de IDN) con verificación de la cadena.
- Correo entrante para tickets (recepción y despacho a HLP).
- Editor de textos enriquecido (docs/00 §27) para documentos legales (WCN), plantillas de contrato y cláusulas (CTR), plantillas de correo y avisos, respuestas predefinidas y de tickets (HLP), mensajes de confirmación de formularios (WCN), descripciones de productos y servicios personalizados (CAT) y la carta de respuesta del Libro (LRC): variables por contexto (`GET /admin/rich-text/variables`), vista previa con datos de ejemplo o reales (`POST /admin/rich-text/preview`), imágenes subidas a `files` (`POST /admin/rich-text/images`).
- Saneado único del HTML en el backend (`POST /admin/rich-text/sanitize` y en cada guardado) con `editor.html.allowed_tags`, `editor.html.allowed_attributes` y `editor.html.allowed_link_schemes`; el editor muestra lo que se quitó.
- Plantillas por categoría (`notification_templates.category`: `notice`, `canned_reply`, `complaint_response`, `form_confirmation`) y formato (`notification_templates.content_format`: `html` o `plain`).
- Historial de versiones (`rich_text_versions`) de plantillas de correo y avisos, plantillas y cláusulas de contrato, artículos, mensajes de formularios y descripciones; restaurar crea una versión nueva. Los documentos legales (`legal_document_versions`), los contratos (`contract_versions`) y las cotizaciones (`quote_versions`) conservan sus versiones propias.
- Alcance de docs/00 §25 y §26: plantillas de la constancia y de la respuesta del Libro de Reclamaciones y del acuse de solicitudes de datos personales (LRC), por marca e idioma; plantilla del código de acceso al correo (IDN) y del aviso de envío de formulario con destino correo (WCN); exportaciones `complaints` (Libro para fiscalización) y `legal_acceptances`; la auditoría guarda el valor anterior y el nuevo de cada publicación de documento legal, de la política de seguridad y de la matriz de permisos. Los avisos de invalidación al plugin de WordPress los envía WCN (`wp_cache_invalidations`) por la cola `webhooks` de este módulo; WordPress no envía webhooks al sistema.

**No incluye**
- Lógica de negocio de cada módulo (la acción "suspender" la ejecuta SRV; AUT solo orquesta).
- Edición de la secuencia de cobranza (CFG/BIL), aunque sus avisos salen por AUT.
- Envío de campañas de marketing (Elastic Email directamente; SAL sincroniza listas).

## 3. Entidades

| Tabla | Campos clave | Notas |
|---|---|---|
| `automation_rules` | name, event, conditions (jsonb), actions (jsonb), brand_id, is_active, priority | |
| `automation_runs` | automation_rule_id, status, output (jsonb), error, started_at | |
| `notification_templates` | code, channel (`email`/`portal`/`whatsapp`), brand_id, locale, country, subject, body, variables (jsonb), whatsapp_template_name, is_active, category (`notice`/`canned_reply`/`complaint_response`/`form_confirmation`), content_format (`html`/`plain`) | El cuerpo HTML se guarda saneado; WhatsApp siempre en texto |
| `rich_text_versions` | owner_type (`notification_template`/`contract_template`/`contract_clause`/`kb_article`/`web_form`/`product`/`service_type`), owner_id, field, locale, version_number, html, html_sha256, sanitizer_profile, change_summary, restored_from_id, author_id | Solo inserción; HTML saneado con su hash |
| `notification_deliveries` | notification_template_id, event, entity_type, entity_id, customer_id, recipient_contact_id, recipient_address, channel, dedupe_key, is_manual, resend_of_id | Solo inserción; dedupe_key único; el estado de entrega vive en `notification_delivery_events` |
| `notification_delivery_events` | notification_delivery_id, status (`queued`/`sent`/`delivered`/`opened`/`bounced`/`failed`/`complained`), provider_message_id, provider_event_id, detail (jsonb), occurred_at | Solo inserción (tabla agregada) |
| `webhook_endpoints` | url, events, secret_id, is_active, description | Salientes |
| `webhook_events` | provider, external_event_id, signature_valid, payload (jsonb), received_at | Solo inserción; (provider, external_event_id) único; cada procesamiento en `webhook_event_processings` |
| `webhook_event_processings` | webhook_event_id, attempt, status (`processed`/`ignored`/`failed`), error, processed_at | Solo inserción (tabla agregada) |
| `outbound_webhook_deliveries` | webhook_endpoint_id, event_type, payload, attempt, status, response_status, next_retry_at | |
| `sync_runs` | provider_account_id, connector, kind, started_at, finished_at, records_read, records_created, records_updated, records_not_found, errors_count, error_detail (jsonb), status | |
| `imports` | entity, file_id, status, rows_total, rows_valid, rows_error, error_report_file_id, created_by, finished_at | |
| `exports` | report, filters (jsonb), format (`xlsx`/`csv`/`pdf`), status, file_id, expires_at, created_by | |

## 4. Casos de uso y flujos

1. **Regla por evento:** el administrador elige evento (por ejemplo `BackupFailed`), condiciones (cliente con SLA crítico) y acciones (crear ticket crítico + notificar a soporte); cada evento recibido evalúa reglas activas y registra `automation_runs`.
2. **Notificación:** un módulo emite evento → AUT resuelve plantilla (marca, idioma, país, servicio), destinatario por rol de contacto, canales y `dedupe_key` → si la clave existe, no envía → si no, encola en `notifications` y registra entrega.
3. **Respetar consentimiento:** comunicaciones comerciales no se envían a contactos con baja; los avisos transaccionales (cobranza, incidentes) sí.
4. **Reenviar o aviso manual:** finanzas desde la factura reenvía un aviso o envía uno manual (nueva fila, enlazada).
5. **Webhook entrante:** `/api/v1/webhooks/<proveedor>` valida firma, guarda el evento con identificador externo único; repetido → se confirma y descarta; procesamiento en cola.
6. **Webhook saliente:** integrador registra endpoint; los eventos se firman (HMAC con secreto en VLT) y se reintentan con espera exponencial.
7. **Importar:** elegir entidad, descargar plantilla, subir CSV → vista previa con validación fila por fila → confirmar → reporte de errores descargable; clientes pasan por deduplicación (CUS).
8. **Exportar:** `POST /exports` con filtros del listado → cola → enlace firmado de corta duración → auditoría.
9. **Auditoría:** buscar por entidad, usuario, acción y fecha; verificar la cadena de hash.
10. **Redactar con el editor enriquecido** (cualquier módulo): el componente pide las variables del contexto → el usuario escribe e inserta variables e imágenes propias → vista previa con datos de ejemplo o de un registro → al guardar, el backend sanea, guarda el texto en la tabla dueña y, donde aplica, una fila nueva en `rich_text_versions` con autor, hash y huella del saneado.
11. **Restaurar una versión** (P-AUT-12): elegir la versión → comparar con la vigente → restaurar crea una versión nueva y la aplica al registro dueño (exige además el permiso de editar ese registro).

## 5. Reglas de negocio clave

Los efectos secundarios viajan por eventos; los controladores no llaman al motor. Ningún aviso se envía dos veces (índice único en `dedupe_key`). Cada aviso va al rol de contacto que corresponde (facturación, técnico, administrativo). Las plantillas no contienen textos fijos en código; todas son administrables y tienen variables documentadas. WhatsApp solo usa plantillas aprobadas por Meta fuera de la ventana de conversación. Un webhook entrante con firma inválida se guarda marcado y no se procesa. La exportación exige el permiso `export` del módulo dueño y nunca incluye valores de secretos. La sincronización registra siempre su `sync_run`, incluso si falla. Las importaciones no confirman filas inválidas. `audit_events`, `notification_deliveries`, `webhook_events` y `rich_text_versions` son de solo inserción. Todo texto enriquecido se sanea en el backend al guardarlo, aunque el editor ya lo haya hecho; imágenes solo de `files`; enlaces solo con los esquemas permitidos (RN-AUT-001 a RN-AUT-004).

## 6. Estados

- No hay estados del contrato para estas tablas; ver anexo (valores agregados).

## 7. Permisos

| Código | Rol por defecto |
|---|---|
| `automation.automation_rule.view` / `create` / `update` / `delete` | admin |
| `automation.notification_template.view` / `create` / `update` | admin; finance (plantillas de cobranza) |
| `automation.notification_delivery.view` | admin, finance, support, sales |
| `automation.notification_delivery.create` (reenviar o manual) | admin, finance, support |
| `automation.webhook_endpoint.view` / `create` / `update` / `delete` | admin |
| `automation.webhook_event.view` | admin |
| `automation.sync_run.view` | admin, support |
| `automation.sync_run.create` | admin, support |
| `automation.import.create` / `view` | admin |
| `automation.export.view` | todo usuario sobre sus exportaciones (cada exportación exige el `export` del módulo dueño) |
| `identity.audit_event.view` / `export` | admin |
| `automation.rich_text.view` / `create` (usar el editor, vista previa, variables e imágenes) | admin, sales, finance, support, documentation |
| `automation.rich_text_version.view` | admin, sales, finance, support, documentation |
| `automation.rich_text_version.create` (restaurar) | admin, documentation |

## 8. Pantallas

### P-AUT-01 · Reglas de automatización
- **Propósito:** definir qué pasa ante cada evento sin programar.
- **Rol principal:** admin
- **Columnas:** regla, evento, condiciones (resumen), acciones, marca, activa, últimas ejecuciones (éxito/fallo).
- **Filtros:** evento, activa, con fallos recientes.
- **Acciones:** Crear regla → `automation.automation_rule.create`; Activar/desactivar → `automation.automation_rule.update`; Duplicar → `automation.automation_rule.create`.
- **Vacío / error:** vacío con reglas sugeridas (backup fallido → ticket); error de carga con reintento.

### P-AUT-02 · Detalle de regla y ejecuciones
- **Propósito:** editar la regla y revisar sus ejecuciones.
- **Rol principal:** admin
- **Campos:** evento, constructor de condiciones, acciones con parámetros, prueba con un evento de ejemplo, historial de `automation_runs` con resultado por acción.
- **Filtros:** estado de ejecución, rango de fechas.
- **Acciones:** Guardar → `automation.automation_rule.update`; Probar con evento de ejemplo → `automation.automation_rule.view`; Eliminar → `automation.automation_rule.delete`.
- **Vacío / error:** condición inválida → 422 con campo; acción webhook sin endpoint activo → 422.

### P-AUT-03 · Plantillas de notificación
- **Propósito:** editar mensajes por canal, marca, idioma, país y servicio, y respuestas predefinidas.
- **Rol principal:** admin
- **Columnas:** clave, canal, marca, idioma, país, categoría de servicio, asunto, activa, última edición.
- **Filtros:** canal, marca, idioma, clave.
- **Acciones:** Crear plantilla → `automation.notification_template.create`; Editar con vista previa (abre P-AUT-11) → `automation.notification_template.update`; Enviar prueba a correo interno → `automation.notification_template.update`; Ver historial → `automation.rich_text_version.view`.
- **Vacío / error:** variable no documentada → 422; aviso si falta la versión en inglés de una plantilla en español.

### P-AUT-11 · Editor de plantillas de texto enriquecido
- **Propósito:** redactar plantillas de correo y avisos, respuestas predefinidas, cartas de respuesta del Libro y confirmaciones de formularios con formato y variables.
- **Rol principal:** admin
- **Campos:** clave, categoría, canal, marca, idioma, país, asunto, editor enriquecido (negrita, cursiva, listas, enlaces, tablas, imágenes), variables insertables del contexto, vista previa con datos de ejemplo o de un registro, lo que quitó el saneado, resumen del cambio.
- **Filtros:** no aplica.
- **Acciones:** Guardar → `automation.notification_template.update`; Vista previa → `automation.rich_text.view`; Insertar imagen → `automation.rich_text.create`; Enviar prueba a correo interno → `automation.notification_template.update`; Ver historial → `automation.rich_text_version.view`.
- **Vacío / error:** variable desconocida → 422 con la variable; plantilla de WhatsApp: editor en texto plano; carta del Libro solo por correo; contenido peligroso eliminado con aviso.

### P-AUT-12 · Historial de versiones del texto
- **Propósito:** ver quién cambió un texto enriquecido y restaurar una versión anterior.
- **Rol principal:** documentation
- **Columnas:** versión, fecha, autor, resumen del cambio, restaurada desde, comparación con la vigente.
- **Filtros:** tipo de registro, registro, campo, idioma.
- **Acciones:** Ver versión → `automation.rich_text_version.view`; Restaurar → `automation.rich_text_version.create`.
- **Vacío / error:** "Sin versiones anteriores"; restaurar sin permiso de editar el registro dueño → 403; nunca permite borrar ni editar una versión.

### P-AUT-04 · Registro de avisos enviados
- **Propósito:** saber si un aviso llegó y responder reclamos.
- **Rol principal:** finance
- **Columnas:** fecha, cliente, contacto/destinatario, canal, plantilla, evento, entidad, estado (enviado, entregado, abierto, rebotado, fallido), manual/automático.
- **Filtros:** cliente, canal, estado, evento, rango de fechas.
- **Acciones:** Reenviar → `automation.notification_delivery.create`; Ver contenido enviado → `automation.notification_delivery.view`.
- **Vacío / error:** "Sin avisos en el rango"; rebotes resaltados con enlace al contacto.

### P-AUT-05 · Webhooks salientes
- **Propósito:** que integradores reciban eventos del sistema.
- **Rol principal:** admin
- **Columnas:** URL, eventos, activo, últimas entregas (éxito/fallo), próximo reintento.
- **Filtros:** activo, con fallos.
- **Acciones:** Crear endpoint → `automation.webhook_endpoint.create`; Rotar secreto → `automation.webhook_endpoint.update`; Reenviar entrega → `automation.webhook_endpoint.update`; Eliminar → `automation.webhook_endpoint.delete`.
- **Vacío / error:** URL no HTTPS → 422; "Sin endpoints".

### P-AUT-06 · Sincronizaciones
- **Propósito:** ver cada corrida de cada conector y lanzar una manual.
- **Rol principal:** support
- **Columnas:** conector, cuenta, operación, inicio, fin, leídos, creados, actualizados, no encontrados, errores, estado.
- **Filtros:** conector, cuenta, estado, rango de fechas.
- **Acciones:** Sincronizar ahora → `automation.sync_run.create`; Ver errores → `automation.sync_run.view`.
- **Vacío / error:** "Sin corridas"; corrida en curso no permite lanzar otra para la misma cuenta (409).

### P-AUT-07 · Importaciones
- **Propósito:** migrar desde Excel con vista previa y validación fila por fila.
- **Rol principal:** admin
- **Columnas:** asistente: entidad, plantilla descargable, archivo, vista previa con filas válidas/erróneas, duplicados propuestos; historial de importaciones.
- **Filtros:** entidad, estado.
- **Acciones:** Descargar plantilla → `automation.import.view`; Subir y validar → `automation.import.create`; Confirmar importación → `automation.import.create`; Descargar reporte de errores → `automation.import.view`.
- **Vacío / error:** archivo con columnas faltantes → error con lista; confirmar con 0 filas válidas → 422.

### P-AUT-08 · Exportaciones
- **Propósito:** descargar las exportaciones solicitadas desde cualquier listado.
- **Rol principal:** todo el personal
- **Columnas:** fecha, entidad, filtros, formato, estado, vence, descarga.
- **Filtros:** estado.
- **Acciones:** Descargar → `automation.export.view`.
- **Vacío / error:** "Sin exportaciones"; enlace vencido → regenerar desde el listado de origen.

### P-AUT-09 · Auditoría
- **Propósito:** investigar cualquier cambio con un registro inalterable.
- **Rol principal:** admin
- **Columnas:** fecha, actor, acción, entidad, cambios (antes/después), resultado, IP, identificador de petición.
- **Filtros:** actor, entidad, acción, resultado, rango de fechas.
- **Acciones:** Verificar cadena → `identity.audit_event.view`; Exportar → `identity.audit_event.export`.
- **Vacío / error:** cadena rota → alerta visible con el primer evento inconsistente; sin resultados.

### P-AUT-10 · Webhooks entrantes
- **Propósito:** revisar eventos recibidos de proveedores (PayPal, Meta, WhatsApp, firma, facturación electrónica).
- **Rol principal:** admin
- **Columnas:** proveedor, identificador externo, firma válida, recibido, procesado, error.
- **Filtros:** proveedor, con error, firma inválida.
- **Acciones:** Reprocesar → `automation.webhook_event.view`; Ver payload → `automation.webhook_event.view`.
- **Vacío / error:** "Sin eventos"; reprocesar un evento ya procesado no duplica efectos (idempotente).

## 9. Eventos y jobs

- **Emite:** `NotificationSent`, `NotificationBounced`, `InboundEmailReceived`, `SyncCompleted`, `SyncFailed`, `ImportCompleted`, `ExportReady`, `AuditChainBroken`.
- **Escucha:** todos los eventos de dominio (motor de reglas y notificaciones).
- **Emite además:** `RichTextVersionCreated` (para auditoría y para invalidar la caché de las webs cuando el texto se muestra en WordPress).
- **Jobs:** `DispatchNotifications` (cola `notifications`); `DeliverOutboundWebhooks` (cola `notifications`); `ProcessWebhookEvents` (cola `critical` para pagos); `RunExport` / `RunImport` (cola `default`); `FetchInboundMail` (cada minuto si es IMAP); `PurgeExpiredExports` (diario).

## 10. Integraciones y conectores

- Elastic Email (correo saliente, rebotes, bajas).
- WhatsApp Business Platform (plantillas aprobadas por Meta).
- Correo entrante IMAP o webhook de entrada.
- Endpoints de webhooks de proveedores (`/api/v1/webhooks/<proveedor>`).
- Marco común de conectores: registro de `sync_runs`, limitador por conector en Redis, clasificación de errores, reintentos.

## 11. Ajustes administrables

- `notifications.whatsapp.enabled`
- `system.daily_jobs_time`
- `editor.html.allowed_tags`, `editor.html.allowed_attributes`, `editor.html.allowed_link_schemes`, `editor.images.max_mb`

## 12. Historias del backlog

- Importación por lotes del resto de entidades (bloque I)
- Conciliación contra proveedores (bloque I)
- Lista de verificación de puesta en marcha (bloque I)
- Exportación a Excel, CSV y PDF
- Plantillas por idioma, país, marca y servicio
- Motor de reglas por evento
- Registro de entregas y prevención de duplicados
- Webhooks salientes
- Correo saliente por Elastic Email
- Registro de avisos enviados
- Plantillas por marca e idioma con envío de prueba
- Marco de conectores con capacidades
- Destinatarios por tipo de aviso
- Avisos de cobranza por WhatsApp
- Importación y deduplicación de clientes

Épica "Editor de textos enriquecido":
- Componente de editor enriquecido con variables y vista previa
- Saneado del HTML enriquecido
- Imágenes del editor en almacenamiento propio
- Historial de versiones de textos enriquecidos
- Plantillas de correo, avisos y respuestas predefinidas con editor

## 13. Criterios de terminado y pruebas obligatorias

- Dos eventos idénticos para el mismo destinatario, entidad y periodo producen una sola entrega.
- Un webhook entrante repetido (mismo identificador externo) se confirma y descarta.
- Webhook con firma inválida no se procesa y queda registrado.
- Exportar sin el permiso `export` del módulo → 403; la exportación queda en auditoría y no contiene secretos.
- Importación con filas inválidas no confirma esas filas y entrega reporte.
- Plantilla con variable desconocida → 422; envío de prueba llega solo al correo interno.
- Contacto con baja comercial no recibe avisos comerciales pero sí transaccionales.
- Toda sincronización deja `sync_run` incluso si falla.
- Batería de cargas XSS (script, iframe, `onerror`, `javascript:`, `data:`, estilos en línea, SVG con script) contra el saneado: ninguna sobrevive al guardar ni a la vista previa; la base rechaza lo evidente aunque la aplicación falle.
- Guardar dos veces el mismo texto crea dos versiones con números consecutivos; restaurar crea una nueva y no borra ninguna; `UPDATE` de `rich_text_versions` → rechazado.
- Una imagen externa en el HTML se elimina; una imagen subida sin texto alternativo → 422.

## 14. Preguntas abiertas

- Ninguna de docs/00, sección 14 propia de este módulo; las plantillas de WhatsApp dependen de la aprobación de Meta (proceso externo).

## Anexo: nombres fuera del contrato

- `automation_runs.status`: `running`, `succeeded`, `failed`, `skipped`.
- `notification_delivery_events.status`: `queued`, `sent`, `delivered`, `opened`, `bounced`, `failed`, `complained` (la entrega en sí es de solo inserción; su estado vigente es el último evento).
- `outbound_webhook_deliveries.status`: `pending`, `succeeded`, `failed`.
- `sync_runs.status`: `running`, `succeeded`, `partial`, `failed`.
- `imports.status`: `uploaded`, `validating`, `validated`, `importing`, `completed`, `failed`, `cancelled`.
- `exports.status`: `queued`, `running`, `completed`, `failed`, `expired`.
- La pantalla de auditoría vive en AUT pero usa `identity.audit_event.view` / `export`, porque la tabla `audit_events` pertenece a IDN.
- Por docs/00 §27: tabla `rich_text_versions`; columnas `notification_templates.category` y `notification_templates.content_format`; permisos `automation.rich_text.*` (no es tabla) y `automation.rich_text_version.*`; endpoints `/admin/rich-text/sanitize`, `/admin/rich-text/preview`, `/admin/rich-text/variables`, `/admin/rich-text/images`, `/admin/rich-text-versions` y `/admin/rich-text-versions/{id}/restore`; evento `RichTextVersionCreated`.
