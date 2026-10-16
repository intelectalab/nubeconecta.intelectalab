# M-WCN · WebConnector (conector con las webs en WordPress)

> Módulo de código `app/Modules/WebConnector` · clave de permiso `web_connector` · código `WCN`.
> Fuente: `docs/00-requerimientos.md` sección 26 ("Webs en WordPress conectadas por shortcodes, servicios personalizados y ajustes del 8 de octubre") y la nota al inicio de la sección 25; sección 8 (seguridad), sección 24 (formularios de captación) y sección 27 (shortcodes `[hub_whois]` y `[hub_servidores]` y editor de textos enriquecido); contrato común de nombres. Especificación del plugin: `docs/13-plugin-wordpress-hub-connector.md`.

## 1. Propósito y bloque

Las webs públicas de las marcas se construyen en **WordPress Multisite** (un sitio por marca, con su dominio, tema, logo y colores) y muestran, mediante el plugin propio **Hub Connector**, todo lo que vive en el sistema: catálogo y precios, buscador de dominios, botones de contratar, formularios, datos de contacto, documentos legales, Libro de Reclamaciones, asistente y estado de los servicios. El sistema **no tiene CMS**: páginas, menús, FAQ, blog, base de conocimientos, página 404, SEO y palabras clave, aviso de cookies, píxeles y CSS personalizado se administran en WordPress.

Este módulo es el lado del sistema de esa conexión: registra los sitios WordPress de cada marca, emite sus tokens de solo lectura, avisa al plugin por webhook firmado cuando cambia lo que muestra, ofrece el generador de shortcodes y la API de lectura que consume el plugin, y guarda lo que el plugin muestra pero WordPress no debe guardar: los formularios (con sus envíos), los datos de contacto por marca y los documentos legales versionados con su aceptación registrada. El carrito, el pago y el portal siguen en el sistema central en alojamientoplus.com.

**Decisión de módulos:** WCN reemplaza al antiguo módulo Cms (código WEB). Los temas por marca pasan a BRD y solo aplican al portal y el carrito, al panel y a los correos (`docs/modulos/M-BRD.md`); el Libro de Reclamaciones sigue en LRC; el catálogo, los servicios personalizados y sus categorías en CAT. El plugin es un entregable aparte del área de desarrollo (`docs/13`), con su propio repositorio de código PHP para WordPress.

- **Bloque:** D. Ventas (después de BRD, CAT, SAL y HLP; la compra en línea de ORD, el asistente de AIA y el Libro de LRC se muestran a través de él).
- **Depende de:** IDN (usuarios y archivos), BRD (marcas), CAT (catálogo, categorías y tipos de servicio), SAL (canales de captación y prospectos), HLP (tickets), VLT (secreto de firma de cada sitio), CFG (ajustes), AUT (colas, avisos, alertas y auditoría).
- **Dependen de él:** ORD (aceptación de términos al comprar, página de agradecimiento), PRT (términos por aceptar), AIA y LRC (sitio de origen de conversaciones y hojas), el plugin Hub Connector (API de lectura y webhooks).

## 2. Alcance

**Incluye**
- Sitios WordPress conectados por marca (`wp_sites`): URL pública única (solo HTTPS), id del sitio en la red Multisite, ruta del plugin para el webhook, secreto de firma en la bóveda, orígenes permitidos para los envíos desde el navegador, página de agradecimiento tras la compra, versión del plugin y de WordPress informadas, última actividad.
- Tokens de solo lectura por sitio (`wp_site_tokens`): se crean en el panel (valor visible una sola vez), vencen según `web_connector.token_expiry_days`, se revocan con motivo; el plugin los usa desde el servidor de WordPress.
- Webhooks salientes de invalidación de caché (`wp_cache_invalidations`): al cambiar catálogo, precios, paquetes, promociones, extensiones, datos de contacto, documentos legales, formularios o tipos de servicio, aviso firmado con HMAC-SHA256 a cada sitio de la marca con alcance y claves; reintentos y alerta; invalidación manual desde el panel.
- API de lectura para el plugin (`/public/wp/...`): configuración del sitio, categorías del catálogo completo, planes por categoría o tipo personalizado, plan, comparador, paquete, precios de dominios, promoción, contacto, documento legal vigente, definición de formulario, estado de los servicios y, por docs/00 §27, planes de VPS y servidores dedicados con complementos (`GET /public/wp/servers`), búsqueda de dominio con WHOIS (`GET /public/wp/whois`, de DOM) y formulario del Libro (`GET /public/wp/complaint-form`, de LRC). La marca y el sitio salen del token.
- Shortcodes de docs/00 §27 (17 en total, docs/13): `[hub_whois]` (disponibilidad, precio por extensión, sugerencias de nombres y extensiones, WHOIS público respetando la privacidad y botones Registrar y Transferir al carrito; límite por visitante y captcha en DOM) y `[hub_servidores]` (VPS y dedicados con CPU, RAM, disco, transferencia, sistema operativo, ubicación y administración; filtros y configurador de complementos con precio en vivo), con sus bloques de Gutenberg y su entrada en el generador.
- Mensajes de confirmación de formularios escritos con el editor de textos enriquecido (AUT), saneados y con historial (`rich_text_versions`, campo `success_message`); los documentos legales también se redactan con el editor y conservan sus versiones propias.
- Generador de shortcodes en el panel: se elige el shortcode, la marca y las opciones; devuelve el shortcode y el bloque de Gutenberg equivalente listos para copiar, con vista previa. Todo servicio activo, incluidos los personalizados, aparece al instante.
- Constructor de formularios (`web_forms`, `web_form_fields`): campos de texto, área de texto, correo, teléfono, lista, casillas y archivo; obligatoriedad y validaciones; casilla de consentimiento con texto y finalidad; captcha; destino prospecto en el CRM, ticket o correo; responsable; mensaje de confirmación y página de redirección.
- Envíos de formularios (`web_form_submissions`): recepción pública con captcha, consentimiento, origen permitido, límite por IP e idempotencia; derivación en cola a prospecto, ticket o correo; bandeja con reintento y marca de spam; retención según `web_connector.forms.submission_retention_days`. WordPress no guarda nada.
- Datos de contacto por marca (`brand_contact_points`): teléfonos, correos, WhatsApp, dirección y horario, con uno principal por tipo, editables en el panel y reflejados en todas las webs de la marca.
- Documentos legales por marca (`legal_documents`, `legal_document_versions`): términos y condiciones por tipo de servicio, privacidad, reembolsos y cancelaciones, SLA, uso aceptable y aviso legal, con versiones validadas por la asesoría legal y una sola vigente; WordPress los muestra con `[hub_documento_legal]`. La política de cookies vive en WordPress.
- Aceptación registrada (`legal_acceptances`, solo inserción) de la versión vigente al comprar, al crear la cuenta y en el portal.
- Enlaces al sistema central ("Mi cuenta", "Contratar", "Pagar", "Soporte") con la marca de origen y el sitio, e identidad del sistema central por marca (`portal.central_identity`).
- Página de agradecimiento tras la compra (`wp_sites.thank_you_url`) con pedido, importe y moneda una sola vez por compra, para que los píxeles de WordPress registren la conversión.

**No incluye**
- Páginas, bloques, menús, novedades, blog, base de conocimientos de las webs, página 404 y de error, SEO y palabras clave, Google Search Console, redirecciones, biblioteca de medios, aviso y consentimiento de cookies, scripts y píxeles de marketing, CSS personalizado y tema de la web pública: viven en WordPress (Rank Math o Yoast, el plugin de cookies y el tema que se elijan; `docs/11`, D-32 y D-33).
- El código del plugin: lo especifica `docs/13` y lo construye el área de desarrollo como entregable aparte.
- Carrito, checkout y pago (ORD, BIL); asistente (AIA); Libro de Reclamaciones y datos personales (LRC); catálogo y tipos de servicio (CAT). WCN solo los expone por la API y los shortcodes.
- Redactar los documentos legales (asesoría legal).
- Escribir en WordPress: el sistema nunca escribe en WordPress; el plugin solo lee del sistema y recibe avisos.

## 3. Entidades

| Tabla | Campos clave | Notas |
|---|---|---|
| `wp_sites` | brand_id, name, base_url, network_site_id, status (`pending`/`active`/`disabled`), webhook_url, webhook_secret_id, allowed_origins, thank_you_url, plugin_version, wordpress_version, last_seen_at, last_invalidation_at, disabled_reason, deleted_at | URL HTTPS única en todo el sistema |
| `wp_site_tokens` | wp_site_id, name, token_hash, token_last_four, scope (`read`), expires_at, last_used_at, last_used_ip_hash, revoked_at, revoked_by, revoke_reason | Solo hash; un revocado no se reactiva |
| `wp_cache_invalidations` | wp_site_id, event_id, scope (`catalog`/`plan`/`bundle`/`domain_prices`/`promotion`/`contact`/`legal_document`/`form`/`service_status`/`all`), keys, trigger_event, status (`pending`/`delivered`/`failed`), attempts, next_retry_at, response_status, last_error, delivered_at, requested_by | Único por sitio y evento |
| `web_forms` | brand_id, code, name, status (`draft`/`active`/`inactive`), destination (`lead`/`ticket`/`email`), lead_channel_id, ticket_type, ticket_department, notify_email, owner_user_id, consent_required, consent_purpose (`marketing`/`privacy`), consent_text, captcha_required, success_message, redirect_url, deleted_at | Código único por marca: identifica el shortcode |
| `web_form_fields` | web_form_id, key, label, help_text, field_type (`text`/`textarea`/`email`/`phone`/`select`/`checkboxes`/`file`), is_required, options, validation, maps_to, position | Clave y posición únicas por formulario |
| `web_form_submissions` | web_form_id, brand_id, wp_site_id, idempotency_key, payload, file_ids, consent_given, consent_text, captcha_verified_at, page_url, attribution, status (`received`/`routed`/`failed`/`spam`), lead_id, ticket_id, emailed_at, routed_at, last_error, ip_hash | Único por formulario y clave de idempotencia |
| `brand_contact_points` | brand_id, kind (`phone`/`email`/`whatsapp`/`address`/`hours`), label, value, is_primary, is_public, position, deleted_at | Un principal por marca y tipo |
| `legal_documents` | brand_id, kind (`terms`/`privacy`/`refunds`/`sla`/`acceptable_use`/`legal_notice`), product_category_id, locale, title, slug, published_version_id, deleted_at | Uno por marca, tipo, idioma y tipo de servicio |
| `legal_document_versions` | legal_document_id, version_number, version_label, body, change_summary, legal_reviewed_by, legal_reviewed_at, effective_at, status (`draft`/`published`/`superseded`), published_at, published_by, superseded_at | Una sola vigente; publicar exige validación legal |
| `legal_acceptances` | legal_document_version_id, customer_id, user_id, context (`checkout`/`signup`/`portal`), checkout_session_id, ip_hash, user_agent_hash | Solo inserción |

## 4. Casos de uso y flujos

1. **Conectar un sitio** (admin): en P-WCN-01 registra el sitio de WordPress Multisite de la marca (URL, id en la red) → `pending`. En P-WCN-02 genera el secreto de firma (`POST …/webhook-secret`, visible una vez, guardado en VLT) y un token de solo lectura (`POST …/tokens`, visible una vez); el administrador de WordPress pega ambos y la URL del sistema en la configuración del plugin del sitio. El plugin lee `GET /public/wp/site` e informa su ruta de webhook; "Probar webhook" envía un aviso `all` firmado; con la prueba entregada, "Activar" pasa el sitio a `active`.
2. **Rotar o revocar un token** (admin): crear uno nuevo, pegarlo en el plugin y revocar el anterior con motivo; desde la revocación el plugin recibe 401 con el viejo y sigue mostrando su última copia.
3. **Mostrar el catálogo** (ventas): en P-WCN-03 elige el shortcode (por ejemplo `[hub_planes]`), la marca, el tipo (`hosting`, `vps`, … o un tipo personalizado), los ids, destacados, ciclo, moneda y columnas; copia el shortcode o el bloque y lo pega en la página de WordPress. El plugin lee `GET /public/wp/catalog/plans` y lo pinta con el tema del sitio.
4. **Invalidar la caché**: un cambio en CAT (precio, plan, ficha, paquete, extensión, tipo de servicio), BIL (promoción y cupón), WCN (contacto, documento legal, formulario) o MON (estado público) emite su evento de dominio; el oyente encola un `wp_cache_invalidations` por cada sitio `active` de la marca con el alcance y las claves; `SendWpCacheInvalidations` lo firma y lo envía a `webhook_url` con reintentos (hasta `web_connector.webhook.max_attempts`, espera de `web_connector.webhook.timeout_seconds`); el plugin verifica la firma y borra solo esas entradas de su caché. Un aviso fallido alerta al administrador; el plugin igual renueva al vencer `web_connector.cache_ttl_seconds`. Desde P-WCN-10 se pide una invalidación manual o se reintenta.
5. **Sistema caído**: el plugin muestra la última copia guardada hasta `web_connector.stale_max_hours`; luego, en lugar del bloque, un aviso con los datos de contacto de la marca (de su última copia). Nunca muestra un error técnico.
6. **Armar un formulario** (ventas): en P-WCN-04 y P-WCN-05 crea el formulario de la marca con su código, agrega campos (tipo, etiqueta por idioma, obligatoriedad, validaciones, opciones, dato del prospecto o ticket al que va), define consentimiento (texto con enlace a la política vigente), captcha, destino, responsable y mensaje; lo activa y lo inserta con `[hub_formulario id="código"]`.
7. **Recibir un envío** (público): el plugin pinta el formulario con su definición (`GET /public/wp/forms/{code}`); el navegador envía los datos directo al sistema (`POST /public/web-forms/{code}/submissions`, CORS limitado a `allowed_origins`) o, si el sitio usa el modo de reenvío del plugin, este los reenvía sin guardarlos. Se valida y se registra `received`; `RouteWebFormSubmission` crea el prospecto (canal del formulario, responsable o reglas de asignación, atribución UTM y consentimiento en `communication_consents`), el ticket (tipo, departamento, canal `web_form`, SLA) o el correo, y pasa a `routed`; si falla, `failed` con alerta y reintento.
8. **Datos de contacto** (ventas): en P-WCN-07 edita teléfonos, correos, WhatsApp, dirección y horario de cada marca, marca el principal de cada tipo y cuáles son públicos; al guardar se invalida la caché `contact` de los sitios de la marca; `[hub_contacto campo="whatsapp" formato="boton"]` los muestra.
9. **Documentos legales** (ventas o admin): crear el documento por marca y tipo (y por tipo de servicio en términos) → cargar el texto de la asesoría legal como borrador → registrar quién lo validó y la fecha de vigencia → publicar; la vigente anterior pasa a `superseded` y se invalida la caché `legal_document`. `[hub_documento_legal tipo="terminos"]` muestra la vigente con su versión y fecha. Al publicar términos nuevos, el portal pide aceptarlos a los clientes con servicios activos; el checkout siempre pide aceptar la versión vigente.
10. **Contratar desde la web**: `[hub_boton_contratar plan="…" ciclo="annual"]` y los botones de `[hub_planes]` llevan al carrito del sistema central con la marca de origen y el sitio; tras pagar, el cliente vuelve a `thank_you_url` del sitio con el código del pedido, el importe y la moneda (una sola vez por compra) y los píxeles de WordPress registran la conversión.
11. **Dar de baja un sitio** (admin): baja lógica que revoca sus tokens y cancela sus avisos pendientes.

## 5. Reglas de negocio clave

RN-WCN-001 a RN-WCN-020 (`docs/04`). Las webs públicas viven en WordPress y el sistema no tiene CMS. Un sitio pertenece a una marca, tiene URL HTTPS única y solo se activa con la prueba de webhook entregada. El token es de solo lectura, solo hash, vence y se revoca sin vuelta atrás. La API del plugin nunca devuelve datos de otra marca, costos, proveedores ni datos personales. Cada cambio de lo que muestra la web envía un aviso firmado a los sitios de la marca. El precio que muestra un shortcode es el que se factura. Los formularios exigen destino completo, consentimiento y captcha según su configuración y se derivan sin duplicar. Los datos de contacto tienen un principal por tipo. Cada documento legal tiene una sola versión vigente validada por la asesoría legal y la aceptación queda registrada sin poder alterarse. `[hub_whois]` y `[hub_servidores]` solo muestran lo vendible de la marca, nunca proveedor ni costo; el configurador suma importes del sistema y coincide con el carrito; el texto enriquecido llega saneado.

## 6. Estados

- `wp_sites.status`: `pending`, `active`, `disabled` (máquina 20 de `docs/03`).
- `web_forms.status`: `draft`, `active`, `inactive` (máquina 21 de `docs/03`).
- `web_form_submissions.status`: `received`, `routed`, `failed`, `spam` (máquina 31 de `docs/03`).
- `legal_document_versions.status`: `draft`, `published`, `superseded` (máquina 28 de `docs/03`).
- `wp_cache_invalidations.status`: `pending`, `delivered`, `failed`. Un fallo se reintenta hasta `web_connector.webhook.max_attempts` y alerta.
- `wp_site_tokens` no tiene estado: vigente, vencido (`expires_at`) o revocado (`revoked_at`).
- `legal_acceptances` no tiene estados: es solo de inserción.

## 7. Permisos

| Código | Rol por defecto |
|---|---|
| `web_connector.site.view` / `update` | admin, sales |
| `web_connector.site.create` / `delete` | admin |
| `web_connector.site_token.view` / `create` / `delete` | admin (crear exige MFA reciente) |
| `web_connector.cache_invalidation.view` / `create` | admin, sales |
| `web_connector.shortcode.view` | admin, sales |
| `web_connector.form.view` / `create` / `update` / `delete` | admin, sales |
| `web_connector.form_submission.view` | admin, sales, support |
| `web_connector.form_submission.update` | admin, sales |
| `web_connector.contact_point.view` | admin, sales, support |
| `web_connector.contact_point.create` / `update` / `delete` | admin, sales |
| `web_connector.legal_document.view` / `create` / `update` / `delete` / `approve` | admin, sales |
| `web_connector.legal_acceptance.view` | admin, sales |

La API de lectura del plugin (`/public/wp/...`) no usa permisos sino el token de solo lectura del sitio (esquema `wpSiteToken`); el envío público de formularios (`POST /public/web-forms/{code}/submissions`) usa captcha, origen permitido, límite por IP e `Idempotency-Key`.

## 8. Pantallas

### P-WCN-01 · Sitios WordPress conectados
- **Propósito:** ver qué webs de cada marca están conectadas y si el plugin está al día.
- **Rol principal:** admin
- **Columnas:** marca, nombre, URL, estado, versión del plugin y de WordPress, tokens vigentes, última lectura del plugin, último aviso entregado, avisos fallidos.
- **Filtros:** marca, estado, con avisos fallidos, plugin desactualizado.
- **Acciones:** Conectar sitio → `web_connector.site.create`; Abrir detalle → `web_connector.site.view`.
- **Vacío / error:** "Ninguna web conectada: instala el plugin Hub Connector en el WordPress de la marca y conéctalo aquí"; plugin bajo `web_connector.min_plugin_version` resaltado.

### P-WCN-02 · Detalle del sitio y tokens
- **Propósito:** configurar la conexión de un sitio y administrar sus credenciales.
- **Rol principal:** admin
- **Campos:** datos del sitio, ruta del webhook, orígenes permitidos, página de agradecimiento; tokens (nombre, últimos cuatro caracteres, creado, vence, último uso, revocado); secreto de firma (solo fecha de la última rotación); últimos avisos.
- **Filtros:** no aplica.
- **Acciones:** Guardar → `web_connector.site.update`; Crear token (se muestra una vez) → `web_connector.site_token.create`; Revocar token → `web_connector.site_token.delete`; Generar o rotar secreto de firma → `web_connector.site.update`; Probar webhook → `web_connector.site.update`; Activar o desactivar → `web_connector.site.update`; Dar de baja → `web_connector.site.delete`.
- **Vacío / error:** "Activar" deshabilitado con el motivo hasta tener token, secreto y prueba entregada; prueba fallida muestra el código HTTP y el error del plugin.

### P-WCN-03 · Generador de shortcodes
- **Propósito:** obtener sin escribir código el shortcode o el bloque de cualquier servicio, formulario o dato.
- **Rol principal:** sales
- **Campos:** marca, shortcode (los 17 de docs/13: los 15 de docs/00 §26 más `[hub_whois]` y `[hub_servidores]` de §27), opciones del shortcode (tipo, plan, ids, destacados, ciclo, moneda, columnas, campo, formato, tipo de documento, posición, extensiones, sugerencias, mostrar WHOIS, filtros, configurador…), vista previa con datos reales, shortcode y bloque de Gutenberg resultantes.
- **Filtros:** marca, categoría o tipo de servicio.
- **Acciones:** Generar → `web_connector.shortcode.view`; Copiar shortcode → `web_connector.shortcode.view`; Copiar bloque → `web_connector.shortcode.view`.
- **Vacío / error:** plan sin precio en la moneda o sin venta en línea → aviso en la vista previa; opción inválida → mensaje por campo.

### P-WCN-04 · Formularios
- **Propósito:** administrar los formularios que muestran las webs.
- **Rol principal:** sales
- **Columnas:** marca, código, nombre, destino, responsable, estado, envíos de los últimos 30 días, fallidos.
- **Filtros:** marca, destino, estado.
- **Acciones:** Crear formulario → `web_connector.form.create`; Editar → `web_connector.form.update`; Activar o desactivar → `web_connector.form.update`; Dar de baja → `web_connector.form.delete`.
- **Vacío / error:** "Sin formularios: crea el de contacto de la marca".

### P-WCN-05 · Editor de formulario
- **Propósito:** armar el formulario campo por campo sin programar.
- **Rol principal:** sales
- **Campos:** código, nombre, destino (prospecto con canal, ticket con tipo y departamento, o correo), responsable, consentimiento (finalidad y texto por idioma), captcha, mensaje de confirmación por idioma con el editor de textos enriquecido (historial de versiones), redirección; campos con tipo, etiqueta y ayuda por idioma, obligatoriedad, opciones, validaciones y dato de destino, ordenables por arrastre; vista previa.
- **Filtros:** no aplica.
- **Acciones:** Guardar → `web_connector.form.update`; Guardar campos → `web_connector.form.update`; Activar → `web_connector.form.update`; Copiar shortcode → `web_connector.shortcode.view`; Ver historial del mensaje → `automation.rich_text_version.view`.
- **Vacío / error:** clave repetida, lista sin opciones o destino incompleto → error por campo; formulario activo sin campos → "Activar" deshabilitado con motivo.

### P-WCN-06 · Envíos de formularios
- **Propósito:** ver lo que llegó de las webs y a dónde se derivó.
- **Rol principal:** sales
- **Columnas:** fecha, marca, sitio, formulario, nombre y correo (de los campos), consentimiento, estado, prospecto o ticket creado, error.
- **Filtros:** marca, sitio, formulario, estado, rango de fechas.
- **Acciones:** Ver detalle → `web_connector.form_submission.view`; Reintentar derivación → `web_connector.form_submission.update`; Marcar como spam → `web_connector.form_submission.update`; Abrir prospecto → `sales.lead.view`; Abrir ticket → `helpdesk.ticket.view`.
- **Vacío / error:** "Sin envíos en el rango"; envíos `failed` arriba con su error.

### P-WCN-07 · Datos de contacto por marca
- **Propósito:** mantener en un solo lugar los teléfonos, correos, WhatsApp, dirección y horario de cada marca.
- **Rol principal:** sales
- **Columnas:** marca, tipo, etiqueta, valor, principal, público, orden.
- **Filtros:** marca, tipo.
- **Acciones:** Agregar dato → `web_connector.contact_point.create`; Editar → `web_connector.contact_point.update`; Dar de baja → `web_connector.contact_point.delete`; Copiar shortcode → `web_connector.shortcode.view`.
- **Vacío / error:** teléfono sin formato internacional → error por campo; segundo principal del mismo tipo → 409 con opción de reemplazarlo.

### P-WCN-08 · Documentos legales
- **Propósito:** publicar y versionar los documentos legales de cada marca.
- **Rol principal:** sales
- **Columnas:** marca, tipo, tipo de servicio, idioma, versión vigente, vigente desde, validado por, borradores abiertos; historial con versión, estado, fechas y resumen de cambios.
- **Filtros:** marca, tipo, idioma, estado.
- **Acciones:** Crear documento → `web_connector.legal_document.create`; Nueva versión (con el editor de textos enriquecido y vista previa) → `web_connector.legal_document.update`; Publicar → `web_connector.legal_document.approve`; Ver aceptaciones → `web_connector.legal_acceptance.view`; Copiar shortcode → `web_connector.shortcode.view`.
- **Vacío / error:** marca con venta en línea sin términos, privacidad, reembolsos, SLA, uso aceptable o aviso legal: alerta "la compra en línea no cumple los requisitos"; publicar sin validación legal o sin fecha → 422.

### P-WCN-09 · Aceptaciones de documentos legales
- **Propósito:** demostrar ante un reclamo o una fiscalización qué aceptó cada persona y cuándo.
- **Rol principal:** admin
- **Columnas:** fecha, cliente, usuario, documento y versión, contexto (compra, registro, portal).
- **Filtros:** cliente, documento, versión, contexto, rango de fechas.
- **Acciones:** Exportar → `web_connector.legal_acceptance.view`.
- **Vacío / error:** "Sin registros en el rango"; nunca muestra IP ni identificador en claro.

### P-WCN-10 · Avisos de invalidación
- **Propósito:** comprobar que las webs se enteran al instante de cada cambio.
- **Rol principal:** admin
- **Columnas:** fecha, sitio, alcance, claves, evento que lo originó, estado, intentos, respuesta, error.
- **Filtros:** sitio, alcance, estado, rango de fechas.
- **Acciones:** Renovar caché ahora → `web_connector.cache_invalidation.create`; Reintentar → `web_connector.cache_invalidation.create`.
- **Vacío / error:** avisos fallidos resaltados con el último error; "Sin avisos en el rango".

### P-WCN-11 · Web de la marca en WordPress (contenido del sistema por shortcode)
- **Propósito:** que el visitante vea planes, precios, contacto, documentos legales, formularios, Libro de Reclamaciones, asistente y estado de los servicios dentro de la web WordPress de la marca.
- **Rol principal:** público
- **Campos:** lo que pinta cada shortcode o bloque del plugin con el tema del sitio: tarjetas de planes, comparador, paquete, precios por extensión, buscador de dominios, búsqueda con WHOIS (P-WCN-12), servidores VPS y dedicados con configurador (P-WCN-13), botón de contratar, formulario, contacto, documento legal vigente con versión y fecha, Libro de Reclamaciones, asistente, estado de servicios, promoción vigente y selector de moneda.
- **Filtros:** idioma; moneda (selector).
- **Acciones:** Contratar (lleva al carrito del sistema central, ORD) → público; Solicitar cotización (formulario) → público; Enviar formulario → público; Mi cuenta, Pagar y Soporte (sistema central) → público.
- **Vacío / error:** sistema sin respuesta → última copia; pasado `web_connector.stale_max_hours`, aviso con los datos de contacto de la marca; formulario inactivo → aviso con contacto.

### P-WCN-12 · Búsqueda de dominio y WHOIS en la web (`[hub_whois]`)
- **Propósito:** que el visitante sepa si un dominio está libre, cuánto cuesta por extensión y, si ya está registrado, sus datos públicos, y pueda registrarlo o transferirlo.
- **Rol principal:** público
- **Campos:** caja de búsqueda; resultado por extensión (disponible, registrado, reservado, no soportado o no verificable) con precio de registro, renovación y transferencia; sugerencias de nombres y extensiones alternativas; WHOIS público del dominio registrado (registrador, fechas, estado, servidores de nombres) sin datos del titular; captcha cuando se exige.
- **Filtros:** extensiones (atributo), moneda (selector o atributo), idioma.
- **Acciones:** Buscar → público; Registrar (al carrito con `register`) → público; Transferir (al carrito con `transfer`) → público; Resolver captcha → público.
- **Vacío / error:** registrador sin respuesta → "No pudimos verificar este dominio, intenta de nuevo" (nunca "disponible"); límite superado → "Intenta de nuevo en unos minutos"; captcha exigido tras varias consultas; resultados anunciados con `aria-live`.

### P-WCN-13 · Servidores VPS y dedicados en la web (`[hub_servidores]`)
- **Propósito:** que el visitante compare VPS y servidores dedicados y arme su servidor con complementos viendo el precio al instante.
- **Rol principal:** público
- **Campos:** tarjetas o tabla de planes con CPU (y procesador en dedicados), RAM, disco y tipo, transferencia, sistemas operativos, ubicación y administración; precio por ciclo; configurador con ciclo, sistema operativo y complementos (respaldos, licencia cPanel, IP adicional) y total en vivo.
- **Filtros:** tipo (VPS o dedicado), ubicación, sistema operativo, RAM, administrado, ciclo, moneda.
- **Acciones:** Configurar → público; Contratar (al carrito con plan, ciclo y complementos) → público; Solicitar cotización (planes sin venta en línea) → público.
- **Vacío / error:** "Sin planes con esos filtros"; plan sin precio en la moneda elegida no se muestra; sistema sin respuesta → última copia con aviso de contacto.

## 9. Eventos y jobs

- **Emite:** `WpSiteCreated`, `WpSiteActivated`, `WpSiteDisabled`, `WpSiteTokenCreated`, `WpSiteTokenRevoked`, `WpCacheInvalidationDelivered`, `WpCacheInvalidationFailed`, `WebFormActivated`, `WebFormDeactivated`, `WebFormSubmissionReceived`, `WebFormSubmissionRouted`, `WebFormSubmissionFailed`, `WebFormSubmissionMarkedSpam`, `LegalDocumentVersionPublished`, `LegalDocumentVersionSuperseded`.
- **Escucha:** cambios de catálogo y precios (CAT: planes, precios, fichas por marca, paquetes, extensiones y tipos de servicio con `ServiceTypeActivated` y `ServiceTypeArchived`), de cupones y promociones (BIL), de incidentes y mantenimientos públicos (MON), y los propios de contacto, documentos legales y formularios, para encolar avisos de invalidación.
- **Escucha además (docs/00 §27):** `RichTextVersionCreated` de mensajes de formularios y descripciones, para invalidar la caché `form` o `catalog`.
- **Jobs:** `SendWpCacheInvalidations` (cola `webhooks`, con reintentos y espera creciente), `RouteWebFormSubmission` (cola `default`), `PurgeWebFormSubmissions` (diario, con `web_connector.forms.submission_retention_days` definido), `ExpireWpSiteTokens` (diario: avisa antes del vencimiento y marca vencidos).

## 10. Integraciones y conectores

- Plugin **Hub Connector** para WordPress Multisite (PHP, entregable del área de desarrollo): especificación completa en `docs/13-plugin-wordpress-hub-connector.md`; ficha en `docs/08` (ficha 33).
- Webhook saliente firmado hacia la ruta REST del plugin (`/wp-json/hub-connector/v1/invalidate`): cabecera `X-Hub-Signature` con `t=<marca de tiempo>,v1=<HMAC-SHA256>` del cuerpo, secreto del sitio en la bóveda.
- Captcha del proveedor de `orders.online.captcha_provider` (por definir, `docs/11`, D-24).
- Sin conectores de proveedor propios para catálogo, formularios y legales: se leen por los `Contracts/` de CAT, SAL, HLP y BIL.

## 11. Ajustes administrables

- Plugin y caché: `web_connector.cache_ttl_seconds` (por marca), `web_connector.stale_max_hours`, `web_connector.min_plugin_version`, `web_connector.token_expiry_days`.
- Webhooks: `web_connector.webhook.timeout_seconds`, `web_connector.webhook.max_attempts`, `web_connector.webhook.secret_overlap_minutes`.
- Formularios: `web_connector.forms.captcha_required` (por marca), `web_connector.forms.submissions_per_ip_per_hour`, `web_connector.forms.max_file_mb`, `web_connector.forms.submission_retention_days` (por definir).
- Ayuda: `web_connector.kb_url` (URL de la base de conocimientos de la marca en WordPress, por definir).
- Buscador de dominios (`[hub_whois]`, se aplica en DOM): `web_connector.whois.limit_per_visitor_per_hour`, `web_connector.whois.captcha_after_lookups`, `web_connector.whois.cache_minutes`, `web_connector.whois.public_fields`, `web_connector.whois.suggestions_max`, `web_connector.whois.retention_days` (por definir).
- Lee `portal.central_identity` y `system.central_domains` para los enlaces al sistema central, `orders.online.enabled` para mostrar "Contratar" o "Solicitar cotización", `assistant.enabled` para `[hub_asistente]` y `complaints.response_days` para habilitar `[hub_libro_reclamaciones]`.

## 12. Historias del backlog

Épica "Plugin WordPress Hub Connector":
- Arquitectura del plugin para WordPress Multisite
- Configuración del plugin por sitio con token de solo lectura
- Caché del plugin con invalidación por webhook firmado
- Última copia cuando el sistema no responde
- Shortcodes de catálogo, dominios y contratación
- Shortcodes de formularios, contacto, documentos legales y Libro de Reclamaciones
- Shortcodes de asistente, estado de servicios, promociones y moneda
- Bloques de Gutenberg equivalentes a los shortcodes
- Seguridad, accesibilidad e idiomas del plugin
- Compatibilidad con Rank Math, Yoast y plugins de caché
- Pruebas, empaquetado y actualización del plugin

Épica "Conexión de sitios WordPress y shortcodes":
- Sitios WordPress conectados por marca
- Tokens de solo lectura revocables por sitio
- Webhooks de invalidación de caché al cambiar datos
- API de lectura para el plugin
- Generador de shortcodes en el panel
- Enlaces al sistema central con marca de origen
- Identidad del sistema central por marca
- Página de agradecimiento con conversión tras la compra

Épica "Constructor de formularios":
- Formularios con campos y validaciones administrables
- Consentimiento y captcha en los formularios
- Destino del envío: prospecto, ticket o correo
- Bandeja de envíos de formularios

Épica "Shortcodes de WHOIS y servidores":
- Shortcode de búsqueda de dominio y WHOIS
- Shortcode de servidores VPS y dedicados
- Configurador de complementos con precio en vivo
- Bloques de Gutenberg de WHOIS y servidores

Épica "Editor de textos enriquecido" (lado de WCN):
- Mensajes de formularios y descripciones de servicios con editor
- Editor enriquecido en contratos, documentos legales y ayuda

Épica "Datos de contacto y documentos legales por marca":
- Datos de contacto por marca
- Términos y condiciones por marca y servicio con versiones
- Aceptación registrada de la versión vigente de los términos
- Políticas de reembolsos, SLA, uso aceptable y aviso legal
- Documentos legales vigentes en la web por shortcode

## 13. Criterios de terminado y pruebas obligatorias

- Dos sitios con la misma URL (aunque sean de otra organización) → rechazado; un sitio sin HTTPS → rechazado; activar sin prueba de webhook entregada → 422.
- Un token revocado o vencido → 401 en toda la API del plugin y no se reactiva; el valor del token solo aparece en la respuesta de creación; `sales` recibe 403 al crear, ver o revocar tokens.
- Un token de la marca A no obtiene planes, contacto, formularios ni documentos de la marca B; ninguna respuesta de `/public/wp` incluye costos, proveedor, paquete de WHM, nodo, notas internas ni datos personales.
- Cambiar un precio encola un aviso por cada sitio activo de la marca; el aviso lleva firma HMAC verificable con el secreto del sitio y el plugin de prueba lo acepta; un aviso con firma inválida o marca de tiempo vieja es rechazado por el plugin; un aviso fallido reintenta y alerta.
- El precio de un plan en el shortcode es igual al de `plan_prices` de la marca y moneda, al del carrito y al facturado (prueba de extremo a extremo con el plugin en un WordPress de prueba).
- Un tipo de servicio personalizado activado aparece en el generador y en `[hub_planes tipo="…"]` sin cambiar el plugin.
- Un formulario con destino prospecto crea el prospecto con canal, responsable, atribución y consentimiento; reenviar el mismo envío no duplica; sin casilla de consentimiento obligatoria → 422; sin captcha cuando se exige → 422; envío desde un origen no permitido → 403; el límite por IP responde 429.
- Un segundo dato de contacto principal del mismo tipo → rechazado; un teléfono sin formato internacional → rechazado; cambiar un dato invalida la caché `contact`.
- Publicar una versión legal sin validación de la asesoría legal → rechazado; una sola versión vigente; un documento de cookies → rechazado; la compra registra la aceptación de la versión vigente y el portal pide aceptar términos nuevos.
- `[hub_whois]` con un dominio libre lleva al carrito con `register` y la marca de origen; con uno registrado muestra solo los campos públicos permitidos; `[hub_servidores]` no devuelve proveedor, plan de origen ni costo; el total del configurador es igual al del carrito y al facturado; generador y bloques de los dos shortcodes producen el mismo HTML.
- No existe ninguna ruta del antiguo CMS (`/admin/cms/...`, `/public/site/...`, `/webhooks/wordpress`): prueba de arquitectura contra el OpenAPI.

## 14. Preguntas abiertas

- Tema y constructor de páginas de WordPress a usar, plugin de SEO (Rank Math o Yoast), plugin de cookies y de caché, y hosting del WordPress Multisite (`docs/11`, D-32 y D-33).
- Migración del contenido de las webs actuales a WordPress (D-23).
- Subdominios definitivos del sistema central e identidad visual para clientes de otras marcas (D-19 y D-20).
- Documentos legales de cada marca y validación de la asesoría legal (D-27).
- Conservación de los envíos de formularios (`web_connector.forms.submission_retention_days`) con la política de privacidad.

## Anexo: nombres fuera del contrato

- Clave de permiso `web_connector` y código WCN (docs/00 §26), que reemplazan a `cms` y WEB.
- Tablas `wp_sites`, `wp_site_tokens`, `wp_cache_invalidations`, `web_forms`, `web_form_fields`, `web_form_submissions` y `brand_contact_points` (docs/00 §26); `legal_documents`, `legal_document_versions` y `legal_acceptances` pasan del antiguo WEB a WCN.
- Esquema de seguridad `wpSiteToken` del OpenAPI y endpoints `GET /public/wp/site`, `/public/wp/catalog/*`, `/public/wp/promotions/{id}`, `/public/wp/contact`, `/public/wp/legal-documents/{kind}`, `/public/wp/forms/{code}`, `/public/wp/service-status` y `POST /public/web-forms/{code}/submissions`; por docs/00 §27, `GET /public/wp/servers` (WCN), `GET /public/wp/whois` (DOM) y `GET /public/wp/complaint-form` (LRC), bloques `hub-connector/whois` y `hub-connector/servidores` y la ruta de reenvío del plugin `/wp-json/hub-connector/v1/whois`.
- Jobs `SendWpCacheInvalidations`, `RouteWebFormSubmission`, `PurgeWebFormSubmissions`, `ExpireWpSiteTokens`; ruta REST del plugin `/wp-json/hub-connector/v1/invalidate`.
