# hub — backend (Laravel 12)

Stack según `docs/00-requerimientos.md` §2: PHP 8.3, PostgreSQL 16, Redis + Horizon, Sanctum.

## Arranque

**Con Docker** (recomendado):

```bash
cp infra/.env.example infra/.env          # variables del compose (puertos, credenciales de desarrollo)
cp backend/.env.example backend/.env      # si aún no existe
docker compose -f infra/docker-compose.yml up -d --build postgres redis app web worker
docker compose -f infra/docker-compose.yml exec app php artisan key:generate
docker compose -f infra/docker-compose.yml exec app php artisan migrate
curl http://localhost:8080/api/v1/health
```

Dentro de los contenedores, `DB_HOST=postgres`, `REDIS_HOST=redis` y los drivers
(`pgsql`, `redis`) llegan como variables de entorno desde el compose y tienen
prioridad sobre `backend/.env`. Si el montaje no trae `vendor/`, el entrypoint
de la imagen ejecuta `composer install`.

**En el host**: `backend/.env` con `DB_HOST=127.0.0.1` y los puertos publicados
(`DB_PORT`, `REDIS_PORT`). El PHP del host necesita `pdo_pgsql`.

## Colas (Horizon)

`config/horizon.php` define un supervisor por cola: `critical`, `webhooks`,
`provisioning`, `billing`, `sync`, `notifications`, `monitoring`, `default`.
Los reintentos siguen la tabla de `docs/00` §10. El servicio `worker` ejecuta
`php artisan horizon`; el panel está en `/horizon` (en entornos no locales lo
protege el gate `viewHorizon` de `App\Providers\HorizonServiceProvider`).

## API

- `routes/api.php` (prefijo `/api`), registrado en `bootstrap/app.php`.
- `GET /api/v1/health`: estado de la app, la base y Redis. Responde 200 si todo
  está arriba y 503 (sin lanzar excepción) si algo falla.
- Sanctum: `config/sanctum.php` publicado y `statefulApi()` activo para que las
  SPA de `SANCTUM_STATEFUL_DOMAINS` usen cookie de sesión. No se publicó la
  migración de `personal_access_tokens`: la tabla ya está en `database/schema.sql`
  (con `organization_id` y `customer_id`).

## Contratos compartidos (para los módulos)

**Estructura de módulo.** `app/Modules/<Modulo>/` con `<Modulo>ServiceProvider.php`,
`routes/api.php`, `Models/`, `Services/`, `Http/{Controllers,Resources,Middleware}/`,
`Console/`, `Database/Seeders/`. El provider se agrega en `bootstrap/providers.php` y
carga sus rutas en `boot()`:

```php
Route::middleware('api')->prefix('api/v1')->name('api.v1.')->group(__DIR__.'/routes/api.php');
```

Un módulo no importa modelos de otro; lo transversal vive en `app/Shared`.
Referencia: `app/Modules/Identity`.

**Autenticación y permisos** (alias en `bootstrap/app.php`):

| Middleware | Efecto |
| --- | --- |
| `hub.auth` | `auth:sanctum` + sesión activa (usuario activo, `user_sessions` no revocada); si no, 401 |
| `permission:<codigo>[,<codigo>]` | Exige todos los permisos por roles vigentes. 403 `forbidden`; 403 `mfa_required` si el usuario debe enrolar MFA o si el permiso es sensible (`permissions.is_sensitive`) y la MFA no es reciente |
| `mfa.recent` | MFA de la sesión con menos de `security.sensitive_action_mfa_max_age_minutes` |
| `user.type:<staff\|customer>` | Separa panel y portal: un usuario `customer` recibe 403 `forbidden` en todo `/admin` (aplicado a los grupos `/admin` de Identity, Brands y Settings); los módulos nuevos deben añadirlo a su grupo `/admin` y, cuando exista, `user.type:customer` al de `/portal` |
| `idempotency` / `idempotency:optional` | `Idempotency-Key` (docs/06 §6): repetición → misma respuesta (`Idempotent-Replayed: true`); otro cuerpo → 422 `idempotency_key_reused`; en curso → 409 `idempotency_in_progress`; sin cabecera → 400 |

```php
Route::post('invoices/{invoice}/issue', IssueInvoice::class)
    ->middleware(['hub.auth', 'permission:billing.invoice.issue', 'idempotency']);
```

Puerto `App\Shared\Contracts\AccessControl` (lo implementa Identity) para chequeos en
código. Permisos desde `database/seeds/permissions.json` y roles del sistema desde
`roles.json` (`php artisan db:seed`, idempotente). Admin inicial:
`php artisan hub:create-admin correo@dominio [--generate | --password-env=VAR]`.

**Organización.** Modelos de negocio con `App\Shared\Database\Concerns\BelongsToOrganization`
(filtro global y relleno de `organization_id`) y `TracksVersionAndActor`
(`created_by`/`updated_by`, `version`+1). `App\Shared\Organization\CurrentOrganization`
resuelve la organización (hoy una; `HUB_ORGANIZATION_ID` si hubiera varias).

**Auditoría.** `app(AuditLogger::class)->record('invoice.issued', 'invoice', $id, $before, $after, $metadata, customerId: $cid)`
dentro de la transacción del cambio. El trigger encadena el hash; las claves de
`config/hub.php` → `audit.redact` se guardan como `[redacted]`. `php artisan hub:audit:verify`
comprueba la cadena.

**Errores (RFC 9457).** Toda excepción en `api/*` sale como `application/problem+json`
`{type,title,status,code,detail,errors?,request_id}` (`App\Shared\Http\Problem\ProblemRenderer`).
Errores de negocio: `throw new ProblemException(409, 'invalid_transition', 'detalle')` o
`ProblemException::forbidden()`, `::versionConflict()`, `::validation([...])`. Títulos en
`lang/{es,en}/problems.php` según `Accept-Language`. Cada respuesta lleva `X-Request-Id`.

**Concurrencia.** PATCH con `version`: `VersionGuard::check($model, $data['version'])` en la transacción → 409 `version_conflict`.

**Listados.** `CursorPagination::respond($query, $request, ['created_at', 'name'], XResource::class)`:
`sort`, `page[size]` (25, máx. 100), `page[cursor]` → `{data, meta: {next_cursor, prev_cursor, has_more, page_size}, links}`.

**Ajustes.** `SettingsReader::get('security.login_max_attempts')` lee el ajuste global de
`settings` o el valor por defecto de `database/seeds/settings.json` (la herencia por
marca/cliente la completará M-CFG).

**Pruebas.** `tests/Feature/Identity` exige PostgreSQL (en SQLite se omite). La imagen no
trae dependencias de desarrollo: en un contenedor sin montajes, contra postgres/redis de
otro proyecto compose, `composer install && php artisan test` con `DB_CONNECTION=pgsql`.

## Estrategia de esquema

**Decisión (técnica):** `database/schema.sql` es la fuente de verdad del modelo
de datos y se aplica como *migración base*; los cambios posteriores son
migraciones de Laravel normales.

- `0000_00_00_000000_load_canonical_schema` ejecuta `database/schema.sql`
  (ruta configurable con `HUB_SCHEMA_PATH`) en PostgreSQL **solo si la tabla
  `users` no existe**. Si el volumen de Docker ya cargó el esquema por initdb,
  la migración no hace nada y queda registrada: los dos caminos conviven.
  En SQLite (pruebas) no hace nada. Su `down()` es vacío a propósito.
- Las 3 migraciones de serie se conservan, pero crean cada tabla solo si falta
  (`Schema::hasTable`). En PostgreSQL `users` la crea el esquema canónico (uuid,
  `password_hash`, `organization_id`) y la migración de serie la omite; su
  `down()` nunca borra `users` en PostgreSQL. `sessions.user_id` pasa a texto
  para admitir ids uuid. Las tablas de sesiones, caché y colas, que no están en
  el esquema, siguen saliendo de estas migraciones.
- `0001_01_01_000003_grant_hub_app_on_framework_tables` concede al rol `hub_app`
  (lo crea `schema.sql`) permisos sobre esas tablas de infraestructura, porque
  los `GRANT ... ON ALL TABLES` del esquema solo alcanzan a las tablas que
  existían al cargarlo.
- Regla para cambios futuros: cada cambio de esquema es una migración nueva
  **y** se refleja en `database/schema.sql`, para que una instalación nueva
  (initdb o migración base) llegue al mismo estado. `database/verificar_schema.sh`
  valida el archivo.

Por qué no otras opciones: convertir las 203 tablas a migraciones Blueprint
pierde CHECK, índices parciales, triggers y `REVOKE` del archivo; usar
`schema:dump` de Laravel exige `pg_dump` en el contenedor y deja dos archivos
de esquema que divergen.

## Pendiente

- Identity: código por correo (`email_login_codes`), dispositivos de confianza,
  cambio/caducidad/historial de contraseña (`must_change_password` aún no se exige),
  lista de contraseñas filtradas, `/auth/sessions`, tokens de API pública
  (`personal_access_tokens.organization_id`), SSO, job de vencimiento de técnicos
  temporales (`users` no tiene `expires_at`; hoy vence la asignación `user_roles.expires_at`).
- Códigos de problema agregados fuera de docs/06 §5: `conflict`, `system_role_protected`,
  `idempotency_in_progress`, `csrf_token_mismatch`, `server_error` (revisar con el contrato).
- Cola `reports` (M-DSH) fuera de la lista de `docs/00` §10; reintentos de `webhooks` sin definir.
- Nombre comercial (D-17), subdominios y `SANCTUM_STATEFUL_DOMAINS` definitivos (D-19).

## Módulos Settings (M-CFG) y Brands (M-BRD)

- **Settings**: `SettingsResolver::get($key, ['brand' => …, 'product' => …, 'customer' => …, 'contract' => …])` resuelve contrato → cliente → producto → marca → global (`scope_order` de settings.json) y `resolve()` devuelve también el origen. `SettingsWriter` valida nivel, tipo y el permiso de edición de cada clave, escribe `setting_changes`, audita y emite `SettingChanged`. `BusinessCalendar` calcula días hábiles y horario con `holidays` y `business_hours`. `SettingsSeeder` carga solo valores por defecto definidos (omite `requires_definition`) y nunca pisa valores existentes.
- **Brands**: CRUD de marcas, entidad emisora, cuentas y series sobre `App\Shared\Http\Controllers\ResourceController`; `DocumentNumberAllocator::take()` (dentro de la transacción de emisión); temas con borradores, verificación de contraste, vista previa firmada, publicación y reversión (`BrandThemeService`). La forma de los tokens y los pares de contraste están en `config/hub.php` (`brands.theme`).
- Rutas: `/api/v1/admin/{settings,setting-changes,holidays,business-hours,legal-entities,brands,bank-accounts,document-series,brand-themes,brand-theme-versions}` y públicas `/api/v1/public/brand-themes/{code}` y `/api/v1/public/brand-theme-previews/{token}`.

## Módulo WebConnector (M-WCN)

- **Sitios** (`/api/v1/admin/web-connector/sites`, `web_connector.site.*`): CRUD sobre `ResourceController`; `webhook-secret` (genera o rota el secreto, visible una vez, MFA reciente; el anterior vence a `web_connector.webhook.secret_overlap_minutes`), `test-webhook` (aviso `all` firmado, un intento), `activate` (exige ruta, secreto, token vigente y prueba entregada con el secreto vigente) y `disable` (con motivo). La baja revoca tokens y cancela avisos pendientes.
- **Tokens** (`…/sites/{id}/tokens`, `web_connector.site_token.*`, crear es sensible): solo hash en `wp_site_tokens`, valor visible una vez, vencen a `web_connector.token_expiry_days`, revocar exige motivo.
- **Secretos**: `WebConnector\Services\SecretStore` cifra con AES-256-GCM en la tabla `secrets` (`owner_type = wp_site`, AAD id|organización) con `HUB_VAULT_KEY` (base64 de 32 bytes; si falta, derivada de `APP_KEY`). Se reemplazará por el módulo VLT.
- **API del plugin** (`/api/v1/public/wp/{site,catalog/categories,catalog/plans,catalog/plans/{id},contact}`): middleware `wp.site` (bearer del sitio, 401 si es desconocido, vencido o revocado o si el sitio está desactivado; `X-Hub-Plugin-Version` menor que `web_connector.min_plugin_version` → 426 `plugin_upgrade_required`), `throttle:wp-plugin` por token (`HUB_WP_REQUESTS_PER_MINUTE`, 120), `ETag`/304 y `Cache-Control: private, max-age=<cache_ttl_seconds de la marca>`. Solo datos de la marca del token, sin costos.
- **Avisos de invalidación**: `CacheInvalidator` crea un `wp_cache_invalidations` por sitio activo y `SendWpCacheInvalidations` (cola `webhooks`) lo envía con `X-Hub-Signature: t=<ts>,v1=<HMAC-SHA256 de "t.cuerpo">` y `X-Hub-Event-Id`, cuerpo `{event_id, scope, keys, brand, sent_at}`, espera creciente (30 s ×2, máx. 1 h) hasta `web_connector.webhook.max_attempts`; agotado → `failed` y `WpCacheInvalidationFailed`. Escucha `BrandUpdated` y `BrandThemeVersionPublished/Reverted` (alcance `all`). Manual y reintento en `/admin/web-connector/cache-invalidations`.
- **Pendiente WCN**: endpoints `/public/wp` de comparador, paquetes, precios de dominios, promociones, documentos legales, formularios, estado de servicios, servidores, WHOIS y Libro (dependen de CAT, BIL, DOM, MON, LRC y del resto de WCN); `central_urls` completos (D-19/D-20); formularios, contacto y documentos legales en el panel; `ExpireWpSiteTokens`; alerta al administrador por aviso fallido (AUT); oyentes de CAT/BIL/MON; valores de espera y del límite de peticiones sin definir en la doc.

## Módulo Customers (M-CUS)

- **Clientes** (`/api/v1/admin/customers`, `customers.customer.*`): listado con `q`, filtros (`origin_brand_id`, `country`, `account_manager_id`, `status`, `type`, `currency`, `has_overdue_debt`, `tag`, `custom[<clave filtrable>]`) y cursor; alta con validación del documento por tipo y país (RUC con dígito verificador, DNI, CE, pasaporte, NIF/RFC), correlativo `CLI-000123` (`hub_next_code`), 409 `duplicate_customer` (mismo documento, no forzable) y `possible_duplicate` (correo o nombre normalizado; `confirm_duplicates: true`); edición con `version` y auditoría `customer.fiscal_data_changed` (antes/después, origen panel o portal); baja lógica (409 `customer_has_obligations`); `duplicates`, `tax-id-lookup` (conector `TaxIdLookup`, implementación nula), `overview` (ficha 360°: conteos por tabla relacionada, saldo, exención, rentabilidad solo con `finance.cost.view`), `history` (incluye absorbidos), `exports` (CSV), `import-templates/{kind}` e `imports` (fila por fila, `dry_run`, `error_report_csv`).
- **Fusión** (`merge-preview`, `merge`): mueve toda referencia con FK a `customers` (salvo tablas de solo inserción) y las etiquetas; el absorbido queda con `merged_into_id` y baja lógica; exige escribir su código; 409 `already_merged`, 422 `currency_mismatch`.
- **Contactos** (`/admin/customers/{id}/contacts`, `/admin/contacts/{id}`, `customers.contact.*`): roles, contacto principal único, acceso al portal (`portal-access` con `customer_admin`/`customer_user`, `portal-invitation`); notas internas (`/notes`, `/admin/customer-notes/{id}`).
- **Consentimientos** (`/admin/contacts/{id}/communication-consents`): solo se agregan filas; una baja en cualquier canal excluye todos los canales comerciales hasta una nueva alta. `App\Shared\Contracts\CommunicationPreferences` (`maySend`, `recordUnsubscribeByEmail`) es la interfaz para SAL/AUT; los avisos transaccionales no dependen del consentimiento. Baja pública: `POST /public/communication-unsubscribes` (token HMAC, siempre 202, 30/min por IP).
- **Privacidad** (`personal-data-exports` → job `ExportPersonalData` en la cola `default`; `personal-data-erasure`): anonimiza contactos y usuarios del portal, conserva comprobantes y auditoría.
- **Portal** (`/api/v1/portal/{account,contacts,communication-consents}`, `user.type:customer`, `portal.*`): el cliente sale del contacto enlazado al usuario; `PortalCustomerResource` nunca incluye notas, responsable, marca de origen ni rentabilidad.
- **Pendiente CUS**: oyentes de `LeadWon` y `MailingUnsubscribed` (SAL aún no existe; la interfaz `createFromLead` y `recordUnsubscribeByEmail` ya están); conector real SUNAT/RENIEC; filtros guardados; pantallas del panel; plazos de retención por país (M-CUS §14).

## Módulos Catalog (M-CAT) y Orders (M-ORD) — franja MVP

- **Catalog** (`/api/v1/admin/{product-categories,products,plans,plan-prices,product-listings}`, `catalog.*`): CRUD con versión y auditoría sobre las mismas tablas que lee `/public/wp/catalog`; precios PEN/USD con vigencias sin superposición; `PriceResolver` para otros módulos; `php artisan hub:demo:catalog` (catálogo del prototipo en AlojamientoPlus, idempotente, no corre en producción). Detalle y pendientes: `app/Modules/Catalog/README.md`.
- **Orders** (`/api/v1/admin/orders`, `orders.order.*`): pedido de un cliente existente con precio congelado, IGV de `tax_rates`, `draft → approved | cancelled` con Idempotency-Key y eventos `OrderCreated`, `OrderApproved`, `OrderCancelled`. Detalle y pendientes: `app/Modules/Orders/README.md`.
- Ajustes: `sales` ya no tiene `customers.customer.delete` (M-CUS §7); mensajes de validación en español (`lang/es/validation.php`, `APP_LOCALE=es`; el idioma sigue `Accept-Language`).

## Módulos Services (M-SRV) y Billing (M-BIL) — franja MVP

- **Services** (`/api/v1/admin/services`, `/api/v1/portal/services`, `services.service.*`, `portal.service.view`): `OrderApproved` crea un servicio `pending` por línea con precio congelado y vencimiento según el ciclo; activar (aprovisionamiento manual por la interfaz `ServiceProvisioner` + suscripción), suspender, reactivar y cancelar con Idempotency-Key, historial, auditoría y eventos. Detalle y pendientes: `app/Modules/Services/README.md`.
- **Billing** (`/api/v1/admin/invoices`, `/api/v1/portal/invoices`, `billing.invoice.*`, `portal.invoice.view`): factura (RUC/extranjero) o boleta en `draft` al aprobar el pedido y en renovaciones (`GenerateRenewalInvoices` diario, `php artisan hub:billing:renewals`); emisión con series de Brands sin huecos ni duplicados, IGV de `tax_rates`, saldo pendiente; `EInvoiceConnector` simulado (`HUB_EINVOICE_DRIVER=fake`, CDR ficticio, no opera en producción; D-01); representación impresa HTML con descarga; anulación sin pagos. **Pagos y cobranza** (`/api/v1/admin/payments`, `/api/v1/admin/collections/*`, `/api/v1/portal/{summary,payments,invoices/{id}/vouchers}`): pago manual con aplicación parcial o total a varios comprobantes, vouchers del portal (archivo privado) validados o rechazados por finanzas, anulación que revierte saldos, antigüedad de deuda y avisos diarios (`RunDunningSequence` 07:00, `php artisan hub:billing:dunning`). Detalle y pendientes: `app/Modules/Billing/README.md`.
- Catalog emite `PlanChanged`/`PlanPriceChanged` y WebConnector los convierte en avisos `plan` firmados a las webs de la marca del producto (o de todas si no tiene marca).
- Demo: `HUB_SERVICES_AUTO_ACTIVATE=true` y `HUB_BILLING_AUTO_ISSUE=true` dejan el flujo Pedido → Servicio activo → Comprobante emitido en un solo paso (aprobar).

## Correo del portal: invitación y olvidé mi contraseña

- **Flujo**: dar acceso al portal a un contacto (o `POST .../portal-invitation`) encola `PortalLinkMail` (cola `notifications`) con `{HUB_PORTAL_URL}/#/activar?token=...` (72 h, `HUB_INVITATION_HOURS`). El portal llama a `POST /api/v1/portal/auth/invitations/verify|accept`; "olvidé mi contraseña" usa `POST /portal/auth/password/forgot` (202 siempre genérica; límites `HUB_FORGOT_PER_MINUTE_IP` y `HUB_FORGOT_PER_HOUR_EMAIL`) y `.../password/reset` (60 min, `HUB_PASSWORD_RESET_MINUTES`; cierra todas las sesiones). Los tokens viven solo como hash en `user_tokens`; son de un solo uso.
- **Desarrollo con Docker**: Mailpit recibe todo el correo en http://localhost:8025 (no sale nada a Internet). Sin Docker: `MAIL_MAILER=log` y el enlace queda en `storage/logs/laravel.log` (`grep "#/activar" storage/logs/laravel.log`).
- **Producción** (`infra/docker-compose.production.yml`, valores en `infra/.env.production`): `MAIL_HOST`, `MAIL_PORT` (587), `MAIL_SCHEME` (vacío = STARTTLS; `smtps` para 465), `MAIL_USERNAME`, `MAIL_FROM_ADDRESS` (remitente del dominio con SPF/DKIM/DMARC configurados), `MAIL_FROM_NAME`, `HUB_PORTAL_URL` (URL pública del portal) y la contraseña SMTP en `secrets/mail_password.txt` (`MAIL_PASSWORD_FILE`). Horizon (worker) debe estar en marcha: el correo sale por la cola.

## Endurecimiento para producción

- **Usuario de BD restringido**: `HUB_DB_APP_PASSWORD='<secreto>' php artisan hub:db:app-user` (ejecutado con el dueño `hub_owner`, tras `migrate`) crea o actualiza el rol `HUB_DB_APP_USERNAME` (por defecto `hub_app_login`) con `LOGIN INHERIT` y sin atributos de administración, miembro de `hub_app` (DML sin DDL y con los REVOKE de solo inserción). La aplicación usa luego `DB_USERNAME=hub_app_login`; migraciones y seeders siguen con `hub_owner`. En desarrollo se puede seguir con `hub_owner`. La contraseña nunca va en el repositorio.
- **Tokens Sanctum**: `SANCTUM_EXPIRATION` (minutos, 480 por defecto = `security.session_duration_hours`); los tokens usan `Identity\Models\PersonalAccessToken` (fija `organization_id`). `sanctum:prune-expired --hours=24` corre a diario (`routes/console.php`, requiere `schedule:work`/cron).
- **Rol admin**: `SystemAdminGuard` impide quitar al rol `admin` los permisos de `hub.identity.admin_minimum_permissions` y deja siempre al menos un usuario del personal activo con el rol vigente (desactivar, borrar o cambiar roles) → 409 `admin_role_protected`.
- **SSRF**: `App\Shared\Http\OutboundUrlGuard` rechaza al guardar y al enviar los webhooks de WebConnector cuyo host sea o resuelva a IP privada, loopback, link-local/metadatos, CGNAT o reservada (también IPv6 mapeada) o que no resuelva, y fija la conexión a las IP verificadas (`CURLOPT_RESOLVE`). `HUB_OUTBOUND_ALLOW_PRIVATE=true` solo tiene efecto con `APP_ENV` `local` o `testing`.
