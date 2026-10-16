# M-CFG · Settings (centro de configuración)

> Módulo de código `app/Modules/Settings` · clave de permiso `settings` · código `CFG`.
> Fuente: `docs/00-requerimientos.md` secciones 13 (criterio 3), 23 y 21; contrato común de nombres.

## 1. Propósito y bloque

Guarda todo plazo, porcentaje, umbral y texto de aviso del negocio con un valor por defecto, administrable desde el panel y sobrescribible por marca, producto, cliente o contrato. Ningún módulo escribe días, porcentajes ni textos de aviso en el código: los lee de aquí.

- **Bloque:** A. Cimientos.
- **Depende de:** IDN (usuarios, permisos, auditoría).
- **Dependen de él:** todos los módulos que leen ajustes (BIL, SRV, DOM, MAI, HLP, INV, CLD, MAP, VLT, PRT, AUT, SAL, CTR).

## 2. Alcance

**Incluye**
- Almacén de ajustes por niveles (`global`, `brand`, `product`, `customer`, `contract`) con resolución "gana el más específico" y origen visible del valor vigente.
- Catálogo completo de ajustes de `docs/00-requerimientos.md` sección 23 con su valor por defecto, cargado por seeder.
- Historial de cambios (quién, cuándo, valor anterior y nuevo) con reversión de un clic.
- Simulador de calendario de avisos y acciones para una factura o un dominio de ejemplo, antes de guardar.
- Pantalla de edición de la secuencia de cobranza (las tablas `dunning_*` son de BIL; CFG ofrece la pantalla y el permiso `settings.dunning.update`).
- Horario de atención por día de la semana y calendario de feriados de Perú (usados por el SLA y por "siguiente día hábil").
- Registro de idiomas disponibles: agregar un idioma se hace con archivos de traducción y plantillas, sin programar.

**No incluye**
- El contenido de las plantillas de notificación (lo administra AUT; CFG enlaza a ellas y ofrece el envío de prueba desde el editor de secuencia).
- Políticas de SLA por prioridad (tabla `sla_policies` de HLP; CFG aporta horario y feriados).
- Configuración de medios de pago y comisiones (tabla `payment_methods` de BIL).
- Ajustes de la plataforma SaaS multiempresa (no se construye).

## 3. Entidades

| Tabla | Campos clave | Notas |
|---|---|---|
| `settings` | key, scope_type (`global`/`brand`/`product`/`customer`/`contract`), scope_id, value (jsonb) | Único por (organization_id, key, scope_type, scope_id) |
| `setting_changes` | key, scope_type, scope_id, old_value, new_value, created_by, created_at, reverts_change_id | Solo inserción |
| `holidays` | date, name, country, recurring | Feriados de Perú precargados |
| `business_hours` | weekday, opens_at, closes_at, timezone | Horario de atención |

El registro de claves (tipo, valor por defecto, niveles permitidos, permiso de edición, grupo) vive en código como definición declarativa por módulo; los **valores** viven solo en `settings`.

## 4. Casos de uso y flujos

1. **Consultar un ajuste:** el administrador ve el valor vigente para un contexto (por ejemplo, un cliente) y de qué nivel proviene.
2. **Sobrescribir:** elige el nivel (marca, producto, cliente o contrato), fija el valor, revisa la vista previa y guarda; queda en `setting_changes` y en auditoría.
3. **Revertir:** desde el historial elige un cambio y lo revierte; se crea un nuevo cambio con referencia al revertido.
4. **Editar secuencia de cobranza:** finanzas agrega, quita, edita o desactiva etapas (momento, acción, canales, plantilla, destinatario, copia interna, hora, días no hábiles, estado); el simulador muestra el calendario resultante para una factura de ejemplo; guarda.
5. **Simular:** elige una factura o dominio real o de ejemplo y ve fechas, canales y acciones que se ejecutarían.
6. **Enviar plantilla de prueba:** desde una etapa envía la plantilla a un correo interno.
7. **Mantener horario y feriados:** soporte o administración edita el horario por día y agrega feriados.
8. **Resolver un valor en código:** `Settings::get('billing.invoice_generation_days', context)` recorre contrato → cliente → producto → marca → global y devuelve valor y origen.

## 5. Reglas de negocio clave

Gana siempre el nivel más específico y la pantalla debe mostrar el origen del valor vigente. Cada clave declara qué niveles admite; un nivel no admitido se rechaza con 422. Solo el administrador cambia ajustes generales; finanzas administra los de cobranza (secuencia, recargo, detracción, comisión) con `settings.dunning.update`. Todo cambio registra valor anterior y nuevo y es reversible. Ningún día, porcentaje ni texto de aviso puede quedar en el código: una prueba recorre el catálogo y verifica que cada clave del docs/00, sección 23 existe con su valor por defecto. Un cambio de ajuste emite `SettingChanged` para que AUT y los jobs recalculen lo que corresponda; los avisos ya enviados no se reenvían por un cambio.

## 6. Estados

- No maneja estados del contrato. Las etapas de cobranza usan `active` / `inactive` como booleano (`is_active`) en `dunning_stages` (tabla de BIL).

## 7. Permisos

| Código | Rol por defecto |
|---|---|
| `settings.setting.view` | admin, finance (lectura de su grupo) |
| `settings.setting.update` | admin |
| `settings.dunning.update` | admin, finance |
| `settings.holiday.view` / `create` / `update` / `delete` | admin, support |
| `settings.business_hours.view` / `update` | admin, support |
| `settings.setting_change.view` | admin |

## 8. Pantallas

### P-CFG-01 · Centro de configuración
- **Propósito:** ver y editar todos los ajustes administrables agrupados (facturación, servicios, dominios, certificados y licencias, proveedores, capacidad, cloud, tickets, mapa de servicios, panel del cliente, seguridad, sistema).
- **Rol principal:** admin
- **Columnas:** grupo, ajuste, valor vigente general, número de sobrescrituras, último cambio.
- **Filtros:** grupo, con sobrescrituras, búsqueda por nombre.
- **Acciones:** Editar valor general → `settings.setting.update`; Editar ajustes de cobranza → `settings.dunning.update`; Ver historial → `settings.setting_change.view`.
- **Vacío / error:** nunca vacío (seeder); error de carga con reintento; 422 con mensaje por campo si el valor no cumple el tipo.

### P-CFG-02 · Detalle de ajuste y sobrescrituras
- **Propósito:** ver un ajuste en todos sus niveles y crear o quitar sobrescrituras.
- **Rol principal:** admin
- **Campos:** valor por defecto, valor general, tabla de sobrescrituras (nivel, entidad, valor, autor, fecha), selector de contexto "¿qué valor ve este cliente?" con origen resaltado.
- **Filtros:** nivel.
- **Acciones:** Agregar sobrescritura → `settings.setting.update`; Quitar sobrescritura → `settings.setting.update`; Vista previa → `settings.setting.view`.
- **Vacío / error:** sin sobrescrituras: "Se usa el valor general"; 422 si el nivel no está permitido para la clave.

### P-CFG-03 · Secuencia de avisos de cobranza
- **Propósito:** administrar las etapas de la cobranza automática por nivel (general, marca, producto, cliente, contrato).
- **Rol principal:** finance
- **Columnas:** orden, momento (N días antes / día / N días después), acción (aviso, tarea para finanzas, suspender), canales, plantilla, destinatario, copia interna, hora, días no hábiles, estado.
- **Filtros:** nivel y entidad.
- **Acciones:** Agregar etapa → `settings.dunning.update`; Editar etapa → `settings.dunning.update`; Desactivar etapa → `settings.dunning.update`; Enviar plantilla de prueba → `settings.dunning.update`; Abrir simulador → `settings.setting.view`.
- **Vacío / error:** una secuencia sin etapas muestra advertencia "no se enviarán avisos"; confirmación al quitar la etapa de suspensión.

### P-CFG-04 · Simulador de calendario de avisos
- **Propósito:** mostrar qué avisos y acciones se ejecutarán para una factura o dominio de ejemplo antes de guardar cambios.
- **Rol principal:** finance
- **Campos:** factura o dominio de ejemplo, fecha de vencimiento, cliente, compromiso de pago opcional; resultado: fecha, hora en zona del cliente, etapa, canal, destinatario, acción.
- **Filtros:** incluir/excluir días no hábiles.
- **Acciones:** Simular → `settings.setting.view`.
- **Vacío / error:** sin ejemplo elegido: invita a elegir uno; error si la secuencia en edición es inválida.

### P-CFG-05 · Horario de atención y feriados
- **Propósito:** definir el tiempo hábil que usa el SLA y la regla "siguiente día hábil".
- **Rol principal:** admin
- **Columnas:** día, abre, cierra, cerrado; feriados con fecha, nombre, recurrente.
- **Filtros:** año.
- **Acciones:** Editar horario → `settings.business_hours.update`; Agregar feriado → `settings.holiday.create`; Editar feriado → `settings.holiday.update`; Borrar feriado → `settings.holiday.delete`.
- **Vacío / error:** año sin feriados: aviso y botón "Cargar feriados de Perú"; 422 si cierra antes de abrir.

### P-CFG-06 · Historial de cambios de ajustes
- **Propósito:** saber quién cambió qué y revertir.
- **Rol principal:** admin
- **Columnas:** fecha, usuario, ajuste, nivel y entidad, valor anterior, valor nuevo.
- **Filtros:** ajuste, usuario, rango de fechas, nivel.
- **Acciones:** Revertir → `settings.setting.update`; Exportar → `settings.setting_change.export`.
- **Vacío / error:** "Aún no hay cambios"; error 409 si el ajuste cambió después (pide confirmar sobre el valor actual).

## 9. Eventos y jobs

- **Emite:** `SettingChanged` (clave, nivel, entidad, valor anterior y nuevo).
- **Escucha:** ninguno.
- **Jobs:** ninguno propio. Expone `system.daily_jobs_time`, que el scheduler usa para programar los jobs diarios del resto de módulos.

## 10. Integraciones y conectores

- Ninguna directa. El envío de prueba de plantillas usa el canal de correo de AUT (Elastic Email).

## 11. Ajustes administrables

Es el dueño del catálogo. Claves canónicas (las usa cada módulo; valor por defecto entre paréntesis):

| Grupo | Claves |
|---|---|
| Facturación | `billing.invoice_generation_days` (30 por ciclo), `billing.invoice_consolidation` (según cliente), `billing.late_fee.enabled` (true), `billing.late_fee.type`, `billing.late_fee.value`, `billing.late_fee.grace_days`, `billing.late_fee.max_amount`, `billing.late_fee.document` (`debit_note`), `billing.exchange_rate.source` (SUNAT), `billing.exchange_rate.update_time`, `billing.detraction.*`, `billing.export.invoice_note`, `billing.collections_inbox_days` (15), `billing.auto_apply_credit_balance` |
| Servicios | `services.suspension.days_after_due` (1), `services.termination.days_after_suspension` (10), `services.terminate_requires_approval` (true), `services.reactivation.auto_on_payment` (true), `services.suspension.exempt` (false; por cliente o producto) |
| Dominios | `domains.customer_notice_days` ([30,15,7,3]), `domains.internal_notice_days` ([30,15,7,3]), `domains.sync_frequency` (diaria) |
| Certificados y licencias | `mail.ssl.notice_days` ([30,15,7]), `mail.ssl.free_cert_alert_days` (10), `mail.licenses.notice_days` ([30,15,7]) |
| Proveedores | `providers.account_renewal_notice_days` ([30,7]) |
| Capacidad | `inventory.capacity_thresholds` ([70,85,95]) |
| Cloud | `cloud.budget_thresholds` ([80,100]) |
| Tickets | `helpdesk.auto_close.waiting_customer_days` (7), `helpdesk.attachments.retention_months` (12), `helpdesk.sla.warning_percent` (75), `helpdesk.sla.alert_recipients` |
| Mapa de servicios | `service_map.metrics_frequency` (diaria) |
| Panel del cliente | `portal.show_provider_name` (false), `portal.actions.dns_change.enabled` (false), `portal.actions.server_reboot.enabled` (false), `portal.actions.cpanel_login.enabled` (true), `portal.actions.usage_view.enabled` (true) |
| Seguridad | `security.session_duration_hours` (8), `security.login_max_attempts` (5), `security.login_lockout_minutes` (15), `security.password.min_length` (10), `security.password.complexity`, `security.password.expiry_days` (0), `security.password.history_count` (5), `security.mfa.required_for_staff` (true), `security.mfa.required_for_customers` (false), `security.mfa.required_by_role`, `security.mfa.email_enabled` (true), `security.mfa.app_enabled` (true), `security.mfa.email_code_ttl_minutes` (10), `security.mfa.email_code_max_attempts` (5), `security.trusted_device_days` (30), `security.vault.reveal_limit_per_hour` (10), `security.sensitive_action_mfa_max_age_minutes` (10); se editan también desde la pantalla de seguridad de IDN (P-IDN-08) |
| Sistema | `system.daily_jobs_time` (06:00), `system.retention.*` (por definir según ley), `system.backup.frequency` (diario), `system.backup.retention_days` (35) |
| Ventas y contratos | `sales.quote.validity_days`, `sales.lead.followup_alert_days`, `contracts.expiry_notice_days` |
| Conector web y apariencia (docs/00 §25 y §26) | `web_connector.cache_ttl_seconds` (600), `web_connector.stale_max_hours` (72), `web_connector.token_expiry_days` (365), `web_connector.webhook.*`, `web_connector.min_plugin_version`, `web_connector.kb_url` (por definir), `web_connector.forms.*` (captcha, límite por IP, tamaño de archivo, conservación por definir), `brands.theme.min_contrast_ratio` (4.5), `brands.theme.allowed_fonts`, `brands.theme.preview_link_minutes` (60) |
| Compra en línea, asistente y respaldos | `orders.online.*`, `assistant.*`, `monitoring.restore.customer_target_kinds`, `monitoring.backup_report.visible`, `system.backup.rpo_minutes` y `system.backup.rto_minutes` (por definir), `system.dr_test.frequency_days`, `portal.central_identity`, `system.central_domains` (por definir) |
| Libro de Reclamaciones y datos personales | `complaints.response_days` (por definir con asesoría legal), `complaints.alert_days_before` ([5,1]), `complaints.code_prefix`, `complaints.public_limit_per_ip_per_day` (5), `complaints.retention_years` (por definir), `complaints.privacy_response_days` (por definir) |

## 12. Historias del backlog

- Internacionalización español e inglés
- Idiomas adicionales
- Ajustes por niveles con herencia
- Editor de la secuencia de avisos de cobranza
- Simulador de calendario de avisos
- Plantillas por marca e idioma con envío de prueba
- Auditoría y reversión de ajustes
- Catálogo de ajustes administrables
- Horario de atención y feriados
- Políticas por producto

## 13. Criterios de terminado y pruebas obligatorias

- Todos los ajustes de `docs/00-requerimientos.md` sección 23 existen en el panel con su valor por defecto (prueba que recorre el catálogo).
- Resolución de niveles: con valor general 30, por marca 20 y por cliente 10, un contrato del cliente sin valor propio obtiene 10 y el origen "cliente".
- Una prueba estática (búsqueda en el código) falla si aparece un literal de días o porcentaje en reglas de cobranza, SLA o avisos.
- Revertir un cambio restaura el valor anterior y crea un nuevo registro en `setting_changes`.
- Finanzas puede editar la secuencia de cobranza pero recibe 403 al cambiar `security.session_duration_hours`.
- El simulador con la secuencia por defecto y vencimiento en día hábil muestra avisos a 30, 15, 7 y 3 días, el día del vencimiento y la suspensión 1 día después; si ese día es feriado, la suspensión pasa al siguiente día hábil.
- Textos de la interfaz en español e inglés; agregar un archivo de traducción habilita un idioma sin cambios de código.

## 14. Preguntas abiertas

- Plazos de retención de datos personales y registros técnicos por país (`system.retention.*`, docs/00, sección 14; necesario antes de la puesta en marcha).
- Valores iniciales del SLA y del recargo por mora: se cargan en el panel, pero alguien de gerencia debe darlos antes de la puesta en marcha (docs/00, sección 14).

## Anexo: nombres fuera del contrato

- Permisos sobre entidades del módulo con acciones estándar: `settings.holiday.*`, `settings.business_hours.*`, `settings.setting_change.*`.
