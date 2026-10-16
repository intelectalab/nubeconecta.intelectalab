# M-DOM · Domains (dominios, operaciones del cliente, reglas por extensión y regularización)

> Módulo de código `app/Modules/Domains` · clave de permiso `domains` · código `DOM`.
> Fuente: `docs/00-requerimientos.md` secciones 4, 6, 7 (no se suspenden dominios), 8 (robo de dominio), 16, 21, 22 (#6), 23 y 27 (consulta WHOIS y de disponibilidad de `[hub_whois]`); contrato común de nombres.

## 1. Propósito y bloque

Controla los más de 150 dominios con dos fechas separadas (expiración real en el registrador y vencimiento comercial pactado), su titular, registrador y cuenta, y las operaciones que el cliente puede pedir desde su panel con confirmación por correo. Incluye reglas por extensión, regularización de titularidad, detección de huérfanos y conciliación de renovaciones. Desde docs/00 §27 atiende además las consultas de disponibilidad, WHOIS público y sugerencias que hacen los visitantes desde `[hub_whois]` y `[hub_buscar_dominio]`, contra los registradores conectados, con límite por visitante y captcha ante abuso.

- **Bloque:** C. Inventario y mapa (conectores Namecheap, NameSilo y PoloDomains en bloque H).
- **Depende de:** PRV, SRV, CUS, CAT (precios por extensión), VLT, CFG.
- **Dependen de él:** MAI (correo depende del dominio), MAP, BIL (renovación tras pago), PRT, MON (DNS), WCN (`[hub_whois]` por `GET /public/wp/whois`), ORD (dominio en el carrito), DSH (búsquedas y registros de dominio).

## 2. Alcance

**Incluye**
- Registro e importación masiva por CSV con validación: registrador, cuenta, cliente, titular, fechas, renovación automática, nameservers, bloqueo, DNSSEC y privacidad.
- Fecha real (`registry_expires_at`) y fecha comercial (`services.commercial_due_date`) separadas: avisos al cliente con la comercial, alertas internas con la real.
- Alertas escalonadas y tablero de dominios por vencer con estado de pago.
- Costo, precio y margen por dominio (desde `domain_tld_prices` de CAT).
- Dominios huérfanos: sin cliente, sin servicio o sin hosting relacionado.
- Transferencias e historial de registradores por dominio.
- Operaciones del cliente: cambio de contactos, cambio de titular (validación de soporte), cambio de servidores DNS (interruptor, apagado por defecto), solicitud de transferencia de salida (identidad, deudas, antigüedad mínima, código de autorización), renovación tras pago validado.
- Confirmación por correo al titular para operaciones de riesgo; sin API, la solicitud crea tarea para soporte.
- Reglas por extensión (.pe, .cl, .mx, .co y genéricas): qué operaciones están habilitadas, bloqueos de 60 días, requisitos.
- Proyecto de regularización de titularidad con estado por dominio.
- Conciliación de renovaciones: dominios renovados sin factura pagada y viceversa.
- Conectores Namecheap y NameSilo (listar, vencimiento, renovar, nameservers, bloqueo) y procedimiento asistido de PoloDomains.
- Consulta de disponibilidad, WHOIS público (o RDAP) y sugerencias para las webs (docs/00 §27): `GET /public/wp/whois` (plugin, con el token del sitio y la IP del visitante reenviada) y `GET /public/domain-availability` (carrito), contra los registradores que declaran la capacidad, con caché `web_connector.whois.cache_minutes`; precios de `domain_tld_prices` de la marca; WHOIS solo con `web_connector.whois.public_fields` (nunca datos personales del titular).
- Límite por visitante y hora (`web_connector.whois.limit_per_visitor_per_hour`) y captcha tras `web_connector.whois.captcha_after_lookups` consultas; registro de cada consulta en `whois_lookups` con el HMAC de la IP (nunca la IP) y purga por `web_connector.whois.retention_days`.

**No incluye**
- Suspensión de dominios: no se suspenden; se deja de renovar y se avisa con mayor anticipación.
- Edición de zonas DNS (registros) desde el sistema; Route 53 se lee en CLD/MAI.
- El carrito y el pago del registro o la transferencia en línea (ORD, docs/00 §25): DOM solo informa disponibilidad, precio y WHOIS, y registra el dominio cuando el pedido se paga.

## 3. Entidades

| Tabla | Campos clave | Notas |
|---|---|---|
| `domains` | name, tld, provider_account_id, customer_id, service_id, holder (`company`/`customer`), registered_at, registry_expires_at, auto_renew, lock, dnssec, privacy, nameservers (jsonb), status, last_transfer_at, deleted_at | Único por (organization_id, name) |
| `domain_contacts` | domain_id, role (`registrant`/`admin`/`tech`/`billing`), name, company, email, phone, address (jsonb), synced_at | |
| `domain_operations` | domain_id, type, status, requested_by_user_id, payload (jsonb), confirmation_token_hash, email_confirmed_at, reviewed_by, reviewed_at, sent_at, completed_at, rejection_reason, task_id, idempotency_key, one_time_link_id | Una fila por solicitud |
| `tld_rules` | tld, allows_contact_change, allows_owner_change, allows_transfer_out (jsonb), transfer_lock_days_after_register, owner_change_lock_days, owner_change_requirements, renewal_rules, verified_at | Documentadas antes de habilitar |
| `domain_regularizations` | domain_id, status, target_holder, started_at, completed_at, task_id, notes | Proyecto de regularización |
| `whois_lookups` | brand_id, wp_site_id, visitor_hash, query_kind (`availability`/`whois`/`suggestions`), domain_name, tld, result (`available`/`registered`/`reserved`/`unsupported`/`unknown`/`rate_limited`/`captcha_required`), registrar_provider_id, captcha_verified, served_from_cache, response_ms | Sin IP ni datos del titular; la aplicación no la edita; se purga por retención |

## 4. Casos de uso y flujos

1. **Importar dominios:** CSV con plantilla → vista previa y validación fila por fila → crear dominios y enlazar a cliente y servicio.
2. **Sincronizar:** `SyncDomains` diario lee vencimiento y estado en cada registrador con API; lo desaparecido se marca y alerta.
3. **Avisos:** al cliente según `domains.customer_notice_days` sobre la fecha comercial (vía secuencia de BIL); internos según `domains.internal_notice_days` sobre la fecha real.
4. **Renovar:** al recibir `InvoicePaid` de la renovación, se renueva por API con clave de idempotencia; sin API (PoloDomains), se crea tarea con lista de verificación; se actualiza `registry_expires_at`.
5. **Cambio de contactos (portal):** cliente administrador envía formulario → correo de confirmación al titular → al confirmar, se envía al registrador por API o se crea tarea → `completed`; queda en auditoría.
6. **Cambio de DNS (portal, si el interruptor está activo):** aviso de impacto (sitio y correo) → confirmación por correo → envío por API.
7. **Cambio de titular:** solicitud → confirmación por correo → revisión de soporte (`domains.operation.approve`) con advertencia del bloqueo de 60 días en genéricos → envío al registrador → actualizar `holder`.
8. **Transferencia de salida:** solicitud → valida antigüedad mínima según `tld_rules`, identidad y deudas → confirmación por correo → revisión de soporte → desbloqueo y obtención del código (API o soporte) → entrega del código por enlace de un solo uso.
9. **Regularización:** seleccionar dominios a nombre de la empresa que deben pasar al cliente → estado `pending` → `requested` → `confirmed`, respetando reglas de la extensión.
10. **Huérfanos y conciliación:** reportes diarios de dominios sin cliente/servicio/hosting y de renovaciones sin factura pagada y viceversa.
11. **Consulta desde la web (`[hub_whois]`):** el visitante busca → el plugin reenvía al sistema (`GET /public/wp/whois`, token del sitio, IP del visitante en `X-Hub-Visitor-Ip`) → DOM calcula el HMAC de la IP y cuenta sus consultas de la última hora (Redis, con `hub_whois_recent_count()` como respaldo) → si supera el límite responde 429 `rate_limited`; si pasó el umbral de captcha y no trae token válido, 429 `captcha_required` → si no, usa la caché o consulta al registrador por defecto de cada extensión (`domain_extensions.default_registrar_id`) → arma disponibilidad, precios, sugerencias, WHOIS público y enlaces al carrito → registra la consulta en `whois_lookups`.
12. **Revisar abuso** (P-DOM-08): soporte ve las consultas por marca, sitio, resultado y visitante (hash), con las frenadas por límite o captcha.

## 5. Reglas de negocio clave

Un dominio guarda dos fechas distintas y cada aviso usa la que corresponde. No se suspenden dominios. Cambiar contactos, DNS, titular o pedir transferencia exige confirmación por correo al titular antes de aplicar; titular y transferencia exigen además revisión de soporte. La transferencia de salida no está disponible en los días posteriores al registro o a una transferencia que fije `tld_rules` (60 por defecto en genéricos) y se bloquea si el cliente tiene deuda vencida. Una operación que la extensión no permite no se ofrece en el portal. Las operaciones de dominio exigen `Idempotency-Key`. El código de autorización se guarda en la bóveda y se entrega por enlace de un solo uso, nunca en texto plano en correo o ticket. Sin API en el registrador, la misma solicitud crea una tarea con los pasos. Las operaciones de dominio del cliente solo se habilitan por extensión cuando sus reglas están documentadas (`tld_rules.verified_at`). Las consultas desde la web nunca dan por disponible un dominio sin respuesta del registrador, no muestran datos personales del titular, tienen límite por visitante y captcha, y no guardan la IP (RN-DOM-015 a RN-DOM-017).

## 6. Estados

- `domains.holder`: `company`, `customer`.
- `domain_operations.type`: `contact_change`, `owner_change`, `nameserver_change`, `transfer_out`, `transfer_in`, `renewal` (+ `transfer_in`, ver anexo).
- `domain_operations.status`: `requested`, `email_confirmed`, `in_review`, `sent`, `completed`, `rejected`, `cancelled`.
  - Contactos y DNS: `requested → email_confirmed → sent → completed`. Titular y transferencia: `requested → email_confirmed → in_review → sent → completed` (o `rejected`). Renovación: `requested → sent → completed`.
- `domains.status` y `domain_regularizations.status`: ver anexo.
- `whois_lookups.query_kind` y `whois_lookups.result`: listas cerradas (docs/01); no son estados con transiciones.

## 7. Permisos

| Código | Rol por defecto |
|---|---|
| `domains.domain.view` | admin, support, sales, finance; cliente sobre los suyos |
| `domains.domain.create` / `update` / `delete` / `export` | admin, support |
| `domains.operation.view` | admin, support; cliente sobre las suyas |
| `domains.operation.create` | admin, support (en el portal, `customer_admin` usa `portal.domain_operation.create`) |
| `domains.operation.approve` | admin, support |
| `domains.tld_rule.view` / `update` | admin |
| `domains.domain_regularization.view` / `create` / `update` | admin, documentation |
| `domains.whois_lookup.view` | admin, support, documentation |

`GET /public/wp/whois` no usa permisos: lo autentica el token del sitio y lo limitan el límite por visitante y el captcha.

## 8. Pantallas

### P-DOM-01 · Dominios
- **Propósito:** listar todos los dominios con sus dos fechas y titular.
- **Rol principal:** support
- **Columnas:** dominio, cliente, titular, registrador y cuenta, expiración real, vencimiento comercial, renovación automática, bloqueo, DNSSEC, privacidad, estado, margen (con permiso).
- **Filtros:** registrador, extensión, titular, cliente, vence en N días (real o comercial), sin cliente, sin servicio.
- **Acciones:** Registrar dominio → `domains.domain.create`; Importar CSV → `automation.import.create`; Sincronizar → `automation.sync_run.create`; Exportar → `domains.domain.export`.
- **Vacío / error:** vacío con botones registrar e importar; error de sincronización por registrador visible.

### P-DOM-02 · Detalle de dominio
- **Propósito:** ver fechas, contactos, nameservers, operaciones, historial de registradores y margen.
- **Rol principal:** support
- **Campos:** fechas real y comercial, titular, registrador/cuenta, nameservers, bloqueo, DNSSEC, privacidad, contactos, servicio enlazado y estado de pago, operaciones, historial de registradores y transferencias, costo, precio y margen, chequeos DNS de correo (MAI).
- **Filtros:** por pestaña.
- **Acciones:** Editar → `domains.domain.update`; Renovar ahora (tras pago validado) → `domains.operation.create`; Registrar transferencia → `domains.operation.create`; Cambiar nameservers → `domains.operation.create`; Agregar a regularización → `domains.domain_regularization.create`.
- **Vacío / error:** operaciones no permitidas por la extensión no aparecen; renovar sin pago validado → 422 con explicación.

### P-DOM-03 · Dominios por vencer
- **Propósito:** tablero de vencimientos con estado de pago para no perder ninguno.
- **Rol principal:** support
- **Columnas:** dominio, cliente, expiración real, vencimiento comercial, días restantes, factura de renovación, estado de pago, renovación automática en registrador, avisos enviados.
- **Filtros:** horizonte (7/15/30/60 días), registrador, pagado/no pagado, titular.
- **Acciones:** Renovar → `domains.operation.create`; Ver factura → `billing.invoice.view`; Exportar → `domains.domain.export`.
- **Vacío / error:** "Nada vence en el horizonte"; resalta dominios con fecha real anterior a la comercial.

### P-DOM-04 · Operaciones de dominio
- **Propósito:** bandeja de solicitudes de contactos, DNS, titular, transferencia y renovación.
- **Rol principal:** support
- **Columnas:** fecha, dominio, cliente, tipo, estado, solicitado por, correo confirmado, revisión, enviado, tarea manual, resultado.
- **Filtros:** tipo, estado, registrador, requiere revisión.
- **Acciones:** Aprobar → `domains.operation.approve`; Rechazar con motivo → `domains.operation.approve`; Reenviar confirmación → `domains.operation.create`; Marcar completada (manual) → `domains.operation.approve`; Entregar código por enlace → `vault.one_time_link.create`.
- **Vacío / error:** "No hay solicitudes pendientes"; aprobar una solicitud sin correo confirmado → 409.

### P-DOM-05 · Reglas por extensión
- **Propósito:** documentar qué operaciones admite cada extensión.
- **Rol principal:** admin
- **Columnas:** extensión, operaciones habilitadas, bloqueo tras registro, bloqueo tras cambio de titular, requisitos de titular, notas de renovación, verificada el.
- **Filtros:** verificada/no verificada.
- **Acciones:** Editar regla → `domains.tld_rule.update`; Marcar verificada → `domains.tld_rule.update`.
- **Vacío / error:** extensión sin regla verificada: el portal no ofrece operaciones para sus dominios (aviso visible).

### P-DOM-06 · Regularización de titularidad
- **Propósito:** pasar a nombre del cliente los dominios que están a nombre de la empresa.
- **Rol principal:** documentation
- **Columnas:** dominio, cliente destino, extensión, estado (pendiente, solicitado, confirmado), solicitado el, confirmado el, tarea.
- **Filtros:** estado, extensión, cliente.
- **Acciones:** Agregar dominios → `domains.domain_regularization.create`; Avanzar estado → `domains.domain_regularization.update`; Crear tarea → `work.task.create`; Exportar → `domains.domain.export`.
- **Vacío / error:** "Todos los dominios están regularizados"; 422 si la extensión no permite cambio de titular.

### P-DOM-07 · Huérfanos y conciliación de renovaciones
- **Propósito:** detectar dominios que nadie usa y renovaciones sin cobrar.
- **Rol principal:** finance
- **Columnas:** dominio, problema (sin cliente, sin servicio, sin hosting, renovado sin factura pagada, factura pagada sin renovación), registrador, fecha, monto.
- **Filtros:** tipo de problema, registrador, periodo.
- **Acciones:** Asignar cliente/servicio → `domains.domain.update`; Crear tarea → `work.task.create`; Exportar → `domains.domain.export`.
- **Vacío / error:** "Sin inconsistencias"; error de carga con reintento.

### P-DOM-08 · Consultas WHOIS de la web
- **Propósito:** ver cuánto se usa el buscador de dominios de las webs y detectar abuso.
- **Rol principal:** support
- **Columnas:** fecha, marca, sitio, tipo de consulta, dominio, resultado, registrador consultado, desde caché, captcha resuelto, tiempo de respuesta, visitante (hash abreviado).
- **Filtros:** marca, sitio, resultado (incluidas frenadas por límite o captcha), tipo, visitante, rango de fechas.
- **Acciones:** Ver consultas de un visitante → `domains.whois_lookup.view`; Abrir ajustes del límite → `settings.setting.update`.
- **Vacío / error:** "Sin consultas en el rango"; nunca muestra la IP ni datos de titulares.

## 9. Eventos y jobs

- **Emite:** `DomainExpiring` (interno, fecha real), `DomainCommercialDueSoon` (para la secuencia de BIL), `DomainRenewed`, `DomainOperationRequested`, `DomainOperationConfirmed`, `DomainOperationCompleted`, `DomainOperationRejected`, `DomainOrphanDetected`, `DomainCostChanged`.
- **Escucha:** `InvoicePaid` (BIL) → renovar; `ServiceTerminated` (SRV) → desactivar renovación automática.
- **Jobs:** `PurgeWhoisLookups` (diario, con `web_connector.whois.retention_days` definido); `SyncDomains` (frecuencia `domains.sync_frequency`, diaria); `NotifyDomainExpiry` (diario); `DetectOrphans` (aporta dominios huérfanos); `ReconcileDomainRenewals` (diario); `ExpireDomainConfirmations` (diario).

## 10. Integraciones y conectores

- `RegistrarConnector` Namecheap (API con lista blanca de IP), NameSilo (clave de API), PoloDomains (por verificar; sin API, registro manual y recordatorio).
- Correo de confirmación al titular (AUT) con token de un solo uso.
- Sin API: importación por CSV y tareas asistidas.
- Disponibilidad y WHOIS o RDAP públicos para `[hub_whois]` (`RegistrarConnector::checkAvailability` y `whois`, capacidades declaradas por conector; `docs/08`, NO VERIFICADO por registrador); captcha del proveedor de `orders.online.captcha_provider`.

## 11. Ajustes administrables

- `domains.customer_notice_days` ([30, 15, 7, 3])
- `domains.internal_notice_days` ([30, 15, 7, 3])
- `domains.sync_frequency` (diaria)
- `domains.confirmation_link_ttl_hours`
- `portal.actions.dns_change.enabled` (false)
- Buscador de las webs: `web_connector.whois.limit_per_visitor_per_hour`, `web_connector.whois.captcha_after_lookups`, `web_connector.whois.cache_minutes`, `web_connector.whois.public_fields`, `web_connector.whois.suggestions_max`, `web_connector.whois.retention_days` (por definir); convive con `orders.online.domain_check_limit_per_ip_per_hour` del carrito.

## 12. Historias del backlog

- Registro e importación masiva de dominios
- Fecha real y fecha comercial separadas
- Alertas de vencimiento de dominios
- Costo, precio y margen por dominio
- Dominios huérfanos
- Transferencias e historial de registrador
- Cambio de contactos del dominio
- Cambio de titular con validación
- Solicitud de transferencia de salida
- Cambio de servidores DNS desde el panel
- Reglas por extensión de dominio
- Regularización de titularidad de dominios
- Conector Namecheap
- Conector NameSilo
- PoloDomains: verificación y procedimiento manual
- Conciliación de renovaciones de dominios

Épica "Shortcodes de WHOIS y servidores" (lado de DOM):
- Consulta WHOIS y disponibilidad contra registradores
- Límite por visitante y captcha en consultas de dominio

## 13. Criterios de terminado y pruebas obligatorias

- Pruebas de contrato con respuestas grabadas de Namecheap y NameSilo.
- Un aviso al cliente se calcula sobre la fecha comercial y una alerta interna sobre la real (prueba con fechas distintas).
- Una operación del cliente sin confirmar por correo nunca llega al registrador.
- Transferencia pedida a los 30 días del registro (regla de 60) → 422; con deuda vencida → 422.
- Renovación repetida con la misma clave de idempotencia renueva una sola vez.
- El código de autorización no aparece en logs, respuestas de listado, correos ni tickets.
- Un cliente no puede pedir operaciones sobre un dominio de otro cliente (404).
- Ninguna rutina de suspensión toca dominios.
- Importar 150 dominios con 3 filas inválidas importa los válidos y reporta los 3.
- `[hub_whois]`: registrador caído → `unknown`, nunca disponible; WHOIS con datos del titular → la respuesta no los incluye; consulta 11 del visitante sin captcha → 429 `captcha_required`; consulta por encima del límite → 429 `rate_limited` y no llega al registrador; `whois_lookups` no guarda la IP y no se edita.

## 14. Preguntas abiertas

- API de PoloDomains y requisitos de API de Namecheap (docs/00, sección 14; antes de esos conectores).
- Reglas de transferencia y cambio de titular de .pe, .cl, .mx y .co (docs/00, sección 14; antes de habilitar esas operaciones).
- Qué operaciones permite la API de cada registrador: contactos, bloqueo y código de autorización (docs/00, sección 16).
- Qué registradores ofrecen disponibilidad, WHOIS o RDAP y sugerencias por API, con qué límites y si permiten mostrar esos datos en una web pública (`docs/08`, NO VERIFICADO; `docs/11`, D-35).

## Anexo: nombres fuera del contrato

- `domain_operations.type`: valor agregado `transfer_in` (para el historial de registradores cuando un dominio llega a un registrador propio).
- `domains.status`: `active`, `expired`, `redemption`, `pending_transfer`, `transferred_out`, `not_found`.
- `domain_regularizations.status`: `pending`, `in_progress`, `completed`, `cancelled`.
- Por docs/00 §27: tabla `whois_lookups`, función `hub_whois_recent_count()`, permiso `domains.whois_lookup.view`, endpoints `GET /public/wp/whois` y `GET /admin/whois-lookups`, cabecera `X-Hub-Visitor-Ip` y job `PurgeWhoisLookups`.
