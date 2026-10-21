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
