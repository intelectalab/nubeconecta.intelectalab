# 06 — Guía de la API

Esta guía acompaña a `api/openapi.yaml`, la especificación de la API REST de la plataforma (nombre de trabajo `hub`). El cliente TypeScript del frontend (`/frontend/packages/api`) se genera desde ese archivo. Toda la API respeta los nombres del contrato común (`docs/01-contrato-de-nombres.md`) y las convenciones del kit (sección 9). Si este documento y el kit no coinciden, prevalece el kit (secciones 13 a 27) y, en nombres, el contrato.

## 1. Alcance del archivo

| Prefijo | Para quién | Operaciones |
| --- | --- | --- |
| `/api/v1/admin/...` | Panel interno: 26 módulos más Dashboard | 936 |
| `/api/v1/portal/...` | Portal del cliente por marca | 73 |
| `/api/v1/public/...` | Formularios de captación, enlaces con token, API pública con token bearer; API de lectura del plugin de WordPress (`/public/wp/...`, con el token del sitio); envío público de formularios del constructor; tema del portal, catálogo, carrito, disponibilidad de dominio, asistente, Libro de Reclamaciones con su hoja pública y solicitudes de datos personales; por docs/00 §27, servidores, búsqueda de dominio con WHOIS y formulario del Libro para el plugin | 54 |
| `/api/v1/webhooks/<proveedor>` | Webhooks entrantes: paypal, card-gateway, whatsapp, meta-leads, elastic-email, einvoice | 8 |
| `/api/v1/auth/...` | Inicio de sesión, MFA (TOTP y código al correo), dispositivos de confianza, contraseña y sesiones (compartido por panel y portal) | 19 |
| **Total** | **733 rutas** | **1090 operaciones** |

Cada operación tiene un `operationId` único (camelCase en inglés), un `summary` en español, un tag por módulo (por ejemplo `Billing (BIL)`) y estas extensiones:

| Extensión | Dónde | Significado |
| --- | --- | --- |
| `x-permission` | Toda operación de `/admin` y `/portal` | Permiso que valida el backend, con el formato `<clave_modulo>.<entidad>.<accion>` |
| `x-module` | Todas las operaciones | Código corto del módulo (`IDN`, `BIL`…). `DSH` = Dashboard y `PRT` = Portal, que no son módulos de backend |
| `x-requires-recent-mfa` | Revelar secreto, ejecutar en servidor, migrar o revertir, reembolsar, crear enlace de un solo uso, restablecer MFA | Exige MFA más reciente que `security.sensitive_action_mfa_max_age_minutes` (10 minutos por defecto) (`POST /auth/mfa/step-up`). Si falta, responde 403 con `code=mfa_required` |
| `x-token-ability` | API pública con token bearer | Habilidad que debe tener el token (`services:read`, `tickets:write`…) |
| `x-export-permissions` | `POST /admin/exports` | Permisos `<modulo>.<entidad>.export` que la política exige según la entidad exportada |
| `x-table` | Esquemas de `components.schemas` | Tabla de `database/schema.sql` que respalda el esquema: cada propiedad es una columna (un `Money` llamado `x` es `x_minor` + moneda) |
| `x-derived` | Propiedades de esquema | La propiedad no es columna de la tabla; el texto dice de dónde sale (otra tabla, un ajuste o un cálculo) |
| `x-enum-source` | Propiedades de esquemas de entrada | Columna `tabla.columna` cuyo `CHECK` define los valores del enum |

La lista completa de permisos usados (641 códigos, sin duplicados) está en `database/seeds/permissions.json`, que se genera desde el OpenAPI y alimenta el seeder de `permissions`.

## 2. Convenciones

| Tema | Convención |
| --- | --- |
| Base y versión | `/api/v1`. Un cambio que rompe compatibilidad abre `/api/v2`; dentro de `v1` solo se agregan campos, rutas u operaciones |
| Rutas | Sustantivos en plural, en inglés y en kebab-case: `/admin/customers/{id}/services`, `/admin/service-map/projects` |
| Acciones de negocio | Verbo como subrecurso con `POST`: `/admin/invoices/{id}/issue`, `/admin/services/{id}/suspend`, `/admin/domain-operations/{id}/approve` |
| Identificadores | UUID v7 en `{id}`. Los correlativos legibles (`CLI-000123`, número de factura) son campos, nunca parte de la ruta |
| Respuesta | `{ "data": ..., "meta": ..., "links": ... }`. Un recurso: `XResource` (`{data}`); un listado: `XCollection` (`{data, meta, links}`) |
| Esquemas | `X` (lectura, campos de solo lectura marcados `readOnly`) y `XInput` (escritura) en `components/schemas`. Los campos internos (costos, proveedor, notas internas, accesos) no existen en los esquemas del portal (`Portal*`) |
| Dinero | Esquema `Money`: `amount_minor` (entero int64, unidad menor) + `currency` (`PEN` o `USD`). Los costos de proveedor usan `ProviderMoney`, que admite cualquier código ISO 4217 |
| Fechas | `date-time` en UTC (ISO 8601); fechas de negocio sin hora como `date`. El frontend las muestra en la zona del usuario |
| Estados | Valores en inglés tal como los fija el contrato (por ejemplo `invoices.status`: `draft, issued, partially_paid, paid, overdue, void`). Las transiciones se piden con acciones o con `POST .../transition` (`TransitionInput`); una transición no permitida responde 409 `invalid_transition` |
| Concurrencia | Cada recurso trae `version`. `PATCH` exige `version` en el cuerpo (`VersionGuard`); si no coincide responde 409 `version_conflict` |
| Idioma | Cabecera `Accept-Language` (`es`, `en`); los mensajes de error y validación salen traducidos |
| Exportación | Cada listado exportable tiene `POST /admin/<recurso>/exports` con su propio permiso `<modulo>.<entidad>.export` (por ejemplo `POST /admin/products/exports` → `catalog.product.export`); crea una fila en `exports` (`report` = recurso) y responde 202. `POST /admin/exports` es la entrada genérica (exige `automation.export.create` más el permiso de la entidad). `GET /admin/exports/{id}` devuelve el estado y el enlace firmado al terminar. No existe exportación de secretos |
| Archivos | `POST /admin/files` (multipart), análisis antivirus en cola y descarga solo por enlace firmado de corta duración (`FileLink`) |

## 3. Listados, filtros y paginación por cursor

Todo listado acepta los parámetros reutilizables de `components/parameters`:

```text
GET /api/v1/admin/services?filter[status]=active&filter[customer_id]=<uuid>&sort=-created_at&page[size]=25&page[cursor]=<cursor>&include=customer,plan
```

- `filter[campo]`: estilo `deepObject`. Los filtros admitidos por entidad los declara el Form Request del endpoint.
- `sort`: campos separados por coma; `-` delante significa descendente.
- `page[size]`: 25 por defecto, 100 como máximo.
- `page[cursor]`: cursor opaco. La respuesta trae `meta.next_cursor`, `meta.prev_cursor` y `meta.has_more`, y en `links` las URL `next` y `prev`. No hay paginación por número de página porque desplazaría filas al insertar.
- `include`: relaciones a incorporar en la misma respuesta.

## 4. Autenticación

| Superficie | Mecanismo (`securitySchemes`) | Detalle |
| --- | --- | --- |
| Panel y portal | `sessionCookie` + `xsrfHeader` (seguridad global) | Sanctum en modo SPA: `GET /sanctum/csrf-cookie` (fuera de `/api/v1`), luego `POST /auth/login`. Cookie `HttpOnly`, `Secure`, `SameSite`; cabecera `X-XSRF-TOKEN` en toda petición que modifica datos |
| MFA | TOTP o código al correo | Si la política exige segundo factor (por rol o por tipo de usuario; `security.mfa.*`) y el dispositivo no es de confianza, el login responde `mfa_required=true` y se completa con `POST /auth/mfa/verify` (`method` = `totp`, `email` o `recovery`; `trust_device` para recordar el dispositivo). El código al correo se pide con `POST /auth/mfa/email-code`, vence y se usa una sola vez. Alta de TOTP con `POST /auth/mfa/totp` y `/confirm`, baja con `DELETE /auth/mfa/totp` (MFA reciente); alta por correo con `POST /auth/mfa/email/confirm`. `POST /auth/mfa/step-up` renueva la marca de MFA reciente |
| Sesiones y dispositivos | — | `GET /auth/sessions` y `DELETE /auth/sessions/{sessionId}` para cierre remoto; `GET /auth/trusted-devices` y `DELETE /auth/trusted-devices/{deviceId}`; el administrador lo hace por usuario en `/admin/users/{id}/sessions` y `/admin/users/{id}/trusted-devices`. Contraseña: `POST /auth/password/change` con la política de `GET /auth/password-policy` |
| API pública | `bearerToken` | Token personal de Sanctum creado en `/admin/api-tokens`, con habilidades (`x-token-ability`) y acotado a un cliente |
| Plugin de WordPress | `wpSiteToken` (bearer) | Token de solo lectura de un sitio conectado (`wp_site_tokens`), creado en `/admin/web-connector/sites/{id}/tokens` y revocable; la marca y el sitio salen del token. Solo en `/public/wp/...`; lo envía el servidor de WordPress con `X-Hub-Plugin-Version` (versión menor que `web_connector.min_plugin_version` → 426) |
| Formularios del constructor | Sin sesión (`security: []`) | `POST /public/web-forms/{code}/submissions`: captcha, consentimiento, origen permitido del sitio (CORS), límite por IP e `Idempotency-Key` |
| Formularios de captación | `formKey` (cabecera `X-Form-Key`) | Clave por formulario, rotable (`/admin/lead-forms/{id}/rotate-key`), con origen permitido, campo trampa, captcha y límite por IP |
| Enlaces con token | Sin sesión (`security: []`) | Confirmación de operación de dominio, enlace de un solo uso, encuesta y baja de comunicaciones. Tokens de un solo uso con vencimiento; un token usado o vencido responde 410 |
| Webhooks | `paypalSignature`, `cardGatewaySignature`, `metaSignature`, `sharedSecretSignature` | Ver la sección 8 |

**Autorización.** El backend valida siempre `x-permission` con la política del recurso. Además, la política filtra por `organization_id` y, en el portal, por el cliente del usuario: un identificador de otra organización o de otro cliente responde 404 (no 403), para no confirmar que existe. El frontend recibe la lista de permisos en `GET /auth/me` y solo oculta lo que el usuario no puede hacer.

**Acciones del cliente con interruptor.** `cpanel_login`, `usage_view`, `dns_change` y `server_reboot` se administran en `/admin/customer-action-flags` (a nivel general o por cliente, con auditoría). Con el interruptor apagado, el portal responde 403 con `code=flag_disabled`. Estado inicial: cPanel y consumo activos; cambio de DNS y reinicio construidos pero apagados.

## 5. Errores (RFC 9457)

Todas las respuestas de error usan `application/problem+json` con el esquema `Problem`:

```json
{
  "type": "https://hub.example/problems/validation",
  "title": "Datos inválidos",
  "status": 422,
  "code": "validation_failed",
  "detail": "Revise los campos marcados.",
  "errors": { "due_date": ["La fecha de vencimiento es obligatoria."] },
  "request_id": "01J..."
}
```

| HTTP | `code` estables | Cuándo |
| --- | --- | --- |
| 400 | `bad_request` | JSON mal formado o parámetros imposibles de interpretar |
| 401 | `unauthenticated`, `invalid_signature` | Sin sesión o token; firma de webhook inválida |
| 403 | `forbidden`, `mfa_required`, `flag_disabled` | Sin permiso, sin MFA reciente o acción del cliente apagada |
| 404 | `not_found` | No existe o pertenece a otra organización o cliente |
| 409 | `version_conflict`, `invalid_transition`, `preview_outdated` | Versión desactualizada, transición de estado no permitida o carta del Libro distinta de su última vista previa |
| 410 | `token_expired`, `token_used` | Enlace de un solo uso o token de confirmación ya usado o vencido |
| 422 | `validation_failed`, `idempotency_key_reused`, `contract_required` | Validación, clave de idempotencia reutilizada con otro cuerpo, activación sin contrato vigente |
| 429 | `rate_limited`, `captcha_required` | Límite por IP, por visitante, por cuenta o de revelaciones por hora; `captcha_required` cuando la búsqueda de dominio de la web exige captcha (`web_connector.whois.captcha_after_lookups`) |

`code` es el valor que usa el frontend para decidir qué mostrar; `title` y `detail` salen traducidos según `Accept-Language`. Nunca incluyen valores sensibles.

## 6. Idempotencia

El contrato exige la cabecera `Idempotency-Key` en pagos, pedidos, aprovisionamiento, emisión de facturas y operaciones de dominio. En el OpenAPI se declara como parámetro obligatorio (`components/parameters/IdempotencyKey`) en 69 operaciones:

| Grupo | Operaciones |
| --- | --- |
| Pagos | `createPayment`, `createPaymentFromStatementLine`, `validatePayment`, `rejectPayment`, `refundPayment`, `requestPaymentRefund`, `authorizePaymentRefund`, `createPaymentDispute`, `createPaymentAllocation`, `deletePaymentAllocation`, `applyCreditBalance`, `createPaymentPromise`, `portalCreateCardCheckout`, `portalCreatePaypalOrder`, `portalCapturePaypalOrder`, `portalSubmitVoucher`, `portalPayCheckoutWithCard`, `portalCreateCheckoutPaypalOrder`, `portalCaptureCheckoutPaypalOrder`, `portalSubmitCheckoutVoucher` |
| Pedidos y compra en línea | `createOrder`, `approveOrder`, `markOrderTested`, `activateOrder`, `cancelOrder`, `convertLead`, `convertQuoteToOrder`, `portalCreateCheckoutSession`, `approveCheckoutSession`, `rejectCheckoutSession`, `completeCheckoutSession` |
| Aprovisionamiento y restauraciones | `provisionOrder`, `suspendService`, `reactivateService`, `terminateService`, `renewService`, `rebootServer`, `createServerSnapshot`, `runMigrationBatch`, `transitionMigrationItem`, `revertMigrationItem`, `executeChangeRequest`, `commitImport`, `createRestoreRequest`, `portalCreateRestoreRequest`, `approveRestoreRequest`, `startRestoreRequest` |
| Emisión de facturas | `issueInvoice`, `voidInvoice`, `createCreditNote`, `createDebitNote`, `retryEinvoiceSubmission`, `generateRenewalInvoices`, `rebillProviderBill` |
| Operaciones de dominio y precios de extensiones | `requestDomainOperation`, `approveDomainOperation`, `completeDomainOperation`, `renewDomain`, `portalRequestDomainOperation`, `publicConfirmDomainOperation`, `scheduleDomainPriceChange` |
| Registros legales (docs/00 §25) | `publicCreateComplaint`, `createComplaint`, `respondComplaint`, `publicCreatePrivacyRequest`, `createPrivacyRequest`, `portalAcceptLegalDocument` |
| Tareas | `approveTask` |
| API pública | `apiCreateTicket` |

Comportamiento (docs/00, sección 10):

1. El middleware guarda la clave en `idempotency_keys` con el hash de la petición (método, ruta, cuerpo, usuario) y, al terminar, la respuesta.
2. Una repetición con la misma clave y el mismo cuerpo devuelve la respuesta guardada, sin ejecutar de nuevo.
3. La misma clave con otro cuerpo responde 422 `idempotency_key_reused`.
4. Mientras la primera petición está en curso, una repetición espera o responde 409; nunca ejecuta en paralelo.
5. El frontend genera la clave (UUID) al abrir el formulario o el diálogo de confirmación, no en cada clic.

Las operaciones que llaman a un proveedor responden 202 y siguen en cola (`provisioning`, `billing`, `critical`). Cada intento de aprovisionamiento es una fila en `provisioning_runs`, y antes de reintentar una creación se consulta al proveedor si el recurso ya existe.

## 7. Versionado y compatibilidad

- La versión mayor va en la ruta (`/api/v1`). `info.version` del OpenAPI sigue SemVer y sube con cada cambio publicado.
- Dentro de `v1` solo se agregan cosas: campos opcionales, valores nuevos en catálogos administrables, rutas y operaciones. Quitar o renombrar un campo, cambiar un tipo o volver obligatorio un campo exige `v2`, con convivencia de ambas versiones durante la transición.
- Un campo que se va a retirar se marca `deprecated: true` en el OpenAPI antes de retirarlo, igual que las migraciones compatibles hacia atrás de la sección 12 del kit.
- El cliente TypeScript se regenera en el pipeline; si el OpenAPI cambia sin regenerar, el paso de pruebas falla.
- **Versión de OpenAPI:** el kit (sección 9) indica OpenAPI 3.1; este paquete se entregó en 3.0.3 por requisito del encargo y por compatibilidad con validadores y generadores. Los únicos rasgos propios de 3.0 que usa son `nullable` y `example`, así que la conversión a 3.1 es mecánica. La decisión queda en manos del ingeniero a cargo.

## 8. Webhooks entrantes

| Ruta | Proveedor | Firma (`securitySchemes`) | Cola | Efecto |
| --- | --- | --- | --- | --- |
| `POST /webhooks/paypal` | PayPal | `paypalSignature`: cabeceras `PAYPAL-TRANSMISSION-*` verificadas con la API de verificación de PayPal | `critical` | El pago pasa a `validated` solo con captura completada e importe coincidente; la comisión real se guarda en `fee_minor` |
| `POST /webhooks/card-gateway` | Pasarela de tarjetas local (por elegir) | `cardGatewaySignature`: HMAC-SHA256 del cuerpo crudo con el secreto de webhooks de la pasarela; cabecera y algoritmo exactos según la pasarela elegida | `critical` | Pago aprobado con importe y moneda iguales al intento → pago `validated` sin finanzas; rechazado → intento `declined`; reembolso → `payment_refunds`; contracargo → `payment_disputes`, pago `charged_back`, factura con saldo y alerta |
| `GET` y `POST /webhooks/whatsapp` | WhatsApp Business Platform | `metaSignature`: `X-Hub-Signature-256` (HMAC-SHA256 del cuerpo crudo con el secreto de la aplicación). El `GET` responde `hub.challenge` | `notifications` | Mensajes a la bandeja compartida, creación directa de tickets y estados de entrega |
| `GET` y `POST /webhooks/meta-leads` | Formularios de Facebook e Instagram | `metaSignature` | `default` | Prospecto con página, formulario y campaña |
| `POST /webhooks/elastic-email` | Elastic Email | `sharedSecretSignature` (HMAC del cuerpo; si el proveedor no firma, token secreto en la URL registrada) | `notifications` | Bajas (respetadas en todos los canales), rebotes y estados de entrega |
| `POST /webhooks/einvoice` | Proveedor de facturación electrónica | `sharedSecretSignature` | `billing` | `fiscal_status`, XML y CDR; el formato exacto depende del proveedor elegido (pendiente de la sección 14) |


Procesamiento común (docs/00, secciones 6 y 10):

1. **Validar la firma** sobre el cuerpo crudo, comparando en tiempo constante. Los secretos de firma salen de la bóveda. Si la firma es inválida, se responde 401 y el evento no se procesa.
2. **Guardar el evento crudo** en `webhook_events` (tabla solo de inserción) con `provider`, `external_event_id`, `event_type`, `payload` y `received_at`. Hay un índice único en (`provider`, `external_event_id`): si el evento se repite, se responde 200 con `duplicate=true` y se descarta. Así, el mismo webhook de PayPal recibido tres veces registra un solo pago.
3. **Encolar el procesamiento** y responder 200 de inmediato, sin llamar a terceros dentro de la petición.
4. **Registrar el resultado.** Como `webhook_events` no admite actualizaciones, cada procesamiento (éxito, fallo o reintento) es una fila en `webhook_event_processings` (`attempt`, `status` = `processed`/`ignored`/`failed`, `error`); si dispara reglas, también en `automation_runs` con `entity_type = webhook_event`. Un evento fallido se reprocesa con `POST /admin/webhook-events/{id}/reprocess`.
5. Los errores se clasifican en transitorio, de credenciales, de validación y desconocido. Solo el transitorio se reintenta solo; los demás abren una alerta.

### Webhook saliente de invalidación al plugin de WordPress

No es un endpoint del sistema sino una llamada que el sistema hace a cada sitio WordPress conectado (`wp_sites.webhook_url`, por defecto `https://<sitio>/wp-json/hub-connector/v1/invalidate`) cuando cambia lo que muestra (RN-WCN-005):

- Cuerpo JSON: `event_id`, `scope` (`catalog`, `plan`, `bundle`, `domain_prices`, `promotion`, `contact`, `legal_document`, `form`, `service_status`, `all`), `keys`, `brand`, `sent_at`.
- Cabecera `X-Hub-Signature: t=<marca de tiempo>,v1=<hex>` con HMAC-SHA256 de `<t>.<cuerpo crudo>` y el secreto del sitio guardado en la bóveda; el plugin rechaza firmas inválidas y marcas de tiempo con más de 5 minutos de diferencia, y descarta `event_id` repetidos.
- Se envía en la cola `webhooks` con espera de `web_connector.webhook.timeout_seconds`, hasta `web_connector.webhook.max_attempts` intentos con espera creciente; cada envío queda en `wp_cache_invalidations`.
- El secreto se rota con `POST /admin/web-connector/sites/{id}/webhook-secret`; el anterior se sigue aceptando `web_connector.webhook.secret_overlap_minutes`. Detalle del lado del plugin en `docs/13-plugin-wordpress-hub-connector.md`.

### Búsqueda de dominio reenviada por el plugin (`[hub_whois]`, docs/00 §27)

- El navegador llama a la ruta REST del plugin (`/wp-json/hub-connector/v1/whois`, con nonce); el plugin reenvía a `GET /public/wp/whois` con el token del sitio y la cabecera `X-Hub-Visitor-Ip`. El sistema no guarda la IP: calcula su HMAC (`whois_lookups.visitor_hash`) con una clave fuera de la base.
- Límite por visitante y hora (`web_connector.whois.limit_per_visitor_per_hour`): 429 con `code = rate_limited` y `Retry-After`. Desde `web_connector.whois.captcha_after_lookups` consultas en la hora: 429 con `code = captcha_required` hasta que la petición traiga `captcha_token` válido. Las respuestas `meta.lookups_left_this_hour` y `meta.captcha_required_next` permiten al plugin avisar antes.
- La respuesta nunca incluye datos personales del titular del dominio (solo `web_connector.whois.public_fields`) y nunca informa "disponible" sin respuesta del registrador (`status = unknown`).
- `GET /public/domain-availability` (carrito) registra también cada consulta en `whois_lookups`.

### Texto enriquecido en la API (docs/00 §27)

- Toda propiedad de texto enriquecido (cuerpos de plantillas, cláusulas, documentos legales, artículos, respuestas de tickets, mensajes de formularios, descripciones y la carta del Libro) se recibe como HTML y se guarda saneado con `editor.html.*`; la respuesta devuelve el HTML ya saneado. `POST /admin/rich-text/sanitize` y `POST /admin/rich-text/preview` permiten ver el resultado antes de guardar.
- El envío de la carta del Libro (`POST /admin/complaints/{id}/responses`) exige el `preview_sha256` de la última vista previa (`POST /admin/complaints/{id}/responses/preview`); si el HTML cambió responde 409 con `code = preview_outdated`.

## 9. Resumen por módulo

Las rutas y operaciones se cuentan por `x-module`, incluidas las públicas y los webhooks que pertenecen a cada módulo. Las 19 operaciones de `/auth` se cuentan en IDN. Los módulos con listados exportables incluyen además su `export<Recurso>` (`POST /admin/<recurso>/exports`, 27 en total, incluida la de indicadores `POST /admin/kpis/exports`).

| Módulo | Código | Rutas | Operaciones | Operaciones principales |
| --- | --- | --- | --- | --- |
| Identity | IDN | 51 | 69 | Login, MFA por TOTP o código al correo, step-up, dispositivos de confianza, cambio de contraseña y política pública de contraseñas; sesiones; CRUD de usuarios (`unlockUser`), roles personalizados (`copyRole`, matriz `getPermissionMatrix` y `getRolePermissions`), etiquetas, campos personalizados y tokens de API; política de seguridad (`getSecurityPolicy`, `putSecurityPolicy`); `deactivateUser` (baja inmediata con lista de accesos a rotar); auditoría con `verifyAuditChain`; archivos con enlace firmado |
| Settings | CFG | 10 | 14 | Ajustes por nivel (`putSetting`, `resolveSetting` muestra de dónde viene el valor), historial y `revertSettingChange`, feriados, horario de atención |
| Brands | BRD | 18 | 34 | CRUD de marcas, entidad emisora, cuentas bancarias y series; temas por marca para el portal, el panel y los correos con contraste, vista previa, publicación y reversión (`publishBrandThemeVersion`, `revertBrandThemeVersion`); tema publicado público para el portal |
| Customers | CUS | 19 | 29 | CRUD de clientes y contactos, ficha 360°, duplicados y `mergeCustomers`, invitación al portal, consentimientos (alta y cambio), exportación y anonimización de datos personales, baja pública |
| Sales | SAL | 53 | 89 | Canales y formularios con clave; embudo con lista y Kanban (`getLeadBoard`, `moveLeadStage` con origen e historial `listLeadStageChanges`) y `convertLead`; seguimientos; reglas de asignación; bandeja de WhatsApp (enviar, crear prospecto o ticket); mailing con Elastic Email; cotizaciones con versiones, `sendQuote`, `acceptQuote`, `rejectQuote`, conversión a contrato o pedido; reporte por canal; formulario público; webhooks de WhatsApp, Meta y Elastic Email |
| Catalog | CAT | 31 | 62 | Categorías del catálogo completo, productos, planes, precios, complementos, paquetes; ajuste masivo de precios con aviso; precios por extensión de dominio con alerta de margen; fichas por marca, fichas técnicas de hosting (`hosting-spec`) y VPS (`vps-spec`), extensiones de dominio con cambio de precio programado (`scheduleDomainPriceChange`); tipos de servicio personalizados con campos propios, activación, archivo y producto con planes (`createServiceTypeProduct`); catálogo público por marca y extensiones en venta en línea |
| Providers | PRV | 10 | 19 | Proveedores y cuentas; `testProviderConnection`, `syncProviderAccount`, `setProviderWriteAccess` (habilitar escrituras) |
| Services | SRV | 25 | 36 | CRUD de servicios; `suspendService`, `reactivateService`, `terminateService`, `cancelService`, `renewService`; historial de estados; vínculo con recursos; campos propios de servicios personalizados (`putServiceFieldValues`); detecciones; suscripciones (pausar, reanudar, cancelar); interruptores de acciones del cliente |
| ServiceMap | MAP | 15 | 27 | Proyectos, componentes, dependencias, métricas, procedimientos; grafo e impacto; completitud; `generateHandoverDocument` (ficha de traspaso) |
| Inventory | INV | 30 | 53 | Recursos y CMDB; nodos de hosting con sincronización; cuentas de hosting con acceso de soporte a cPanel (`createAdminCpanelSession`); servidores (`rebootServer`, `createServerSnapshot`); software; mantenimientos; lotes de migración (`validateMigrationCapacity`, `runMigrationBatch`, transición y reversión por cuenta, tablero de avance) |
| Cloud | CLD | 11 | 21 | Cuentas cloud con modalidad y autorización, sincronización en solo lectura, revocación de acceso; proyectos, recursos sin asignar, presupuestos |
| Domains | DOM | 24 | 34 | CRUD de dominios, sincronización, renovación, reporte de titularidad; contactos; operaciones (`requestDomainOperation`, `approveDomainOperation`, `rejectDomainOperation`, `completeDomainOperation`, `cancelDomainOperation`); confirmación pública por correo; reglas por extensión; regularización; disponibilidad pública de dominios para el carrito; búsqueda con WHOIS para `[hub_whois]` (`wpLookupDomain`, límite por visitante y captcha) y consultas de la web (`listWhoisLookups`) |
| Mail | MAI | 11 | 21 | Servicios de correo, verificación de MX, SPF, DKIM y DMARC, licencias por usuario con sobreasignación, certificados SSL con `inspectSslCertificate` |
| Saas | SAA | 7 | 13 | Plataformas e instancias, sincronización e instancias que superan su plan |
| Contracts | CTR | 23 | 37 | Plantillas con vista previa, cláusulas; contratos (`submitContractForReview`, `approveContract`, `sendContract`, `signContract`, `requestContractESignature`, `terminateContract`); versiones, `createContractAddendum` y comentarios; entregas de cuenta (`startAccountHandover`, `completeAccountHandover`) |
| Orders | ORD | 21 | 25 | Pedidos con máquina de estados: `approveOrder`, `provisionOrder`, `markOrderTested`, `activateOrder`, `cancelOrder`; intentos de aprovisionamiento; carritos y compras en línea (`approveCheckoutSession`, `rejectCheckoutSession`, `completeCheckoutSession`); carrito público con cupón y dominio |
| Billing | BIL | 70 | 97 | Facturas (`issueInvoice`, `voidInvoice`, notas de crédito y débito, PDF, envío, aviso manual, generación de renovaciones, antigüedad de deuda, estado de cuenta); emisión electrónica con reintento; medios de pago; pagos (`validatePayment`, `rejectPayment`, `refundPayment`, aplicaciones); reembolsos totales o parciales (`requestPaymentRefund`, `authorizePaymentRefund`); intentos de pago con tarjeta (`listPaymentCheckouts`); contracargos (`createPaymentDispute`, `submitPaymentDisputeEvidence`, `resolvePaymentDispute`); liquidaciones de la pasarela (`listPaymentSettlementLines`, `importPaymentSettlement`, `syncPaymentSettlement`, `matchPaymentSettlementLine`); conciliación bancaria (`listBankStatementLines`, `importBankStatement`, `matchBankStatementLine`, `createPaymentFromStatementLine`); `createPaymentPromise`; saldos a favor, cupones, impuestos, tipo de cambio; refacturación (`rebillProviderBill` y reporte); secuencias de cobranza con `simulateDunningSequence`; bandeja diaria; webhooks de PayPal, de la pasarela de tarjetas y de facturación electrónica; API pública de comprobantes |
| Finance | FIN | 8 | 11 | Costos y `allocateCost`; rentabilidad por cliente, servicio, producto, técnico o proveedor; facturado, cobrado e ingreso reconocido; horas no facturadas |
| Helpdesk | HLP | 26 | 42 | Políticas y objetivos de SLA; bandeja de tickets con SLA, detalle con conversación y notas internas (`createTicketInternalNote`), asignación, escalamiento, impacto, tarea, mensajes y vínculos con servicios (`listTicketLinks`); base de conocimientos con publicación; encuestas; KB pública, encuesta pública y API pública de tickets |
| Work | WRK | 23 | 40 | Proyectos internos, tareas (tablero, transición, lista de verificación, dependencias), horas; aprobación de tareas en revisión (`approveTask`, `rejectTask`); solicitudes de cambio (`approveChangeRequest`, `rejectChangeRequest`, `executeChangeRequest`); problemas |
| Vault | VLT | 11 | 16 | Secretos sin valores en listados; `revealSecret` (MFA y motivo); concesiones; bitácora; `createOneTimeLink` y su consumo público |
| Monitoring | MON | 36 | 57 | Monitores y resultados; incidentes con afectados y aviso; ventanas de mantenimiento; políticas, ejecuciones y pruebas de restauración de backups; alertas; portal de estado público; solicitudes de restauración (`approveRestoreRequest`, `startRestoreRequest`, completar o fallar con evidencia), herramientas de respaldos por nodo con sincronización, pruebas del plan de recuperación |
| Automation | AUT | 38 | 50 | Reglas con prueba en seco y ejecuciones; plantillas con envío de prueba y vista previa; entregas con reenvío; webhooks salientes; eventos entrantes con reproceso; sincronizaciones; importaciones con vista previa y confirmación; exportaciones; exportaciones del Libro de Reclamaciones y de aceptaciones legales; editor de textos enriquecido (`sanitizeRichText`, `previewRichText`, `listRichTextVariables`, `uploadRichTextImage`) e historial de versiones (`listRichTextVersions`, `restoreRichTextVersion`); plantillas por categoría y formato |
| WebConnector | WCN | 43 | 59 | Sitios WordPress conectados (`activateWpSite`, `disableWpSite`, `rotateWpSiteWebhookSecret`, `testWpSiteWebhook`); tokens de solo lectura (`createWpSiteToken`, `revokeWpSiteToken`); avisos de invalidación con reintento; generador de shortcodes (`listShortcodes`, `buildShortcode`); formularios con campos, activación y envíos (reintento, spam); datos de contacto por marca; documentos legales con versiones y publicación; aceptaciones; API de lectura del plugin (`/public/wp/...`: sitio, categorías, planes, plan, comparador, paquete, precios de dominios, promoción, contacto, documento legal, formulario, estado de servicios y, por docs/00 §27, servidores VPS y dedicados con complementos `wpListServerPlans`) y envío público de formularios |
| Assistant | AIA | 12 | 14 | Perfiles por marca y canal con prueba en seco; conversaciones con enlace y cierre; consumo; conversación pública en la web |
| Complaints | LRC | 21 | 25 | Libro de Reclamaciones (`publicCreateComplaint` con constancia, `createComplaint`, `startComplaint`, `respondComplaint`, `closeComplaint`, `exportComplaints`, consulta pública); hojas de prueba (`markComplaintTest`, `deleteComplaint`, `listComplaintDeletions`); solicitudes de datos personales (`verifyPrivacyRequestIdentity`, `answerPrivacyRequest`, `rejectPrivacyRequest`); por docs/00 §27, vista previa de la carta (`previewComplaintResponse`) y envío con `preview_sha256`, hoja de reclamación (`getComplaintSheet`, `publicGetComplaintSheet`), vista pública (`getComplaintPublicForm`) y formulario para el plugin (`wpGetComplaintForm`) |
| Dashboard | DSH | 20 | 23 | Indicadores de resumen, vencimientos próximos, capacidad y búsqueda global; panel de indicadores (docs/14): catálogo (`listKpis`, `getKpi`, `updateKpi`), valores por grupo (`getKpiValuesCommercial` … `getKpiValuesWeb`), metas (`listKpiTargets`, `createKpiTarget`, `updateKpiTarget`, `deleteKpiTarget`), recálculo y exportación; tablero propio de cada indicador (`listKpiRecords`, `exportKpiRecords`) |
| Portal | PRT | 66 | 73 | Mi cuenta y resumen; proyectos y servicios en modo consulta; `portalCreateCpanelSession`; `portalUpdateBillingProfile`; `portalSignContract`; `portalRequestServerReboot`; dominios y operaciones; comprobantes, opciones de pago con recargo, tarjeta (`portalCreateCardCheckout`, `portalGetCardCheckout`), PayPal y voucher; tickets y encuesta; contratos; cotizaciones; contactos y usuarios; notificaciones; mantenimientos; preferencias de comunicación; base de conocimientos; compra en línea (`portalCreateCheckoutSession`, pago con tarjeta, PayPal o voucher); asistente; informe de respaldos y restauraciones; términos por aceptar (`portalAcceptLegalDocument`) |
| **Total** | | **733** | **1090** | |

## 10. Cómo se validó

1. `pip install --break-system-packages openapi-spec-validator pyyaml`.
2. Validación estructural con `openapi_spec_validator.validate()` sobre `api/openapi.yaml`, que lo detecta como OpenAPI 3.0.3. Resultado: **válido, sin errores**.
3. Script de verificación propio, que recorre todas las operaciones:
   - `operationId` únicos: 1090 de 1090, sin duplicados.
   - Todo esquema con `x-table` coincide con `database/schema.sql`: cada propiedad no derivada es una columna y cada enum está dentro del `CHECK` de su columna (`tools/verificar_coherencia.py`).
   - Toda ruta `/admin` (y `/portal`) declara `x-permission` con el formato `<clave>.<entidad>.<accion>` y una clave de módulo conocida: 0 faltantes.
   - Toda operación declara `x-module`.
   - Todos los `$ref` apuntan a componentes existentes: 0 referencias rotas.
4. `database/seeds/permissions.json` se generó leyendo el OpenAPI ya validado (los `x-permission` más los `x-export-permissions`), así que no puede listar un permiso que la API no use. Resultado: 641 códigos. Se cruzó además con `database/seeds/roles.json` y `docs/05-permisos-y-roles.md`: todos los códigos concretos que usan los roles existen en la API.

Para revalidar después de cada cambio, el pipeline debe correr el validador y el script de verificación, y fallar si alguno no pasa.

## 11. Agregados fuera del contrato

Estos nombres no estaban en el contrato. Se agregaron con el mismo estilo y deben confirmarse al actualizarlo:

| Agregado | Tipo | Motivo |
| --- | --- | --- |
| `personal_access_tokens` (tabla estándar de Sanctum), expuesta como `/admin/api-tokens` y permisos `identity.api_token.*` | Tabla y permisos | API pública con token bearer (docs/00, secciones 2 y 13) |
| Claves de permiso `dashboard` (`dashboard.summary.view`, `dashboard.search.view`) y `portal` (`portal.<entidad>.<accion>`) | Claves de permiso | El contrato define claves solo para los 23 módulos de backend; Dashboard y Portal necesitan permisos propios para los roles de personal y de cliente |
| Códigos cortos `DSH` (Dashboard) y `PRT` (Portal) | Códigos de módulo | Valor de `x-module` para operaciones que no pertenecen a un módulo de backend |
| Prefijo `/api/v1/auth/...` | Ruta | Inicio de sesión, MFA y sesiones comunes a panel y portal; no encaja en `/admin` ni en `/portal` |
| Entidades de permiso que no son tabla: `finance.profitability`, `dashboard.summary`, `dashboard.search`; por docs/00 §27, `automation.rich_text` y los ocho grupos de valores de indicadores (`dashboard.kpi_commercial` … `dashboard.kpi_web`) | Permisos | Reportes y herramientas que necesitan control propio; un permiso por grupo de indicadores para que cada rol vea solo su área |
| Acciones especiales nuevas: `inventory.hosting_account.login` (entrar a cPanel desde soporte) | Permiso | Acción sensible distinta de editar la cuenta; ya la usa `roles.json` |
| Estados de entidades sin estados en el contrato: `change_requests.status`, `problems.status`, `migration_batches.status`, `domain_regularizations.status`, `alerts.status`, `imports.status`, `exports.status`, `sync_runs.status`, `contract_signatures.status`, `monitors.status`, `notification_delivery_events.status`, `tickets.type` y `tickets.channel` | Valores de estado | Necesarios para las máquinas de estado; la lista de cada uno es la del `CHECK` de `database/schema.sql`, el OpenAPI usa la misma y están en `docs/01-contrato-de-nombres.md` |
| `change_requests.kind` con `server_reboot` y `dns_change` | Valor de catálogo | El reinicio solicitado desde el portal se modela como solicitud de cambio: soporte aprueba y luego se ejecuta |
| `webhook_event_processings` | Tabla agregada | Registrar cada intento de procesamiento de un webhook sin actualizar `webhook_events`, que es solo de inserción |
| Exportaciones por recurso (`POST /admin/<recurso>/exports`) y permisos `<modulo>.<entidad>.export` de productos, recursos cloud, contratos, usuarios, correo, certificados, pedidos, proveedores, instancias SaaS, cotizaciones, proyectos del cliente, cambios de ajustes y tareas | Operaciones y permisos | Los módulos piden exportar esos listados; cada permiso necesita una operación real |
| `billing.invoice.void`, `work.task.approve` | Permisos | Anular comprobantes y aprobar tareas en revisión (docs/03) |
| `portal.contract.update`, `portal.account.update` | Permisos | Aceptar o firmar el contrato y editar datos de facturación desde el portal (M-PRT) |
| `bank_statement_lines` y `/admin/bank-statement-lines` | Tabla y operaciones | Conciliación bancaria (P-BIL-09) con los permisos de pagos |
| `payment_checkouts`, `payment_refunds`, `payment_disputes`, `payment_settlement_lines`; `/portal/payments/card-checkouts`, `/admin/payment-checkouts`, `/admin/payments/{id}/refunds`, `/admin/payment-disputes`, `/admin/payment-settlement-lines`, `/webhooks/card-gateway`; esquema de seguridad `cardGatewaySignature`; permisos `billing.payment_dispute.*` | Tablas, operaciones y permisos | Pago con tarjeta mediante pasarela local (docs/00 §21): intento con formulario alojado, webhook firmado, reembolso total o parcial, contracargos y conciliación de liquidaciones |
| Alcance ampliado de docs/00 §25: claves `assistant` (AIA) y `complaints` (LRC); `/admin/complaints`, `/admin/privacy-requests`, `/public/complaints`, `/public/privacy-requests`, `/portal/legal-documents/pending`, `/portal/legal-acceptances`, `/admin/brand-themes/*` y `/public/brand-themes/{brand}` | Módulos, operaciones y permisos | Cumplimiento legal, Libro de Reclamaciones, temas por marca; el carrito es público y la compra se confirma con sesión en el portal (`/portal/checkout-sessions`, con `Idempotency-Key`) |
| Alcance de docs/00 §26: clave `web_connector` (WCN) en lugar de `cms` (WEB); `/admin/web-connector/*`, `/public/wp/*` con el esquema `wpSiteToken`, `/public/web-forms/{code}/submissions`; `/admin/service-types/*`, `/admin/services/{id}/field-values`; `/admin/security-policy`, `/admin/permissions/matrix`, `/admin/roles/{id}/copy`, `/admin/users/{id}/unlock` y `/trusted-devices`; `/auth/mfa/email-code`, `/auth/mfa/email/confirm`, `DELETE /auth/mfa/totp`, `/auth/trusted-devices`, `/auth/password/change`, `/auth/password-policy`; `/admin/leads/{id}/stage-changes`; `/admin/tickets/{id}/internal-notes` y `GET /admin/tickets/{id}/links`; `/admin/complaints/{id}/mark-test`, `DELETE /admin/complaints/{id}`, `/admin/complaint-deletions`. Se eliminaron `/admin/cms/*`, `/public/site/*`, `/public/cookie-consents` y `/webhooks/wordpress` | Módulos, operaciones y permisos | Webs en WordPress conectadas por shortcodes, servicios personalizados, seguridad administrable, roles personalizados, CRM Kanban, bandeja de soporte y reclamos de prueba |
| Alcance de docs/00 §27: `/admin/kpis`, `/admin/kpis/{code}`, `/admin/kpis/{code}/records`, `/admin/kpis/{code}/records/exports`, `/admin/kpis/exports`, `/admin/kpis/recalculations`, `/admin/kpi-values/<grupo>` (8), `/admin/kpi-targets`; `/admin/rich-text/*` y `/admin/rich-text-versions`; `/admin/complaints/{id}/responses/preview`, `/admin/complaints/{id}/sheet`, `/admin/complaints/public-form`, `/public/complaints/sheets/{token}`; `/public/wp/whois` (cabecera `X-Hub-Visitor-Ip`, códigos `rate_limited` y `captcha_required`), `/public/wp/servers`, `/public/wp/complaint-form`; `/admin/whois-lookups`; permisos `dashboard.kpi.*`, `dashboard.kpi_target.*`, `automation.rich_text.*`, `automation.rich_text_version.*`, `domains.whois_lookup.view`; reporte `kpi_values` | Operaciones y permisos | Panel de indicadores, editor de textos enriquecido, Libro de Reclamaciones con vista pública y respuesta, shortcodes de WHOIS y servidores |
