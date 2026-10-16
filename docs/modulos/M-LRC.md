# M-LRC · Complaints (Libro de Reclamaciones y datos personales)

> Módulo de código `app/Modules/Complaints` · clave de permiso `complaints` · código `LRC`.
> Fuente: `docs/00-requerimientos.md` sección 25 (apartado "Cumplimiento legal de las webs": Libro de Reclamaciones virtual y política de privacidad con registro de solicitudes), sección 26 (shortcode `[hub_libro_reclamaciones]` y reclamos de prueba), sección 27 (vista pública, hoja de reclamación numerada y respuesta con editor enriquecido), sección 8 (seguridad) y sección 23 (centro de configuración); contrato común de nombres.

## 1. Propósito y bloque

Cada web de marca (en WordPress, con el shortcode `[hub_libro_reclamaciones]` del plugin Hub Connector; el sistema guarda, numera y responde) tiene su Libro de Reclamaciones virtual, como exige la venta en línea en Perú: un formulario con los datos del consumidor, el servicio contratado, el monto, el tipo (reclamo o queja), el detalle y el pedido; un número correlativo por marca; una constancia automática al correo del consumidor; un ticket interno con plazo de respuesta y alertas antes del vencimiento; y un registro conservado para fiscalización y exportable. El mismo módulo recibe las solicitudes del titular de datos personales (acceso, rectificación, cancelación u oposición, Ley 29733) por el canal que indica la política de privacidad, con verificación de identidad, plazo y respuesta.

**Por qué es un módulo propio:** son registros legales con plazos, responsables propios (documentación y administrador), conservación, inmutabilidad de las respuestas y exportación para fiscalización. No dependen de la web: WordPress solo pone el enlace visible en todas las páginas y el formulario por shortcode, y la política de privacidad la publica WCN como documento legal. Las hojas creadas para probar el formulario se marcan como prueba y solo esas se eliminan, con constancia (docs/00 §26).

- **Bloque:** D. Ventas (después de WCN, HLP y CFG; antes de activar la compra en línea).
- **Depende de:** BRD (marca y datos de la empresa para la constancia), WCN (sitio WordPress de origen, `[hub_libro_reclamaciones]`, política de privacidad), HLP (ticket interno con plazo), CUS (cliente y exportación de datos personales), SRV (servicio reclamado), CFG (plazos, feriados y horario para días hábiles), AUT (correos, alertas, exportaciones y auditoría), IDN (archivos de constancia y respuesta).
- **Dependen de él:** ORD (la compra en línea no se activa sin el Libro habilitado), DSH (indicadores del grupo Reclamos: KPI-REC-01 a KPI-REC-06).
- **Usa además:** AUT (plantillas de carta `notification_templates.category = complaint_response` y saneado del editor enriquecido).

## 2. Alcance

**Incluye**
- Formulario público del Libro de Reclamaciones por sitio WordPress de marca (`[hub_libro_reclamaciones]`; la marca sale del sitio): datos del consumidor (nombre, documento, domicilio, correo, teléfono; representante si es menor de edad), servicio contratado, monto y moneda, tipo (reclamo o queja), detalle, pedido del consumidor, pedido o factura relacionada; declaración de veracidad y captcha.
- Número correlativo por marca (`complaints.number`, sin huecos ni repeticiones) y código visible (`complaints.code`) con el prefijo de la marca (`complaints.code_prefix`).
- Constancia automática en PDF al correo del consumidor con la hoja completa, fecha y plazo de respuesta; también descargable desde la confirmación.
- Ticket interno de tipo `complaint` con canal `web_form` y vencimiento igual al plazo de respuesta (`complaints.response_days`, días hábiles con feriados y horario de CFG).
- Alertas a documentación y al administrador `complaints.alert_days_before` días antes del vencimiento, y alerta diaria por cada hoja vencida sin respuesta.
- Respuesta al consumidor por correo con PDF, registrada sin poder editarse ni borrarse (`complaint_responses`), redactada con el editor enriquecido a partir de una plantilla de carta de la marca, con vista previa de la carta completa y registro de la fecha y de quién respondió (docs/00 §27).
- Vista pública del Libro en el panel: el formulario tal como lo ve el consumidor en cada web (mismos campos del reglamento y datos del proveedor que entrega `GET /public/wp/complaint-form` al plugin), para revisarlo sin registrar hojas.
- Hoja de reclamación numerada como constancia: el consumidor la recibe por correo con un enlace propio (token guardado solo como hash en `complaints.sheet_token_hash`) y en PDF; documentación la ve y la reenvía desde el panel.
- Consulta pública del estado de una hoja con su código y el correo del consumidor.
- Registro de hojas recibidas por otros canales (en nombre del consumidor) con el mismo correlativo.
- Hojas de prueba (docs/00 §26): el administrador marca como prueba, con motivo y MFA reciente, una hoja sin respuesta enviada; solo esas se eliminan junto con sus respuestas, y cada eliminación deja su constancia en `complaint_deletions` (número, código, motivo, quién la marcó y quién la eliminó, copia) y en auditoría.
- Registro conservado para fiscalización: las hojas reales no se borran (trigger `complaints_guard`); exportación del Libro por marca y rango con sus respuestas; anonimización del consumidor al cumplir `complaints.retention_years`.
- Solicitudes de derechos sobre datos personales (`privacy_requests`): formulario público del canal de la política de privacidad, registro manual, verificación de identidad, plazo por tipo (`complaints.privacy_response_days`), respuesta o rechazo con motivo, ejecución de la exportación (acceso) o de la anonimización (cancelación) respetando las retenciones legales.

**No incluye**
- Redacción de los documentos legales (asesoría legal) y su publicación (WCN, `legal_documents`).
- Resolver el fondo del reclamo: se gestiona en el ticket y en los módulos del servicio (SRV, BIL para notas de crédito o reembolsos).
- Envío a la autoridad: la exportación queda disponible para entregarla cuando se requiera.

## 3. Entidades

| Tabla | Campos clave | Notas |
|---|---|---|
| `complaints` | brand_id, wp_site_id, number, code, complaint_type (`claim`/`grievance`), consumer_name, consumer_document_type (`dni`/`ce`/`passport`/`ruc`), consumer_document_number, consumer_address, consumer_email, consumer_phone, is_minor, guardian_name, customer_id, service_id, service_description, amount_minor, currency, detail, consumer_request, status (`received`/`in_progress`/`answered`/`closed`), received_at, response_days, due_at, ticket_id, acknowledgement_file_id, acknowledgement_sent_at, sheet_token_hash, answered_at, closed_at, ip_hash, is_test, test_marked_at, test_marked_by, test_reason | Correlativo único por marca; solo se elimina si es de prueba |
| `complaint_responses` | complaint_id, body, body_html, template_id, previewed_at, preview_sha256, responded_by, sent_to_email, sent_at, file_id, is_final | No se editan; se borran solo con su hoja de prueba; el HTML enviado es el previsualizado (CHECK del hash) |
| `complaint_deletions` | complaint_id, brand_id, number, code, test_reason, test_marked_by, test_marked_at, deleted_by, snapshot | Solo inserción; justifica el hueco del correlativo |
| `privacy_requests` | brand_id, code, request_type (`access`/`rectification`/`cancellation`/`opposition`), requester_name, requester_email, requester_document_type (`dni`/`ce`/`passport`/`ruc`), requester_document_number, customer_id, detail, status (`received`/`in_progress`/`answered`/`rejected`), received_at, due_at, identity_verified_at, identity_verified_by, ticket_id, response_summary, response_file_id, answered_at | No se responde sin identidad verificada |

## 4. Casos de uso y flujos

1. **Habilitar el Libro** (admin): definir `complaints.response_days` (con asesoría legal) y, si se quiere, `complaints.code_prefix` por marca; crear el correlativo `complaint:<código de marca>` en `code_sequences`. Mientras `complaints.response_days` esté en `null`, el formulario muestra "En habilitación" con un correo de contacto y la compra en línea no se activa.
2. **Registrar desde la web** (público): el consumidor llena la hoja que muestra `[hub_libro_reclamaciones]` (el navegador la envía directo a `POST /public/complaints`) → validación y captcha → en una transacción: toma del correlativo con `hub_next_code()`, cálculo de `due_at` en días hábiles, creación del ticket y de la hoja → generación de la constancia en PDF y envío al correo → respuesta con el código y la constancia. Si el correo falla, la hoja queda registrada, se reintenta el envío y se alerta.
3. **Registrar en nombre del consumidor** (documentación): mismo flujo desde el panel con `Idempotency-Key`; la constancia se envía igual.
4. **Atender** (documentación o admin): tomar la hoja (`received` → `in_progress`), investigar en el ticket con los módulos del servicio, redactar la respuesta.
5. **Responder** (P-LRC-09): documentación elige una plantilla de carta de la marca (`notification_templates`, categoría `complaint_response`) → la completa con el editor enriquecido (variables de la hoja y del consumidor) → pide la vista previa (`POST /admin/complaints/{id}/responses/preview`), que sanea el HTML y devuelve la carta completa con membrete, datos de la hoja y firma, el hash y si se enviaría fuera de plazo → envía (`POST /admin/complaints/{id}/responses` con `preview_sha256`): se manda exactamente lo previsualizado al correo del consumidor con PDF y se registra en `complaint_responses` con `responded_by` y `sent_at`; una respuesta final pasa la hoja a `answered`. Responder fuera de plazo se permite y queda marcado. Si el texto cambió después de la vista previa, el envío responde 409 y pide una nueva vista previa.
6. **Alertas:** `CheckComplaintDeadlines` (diario) avisa en `complaints.alert_days_before` días hábiles antes del vencimiento y cada día después del vencimiento, una vez por hoja y umbral.
7. **Cerrar:** `answered` → `closed` cuando el ticket se resuelve; la hoja y sus respuestas se conservan.
8. **Consultar** (público): con código y correo; si no coinciden responde 404 sin revelar si el código existe.
9. **Exportar** (documentación o admin): por marca y rango, en CSV, Excel o PDF, con respuestas y fechas; la exportación queda en `exports` y en auditoría.
10. **Hoja de prueba** (admin): al probar el formulario en un sitio, la hoja de prueba se marca (`POST /admin/complaints/{id}/mark-test`, motivo y MFA reciente) y se elimina (`DELETE /admin/complaints/{id}`); se borran sus respuestas, queda la fila en `complaint_deletions` y el número aparece como hueco justificado en P-LRC-07 y en la exportación. Una hoja ya respondida al consumidor no se marca; una real responde 409.
11. **Solicitud de datos personales:** el titular la envía desde el canal de la política de privacidad (o se registra a mano) → ticket con plazo por tipo → documentación verifica la identidad (`received` → `in_progress`) → responde (`answered`) adjuntando la exportación de datos personales (acceso), aplicando la corrección (rectificación), anonimizando lo que la ley no obliga a conservar (cancelación) o dejando de usar los datos para la finalidad objetada (oposición, que también revoca `communication_consents`) → o rechaza con motivo (`rejected`).
12. **Vista pública** (P-LRC-08): documentación elige la marca y ve el formulario como el consumidor (datos del proveedor, campos del reglamento, declaración, plazo vigente y si el Libro está habilitado), sin poder enviarlo.
13. **Hoja de reclamación (constancia):** al registrar, el sistema genera un token aleatorio, guarda su hash en `complaints.sheet_token_hash` y envía al consumidor el enlace `GET /public/complaints/sheets/{token}` (P-LRC-10) y el PDF; reenviar la constancia no cambia el token. Un token desconocido responde 404 sin revelar nada.

## 5. Reglas de negocio clave

RN-LRC-001 a RN-LRC-016 (`docs/04`). El enlace al Libro está en todas las páginas de cada sitio. El correlativo es único y sin huecos por marca. La constancia sale siempre, aunque falle el primer envío. El plazo se copia a la hoja al registrarla y se cuenta en días hábiles. Las hojas reales no se borran y las respuestas no se editan; solo se eliminan hojas marcadas como prueba por el administrador, con constancia. La consulta pública exige código y correo; la hoja pública, el enlace con token. La carta de respuesta se sanea, se previsualiza y se envía exactamente como se vio, con fecha y quién respondió. Una solicitud de datos personales no se responde ni se rechaza sin verificar la identidad del titular, y la cancelación respeta las retenciones legales (comprobantes, el propio Libro).

## 6. Estados

- `complaints.status`: `received`, `in_progress`, `answered`, `closed` (máquina 29 de `docs/03`).
- `privacy_requests.status`: `received`, `in_progress`, `answered`, `rejected` (máquina 30 de `docs/03`).

## 7. Permisos

| Código | Rol por defecto |
|---|---|
| `complaints.complaint.view` | admin, documentation, support |
| `complaints.complaint.create` / `update` / `export` | admin, documentation |
| `complaints.complaint.delete` (marcar como prueba y eliminar solo hojas de prueba, con MFA reciente) | admin |
| `complaints.complaint_response.create` | admin, documentation |
| `complaints.privacy_request.view` | admin, documentation, support |
| `complaints.privacy_request.create` / `update` | admin, documentation |

El formulario público, la consulta pública, la hoja pública (enlace con token) y la solicitud de datos personales no usan permisos (captcha, límite por IP e `Idempotency-Key`). La vista previa de la carta usa `complaints.complaint_response.create`; la vista pública del Libro y la hoja en el panel, `complaints.complaint.view`; el editor, `automation.rich_text.view`.

## 8. Pantallas

### P-LRC-01 · Libro de Reclamaciones
- **Propósito:** atender todas las hojas de las marcas dentro del plazo.
- **Rol principal:** documentation
- **Columnas:** código, marca, tipo, consumidor, servicio, monto, recibida, vence, días hábiles restantes, estado, responsable del ticket.
- **Filtros:** marca, tipo, estado, por vencer en N días, vencidas, rango de fechas.
- **Acciones:** Registrar hoja → `complaints.complaint.create`; Exportar → `complaints.complaint.export`; Ver hojas de prueba eliminadas → `complaints.complaint.view`.
- **Vacío / error:** "Sin hojas registradas"; hojas vencidas resaltadas arriba; hojas de prueba con etiqueta "Prueba"; error de carga con reintento.

### P-LRC-02 · Detalle de hoja de reclamación
- **Propósito:** ver la hoja tal como la envió el consumidor y responderla.
- **Rol principal:** documentation
- **Campos:** hoja completa (solo lectura), constancia enviada, plazo y vencimiento, ticket enlazado, cliente y servicio relacionados, respuestas enviadas con fecha y autor.
- **Filtros:** no aplica.
- **Acciones:** Tomar → `complaints.complaint.update`; Responder al consumidor (abre P-LRC-09) → `complaints.complaint_response.create`; Ver hoja de reclamación → `complaints.complaint.view`; Reenviar constancia → `complaints.complaint.update`; Cerrar → `complaints.complaint.update`; Abrir ticket → `helpdesk.ticket.view`; Marcar como prueba → `complaints.complaint.delete`; Eliminar hoja de prueba → `complaints.complaint.delete`.
- **Vacío / error:** aviso fijo "La respuesta enviada no se puede editar"; respuesta fuera de plazo marcada; envío de correo fallido con reintento; "Marcar como prueba" no aparece en una hoja respondida y "Eliminar" solo aparece en una de prueba (confirmación escribiendo el código y MFA reciente).

### P-LRC-03 · Solicitudes de datos personales
- **Propósito:** cumplir los derechos del titular dentro del plazo.
- **Rol principal:** documentation
- **Columnas:** código, marca, tipo de derecho, titular, recibida, vence, identidad verificada, estado.
- **Filtros:** marca, tipo, estado, por vencer, vencidas.
- **Acciones:** Registrar solicitud → `complaints.privacy_request.create`.
- **Vacío / error:** "Sin solicitudes"; tipo con plazo sin definir marcado "plazo por definir".

### P-LRC-04 · Detalle de solicitud de datos personales
- **Propósito:** verificar la identidad y responder o rechazar con motivo.
- **Rol principal:** documentation
- **Campos:** solicitud, cliente relacionado, verificación (método y evidencia), respuesta, archivo entregado, ticket.
- **Filtros:** no aplica.
- **Acciones:** Verificar identidad → `complaints.privacy_request.update`; Generar exportación de datos personales → `customers.customer.export`; Responder → `complaints.privacy_request.update`; Rechazar con motivo → `complaints.privacy_request.update`.
- **Vacío / error:** "Responder" deshabilitado sin identidad verificada; datos que la ley obliga a conservar listados como excepción en la respuesta.

### P-LRC-07 · Hojas de prueba eliminadas
- **Propósito:** justificar ante una fiscalización cada número del correlativo sin hoja.
- **Rol principal:** documentation
- **Columnas:** marca, número, código, motivo, marcada por y cuándo, eliminada por y cuándo.
- **Filtros:** marca, rango de fechas.
- **Acciones:** Ver copia de la hoja → `complaints.complaint.view`; Exportar → `complaints.complaint.export`.
- **Vacío / error:** "Ninguna hoja de prueba eliminada"; nunca permite editar ni borrar una constancia.

### P-LRC-08 · Vista pública del Libro de Reclamaciones
- **Propósito:** revisar el formulario del Libro tal como lo ve el consumidor en la web de cada marca, sin registrar hojas.
- **Rol principal:** documentation
- **Campos:** marca, datos del proveedor (razón social, RUC y dirección de la entidad emisora), número con el formato de la marca (sin reservar correlativo), campos del consumidor, del menor y su representante, del bien contratado y monto, tipo con la explicación de reclamo y queja, detalle, pedido, declaración, captcha, plazo de respuesta vigente y estado (habilitado o en habilitación).
- **Filtros:** marca, idioma.
- **Acciones:** Cambiar de marca → `complaints.complaint.view`; Copiar shortcode → `web_connector.shortcode.view`.
- **Vacío / error:** "Libro en habilitación" mientras `complaints.response_days` sea `null`; el botón Enviar se muestra deshabilitado con el motivo "Vista previa: no registra hojas".

### P-LRC-09 · Responder hoja de reclamación
- **Propósito:** redactar, previsualizar y enviar la carta de respuesta al consumidor.
- **Rol principal:** documentation
- **Campos:** hoja (resumen), plazo y días hábiles restantes, plantilla de carta de la marca, editor enriquecido con variables de la hoja y del consumidor, marca de respuesta final, adjunto opcional, vista previa de la carta completa (membrete, datos de la hoja, cuerpo, firma), destinatario, aviso de fuera de plazo, respuestas ya enviadas con fecha y quién respondió.
- **Filtros:** no aplica.
- **Acciones:** Elegir plantilla → `automation.notification_template.view`; Vista previa de la carta → `complaints.complaint_response.create`; Enviar al consumidor → `complaints.complaint_response.create`; Subir imagen → `automation.rich_text.create`.
- **Vacío / error:** "Enviar" solo después de una vista previa del texto actual (si el texto cambia, vuelve a pedirla); lo que quitó el saneado se lista; envío fallido con reintento; confirmación con `ConfirmDialog` porque una respuesta enviada no se edita.

### P-LRC-05 · Libro de Reclamaciones (web de la marca)
- **Propósito:** que el consumidor registre un reclamo o una queja y reciba su constancia (formulario `[hub_libro_reclamaciones]` del plugin en la web WordPress de la marca).
- **Rol principal:** público
- **Campos:** datos de la empresa y de la marca (razón social, RUC, domicilio), datos del consumidor, representante si es menor, servicio contratado, monto, tipo con explicación de reclamo y queja, detalle, pedido, declaración de veracidad, captcha.
- **Filtros:** idioma.
- **Acciones:** Enviar → público; Descargar constancia → público; Consultar el estado de una hoja (código y correo) → público.
- **Vacío / error:** validación por campo; límite por IP → 429 con alternativa de contacto; Libro en habilitación → mensaje con correo de contacto.

### P-LRC-10 · Hoja de reclamación (constancia pública)
- **Propósito:** que el consumidor vea y descargue la hoja numerada que registró, como constancia.
- **Rol principal:** público
- **Campos:** número de la hoja, fecha y hora, datos del proveedor, datos del consumidor, bien contratado y monto, tipo, detalle, pedido, plazo de respuesta y estado.
- **Filtros:** idioma.
- **Acciones:** Descargar PDF → público; Imprimir → público.
- **Vacío / error:** enlace inválido → 404 genérico con el correo de contacto de la marca, sin revelar si la hoja existe; límite de peticiones → 429.

### P-LRC-06 · Solicitud de derechos sobre datos personales (web de la marca)
- **Propósito:** canal de la política de privacidad para ejercer los derechos de la Ley 29733.
- **Rol principal:** público
- **Campos:** tipo de derecho con explicación, nombre, correo, documento, detalle, captcha.
- **Filtros:** idioma.
- **Acciones:** Enviar → público.
- **Vacío / error:** validación por campo; acuse con código y plazo.

## 9. Eventos y jobs

- **Emite:** `ComplaintReceived`, `ComplaintStarted`, `ComplaintAnswered`, `ComplaintClosed`, `ComplaintDeadlineApproaching`, `ComplaintMarkedAsTest`, `ComplaintTestDeleted`, `PrivacyRequestReceived`, `PrivacyRequestIdentityVerified`, `PrivacyRequestAnswered`, `PrivacyRequestRejected`.
- **Escucha:** `TicketResolved` (HLP) para proponer el cierre de la hoja respondida.
- **Jobs:** `CheckComplaintDeadlines` (diario), `CheckPrivacyRequestDeadlines` (diario), `SendComplaintAcknowledgement` (cola `notifications`, con reintentos), `AnonymizeExpiredComplaints` (mensual, con `complaints.retention_years` definido).

## 10. Integraciones y conectores

- Sin conectores externos. Correo saliente por el canal de AUT; captcha por el proveedor de `orders.online.captcha_provider`.

## 11. Ajustes administrables

- `editor.html.allowed_tags`, `editor.html.allowed_attributes` y `editor.html.allowed_link_schemes` (saneado de la carta).
- `complaints.response_days` (por definir con asesoría legal tras la Ley 31435), `complaints.alert_days_before`, `complaints.code_prefix`, `complaints.public_limit_per_ip_per_day`, `complaints.retention_years` (por definir), `complaints.privacy_response_days` (por definir).
- Lee los feriados y el horario de atención de CFG para contar días hábiles.

## 12. Historias del backlog

- Libro de Reclamaciones virtual por marca
- Constancia y ticket con plazo del reclamo
- Respuesta, alertas de vencimiento y exportación del Libro
- Política de privacidad y solicitudes de datos personales
- Shortcodes de formularios, contacto, documentos legales y Libro de Reclamaciones

Épica "Libro de Reclamaciones: vista pública y respuesta":
- Vista pública del Libro de Reclamaciones
- Hoja de reclamación numerada como constancia
- Respuesta al consumidor con editor y plantillas
- Vista previa de la carta y envío al correo del consumidor

Épica "Reclamos de prueba":
- Marcar una hoja del Libro como prueba
- Eliminar solo hojas de prueba con constancia

## 13. Criterios de terminado y pruebas obligatorias

- Dos hojas simultáneas de la misma marca reciben números consecutivos distintos; un número repetido en la marca → rechazado; dos marcas tienen correlativos independientes.
- La hoja se registra aunque el correo de la constancia falle, y el envío se reintenta; la constancia incluye razón social, RUC, número, fecha y plazo.
- `due_at` cuenta días hábiles con los feriados de CFG; cambiar `complaints.response_days` no altera hojas ya registradas.
- Alertas en cada umbral de `complaints.alert_days_before`, una sola vez por hoja; hoja vencida alerta cada día.
- `DELETE` de una hoja real y `UPDATE` de una respuesta como rol de la aplicación → rechazados; `sales` y `finance` reciben 403 en `/admin/complaints`.
- Una hoja marcada como prueba se elimina con sus respuestas y deja su fila en `complaint_deletions`; marcar una hoja respondida o sin motivo → rechazado; `documentation` recibe 403 al marcar o eliminar; sin MFA reciente → 403 `mfa_required`.
- Consulta pública con correo equivocado → 404; el formulario respeta el límite por IP.
- Una solicitud de datos personales no se responde ni se rechaza sin identidad verificada; la cancelación anonimiza al cliente pero conserva comprobantes y hojas del Libro.
- Con `complaints.response_days` en `null`, el formulario no registra hojas y `orders.online.enabled` no puede activarse.
- Enviar una respuesta con un `preview_sha256` distinto del HTML enviado → 409 (y la base lo rechaza); una carta con `<script>` o enlace `javascript:` se sanea antes de la vista previa; la respuesta guarda `responded_by` y `sent_at`.
- La hoja pública con un token desconocido → 404 sin revelar nada; el token no se guarda en claro; la vista pública del Libro coincide con `GET /public/wp/complaint-form` de la misma marca.

## 14. Preguntas abiertas

- Plazo exacto de respuesta tras la Ley 31435, conservación del Libro y plazos por derecho de la Ley 29733: con asesoría legal (`docs/11`, D-28).
- Prefijo del código por marca y si cada marca usa su propia razón comercial en la constancia (siempre con el RUC único).

## Anexo: nombres fuera del contrato

- Clave de permiso `complaints` y código LRC (docs/00 §25); tablas `complaints`, `complaint_responses`, `privacy_requests`; valor `web_form` de `tickets.channel`.
- Tabla `complaint_deletions`, columnas `complaints.is_test`, `test_marked_at`, `test_marked_by`, `test_reason` y `wp_site_id`, permiso `complaints.complaint.delete` y endpoints `POST /admin/complaints/{id}/mark-test`, `DELETE /admin/complaints/{id}` y `GET /admin/complaint-deletions` (docs/00 §26).
- Por docs/00 §27: columnas `complaints.sheet_token_hash`, `complaint_responses.body_html`, `template_id`, `previewed_at`, `preview_sha256`; endpoints `POST /admin/complaints/{id}/responses/preview`, `GET /admin/complaints/{id}/sheet`, `GET /admin/complaints/public-form`, `GET /public/complaints/sheets/{token}` y `GET /public/wp/complaint-form`.
- Endpoints `POST /public/complaints`, `GET /public/complaints/{code}`, `POST /public/privacy-requests`; jobs `CheckComplaintDeadlines`, `CheckPrivacyRequestDeadlines`, `SendComplaintAcknowledgement`, `AnonymizeExpiredComplaints`.
