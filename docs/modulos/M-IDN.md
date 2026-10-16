# M-IDN · Identity (identidad, roles, permisos y cimientos)

> Módulo de código `app/Modules/Identity` · clave de permiso `identity` · código `IDN`.
> Fuente: `docs/00-requerimientos.md` secciones 2, 3, 5, 8, 12, 13, 19, 23 y 26 ("Seguridad administrable" y "Usuarios y roles"); contrato común de nombres.

## 1. Propósito y bloque

Autentica a personal y clientes, define quién puede hacer qué (roles, permisos por acción y políticas por registro) y aísla los datos por organización. Además aloja los servicios transversales de cimientos que todos los módulos usan: auditoría de solo inserción, idempotencia, archivos, etiquetas y campos personalizados.

- **Bloque:** A. Cimientos (docs/00, sección 13).
- **Depende de:** ninguno. Es el primer módulo que se construye.
- **Dependen de él:** todos los módulos y las dos SPA (panel y portal).

## 2. Alcance

**Incluye**
- Organización operadora única (`organizations`, una fila hoy) con filtro global por `organization_id` en toda tabla de negocio y prueba automática de aislamiento.
- Usuarios de tipo `staff` y `customer`; inicio de sesión con Sanctum (cookies para las SPA), contraseñas Argon2id con verificación contra listas filtradas, segundo factor por aplicación TOTP o por código al correo, códigos de recuperación.
- Política de seguridad administrable (docs/00 §26, keys `security.*` editables desde P-IDN-08): longitud mínima y complejidad de contraseñas, caducidad e historial (`password_histories`); segundo factor por código al correo (`email_login_codes`: vencimiento, intentos, un solo uso) o por aplicación TOTP (alta, verificación y baja); obligatorio u opcional por rol (`security.mfa.required_by_role`) y por tipo de usuario personal o cliente; intentos antes del bloqueo y duración del bloqueo, duración de sesión y dispositivos de confianza (`trusted_devices`).
- Sesiones y dispositivos con cierre remoto; límite de intentos por IP y por cuenta en inicio de sesión, MFA y recuperación.
- Roles del sistema por seeder (no se borran ni cambian de código o audiencia), roles personalizados creados desde cero o copiando uno existente, matriz de permisos por módulo y acción para asignarlos uno por uno, permisos `modulo.entidad.accion`, políticas por registro, matriz probada por endpoint.
- Reautenticación (MFA reciente) para acciones sensibles: revelar secretos, ejecutar en servidores, autorizar reembolsos.
- Usuario con fecha de vencimiento (técnico temporal) y baja inmediata de personal con lista de accesos vistos para rotar (la lista la entrega VLT).
- Servicios compartidos (`app/Shared` + tablas IDN): auditoría encadenada por hash (`audit_events`), idempotencia (`idempotency_keys`), archivos protegidos (`files`), etiquetas polimórficas (`tags`, `taggables`), definiciones de campos personalizados (`custom_field_definitions`).
- Cimientos técnicos que se entregan con este bloque: repositorio, Docker, pipeline, estructura modular con prueba de arquitectura, value object de dinero, componentes base del frontend, despliegue en Contabo y respaldo del propio sistema en AWS S3.
- Tokens de la API pública con alcances y límite de peticiones; SSO empresarial (SAML u OIDC) para personal.

**No incluye**
- Registro de nuevas empresas, planes y cobro del SaaS, panel de plataforma (docs/00, sección 19: fuera del alcance, solo si se decide vender el sistema como SaaS).
- Clave maestra por organización en KMS/Vault (prevista, no se construye).
- Gestión de contactos del cliente (CUS) ni de secretos (VLT).
- Pantalla de consulta de la auditoría (la expone AUT; IDN provee el servicio y la tabla).
- Barreras de seguridad adicionales para el cliente (decisión ya tomada).

## 3. Entidades

| Tabla | Campos clave | Notas |
|---|---|---|
| `organizations` | name, default_locale, default_timezone | Una fila hoy; toda tabla de negocio la referencia |
| `users` | email, password_hash (Argon2id), password_changed_at, must_change_password, mfa_secret (cifrado), mfa_enabled_at, mfa_method (`totp`/`email`), failed_login_count, locked_until, locale, timezone, type (`staff`/`customer`), last_login_at, disabled_at | `expires_at` para técnico temporal |
| `roles` | code, name, audience (`staff`/`customer`), is_system, copied_from_role_id | Roles del contrato con `is_system = true`; personalizados con `false` |
| `permissions` | code (`modulo.entidad.accion`), module, description | Cargados por seeder desde el registro de cada módulo |
| `role_permissions` | role_id, permission_id | N:M |
| `user_roles` | user_id, role_id, expires_at | Vencimiento opcional por asignación |
| `user_sessions` | user_id, device_label, ip, user_agent, last_activity_at, revoked_at, mfa_verified_at | `mfa_verified_at` alimenta la regla de MFA reciente |
| `mfa_recovery_codes` | user_id, code_hash, used_at | Solo hash |
| `email_login_codes` | user_id, purpose (`login`/`step_up`/`enroll`), code_hash, sent_to, expires_at, max_attempts, attempts, consumed_at, invalidated_at, ip_hash | Un vigente por usuario y propósito; un solo uso |
| `trusted_devices` | user_id, device_token_hash, label, user_agent, ip_hash, trusted_until, last_used_at, revoked_at, revoked_by | Solo hash del token del dispositivo |
| `password_histories` | user_id, password_hash | Contraseñas anteriores para el historial |
| `audit_events` | actor_id, actor_type, action, entity_type, entity_id, before, after (jsonb), metadata, ip, request_id, prev_hash, hash, occurred_at | Solo inserción; encadenada por hash |
| `idempotency_keys` | key, user_id, scope, request_hash, response_status, response_body, expires_at | Única por (organization_id, scope, key) |
| `code_sequences` | entity, prefix, padding, next_value | Correlativos legibles (tabla agregada) |
| `personal_access_tokens` | tokenable_type, tokenable_id, name, token, abilities, customer_id, last_used_at, expires_at | Tabla de Laravel Sanctum para la API pública (tabla agregada) |
| `files` | disk, path, mime_type, size_bytes, checksum_sha256, scan_status, attachable_type, attachable_id | Ruta con `organization_id`; enlaces firmados de corta duración |
| `tags` / `taggables` | name, color / tag_id, taggable_type, taggable_id | Polimórfica |
| `custom_field_definitions` | entity_type, key, label (i18n), field_type (`text`/`number`/`date`/`boolean`/`select`/`multiselect`/`url`), options, filterable, exportable | Valores en la columna `custom` de cada tabla |

## 4. Casos de uso y flujos

1. **Inicio de sesión del personal:** correo + contraseña (bloqueo tras `security.login_max_attempts` intentos por `security.login_lockout_minutes`) → si la política lo exige para su rol o tipo de usuario y el dispositivo no es de confianza, segundo factor por TOTP o por código al correo (opción "Confiar en este dispositivo" por `security.trusted_device_days`) → sesión con cookie `HttpOnly`/`Secure`/`SameSite` → la respuesta trae la lista de permisos para el componente `<Can>`.
2. **Activar MFA:** por aplicación, el usuario escanea el QR, confirma un código (`POST /auth/mfa/totp/confirm`) y descarga los códigos de recuperación; por correo, pide un código de enrolamiento (`POST /auth/mfa/email-code`) y lo confirma (`POST /auth/mfa/email/confirm`). Desactivar TOTP (`DELETE /auth/mfa/totp`) exige MFA reciente y, si la política lo obliga, el correo como alternativa.
2b. **Código al correo:** `POST /auth/mfa/email-code` invalida el código vigente del mismo propósito y envía uno nuevo que vence en `security.mfa.email_code_ttl_minutes` y admite `security.mfa.email_code_max_attempts` intentos; `POST /auth/mfa/verify` con `method = email` lo consume una sola vez.
2c. **Política de seguridad** (admin): en P-IDN-08 cambia contraseñas, segundo factor, obligatoriedad por rol y tipo de usuario, bloqueo, sesión y dispositivos de confianza (`PUT /admin/security-policy`, con MFA reciente); se guarda como ajustes globales con historial y rige en el siguiente inicio de sesión o cambio de contraseña.
3. **Reautenticación:** al invocar una acción marcada como sensible, si `mfa_verified_at` tiene más de `security.sensitive_action_mfa_max_age_minutes`, la API responde 403 con `code = mfa_required`; el frontend abre `ConfirmDialog` con TOTP y reintenta.
4. **Cerrar sesión remota:** el usuario (o el administrador) revoca una fila de `user_sessions`; la siguiente petición con esa cookie responde 401.
5. **Crear rol personalizado:** el administrador crea el rol desde cero o copia uno existente (`POST /admin/roles/{id}/copy`), marca sus permisos en la matriz por módulo y acción (`GET /admin/permissions/matrix`, `PUT /admin/roles/{id}/permissions`) y lo asigna a usuarios; queda en auditoría con la lista anterior. Un rol del sistema no se borra ni cambia de código; un rol de cliente solo admite permisos `portal.*`.
6. **Dar acceso a técnico temporal:** se crea el usuario con rol `temp_technician` y `expires_at`; un job lo deshabilita al vencer.
7. **Baja de personal:** deshabilitar usuario → revocar sesiones y concesiones → VLT entrega la lista de secretos que reveló para crear tareas de rotación.
8. **Escritura auditada:** cada acción de escritura registra usuario, fecha, entidad, cambios, resultado e IP; un comando verifica la cadena de hash.
9. **Petición idempotente:** en pagos, pedidos, aprovisionamiento, emisión de facturas y operaciones de dominio se exige `Idempotency-Key`; repetición → misma respuesta; misma clave con otro cuerpo → 422.
10. **Token de API pública:** el administrador emite un token con alcances y límite de peticiones; se muestra una sola vez.
11. **SSO:** inicio de sesión del personal por SAML u OIDC; el MFA lo aporta el proveedor de identidad si así se configura.

## 5. Reglas de negocio clave

El backend valida siempre los permisos; el frontend solo oculta. Un usuario de cliente nunca recibe filas de otra organización de cliente aunque adivine un identificador, y una prueba automática lo verifica en cada endpoint del portal. Los roles del sistema no se pueden borrar ni cambiar de código o audiencia, y un rol de cliente solo recibe `portal.*` (RN-IDN-008). Revelar secretos, ejecutar en servidores y autorizar reembolsos exigen MFA de menos de 10 minutos (valor en ajustes). Las tablas `audit_events` (y las demás de solo inserción del contrato) no admiten UPDATE ni DELETE por el usuario de base de datos de la aplicación. La política de contraseñas, el segundo factor y su obligatoriedad por rol y tipo de usuario, los intentos y el bloqueo, la duración de sesión y los dispositivos de confianza viven en ajustes, no en el código (RN-IDN-001 a RN-IDN-009). Un código al correo se usa una sola vez y vence. Un usuario con `expires_at` vencido no puede iniciar sesión. Archivos, colas y caché llevan el identificador de la organización en su ruta o clave, y los conectores reciben credenciales por parámetro.

## 6. Estados

- `users.mfa_method`: `totp`, `email` (sin método: segundo factor no activado). `email_login_codes.purpose`: `login`, `step_up`, `enroll`; un código es vigente, consumido (`consumed_at`) o invalidado (`invalidated_at`), sin columna de estado.
- El contrato no define otras columnas de estado para las tablas de este módulo. Los usuarios se controlan con marcas de tiempo (`disabled_at`, `expires_at`), no con una columna de estado.
- `files.scan_status`: ver anexo (valor agregado).

## 7. Permisos

| Código | Rol por defecto |
|---|---|
| `identity.user.view` / `create` / `update` / `delete` | admin |
| `identity.role.view` / `create` / `update` / `delete` | admin |
| `identity.session.view` / `delete` | admin (todas); cada usuario sobre las suyas por política |
| `identity.custom_field_definition.view` / `create` / `update` / `delete` | admin |
| `identity.tag.view` / `create` / `update` / `delete` | admin, sales, support |
| `identity.api_token.view` / `create` / `delete` | admin |
| `identity.permission.view` (matriz) | admin |
| `identity.security_policy.view` / `update` | admin (cambiar exige MFA reciente) |
| `identity.trusted_device.view` / `delete` | admin; cada usuario gestiona los suyos en `/auth/trusted-devices` |

Roles del contrato cargados por seeder: `admin`, `sales`, `finance`, `support`, `documentation`, `external_accountant`, `temp_technician`, `customer_admin`, `customer_user`. La matriz inicial es la de `docs/00-requerimientos.md` sección 5.

## 8. Pantallas

### P-IDN-01 · Inicio de sesión del panel
- **Propósito:** autenticar al personal con contraseña y TOTP, o por SSO.
- **Rol principal:** todo el personal
- **Campos:** correo, contraseña, código TOTP, código al correo o código de recuperación, "Confiar en este dispositivo"; botón de SSO si está configurado.
- **Filtros:** no aplica.
- **Acciones:** Ingresar → público; Enviar código al correo → público; Recuperar contraseña → público; Ingresar con SSO → público.
- **Vacío / error:** credenciales inválidas con mensaje genérico (igual si la cuenta está bloqueada); MFA inválido; código al correo vencido o ya usado → pedir otro.

### P-IDN-02 · Usuarios internos
- **Propósito:** administrar las cuentas del personal y sus roles.
- **Rol principal:** admin
- **Columnas:** nombre, correo, roles, MFA activo, último acceso, vence el, estado (activo/deshabilitado).
- **Filtros:** rol, activo/deshabilitado, con vencimiento, sin MFA.
- **Acciones:** Crear usuario → `identity.user.create`; Editar → `identity.user.update`; Deshabilitar (baja inmediata) → `identity.user.delete`; Exportar → `identity.user.export`.
- **Vacío / error:** vacío con botón "Crear usuario"; error de carga con reintento.

### P-IDN-03 · Detalle de usuario
- **Propósito:** ver roles, sesiones, vencimiento y accesos revelados de un usuario.
- **Rol principal:** admin
- **Campos:** datos básicos, idioma, zona horaria, roles con vencimiento, segundo factor (método y fecha), bloqueo e intentos fallidos, dispositivos de confianza, sesiones activas, secretos revelados (desde VLT), historial de auditoría.
- **Filtros:** no aplica.
- **Acciones:** Asignar rol → `identity.user.update`; Cerrar sesión remota → `identity.session.delete`; Restablecer MFA → `identity.user.update`; Desbloquear → `identity.user.update`; Revocar dispositivo de confianza → `identity.trusted_device.delete`; Deshabilitar y generar tareas de rotación → `identity.user.delete`.
- **Vacío / error:** sin sesiones activas; sin revelaciones registradas; 404 si el usuario no existe.

### P-IDN-04 · Roles y permisos
- **Propósito:** ver los roles del sistema y crear roles personalizados con la matriz de permisos.
- **Rol principal:** admin
- **Columnas:** rol, código, audiencia (personal/cliente), número de usuarios, de sistema, copiado de; matriz de permisos por módulo (filas: entidades; columnas: ver, crear, editar, borrar, aprobar, exportar y acciones especiales), con casillas y marca de las que exigen MFA reciente.
- **Filtros:** audiencia, módulo, solo los otorgados.
- **Acciones:** Crear rol → `identity.role.create`; Copiar rol → `identity.role.create`; Guardar matriz → `identity.role.update`; Borrar rol personalizado → `identity.role.delete`.
- **Vacío / error:** el botón borrar no aparece en roles del sistema y su código no se edita; 409 si el rol tiene usuarios; un rol de cliente solo muestra permisos `portal.*`.

### P-IDN-05 · Mi cuenta: seguridad y sesiones
- **Propósito:** que cada usuario del personal gestione su contraseña, MFA y sesiones.
- **Rol principal:** todo el personal
- **Campos:** idioma, zona horaria, cambio de contraseña con las reglas vigentes, segundo factor (activar TOTP o código al correo, desactivar TOTP, regenerar códigos), dispositivos de confianza, lista de sesiones con dispositivo, IP y último uso.
- **Filtros:** no aplica.
- **Acciones:** Cambiar contraseña → propio usuario; Activar segundo factor → propio usuario; Desactivar TOTP → propio usuario; Quitar dispositivo de confianza → propio usuario; Regenerar códigos de recuperación → propio usuario; Cerrar sesión → `identity.session.delete`.
- **Vacío / error:** contraseña que no cumple la política (longitud, complejidad, historial o filtrada) rechazada con la regla incumplida; código TOTP inválido; desactivar TOTP sin alternativa cuando la política lo obliga → 409.

### P-IDN-06 · Campos personalizados y etiquetas
- **Propósito:** agregar datos propios a clientes, servicios y otras entidades sin programar.
- **Rol principal:** admin
- **Columnas:** entidad, clave, etiqueta, tipo, opciones, filtrable, exportable; etiquetas con color y uso.
- **Filtros:** entidad, tipo.
- **Acciones:** Crear campo → `identity.custom_field_definition.create`; Editar → `identity.custom_field_definition.update`; Borrar → `identity.custom_field_definition.delete`; Crear etiqueta → `identity.tag.create`.
- **Vacío / error:** vacío explicativo con botón crear; 409 al borrar un campo con datos (pide confirmación escribiendo la clave).

### P-IDN-07 · Tokens de la API pública
- **Propósito:** emitir y revocar tokens con alcances para integradores.
- **Rol principal:** admin
- **Columnas:** nombre, alcances, límite de peticiones por minuto, creado por, último uso, vence.
- **Filtros:** activos/revocados.
- **Acciones:** Crear token (se muestra una sola vez) → `identity.api_token.create`; Revocar → `identity.api_token.delete`.
- **Vacío / error:** vacío con enlace a la documentación OpenAPI; error si no se elige ningún alcance.

### P-IDN-08 · Política de seguridad
- **Propósito:** decidir sin programar cómo se protegen las cuentas del personal y de los clientes.
- **Rol principal:** admin
- **Campos:** contraseñas (longitud mínima, mayúsculas, minúsculas, números, símbolos, caducidad en días, historial); segundo factor (correo habilitado, aplicación habilitada, obligatorio para personal, obligatorio para clientes, obligatorio u opcional por rol, vigencia e intentos del código al correo); bloqueo (intentos, minutos); sesión (horas); dispositivos de confianza (días); historial de cambios de cada valor.
- **Filtros:** no aplica.
- **Acciones:** Guardar → `identity.security_policy.update`; Ver historial → `identity.security_policy.view`.
- **Vacío / error:** dejar sin segundo factor al rol admin o desactivar correo y aplicación con un rol obligado → 422 con el motivo; guardar pide MFA reciente.

## 9. Eventos y jobs

- **Emite:** `UserCreated`, `UserDisabled`, `RoleChanged`, `LoginFailed`, `LoginLockedOut`, `SessionRevoked`, `MfaReset`, `UserLocked`, `UserUnlocked`, `UserMfaEnabled`, `UserMfaDisabled`, `UserPasswordChanged`, `TrustedDeviceAdded`, `TrustedDeviceRevoked`, `RoleCreated`, `RoleCopied`, `RoleDeleted`, `RolePermissionsChanged`, `SecurityPolicyChanged`.
- **Escucha:** `ContactPortalAccessGranted` (CUS) para crear el usuario `customer`; `ContactRemoved` (CUS) para deshabilitarlo.
- **Jobs:** `ExpireTemporaryUsers` (diario, a `system.daily_jobs_time`); `PurgeEmailLoginCodes` (diario, borra códigos vencidos o usados); `PurgePasswordHistories` (diario, conserva solo las últimas `security.password.history_count`); `PurgeExpiredIdempotencyKeys` (diario); `VerifyAuditChain` (comando y diario); `OffsiteBackup` (diario, respaldo cifrado del sistema en AWS S3; operado desde cimientos).

## 10. Integraciones y conectores

- Proveedor de identidad SAML u OIDC (SSO del personal).
- AWS S3 (archivos y respaldo del sistema, credenciales que solo pueden escribir).
- Elastic Email para correos de recuperación de contraseña y códigos de acceso al correo (vía AUT).
- Servicio de antivirus en cola para `files`.

## 11. Ajustes administrables

- Sesión y bloqueo: `security.session_duration_hours` (8), `security.login_max_attempts` (5), `security.login_lockout_minutes` (15).
- Contraseñas: `security.password.min_length` (10), `security.password.complexity`, `security.password.expiry_days` (0 = no caduca), `security.password.history_count` (5).
- Segundo factor: `security.mfa.app_enabled` (true), `security.mfa.email_enabled` (true), `security.mfa.required_for_staff` (true), `security.mfa.required_for_customers` (false), `security.mfa.required_by_role`, `security.mfa.email_code_ttl_minutes` (10), `security.mfa.email_code_max_attempts` (5), `security.trusted_device_days` (30).
- `security.sensitive_action_mfa_max_age_minutes` (10)
- `security.vault.reveal_limit_per_hour` (lo aplica VLT)
- `system.daily_jobs_time` (06:00)
- `system.backup.frequency` (diario) y `system.backup.retention_days` (35)

## 12. Historias del backlog

- Repositorio, Docker y pipeline CI/CD
- Estructura modular y reglas de dependencia
- Value object de dinero y monedas
- Auditoría de solo inserción
- Middleware de idempotencia
- Componentes base del frontend
- Inicio de sesión con MFA TOTP
- Gestión de sesiones y dispositivos
- Roles iniciales y permisos por acción
- Roles personalizados
- Reautenticación para acciones sensibles
- Roles de documentación, contador externo y técnico temporal
- Etiquetas y campos personalizados
- organization_id en todas las tablas de negocio
- Configuración por organización
- API pública documentada
- SSO empresarial
- Despliegue en VPS Contabo
- Respaldos fuera del VPS

Épica "Política de seguridad administrable":
- Política de contraseñas administrable
- Segundo factor por código al correo
- Alta, verificación y baja del segundo factor por aplicación
- Obligatoriedad del segundo factor por rol y tipo de usuario
- Bloqueo por intentos y duración de sesión
- Dispositivos de confianza

Épica "Roles y permisos personalizados":
- Crear roles con matriz de permisos por módulo y acción
- Copiar un rol existente como base
- Roles del sistema protegidos

## 13. Criterios de terminado y pruebas obligatorias

- Definición de terminado del kit (sección 11) cumplida en cada historia.
- Prueba de matriz: cada endpoint del panel y del portal contra cada rol responde permitido o 403.
- Prueba de aislamiento: un usuario `customer_admin` de la organización de cliente A recibe 404 al pedir por identificador un recurso de B, en todos los endpoints del portal.
- Prueba de organización: una consulta sin el filtro global falla la suite.
- Revelar un secreto, ejecutar en servidor y autorizar reembolso con MFA de hace 11 minutos → 403 `mfa_required`; con MFA de hace 5 minutos → permitido.
- Intentar UPDATE o DELETE sobre `audit_events` con el usuario de la aplicación falla; el comando de verificación detecta una fila alterada.
- La misma `Idempotency-Key` repetida devuelve la misma respuesta; con otro cuerpo responde 422.
- Usuario con `expires_at` vencido no inicia sesión; usuario deshabilitado pierde sus sesiones al instante.
- Borrar un rol del sistema o cambiarle el código → rechazado (API 409, base 42501); copiar un rol crea uno personalizado con los mismos permisos; asignar `portal.*` a un rol del personal → rechazado.
- Contraseña de 9 caracteres o repetida de las últimas 5 → 422 con la regla; tras 5 intentos fallidos la cuenta se bloquea 15 minutos con la misma respuesta que una credencial inválida.
- Un código al correo usado o vencido no vale; dos vigentes del mismo propósito → rechazado; un dispositivo de confianza vencido o revocado vuelve a pedir el segundo factor y nunca evita el MFA reciente de una acción sensible.
- Con `security.mfa.required_by_role` marcando un rol como `required`, un usuario de ese rol sin segundo factor solo puede enrolarse.
- Prueba de arquitectura: un módulo que importa modelos de otro módulo falla.
- `docker compose` levanta app, web, worker, scheduler, PostgreSQL y Redis.

## 14. Preguntas abiertas

- Cuenta, región y retención del bucket de AWS S3 para respaldos del sistema (docs/00, sección 14; necesario antes de cerrar cimientos).
- Proveedor de identidad para SSO empresarial (SAML u OIDC): cuál se usará y si aporta el MFA o se mantiene el TOTP propio (derivada).

## Anexo: nombres fuera del contrato

- Tabla de framework `personal_access_tokens` (Laravel Sanctum) para los tokens de la API pública.
- `files.scan_status`: `pending`, `clean`, `infected`, `failed`.
- Permisos sobre entidades no listadas como tabla: `identity.api_token.*`, `identity.security_policy.*` (keys `security.*`).
- Tablas `email_login_codes`, `trusted_devices` y `password_histories`, columnas `users.mfa_method`, `failed_login_count`, `locked_until`, `must_change_password` y `roles.copied_from_role_id` (docs/00 §26); endpoints `/admin/security-policy`, `/admin/permissions/matrix`, `/admin/roles/{id}/copy`, `/admin/users/{id}/unlock`, `/admin/users/{id}/trusted-devices`, `/auth/mfa/email-code`, `/auth/mfa/email/confirm`, `DELETE /auth/mfa/totp`, `/auth/trusted-devices`, `/auth/password/change` y `/auth/password-policy`.
