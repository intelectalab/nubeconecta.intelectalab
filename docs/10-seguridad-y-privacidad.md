# 10 — Seguridad y privacidad

Reglas de seguridad que el código debe cumplir. Fuente: `docs/00-requerimientos.md` secciones 2, 5, 8, 10, 11, 12, 19, 21, 23, 24, 25, 26 y 27; nombres según `docs/01-contrato-de-nombres.md`. Principio del kit: **no se agregan barreras para el cliente**; el sistema protege las llaves y accesos que guarda, y confirma por correo las acciones de riesgo sobre dominios. Nivel objetivo: OWASP ASVS nivel 2 para toda la aplicación.

## 1. Bóveda de credenciales

### Qué guarda

1. Accesos de clientes que la empresa administra y comparte con soporte para mantenimientos y emergencias.
2. Llaves API de los proveedores que usan los conectores (ver `08-integraciones.md`).

No guarda contraseñas de buzones de correo de clientes. Se prefieren claves SSH, tokens de alcance limitado y roles asumidos frente a contraseñas compartidas.

Tablas (módulo Vault): `secrets` (`kind` según el contrato: `ssh`, `sftp`, `ftp`, `cpanel`, `whm`, `plesk`, `panel`, `cloud`, `registrar`, `database`, `app_admin`, `api_token`, `private_key`, `other`), `secret_grants`, `secret_access_logs` (solo inserción), `one_time_links`.

### Cifrado

| Regla | Detalle |
| --- | --- |
| Algoritmo | AES-256-GCM, con nonce aleatorio de 96 bits por cada cifrado (nunca reutilizado). `secrets` guarda `ciphertext`, `nonce`, `key_version`. |
| Datos asociados (AAD) | `secrets.id` y `organization_id` como datos asociados: un texto cifrado copiado a otra fila u organización no descifra. |
| Clave | Vive en el gestor de secretos del servidor, fuera del repositorio y de la base de datos; distinta por entorno (desarrollo, staging, producción). Nunca en `.env` versionado, en `settings` ni en logs. |
| Respaldo | Un respaldo de la base sin la clave no expone ningún acceso. La clave se respalda por separado, fuera de AWS S3 de respaldos y fuera de Contabo, con acceso solo del administrador. |
| Futuro | Queda previsto, sin construirlo ahora, pasar a clave maestra en KMS o Vault si el sistema se ofrece como SaaS (docs/00, secciones 8 y 19). |

### Rotación

- **De la clave de cifrado:** se agrega una versión nueva (`key_version`); los secretos nuevos se cifran con ella; un job en cola `default` vuelve a cifrar los existentes. La versión anterior se retira solo cuando ninguna fila la usa. La rotación queda en `audit_events`.
- **De cada secreto:** cada secreto tiene `rotates_at`. El job diario `RotateSecretsReminder` crea tareas de rotación (docs/00, sección 10).
- **Rotación forzada:** al dar de baja a un usuario, el sistema genera la lista de secretos que reveló (desde `secret_access_logs`) y crea tareas para rotarlos. Igual al cerrar una entrega de cuenta cloud (`account_handovers`) o un traspaso del cliente.

### Revelación

- Requiere: permiso `vault.secret.reveal`, una concesión vigente en `secret_grants` sobre ese secreto y MFA reciente (menos de `security.sensitive_action_mfa_max_age_minutes`, 10 minutos por defecto).
- Pide motivo. Escribe en `secret_access_logs`: usuario, secreto, motivo, IP, fecha. El valor nunca se registra.
- Límite de revelaciones por usuario y por hora (ajuste; por defecto 10). Superarlo bloquea nuevas revelaciones y alerta al administrador.
- Las concesiones pueden ser temporales y caducan solas; revocar surte efecto inmediato. El técnico temporal solo recibe concesiones con vencimiento.
- El listado de la API nunca devuelve valores. No existe exportación masiva de secretos. El valor revelado se devuelve en una respuesta con `Cache-Control: no-store` y no se guarda en el estado persistente del frontend.

### Enlaces de un solo uso

Para entregar accesos al cliente (correo de bienvenida, traspaso, entrega de cuenta), nunca por correo en claro (docs/00, secciones 15 y 22).

- `one_time_links` guarda solo el hash del token (SHA-256), el secreto referido, la fecha de vencimiento y la fecha de uso.
- El token es aleatorio de al menos 128 bits y viaja solo en el enlace.
- Se invalida en la primera apertura o al vencer, lo que ocurra primero. La vigencia es un ajuste.
- La página del enlace no se indexa (`noindex`), no carga recursos de terceros y responde `Cache-Control: no-store`, `Referrer-Policy: no-referrer`.
- Crear un enlace exige las mismas condiciones que revelar y queda en `secret_access_logs`.

## 2. Riesgos propios de conectarse por API

Tabla del kit (sección 8), con su implementación.

| Caso | Qué puede pasar | Control mínimo (kit) | Cómo se implementa |
| --- | --- | --- | --- |
| Robo de dominio | Alguien entra a la cuenta de un cliente y pide transferencia o cambia DNS | Confirmación por correo al titular y revisión de soporte antes de entregar el código | `domain_operations` pasa por `requested` → `email_confirmed` → `in_review` → `sent`. El código de autorización se entrega por enlace de un solo uso. Restricciones por extensión en `tld_rules` (60 días tras registro o transferencia en genéricos). Aviso de impacto antes de cambiar nameservers. |
| Sistema comprometido | Quien entre obtiene las llaves de todos los proveedores | Llaves cifradas, con permiso mínimo y restringidas por IP cuando el proveedor lo permite | Bóveda cifrada (sección 1). Llaves de solo lectura por defecto; escritura habilitada por cuenta. Restricción por IP del VPS donde el proveedor la ofrezca (por ejemplo Namecheap exige lista blanca; Elastic Email la permite, ver `08-integraciones.md`). Panel interno restringible por IP o VPN. |
| Cliente que ve datos de otro | Cambiar un identificador en la dirección muestra un servicio ajeno | Filtro por organización del cliente en cada consulta y prueba automática | Scope global y políticas por registro; UUID v7 como identificador público; 404 para filas ajenas; prueba automática obligatoria (ver `05-permisos-y-roles.md`). |
| Personal que se retira | Conserva accesos compartidos | Baja inmediata del usuario y lista de accesos que vio para rotarlos | Desactivar usuario cierra todas sus sesiones (`user_sessions`), revoca concesiones y genera las tareas de rotación. |

## 3. Controles OWASP ASVS nivel 2

Resumen por capítulo de ASVS. Cada control se verifica con prueba automatizada o con la checklist de PR (sección 9).

| Área ASVS | Control |
| --- | --- |
| Arquitectura | Monolito modular; módulos se llaman solo por `Contracts/`; secretos fuera del código; tres entornos aislados con datos ficticios fuera de producción. |
| Autenticación | Contraseñas con Argon2id, verificación contra listas de contraseñas filtradas y política administrable (longitud mínima `security.password.min_length`, 10 por defecto; complejidad; caducidad; historial de las últimas `security.password.history_count` en `password_histories`); segundo factor por aplicación TOTP o por código al correo (`email_login_codes`: solo hash, vencimiento de `security.mfa.email_code_ttl_minutes`, `security.mfa.email_code_max_attempts` intentos, un solo uso y un vigente por propósito, garantizado por la base), obligatorio por rol (`security.mfa.required_by_role`) o por tipo de usuario (personal obligatorio, cliente opcional por defecto) y siempre para `admin`; códigos de recuperación (`mfa_recovery_codes`, con hash); bloqueo tras `security.login_max_attempts` intentos por `security.login_lockout_minutes` con la misma respuesta que una credencial inválida; límite de intentos por IP y por cuenta en inicio de sesión, MFA y recuperación (RN-IDN-001 a RN-IDN-004). |
| Sesiones | Sanctum con cookies `HttpOnly`, `Secure`, `SameSite`; regeneración de sesión al iniciar y al elevar con MFA; duración configurable (`security.session_duration_hours`, 8 horas por defecto); cambiar la contraseña o desactivar el segundo factor cierra las demás sesiones; dispositivos de confianza (`trusted_devices`, token del dispositivo solo como hash, `security.trusted_device_days`) que evitan el segundo factor al iniciar sesión pero nunca el MFA reciente de acciones sensibles; lista de sesiones y dispositivos con cierre remoto; protección CSRF de Sanctum (RN-IDN-005, RN-IDN-006). |
| Control de acceso | Permisos por acción y políticas por registro, siempre en el backend; prueba de matriz rol × endpoint; roles personalizados con matriz por módulo y acción, roles del sistema protegidos por la base y roles de cliente limitados a `portal.*` (RN-IDN-008); MFA reciente para acciones sensibles. |
| Validación y codificación | Form Requests en backend y Zod en frontend; consultas parametrizadas (Eloquent/Query Builder, sin SQL concatenado); escape por defecto de React, sin `dangerouslySetInnerHTML` salvo HTML saneado (plantillas de contratos y correos con lista blanca de etiquetas). |
| Criptografía almacenada | AES-256-GCM para secretos; hash para tokens de un solo uso y de API pública; ninguna criptografía propia. |
| Errores y registros | RFC 9457 sin trazas internas; logs JSON con identificador de petición y lista de redacción (`password`, `token`, `secret`, `authorization`, más `key`, `apikey`, `accesskey`, `client_secret`); los modelos marcan los campos sensibles como ocultos. |
| Protección de datos | Campos internos ausentes en la API del portal; `Cache-Control: no-store` en respuestas con datos sensibles; exportaciones por trabajo en cola con enlace firmado de corta duración. |
| Comunicaciones | Solo HTTPS con HSTS; TLS verificado en todas las llamadas a proveedores. |
| Código y dependencias | Análisis de vulnerabilidades en cada pipeline; dependencias fijadas por archivo de bloqueo; PHPStan, ESLint y TypeScript estricto. |
| Lógica de negocio | Pago con tarjeta validado solo por webhook firmado con importe coincidente (sección 10); idempotencia en pagos, pedidos, aprovisionamiento, emisión de facturas y operaciones de dominio; máquinas de estado con transiciones validadas; límite de revelaciones; numeración de facturas con bloqueo. |
| Archivos | Tipo y tamaño validados; análisis antivirus en cola; almacenamiento fuera del directorio público; enlaces firmados de corta duración; ruta con `organization_id`. |
| API y servicios web | Webhooks entrantes con firma validada y evento único; webhooks salientes al plugin de WordPress firmados con HMAC-SHA256 y marca de tiempo; API pública con tokens Sanctum de alcance limitado; API del plugin con token de solo lectura por sitio (solo hash, vencimiento, revocable); límite de peticiones; `x-permission` declarado en cada operación del panel. |
| Configuración | Cabeceras CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors` (salvo el formulario insertable de captación, con su propia política); WAF o proxy inverso con límite de peticiones; `APP_DEBUG` desactivado fuera de desarrollo. |

## 4. Auditoría encadenada por hash

- `audit_events` es solo de inserción: el usuario de base de datos de la aplicación no tiene `UPDATE` ni `DELETE` sobre ella (tampoco sobre `secret_access_logs`, `setting_changes`, `notification_deliveries`, `webhook_events`).
- Cada evento guarda: actor (usuario o sistema), acción, entidad e identificador, valores anteriores y nuevos (sin campos sensibles), IP, identificador de petición, fecha.
- **Encadenamiento:** cada fila guarda `prev_hash` y `hash = SHA-256(prev_hash || contenido canónico del evento)`, con la cadena por `organization_id`. La inserción toma un bloqueo para que dos eventos simultáneos no compartan `prev_hash`.
- Un job diario recalcula la cadena del día y alerta al administrador si no coincide. El último hash del día se copia también al respaldo en AWS S3, para detectar una reescritura completa de la tabla.
- Se auditan, como mínimo: inicio y cierre de sesión, cambios de rol y permisos, revelaciones, cambios de ajustes (`setting_changes`), aprobaciones y rechazos, emisiones y anulaciones de facturas, validaciones de pago, intentos de pago con tarjeta, reembolsos y contracargos, suspensiones, operaciones de dominio, cambios de interruptores del cliente, habilitación de escritura en proveedores.

## 5. Respaldos del sistema en AWS S3

Separados de los backups de clientes (módulo Monitoring). Se guardan fuera de Contabo para que un problema con esa cuenta no se lleve también las copias (docs/00, sección 21).

| Regla | Detalle |
| --- | --- |
| Qué | Base de datos y archivos del sistema, cifrados, con recuperación a un punto en el tiempo (docs/00, sección 12). |
| Frecuencia y retención | Ajustes en `settings`: por defecto diario y 35 días (docs/00, sección 23). |
| Bucket | Bucket propio del sistema, con versionado, cifrado y bloqueo contra borrado durante el periodo de retención; paso a almacenamiento de bajo costo tras 30 días. |
| Credencial de respaldo | Usuario que solo puede subir archivos, nunca borrarlos; guardada en el gestor de secretos del servidor, no en la bóveda de la base. |
| Credencial de restauración | Distinta, con lectura; fuera del VPS de producción; se usa solo en restauraciones y pruebas. |
| Cifrado | Copias cifradas antes de subir, además del cifrado del bucket. La clave de cifrado de la bóveda no viaja en el mismo respaldo. |
| Prueba de restauración | Periódica, registrada en `restore_tests`, en un entorno aislado sin conectores reales. |
| Fallo | `BackupFailed` y alerta. |
| RPO y RTO | Los fija la gerencia. |
| **NO VERIFICADO** | Cuenta, región y retención definitiva del bucket (docs/00, sección 14). |

## 6. Privacidad y consentimiento de comunicaciones

- Cada contacto guarda en `communication_consents` si aceptó recibir comunicaciones comerciales, con fecha, canal y origen (formulario, portal, ventas, importación).
- Los avisos de servicio y cobranza (transaccionales) no dependen del consentimiento comercial; las campañas y mailing sí.
- Una baja en Elastic Email, en el portal o en WhatsApp se respeta en todos los canales (docs/00, sección 24); el webhook de baja actualiza el consentimiento y la lista en todas las marcas.
- Los formularios de captación muestran el texto de consentimiento configurado por marca (texto en `settings`, no en el código) y guardan la versión aceptada.
- Derechos del titular: exportación y eliminación de datos personales a solicitud (docs/00, sección 8), como trabajo en cola con aprobación del administrador y registro en auditoría. La eliminación anonimiza datos personales y conserva lo que la ley obliga a guardar (comprobantes electrónicos y su información tributaria).
- Las cuentas cloud del cliente se registran solo con autorización expresa y documento adjunto (docs/00, sección 21).
- Datos de prueba: solo ficticios; nunca copia de producción en staging.

## 7. Retención de datos

| Dato | Retención | Estado |
| --- | --- | --- |
| Adjuntos de tickets | 12 meses (ajuste, docs/00, sección 23) | Definido |
| Respaldos del sistema | 35 días (ajuste) | Definido |
| Comprobantes electrónicos (XML, CDR, PDF) | Según obligación tributaria peruana | Confirmar con el contador |
| Clientes inactivos y registros técnicos | Por definir según ley aplicable (ajuste, docs/00, sección 23) | **Pendiente por país** (docs/00, sección 14) |
| Datos personales de prospectos no convertidos | Por definir | **Pendiente por país** |
| `audit_events`, `secret_access_logs` | No se borran por la aplicación; archivado según política | Pendiente de definir |
| Libro de Reclamaciones (`complaints`, `complaint_responses`) | No se borra; datos del consumidor anonimizados al cumplir `complaints.retention_years` | **Pendiente con asesoría legal** (D-28) |
| Aceptaciones de documentos legales | Solo inserción; mientras exista la relación y el plazo de prescripción | Pendiente de definir |
| Envíos de formularios de la web (`web_form_submissions`) | `web_connector.forms.submission_retention_days` tras derivarse (los datos siguen en el prospecto o el ticket) | **Pendiente** (política de privacidad) |
| Códigos al correo y contraseñas anteriores | Códigos vencidos o usados se purgan a diario; se conservan solo las últimas `security.password.history_count` contraseñas (hash) | Definido |
| Hojas de prueba eliminadas del Libro (`complaint_deletions`) | No se borran (justifican el correlativo) | Definido |
| Conversaciones del asistente | Anonimizadas a `assistant.conversation_retention_days` | **Pendiente** (D-22) |
| Consultas WHOIS de la web (`whois_lookups`) | `web_connector.whois.retention_days`; solo HMAC de la IP, sin datos de titulares | **Pendiente** (D-36) |
| Versiones de textos enriquecidos (`rich_text_versions`) y valores de indicadores (`kpi_snapshots`) | No contienen datos personales del cliente; se conservan (las versiones son solo de inserción) | Definido |


Todo plazo de retención vive en `settings`; un job de retención aplica los plazos y deja un registro de lo purgado o anonimizado. Hasta que se definan los plazos pendientes, el job no purga esos tipos de dato.

## 8. Operación segura

- Logs estructurados en JSON sin datos sensibles; métricas y alertas de colas, errores y fallos de sincronización.
- Endpoint de salud sin información interna.
- Panel interno restringible por IP o VPN; WAF o proxy inverso con límite de peticiones.
- Migraciones compatibles hacia atrás; despliegue a producción con aprobación manual.
- Incidentes de seguridad registrados como incidentes con procedimiento (docs/00, sección 13, funciones adicionales).

## 9. Checklist de seguridad para cada PR

- [ ] Cada endpoint nuevo declara `x-permission` y tiene política en backend; la prueba de matriz rol × endpoint pasa.
- [ ] Las consultas nuevas respetan el filtro por `organization_id` y, en el portal, por cliente; hay prueba de acceso con identificador ajeno.
- [ ] Los recursos del portal no exponen costos, márgenes, proveedor, notas internas, accesos ni identificadores externos.
- [ ] Entradas validadas con Form Request (backend) y Zod (frontend); sin SQL concatenado; sin HTML sin sanear.
- [ ] Ningún secreto, token, clave o contraseña en código, `.env` versionado, `settings`, logs, respuestas de listado, exportaciones ni mensajes de error.
- [ ] Credenciales de conectores leídas desde la bóveda y pasadas por parámetro.
- [ ] Acciones sensibles (revelar, ejecutar en servidor, reembolsar, eliminar hojas de prueba del Libro, emitir el token de un sitio WordPress, cambiar la política de seguridad) exigen MFA reciente y escriben auditoría.
- [ ] Escrituras sensibles con `Idempotency-Key`; webhooks con firma validada y evento único en `webhook_events`.
- [ ] Ningún campo de petición, respuesta, tabla, log ni archivo contiene número, vencimiento ni código de seguridad de tarjeta; el pago con tarjeta solo usa el formulario alojado o tokenizado de la pasarela (sección 10).
- [ ] Toda acción de escritura escribe en `audit_events`.
- [ ] Ningún plazo, porcentaje ni texto de aviso en el código: van en `settings`.
- [ ] Archivos: tipo y tamaño validados, antivirus en cola, enlace firmado de corta duración.
- [ ] Datos de prueba ficticios; ninguna credencial ni cliente real en seeders o fixtures.
- [ ] Análisis de dependencias y estático sin hallazgos nuevos de severidad alta.
- [ ] Si toca la bóveda, el cifrado o la auditoría: revisión de un segundo desarrollador.
- [ ] Si toca el asistente: el contenido del usuario y de las fuentes va como datos delimitados; las herramientas reciben el cliente de la sesión, nunca del modelo; la batería de inyección pasa (sección 11).
- [ ] Si toca la API del plugin o el conector web: la respuesta sale solo de la marca del token, sin costos, proveedor, notas internas ni datos personales; los avisos al plugin van firmados; el plugin escapa toda salida y no guarda datos personales (sección 12 y `docs/13`).
- [ ] Si toca la compra en línea: precio recalculado en el servidor, captcha verificado en el servidor, límites y reglas de revisión aplicados antes de cobrar (sección 13).
- [ ] Si guarda datos personales nuevos: finalidad declarada en la política de privacidad, incluidos en la exportación y en la anonimización (sección 14).
- [ ] Si guarda o muestra texto enriquecido: pasa por el saneado único del backend (`editor.html.*`), la prueba con la batería de cargas XSS pasa, las imágenes son de `files` y la vista previa no resuelve variables con datos que el usuario no puede ver (sección 15).
- [ ] Si toca la búsqueda de dominios: límite por visitante y captcha antes de llamar al registrador, sin IP guardada y sin datos personales del titular en la respuesta (sección 16).
- [ ] Si toca indicadores: el grupo exige su permiso en el catálogo, los valores, el detalle y la exportación; ninguna fórmula lee de otra organización.

## 10. Pago con tarjeta y PCI DSS

El cliente paga con tarjeta de crédito o débito mediante una pasarela local (docs/00, sección 21; ficha 20 de `08-integraciones.md`). El diseño busca el **alcance PCI DSS mínimo** para el comercio:

| Control | Cómo se implementa |
| --- | --- |
| Los datos de tarjeta nunca pasan por el sistema | El formulario lo aloja la pasarela (redirección) o lo inserta como formulario embebido que tokeniza en el navegador y envía los datos directo a la pasarela. Ni el portal ni la API reciben número, vencimiento ni código de seguridad; el OpenAPI no tiene campos para ellos y `schema.sql` no tiene columnas para ellos (prueba de arquitectura, RN-BIL-058). |
| Sin tarjetas guardadas ni cobro recurrente | No hay tokens de tarjeta reutilizables ni cobros sin el cliente presente (RN-BIL-065, docs/00 §22). |
| El navegador no decide el resultado | El regreso desde la pasarela solo muestra el estado; el pago se valida con el webhook firmado de pago aprobado e importe coincidente, deduplicado en `webhook_events` (RN-BIL-059). |
| Integridad del formulario embebido | Si la pasarela usa formulario embebido, su script se carga solo desde el dominio oficial de la pasarela, declarado en la política CSP (`script-src`, `frame-src`, `connect-src`) de las páginas de pago del portal; ningún otro script de terceros se carga en esas páginas. Las páginas de pago se revisan en cada cambio (inventario de scripts). |
| Credenciales | Clave secreta de comercio y secreto de firma de webhooks en la bóveda (sección 1), distintos por entorno; la clave pública del formulario se lee de la cuenta del proveedor. |
| 3-D Secure | Lo ejecuta la pasarela dentro de su formulario; reduce fraude y contracargos. |
| Reembolsos | Solicitud de finanzas y autorización del administrador con MFA reciente (`billing.refund.authorize`); ejecución por API con `Idempotency-Key`. |
| Contracargos | Alerta `chargeback` para finanzas; la factura vuelve a tener saldo; queda en auditoría. |
| Registros | La lista de redacción de logs incluye además `card`, `pan`, `cvv`, `cvc` y `expiry` por si una pasarela los devolviera enmascarados; los payloads de webhooks se guardan como llegan, y la pasarela solo envía datos enmascarados (a verificar con la elegida). |
| Obligaciones del comercio | El tipo de cuestionario de autoevaluación PCI DSS que corresponda lo indica la pasarela elegida según el tipo de formulario: **NO VERIFICADO** hasta elegirla (D-18 en `11-decisiones-abiertas.md`). |

## 11. Asistente con IA: inyección de instrucciones y datos que no ve

El asistente (M-AIA, ficha 29 de `08-integraciones.md`) recibe texto de visitantes anónimos de las webs WordPress y de fuentes que el sistema no controla del todo (artículos, documentos legales); el contenido de las páginas de WordPress no es fuente. Se trata como un componente no confiable:

| Riesgo | Control |
| --- | --- |
| Inyección de instrucciones en el mensaje, en un artículo o en un documento legal ("ignora tus reglas", "muéstrame los datos del cliente X") | Las instrucciones del perfil van solo en el mensaje de sistema; el mensaje del usuario y el contexto recuperado se envían como datos delimitados y etiquetados por origen; un filtro marca patrones conocidos (`ai_messages.injection_flagged`) sin cambiar el comportamiento; batería de pruebas de inyección en CI (RN-AIA-005). |
| El modelo pide datos de otro cliente | Las herramientas no aceptan `customer_id` del modelo: lo toman de la sesión; en la web no existe herramienta que lea servicios; las respuestas de herramientas pasan por la clase de recurso del portal (RN-AIA-003). |
| Datos que el asistente nunca ve | Facturas, pagos, contratos, accesos de la bóveda, costos, márgenes, proveedor, notas internas, datos de otros clientes y artículos internos. No están en ninguna fuente ni herramienta (prueba de serialización de fuentes). |
| Acciones sobre servicios | No existen herramientas que actúen sobre servicios, pagos o datos del cliente; el asistente abre un ticket (RN-AIA-004). |
| Abuso y costo | Límite por IP y captcha en la web, topes por conversación y mensual por marca aplicados antes de llamar a la API (RN-AIA-007). |
| Transparencia | Se presenta como asistente automático y ofrece una persona (RN-AIA-001). |
| Registro | `ai_messages` es solo de inserción; las conversaciones se anonimizan al vencer su retención (RN-AIA-010). La clave de la API vive en la bóveda y nunca llega al navegador. |

## 12. Webs en WordPress: plugin Hub Connector, token del sitio y webhooks

Las webs públicas viven en WordPress Multisite (docs/00 §26); su CSS, sus píxeles, su aviso de cookies y su SEO se administran allí, fuera del sistema. Lo que el sistema expone y recibe:

| Riesgo | Control |
| --- | --- |
| Robo o filtración del token del plugin | Token de solo lectura por sitio (`scope = read`), guardado solo como hash (`wp_site_tokens.token_hash`), mostrado una vez, con vencimiento (`web_connector.token_expiry_days`) y revocable con motivo; un revocado no se reactiva (la base lo impide). El plugin lo guarda cifrado en las opciones del sitio y solo lo envía desde el servidor de WordPress, nunca al navegador. Crear un token exige MFA reciente y es solo del administrador (RN-WCN-003, RN-WCN-016). |
| Fuga de datos por la API del plugin | `/public/wp/...` solo devuelve datos públicos de la marca del token: planes con precio vigente, contacto público, documentos legales vigentes, definición de formularios activos y estado público; nunca costos, proveedor, paquete de WHM, nodo, notas internas ni datos personales (RN-WCN-004); límite de peticiones por token. |
| Avisos falsos al plugin (envenenar o vaciar su caché) | Webhook saliente firmado con HMAC-SHA256 sobre marca de tiempo y cuerpo, con el secreto del sitio en la bóveda (`secrets.owner_type = wp_site`); el plugin rechaza firmas inválidas, marcas de tiempo de más de 5 minutos y `event_id` repetidos; un aviso solo borra entradas de caché, nunca escribe contenido (RN-WCN-005). |
| XSS o inyección a través de lo que muestra el plugin | El plugin escapa toda salida (`esc_html`, `esc_attr`, `esc_url`, `wp_kses` con lista cerrada para el HTML saneado de los documentos legales) y valida los atributos de los shortcodes contra listas cerradas (`docs/13`). |
| Datos personales en WordPress | Los formularios, el Libro de Reclamaciones y el asistente envían los datos directo al sistema (o el plugin los reenvía sin guardarlos); WordPress no guarda envíos, IP ni consentimientos de estos formularios (RN-WCN-011). |
| CSRF y abuso en formularios | Captcha verificado en el servidor, casilla de consentimiento obligatoria cuando corresponde, origen permitido por sitio (CORS), campo trampa, límite por IP e `Idempotency-Key`; en el modo de reenvío por el plugin, nonce de WordPress además (RN-WCN-010). |
| Scripts de terceros | Viven solo en WordPress; nunca se cargan en el portal, el carrito ni el panel. La conversión de una compra se registra en la página de agradecimiento del sitio, con importe y moneda y sin datos personales (RN-ORD-016). |

## 13. Compra en línea: controles antifraude del checkout

La compra en línea abre el sistema a clientes que no pasaron por ventas (docs/00 §22 ya no descarta la tienda; §25). Controles:

- Precio siempre recalculado en el servidor desde el catálogo vigente y congelado al confirmar; nunca se acepta un precio del navegador (RN-ORD-002).
- Cuenta con correo verificado, captcha verificado en el servidor al crear la cuenta y al confirmar (RN-ORD-013), aceptación registrada de los términos vigentes (RN-ORD-015).
- Límite de compras en curso para clientes nuevos y reglas de revisión manual (monto por moneda, cantidad de dominios, país distinto del de la IP, correo desechable); en revisión no hay cobro (RN-ORD-008, RN-ORD-009).
- Una compra genera un solo pedido (`Idempotency-Key`, unicidad en base de datos, webhooks deduplicados) y el pedido nace solo con pago validado (RN-ORD-005, RN-ORD-006).
- Límite por IP en la consulta de dominios y en el asistente; 3-D Secure de la pasarela; contracargos con alerta (sección 10).
- IP y navegador se guardan solo como hash (`checkout_sessions.ip_hash`).

## 14. Ley 29733: datos personales en las webs, el Libro de Reclamaciones y las solicitudes del titular

| Tema | Cómo se cumple |
| --- | --- |
| Información al titular | Política de privacidad por marca con finalidades, destinatarios (incluidos proveedores como el de IA y los de analítica de WordPress), plazos, derechos y canal para ejercerlos; versionada y publicada como documento legal (RN-WCN-013) y mostrada en la web con `[hub_documento_legal tipo="privacidad"]`. |
| Consentimiento | Comercial en `communication_consents` (sección 6), también desde la casilla de los formularios del constructor con el texto aceptado guardado en el envío; el consentimiento de cookies lo gestiona el plugin de cookies de WordPress; ambos independientes y revocables. |
| Derechos del titular | Solicitudes de acceso, rectificación, cancelación y oposición en `privacy_requests` (LRC), con verificación de identidad, plazo por tipo (`complaints.privacy_response_days`, a confirmar con asesoría legal) y respuesta registrada (RN-LRC-008, RN-LRC-009). |
| Libro de Reclamaciones | Datos mínimos del consumidor, constancia, conservación sin borrado de las hojas reales y anonimización al vencer `complaints.retention_years`; solo las hojas de prueba se eliminan, con constancia en `complaint_deletions` (RN-LRC-004, RN-LRC-007, RN-LRC-012). |
| Transferencias a terceros | El asistente envía a la API de Claude solo el texto de la conversación y el contexto permitido; los píxeles reciben solo eventos sin datos personales. Revisar con asesoría legal la comunicación de flujo transfronterizo de datos que corresponda. |
| Seguridad | Cifrado en tránsito, control de acceso por rol, auditoría, IP en hash y minimización en registros públicos. |
| **NO VERIFICADO** | Plazos exactos de respuesta por derecho, obligación de inscribir bancos de datos y comunicación de transferencias: con asesoría legal (`docs/11`, D-28). |

## 15. Saneado del HTML enriquecido (docs/00 §27)

El editor de textos enriquecido (AUT) es la única vía para escribir HTML en el sistema: documentos legales, plantillas de contrato y cláusulas, plantillas de correo y avisos, respuestas predefinidas y de tickets, artículos, mensajes de confirmación de formularios, descripciones de productos y servicios personalizados y la carta de respuesta del Libro. Ese HTML llega a correos, al portal, al panel, a PDF y a las webs WordPress, así que un fallo de saneado sería un XSS almacenado.

| Control | Cómo se cumple |
| --- | --- |
| Saneado en el backend, siempre | Al guardar y en cada vista previa, con una biblioteca de saneado por lista blanca (por ejemplo HTML Purifier o `symfony/html-sanitizer`) configurada con `editor.html.allowed_tags`, `editor.html.allowed_attributes` y `editor.html.allowed_link_schemes`; nunca con expresiones regulares. El saneado del navegador es solo ayuda visual. |
| Lo que nunca pasa | `script`, `iframe`, `object`, `embed`, `style`, `form`, `input`, SVG con scripts, atributos `on…`, `style` en línea, `srcdoc`, enlaces `javascript:`, `data:` o `vbscript:`, comentarios condicionales. Los enlaces externos salen con `rel="noopener noreferrer"`. |
| Defensa en profundidad | CHECK en `notification_templates`, `rich_text_versions` y `complaint_responses` que rechaza lo evidente aunque la aplicación falle; Content-Security-Policy estricta en panel y portal (sin `unsafe-inline` para scripts); en WordPress, el plugin vuelve a pasar el HTML por `wp_kses_post`. |
| Imágenes | Solo subidas a `files` (tipo imagen verificado por contenido, antivirus, `editor.images.max_mb`), servidas con enlace firmado o público según el uso; nunca imágenes de otros dominios (evita rastreo y contenido mixto). Texto alternativo obligatorio. |
| Variables | Se resuelven después de sanear y se escapan como texto; una variable no puede inyectar HTML. Solo las del contexto (lista de `GET /admin/rich-text/variables`); una desconocida → 422. |
| Correos y PDF | El correo lleva el HTML saneado y su versión en texto plano; el PDF se genera desde el mismo HTML saneado en un proceso sin acceso a red. |
| Trazabilidad | Cada guardado de los textos sin versiones propias deja una fila en `rich_text_versions` con autor, hash y huella del perfil de saneado; la carta del Libro guarda el hash de la vista previa y la base verifica que coincida con lo enviado. |
| Pruebas | Batería de cargas XSS conocidas (incluidas variantes con mayúsculas, entidades y atributos partidos) contra el saneado, la vista previa, el correo, el PDF y la salida del plugin. |

## 16. Abuso de la búsqueda de dominios y WHOIS (docs/00 §27)

| Riesgo | Control |
| --- | --- |
| Uso del buscador para consultas masivas (agotar la cuota de los registradores o extraer datos) | Límite por visitante y hora (`web_connector.whois.limit_per_visitor_per_hour`), captcha tras `web_connector.whois.captcha_after_lookups` consultas, caché por dominio (`web_connector.whois.cache_minutes`) y límite general por IP en el proxy; las consultas frenadas no llegan al registrador (RN-DOM-016). |
| Visitante identificado por la IP del servidor de WordPress | El plugin reenvía la IP real en `X-Hub-Visitor-Ip`; el sistema solo la acepta en peticiones con un token de sitio vigente y la convierte en HMAC (clave fuera de la base). Si el hosting está detrás de un proxy, el plugin usa solo la cabecera del proxy de confianza configurado (D-29). |
| Exposición de datos personales del titular | Del WHOIS o RDAP solo salen los campos de `web_connector.whois.public_fields`; nunca nombre, correo, teléfono ni dirección, aunque el registro los publique (RN-DOM-015). |
| Datos personales del visitante | `whois_lookups` guarda el HMAC de la IP, el dominio y el resultado; se purga con `web_connector.whois.retention_days` (D-36). WordPress no guarda nada. |
| Falsos "disponible" | Sin respuesta del registrador el resultado es `unknown`; el carrito vuelve a consultar antes de cobrar (RN-ORD-003). |
| Seguimiento del abuso | P-DOM-08 y el indicador KPI-WEB-08 (consultas frenadas); una tasa alta de captchas por sitio genera alerta `security`. |

## Nombres usados fuera del contrato

- Columnas: `secrets.ciphertext`, `secrets.nonce`, `secrets.key_version`, `secrets.rotates_at`, `secrets.expires_at` (de docs/00, sección 4); `audit_events.prev_hash`, `audit_events.hash`; `one_time_links` con hash del token, vencimiento y fecha de uso.
- Job de verificación de la cadena de auditoría y job de retención (nombres a fijar en código).
- Claves de redacción de logs para pagos con tarjeta: `card`, `pan`, `cvv`, `cvc`, `expiry`.
- Secciones 11 a 14 del alcance de docs/00 §25 y §26: columna `ai_messages.injection_flagged`, tablas `legal_acceptances`, `privacy_requests`, `complaints`, `complaint_deletions`, `wp_site_tokens`, `web_form_submissions`, `email_login_codes`, `trusted_devices` y `password_histories`.
- Secciones 15 y 16 del alcance de docs/00 §27: tablas `rich_text_versions` y `whois_lookups`, columnas `complaint_responses.preview_sha256` y `notification_templates.content_format`, cabecera `X-Hub-Visitor-Ip`, ajustes `editor.html.*`, `editor.images.max_mb` y `web_connector.whois.*`.
