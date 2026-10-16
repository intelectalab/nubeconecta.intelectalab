# M-MAI · Mail (correo corporativo, licencias por usuario y certificados SSL)

> Módulo de código `app/Modules/Mail` · clave de permiso `mail` · código `MAI`.
> Fuente: `docs/00-requerimientos.md` secciones 6 (conectores añadidos), 10, 18, 21 y 23; contrato común de nombres.

## 1. Propósito y bloque

Registra el correo de cada cliente (cPanel, Google Workspace, Microsoft 365) con sus licencias compradas y asignadas, el titular de la cuenta y la verificación diaria de MX, SPF, DKIM y DMARC. También lleva el inventario de certificados SSL con emisor, fechas, dónde están instalados y su renovación; y los conectores de lectura de CDN (Bunny.net) y envíos masivos (Elastic Email) que alimentan el mapa de servicios.

- **Bloque:** C. Inventario y mapa (conectores en bloque H).
- **Depende de:** DOM, PRV, SRV, INV (`resources`), CFG.
- **Dependen de él:** MAP (componentes correo, SSL, CDN, envíos), MON (chequeos SSL y DNS), BIL (licencias facturables), PRT.

## 2. Alcance

**Incluye**
- Servicios de correo por dominio y proveedor: plan/edición, inquilino, licencias compradas y asignadas, renovación, titular de la cuenta en el proveedor (empresa o cliente).
- Licencias por usuario (`seat_licenses`) y alerta cuando las asignadas superan las facturadas al cliente.
- Verificación diaria de MX, SPF, DKIM y DMARC con resultado por registro y aviso si cambian o faltan.
- Inventario de certificados SSL: dominios cubiertos (uno, varios, comodín), emisor y tipo (gratuito o de pago), proveedor de compra con costo y precio, emisión y expiración, dónde está instalado (servidor, cuenta de hosting, CDN o balanceador), renovación automática o manual con responsable.
- Lectura diaria del certificado publicado en cada dominio (emisor, expiración, dominios cubiertos).
- Avisos a 30, 15 y 7 días para certificados de renovación manual (cada aviso crea tarea) y alerta técnica si un gratuito no se renovó a 10 días de expirar.
- Conectores de solo lectura: Google Workspace (API de administración), Microsoft 365 (Microsoft Graph), Bunny.net (zonas, tráfico) y Elastic Email (estado de cuenta, volumen, límites).

**No incluye**
- Contraseñas de buzones (no se almacenan).
- Crear buzones desde el panel (el cliente entra a su cPanel).
- Conectores de revendedor (Partner Center, API de revendedor de Google): previstos cuando se obtenga la condición de socio.
- Monitoreo de disponibilidad de sitios (MON).

## 3. Entidades

| Tabla | Campos clave | Notas |
|---|---|---|
| `mail_services` | resource_id, domain_id, service_id, provider_account_id, provider_kind (`cpanel`/`google_workspace`/`microsoft_365`/`other`), tenant_id, plan, account_owner (`company`/`customer`), seats_purchased, seats_used, seats_billed, renewal_date, hosting_account_id | |
| `mail_dns_checks` | mail_service_id, record_type (`MX`/`SPF`/`DKIM`/`DMARC`), expected, observed, result (`ok`/`missing`/`changed`/`invalid`), checked_at | Una fila por chequeo |
| `seat_licenses` | mail_service_id, sku, purchased, assigned, billed, renewal_date, cost_minor, cost_currency | Por tipo de licencia |
| `ssl_certificates` | resource_id, service_id, common_name, covered_names (jsonb), is_wildcard, issuer, kind (`free_auto`/`paid`), purchase_provider_account_id, cost_minor, cost_currency, price_minor, currency, issued_at, expires_at, installed_on_type, installed_on_id, renewal_mode (`automatic`/`manual`), responsible_user_id, last_checked_at, is_published | `published = false` para certificados registrados a mano |

## 4. Casos de uso y flujos

1. **Registrar correo:** elegir dominio, plataforma, plan, titular; para cPanel enlazar la cuenta de hosting.
2. **Sincronizar licencias:** job diario lee usuarios, licencias y almacenamiento (Google Workspace) o dominios, usuarios y licencias (Microsoft Graph); actualiza `seat_licenses` y `seats_used`.
3. **Licencias no facturadas:** compara asignadas del proveedor con la suscripción del cliente; si asignadas > facturadas, alerta a finanzas.
4. **Chequeo DNS de correo:** `CheckSslAndDns` diario consulta MX, SPF, DKIM y DMARC; registra resultado por registro y avisa si cambian o faltan.
5. **Certificados:** el mismo job lee el certificado publicado de cada dominio y actualiza emisor y expiración; avisos 30/15/7 crean tarea al responsable; gratuito a 10 días sin renovar → alerta técnica.
6. **CDN y envíos:** lectura de tráfico de Bunny.net y volumen de Elastic Email para las métricas del mapa.

## 5. Reglas de negocio clave

Se registra siempre quién es el titular de la cuenta en el proveedor, porque define quién paga y qué se entrega en un traspaso. No se guardan contraseñas de buzones. Los conectores de correo, CDN y envíos son de solo lectura; sin API, el componente se registra a mano. Una alerta de licencias o de DNS se emite una vez por cambio de estado, no en cada chequeo. Un certificado de renovación automática no genera avisos de 30/15/7, pero sí la alerta técnica a los 10 días. Los avisos de certificados y licencias leen sus días del centro de configuración.

## 6. Estados

- No hay estados del contrato para este módulo; `ssl_certificates.status` se deriva (ver anexo).

## 7. Permisos

| Código | Rol por defecto |
|---|---|
| `mail.mail_service.view` | admin, support, finance; cliente sobre los suyos |
| `mail.mail_service.create` / `update` / `delete` / `export` | admin, support |
| `mail.seat_license.view` / `update` | admin, support, finance |
| `mail.mail_dns_check.view` | admin, support |
| `mail.ssl_certificate.view` | admin, support; cliente sobre los suyos |
| `mail.ssl_certificate.create` / `update` / `delete` / `export` | admin, support |

## 8. Pantallas

### P-MAI-01 · Servicios de correo
- **Propósito:** listar el correo de todos los clientes con licencias y estado DNS.
- **Rol principal:** support
- **Columnas:** dominio, cliente, plataforma, titular, plan, licencias compradas/asignadas/facturadas, renovación, estado DNS (MX/SPF/DKIM/DMARC), última sincronización.
- **Filtros:** plataforma, titular, con licencias sobreasignadas, con DNS fallido, renovación en N días.
- **Acciones:** Registrar correo → `mail.mail_service.create`; Sincronizar → `automation.sync_run.create`; Exportar → `mail.mail_service.export`.
- **Vacío / error:** vacío con botón registrar; error de conector visible por cuenta.

### P-MAI-02 · Detalle de servicio de correo
- **Propósito:** ver licencias, usuarios, chequeos DNS e historial de un correo.
- **Rol principal:** support
- **Campos:** datos del servicio, titular, licencias por SKU, historial de chequeos por registro con valor esperado y encontrado, servicio facturado, cuenta de hosting (cPanel).
- **Filtros:** registro DNS, rango de fechas.
- **Acciones:** Editar → `mail.mail_service.update`; Verificar DNS ahora → `mail.mail_service.update`; Crear ticket → `helpdesk.ticket.create`.
- **Vacío / error:** "Aún sin chequeos"; registro faltante resaltado con instrucción de corrección.

### P-MAI-03 · Licencias asignadas vs facturadas
- **Propósito:** detectar licencias regaladas.
- **Rol principal:** finance
- **Columnas:** cliente, dominio, plataforma, SKU, compradas, asignadas, facturadas, diferencia, costo de la diferencia.
- **Filtros:** plataforma, solo con diferencia.
- **Acciones:** Ajustar suscripción → `services.subscription.update`; Crear tarea → `work.task.create`; Exportar → `mail.mail_service.export`.
- **Vacío / error:** "Sin diferencias"; error de carga con reintento.

### P-MAI-04 · Certificados SSL
- **Propósito:** inventario de certificados con vencimiento.
- **Rol principal:** support
- **Columnas:** nombre común, dominios cubiertos, comodín, emisor, tipo, expira, días restantes, instalado en, renovación, responsable, publicado.
- **Filtros:** tipo, renovación, vence en N días, no publicados, cliente.
- **Acciones:** Registrar certificado → `mail.ssl_certificate.create`; Leer certificados publicados ahora → `mail.ssl_certificate.update`; Exportar → `mail.ssl_certificate.export`.
- **Vacío / error:** vacío con botón registrar; fila resaltada si expira en menos de 7 días.

### P-MAI-05 · Detalle de certificado SSL
- **Propósito:** ver y editar un certificado, su instalación y su renovación.
- **Rol principal:** support
- **Campos:** dominios cubiertos, emisor, tipo, proveedor de compra con costo y precio (con permiso), emisión, expiración, dónde está instalado, renovación y responsable, avisos enviados, tareas creadas.
- **Filtros:** no aplica.
- **Acciones:** Editar → `mail.ssl_certificate.update`; Marcar renovado → `mail.ssl_certificate.update`; Crear tarea de instalación → `work.task.create`.
- **Vacío / error:** 422 si la expiración es anterior a la emisión; aviso si el certificado publicado difiere del registrado.

## 9. Eventos y jobs

- **Emite:** `MailDnsCheckFailed`, `MailDnsCheckRecovered`, `LicensesOverAllocated`, `SslExpiring`, `SslFreeCertNotRenewed`.
- **Escucha:** `DomainOperationCompleted` (DOM, cambio de nameservers) → chequear DNS al día siguiente.
- **Jobs:** `CheckSslAndDns` (diario); `SyncMailLicenses` (diario); `SyncComponentMetrics` aporta CDN y envíos (MAP).

## 10. Integraciones y conectores

- `MailConnector` Google Workspace (cuenta de servicio con delegación) y Microsoft 365 (Microsoft Graph, aplicación registrada), solo lectura.
- Bunny.net (API REST) y Elastic Email (API REST), solo lectura.
- Lectura directa del certificado publicado (TLS) y consultas DNS; sin conector por proveedor de SSL.

## 11. Ajustes administrables

- `mail.ssl.notice_days` ([30, 15, 7])
- `mail.ssl.free_cert_alert_days` (10)
- `mail.licenses.notice_days` ([30, 15, 7])

## 12. Historias del backlog

- Conector Google Workspace
- Conector Microsoft 365 (Azure)
- Alerta de licencias no facturadas
- Inventario de certificados SSL
- Conectores Bunny.net y Elastic Email
- Registros de correo SPF, DKIM, DMARC y MX

## 13. Criterios de terminado y pruebas obligatorias

- Pruebas de contrato con respuestas grabadas de Google Workspace, Microsoft Graph, Bunny.net y Elastic Email; todos sin capacidades de escritura.
- 12 licencias asignadas contra 10 facturadas genera una alerta, una sola vez hasta que cambie la diferencia.
- Certificado manual que expira en 30, 15 y 7 días crea tres avisos con tarea cada uno; uno gratuito sin renovar a 10 días genera alerta técnica.
- Ningún modelo ni respuesta contiene contraseñas de buzones.
- La API del portal muestra licencias y usuarios del cliente, sin costos ni titular interno.

## 14. Preguntas abiertas

- Programas de socio de Google Workspace y Microsoft (docs/00, sección 14): definen cuándo se construyen los conectores de revendedor.

## Anexo: nombres fuera del contrato

- Estado derivado de `ssl_certificates`: `valid`, `expiring`, `expired` (calculado, no columna).
- Columnas `mail_services.account_owner`, `seats_billed`; `seat_licenses.billed`.
