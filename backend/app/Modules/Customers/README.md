# Customers (M-CUS)

Clientes, contactos, acceso al portal, consentimientos y privacidad. Doc: `docs/modulos/M-CUS.md`.

## Pendientes de la revisión del 22-10

Corregido: la auditoría de consentimientos ya no replica `evidence` (IP y user-agent quedan solo en `communication_consents`, docs/10); en el portal `ContactResource` omite `user_id`, `mfa_enabled` y `last_login_at`; el panel permite elegir el rol (usuario/administrador) al dar acceso al portal y cambiarlo después.

Pendiente:
- `Jobs/ExportPersonalData` deja el paquete en `storage/app/privacy-exports/{customer}/{request}.json` sin cifrar, sin caducidad ni descarga protegida (la entrega es de AUT). Falta: registrarlo en `files` con `expires_at`, borrarlo en `PrivacyService::erase()` y con un comando programado (p. ej. 7 días), o no generarlo hasta que exista la descarga.
- `GET …/customers/{id}/history` devuelve `before`/`after`/`metadata` completos de `audit_events`; conviene filtrar los campos que el personal no necesita (hoy solo se dejaron de auditar IP y user-agent).
- `hub.audit.redact` (config) no incluye `ip`, `user_agent` ni `evidence`; añadirlos cuando se toque `config/hub.php` (archivo en curso del despliegue a producción).
