# M-VLT · Vault (accesos, concesiones, bitácora y enlaces de un solo uso)

> Módulo de código `app/Modules/Vault` · clave de permiso `vault` · código `VLT`.
> Fuente: `docs/00-requerimientos.md` secciones 2 (secretos), 5 (accesos sensibles), 6 (credenciales de conectores), 8 y 22 (#8, #11); contrato común de nombres.

## 1. Propósito y bloque

Guarda cifrados dos tipos de secreto: los accesos de clientes que la empresa administra y comparte con soporte para mantenimientos y emergencias, y las llaves API de los proveedores que usan los conectores. Controla quién puede revelar qué, por cuánto tiempo, con MFA reciente y bitácora, y entrega accesos al cliente por enlace de un solo uso.

- **Bloque:** B. Núcleo comercial.
- **Depende de:** IDN, CFG.
- **Dependen de él:** PRV (credenciales de cuentas), todos los conectores (bloque H), INV, MAP, SRV (bienvenida), DOM (código de autorización), CTR (entregas), SAA.

## 2. Alcance

**Incluye**
- Cifrado AES-256-GCM antes de guardar; clave en el gestor de secretos del servidor, fuera del repositorio y de la base, distinta por entorno; `key_version` para rotación de clave.
- Registro de secretos por tipo (SSH, SFTP, FTP, cPanel, WHM, Plesk, panel, cloud, registrador, base de datos, administrador de aplicación, token de API, llave privada, otro) con campos propios, asociados a proveedor, cuenta, servidor, cliente, servicio o proyecto.
- Revelación con permiso, concesión vigente, MFA reciente y motivo; bitácora con usuario, secreto, motivo, IP y fecha, nunca el valor.
- Concesiones temporales que caducan solas; revocación inmediata.
- Fecha de rotación por secreto y job diario que crea tareas de rotación.
- Límite de revelaciones por usuario y hora; superarlo bloquea y alerta a seguridad.
- Sin exportación de valores; el listado nunca devuelve valores.
- Entrega segura al cliente por enlace de un solo uso con vencimiento y registro de apertura.
- Lista de accesos revelados por un usuario que se retira, para rotarlos.
- Entrega de credenciales a los conectores en el momento de la llamada (interfaz pública), nunca persistidas en otro lugar.

**No incluye**
- Contraseñas de buzones de correo de clientes (no se almacenan).
- Clave maestra por organización en KMS o Vault (prevista para SaaS, no se construye).
- Controles adicionales para el cliente.

## 3. Entidades

| Tabla | Campos clave | Notas |
|---|---|---|
| `secrets` | kind, name, owner_type (`provider_account`/`server`/`hosting_account`/`cloud_account`/`domain`/`resource`/`saas_instance`/`service`/`customer`/`webhook_endpoint`/`wp_site`), owner_id, username, host, port, ciphertext, nonce, key_version, metadata (jsonb, no sensible), rotates_at, expires_at, last_rotated_at, deleted_at | El valor nunca sale en listados |
| `secret_grants` | secret_id, user_id, role_id, created_by, reason, starts_at, expires_at, revoked_at, revoked_by | Temporales |
| `secret_access_logs` | secret_id, user_id, action (`reveal`/`copy`/`connector_use`/`reveal_denied`/`one_time_link`), reason, ip, user_agent, created_at | Solo inserción |
| `one_time_links` | secret_id, token_hash, recipient_email, created_by, expires_at, consumed_at, revoked_at | Un solo uso |

## 4. Casos de uso y flujos

1. **Registrar secreto:** elegir tipo, propietario y campos; el valor se cifra en el backend; se define fecha de rotación.
2. **Conceder acceso:** el administrador da concesión a un usuario o rol, con vencimiento opcional y motivo.
3. **Revelar:** usuario con `vault.secret.reveal` + concesión vigente + MFA reciente escribe el motivo → se devuelve el valor una vez (sin caché) → bitácora; se cuenta contra el límite por hora.
4. **Bloqueo por abuso:** superar `security.vault.reveal_limit_per_hour` bloquea nuevas revelaciones del usuario y alerta a seguridad (admin).
5. **Rotación:** `RotateSecretsReminder` diario crea tareas para secretos con `rotates_at` cercano o vencido; al rotar, se actualiza el valor y `last_rotated_at`.
6. **Enlace de un solo uso:** soporte crea enlace para un acceso o código de autorización → el cliente lo abre una vez dentro del plazo → queda registrada la apertura; un segundo intento muestra "enlace usado o vencido".
7. **Baja de personal:** IDN pide la lista de secretos revelados por el usuario → se crean tareas de rotación.
8. **Uso por conector:** `Vault::credentialsFor($providerAccountId)` descifra en memoria para la llamada y registra `connector_use` sin valor.

## 5. Reglas de negocio clave

Revelar exige permiso, concesión vigente sobre ese secreto y MFA de menos de `security.sensitive_action_mfa_max_age_minutes`. Cada revelación se registra; el valor nunca se registra ni aparece en logs, respuestas de listado, exportaciones, auditoría ni mensajes de error. Las concesiones temporales caducan solas y la revocación surte efecto inmediato. No existe exportación masiva de secretos. Los modelos marcan los campos sensibles como ocultos y el logger aplica la lista de redacción (`password`, `token`, `secret`, `authorization`). Un respaldo de la base sin la clave no expone ningún acceso. Se prefieren claves SSH, tokens de alcance limitado y roles asumidos frente a contraseñas compartidas. El técnico temporal solo accede a lo asignado y con vencimiento.

## 6. Estados

- `secrets.kind`: `ssh`, `sftp`, `ftp`, `cpanel`, `whm`, `plesk`, `panel`, `cloud`, `registrar`, `database`, `app_admin`, `api_token`, `private_key`, `other`.
- Concesiones y enlaces se controlan con marcas de tiempo (`expires_at`, `revoked_at`, `opened_at`), sin columna de estado.

## 7. Permisos

| Código | Rol por defecto |
|---|---|
| `vault.secret.view` (metadatos, nunca valor) | admin, support; temp_technician (asignados) |
| `vault.secret.create` / `update` / `delete` | admin, support |
| `vault.secret.reveal` | admin, support; temp_technician (asignados, con vencimiento) |
| `vault.secret_grant.view` / `create` / `delete` | admin |
| `vault.secret_access_log.view` | admin |
| `vault.one_time_link.create` / `delete` | admin, support |

## 8. Pantallas

### P-VLT-01 · Secretos
- **Propósito:** ubicar accesos y llaves API sin exponer valores.
- **Rol principal:** support
- **Columnas:** etiqueta, tipo, propietario (proveedor, servidor, cliente, servicio, proyecto), usuario, host, rotación (fecha y estado), concesión vigente para mí, última revelación.
- **Filtros:** tipo, propietario, cliente, rotación vencida, con concesión para mí.
- **Acciones:** Registrar secreto → `vault.secret.create`; Abrir → `vault.secret.view`.
- **Vacío / error:** vacío con botón registrar; no existe botón exportar; error de carga con reintento.

### P-VLT-02 · Detalle de secreto
- **Propósito:** revelar con motivo, ver concesiones, rotación y bitácora del secreto.
- **Rol principal:** support
- **Campos:** metadatos, valor oculto, concesiones, fecha de rotación, historial de revelaciones (sin valor), enlaces de un solo uso emitidos.
- **Filtros:** no aplica.
- **Acciones:** Revelar (motivo + MFA) → `vault.secret.reveal`; Rotar valor → `vault.secret.update`; Conceder acceso → `vault.secret_grant.create`; Crear enlace de un solo uso → `vault.one_time_link.create`; Eliminar → `vault.secret.delete`.
- **Vacío / error:** sin concesión: mensaje "No tiene concesión vigente" y botón de solicitar al administrador; límite excedido: bloqueo con mensaje; el valor revelado se oculta solo tras un tiempo y nunca queda en el estado del cliente React persistido.

### P-VLT-03 · Concesiones
- **Propósito:** dar y revocar acceso temporal a secretos.
- **Rol principal:** admin
- **Columnas:** secreto, usuario o rol, otorgado por, motivo, desde, hasta, estado (vigente, vencida, revocada).
- **Filtros:** usuario, vigentes, por vencer.
- **Acciones:** Crear concesión → `vault.secret_grant.create`; Revocar → `vault.secret_grant.delete`.
- **Vacío / error:** "Sin concesiones vigentes"; revocar pide confirmación y surte efecto inmediato.

### P-VLT-04 · Bitácora de accesos
- **Propósito:** investigar quién reveló qué, cuándo y por qué.
- **Rol principal:** admin
- **Columnas:** fecha, usuario, secreto, acción, motivo, IP.
- **Filtros:** usuario, secreto, acción, rango de fechas.
- **Acciones:** Generar tareas de rotación para un usuario que se retira → `work.task.create`; Exportar bitácora (sin valores) → `vault.secret_access_log.view`.
- **Vacío / error:** "Sin accesos registrados"; error de carga con reintento.

### P-VLT-05 · Enlaces de un solo uso
- **Propósito:** controlar la entrega de accesos al cliente.
- **Rol principal:** support
- **Columnas:** secreto, cliente, destinatario, creado por, vence, abierto el, IP de apertura, estado.
- **Filtros:** estado (vigente, abierto, vencido, revocado), cliente.
- **Acciones:** Crear enlace → `vault.one_time_link.create`; Revocar → `vault.one_time_link.delete`.
- **Vacío / error:** "Sin enlaces emitidos"; 422 si el vencimiento supera el máximo configurado.

## 9. Eventos y jobs

- **Emite:** `SecretRevealed`, `SecretRevealLimitExceeded`, `SecretGrantExpired`, `SecretRotationDue`, `OneTimeLinkOpened`.
- **Escucha:** `UserDisabled` (IDN) → revocar concesiones y listar revelaciones para rotación.
- **Jobs:** `RotateSecretsReminder` (diario); `ExpireSecretGrants` (cada hora).

## 10. Integraciones y conectores

- Gestor de secretos del servidor (clave de cifrado por entorno).
- Entrega credenciales a todos los conectores en el momento de la llamada.

## 11. Ajustes administrables

- `security.vault.reveal_limit_per_hour` (10)
- `security.sensitive_action_mfa_max_age_minutes` (10)
- `vault.one_time_link.ttl_hours`
- `vault.secret.default_rotation_days`

## 12. Historias del backlog

- Cifrado de accesos y llaves API
- Registro de secretos por tipo
- Revelación con MFA y bitácora
- Concesiones temporales y revocación
- Rotación y caducidad
- Límite de revelaciones y sin exportación masiva
- Entrega segura de accesos al cliente
- Reautenticación para acciones sensibles

## 13. Criterios de terminado y pruebas obligatorias

- Un secreto revelado no aparece en logs, respuestas de listado ni exportaciones (prueba obligatoria del kit, buscando el valor sembrado en todas las salidas).
- Revelar sin concesión → 403; con concesión vencida → 403; sin MFA reciente → 403 `mfa_required`.
- La revocación de una concesión impide la siguiente revelación inmediatamente.
- La 11.ª revelación en una hora bloquea y alerta.
- Un enlace de un solo uso abierto dos veces muestra el valor solo la primera.
- Con la base de datos copiada sin la clave de entorno, el valor no puede descifrarse.
- `secret_access_logs` no admite UPDATE ni DELETE.

## 14. Preguntas abiertas

- Ninguna pendiente; la clave maestra en KMS/Vault queda prevista para SaaS (docs/00, sección 8).

## Anexo: nombres fuera del contrato

- Ajustes `vault.one_time_link.ttl_hours` y `vault.secret.default_rotation_days`.
