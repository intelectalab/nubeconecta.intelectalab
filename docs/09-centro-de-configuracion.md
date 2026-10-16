# 09 — Centro de configuración

Todo plazo, porcentaje, umbral, hora y texto de aviso del negocio vive aquí y se edita desde el panel. El área de desarrollo no escribe ninguno de esos valores en el código (docs/00 §13, §23; RN-CFG-001). Este documento explica cómo se resuelven los ajustes, cómo funcionan el simulador y la auditoría, y lista el catálogo completo de `database/seeds/settings.json`.

## 1. Modelo de datos

| Tabla (módulo CFG) | Uso |
|---|---|
| `settings` | Un valor por (`organization_id`, `key`, `scope_type`, `scope_id`). `scope_type` ∈ `global`, `brand`, `product`, `customer`, `contract`; `scope_id` es nulo en `global`. `value jsonb`. |
| `setting_changes` | Solo inserción: quién, cuándo, key, nivel, `scope_id`, valor anterior, valor nuevo, motivo, id del cambio revertido (si es una reversión). |
| `holidays` | Feriados por país (Perú inicialmente); los usa el SLA y las etapas con `next_business_day`. |
| `business_hours` | Horario de atención por día de la semana; base del SLA. |

El catálogo (`settings.json`) es la definición de cada key: tipo, valor por defecto, niveles permitidos y quién la edita. El seeder carga en `settings` una fila `global` por key con su valor por defecto (incluido `null` en las que requieren definición). Algunas keys se materializan además en tablas de configuración propias del módulo que las usa:

| Key | Tabla donde se materializa |
|---|---|
| `billing.dunning.default_sequence` | `dunning_sequences` y `dunning_stages` (una secuencia por nivel sobrescrito) |
| `helpdesk.sla.default_targets` | `sla_policies` y `sla_targets` |
| `billing.payment_methods.defaults` | `payment_methods` (solo carga inicial) |
| `billing.card_gateway.fee_percent`, `billing.card_gateway.fee_fixed`, `billing.card_gateway.pass_to_customer` | Fila de `payment_methods` con `kind = card_gateway` (`fee_percent`, `fee_fixed_minor` y `fee_currency`, `pass_to_customer`); al guardar el ajuste se copia a esa fila, que es la que usa el cálculo del recargo |
| `portal.actions.*.enabled` (nivel cliente) | `customer_action_flags` |
| `web_connector.cache_ttl_seconds` (nivel marca) | Se entrega al plugin de cada sitio de la marca en `GET /public/wp/site` (`cache_ttl_seconds`); el plugin no guarda otro valor |
| `assistant.instructions` (nivel marca) | `ai_assistant_profiles.instructions` de los perfiles de esa marca (web y portal) |
| `security.mfa.email_code_max_attempts` | `email_login_codes.max_attempts` de cada código al emitirlo (un cambio no altera códigos ya enviados) |
| `dashboard.targets.*` | No se copia: `kpi_definitions.target_setting_key` apunta a la key y el panel la usa como meta cuando no hay fila en `kpi_targets` para ese indicador, marca y periodo |
| `editor.html.allowed_tags`, `editor.html.allowed_attributes`, `editor.html.allowed_link_schemes` | Perfil del saneado; su huella se guarda en `rich_text_versions.sanitizer_profile` de cada versión (un cambio no altera textos ya guardados, se aplica al volver a guardarlos) |

Las tasas de IGV (`tax_rates`), los tipos de cambio (`exchange_rates`), las plantillas de aviso (`notification_templates`), las reglas por extensión de dominio (`tld_rules`), las etapas del embudo (`pipeline_stages`) y las reglas de asignación (`assignment_rules`) son tablas de configuración, igual que los sitios WordPress conectados, los formularios, los datos de contacto por marca y los documentos legales del conector web (`wp_sites`, `web_forms`, `brand_contact_points`, `legal_documents`), los tipos de servicio personalizados (`service_types`), los roles y su matriz de permisos (`roles`, `role_permissions`), los perfiles del asistente (`ai_assistant_profiles`) y las herramientas de respaldos de los nodos (`backup_tool_accounts`) y, por docs/00 §27, las metas de los indicadores por periodo y marca (`kpi_targets`) y las plantillas de texto enriquecido por categoría (`notification_templates.category`: avisos, respuestas predefinidas, cartas de respuesta del Libro y confirmaciones de formularios), no keys de `settings`, y también se administran desde el panel.

## 2. Herencia de ajustes

Cada key declara sus niveles permitidos. Al resolver un valor para un contexto (por ejemplo, una factura), el servicio `SettingsResolver` busca en este orden y devuelve el primero que encuentre:

```
contract  →  customer  →  product  →  brand  →  global
(más específico)                         (más general)
```

- Solo se consultan los niveles permitidos de esa key (RN-CFG-002). Un valor guardado en un nivel no permitido es imposible: el endpoint responde 422 (RN-CFG-003).
- El contexto lo arma el caso de uso: una factura aporta su contrato (si existe), su cliente, el producto de cada línea y la marca; un ticket aporta producto y contrato; un dominio aporta su servicio.
- La respuesta del resolvedor es `{ value, source_scope, source_id, setting_change_id }`. La pantalla muestra junto a cada valor vigente de dónde viene ("heredado de la marca X", "definido en el contrato C-000123").
- Un valor `null` guardado en un nivel específico **sí** cuenta como definido solo para keys cuyo `null` tiene significado (por ejemplo, `billing.rebilling.monthly_minimum` = sin mínimo). Para el resto, "quitar la sobrescritura" borra la fila y vuelve a heredar.
- Las keys de tipo `json` se reemplazan completas (no se mezclan campo a campo). Una secuencia de cobranza de cliente reemplaza la general entera; para cambiar una sola etapa se copia la heredada y se edita.
- El resolvedor guarda en caché por organización con la versión del último `setting_changes`; un cambio invalida la caché.
- Ajustes con nivel por cliente ligados a interruptores del portal: el nivel cliente se lee de `customer_action_flags`; el resolvedor lo trata como la capa `customer`.
- El proveedor visible al cliente admite además una sobrescritura por servicio en `services.show_provider`, que se aplica antes de la herencia (docs/00 §21: "ajuste por cliente y por servicio").

### Ejemplo

`services.suspension.days_after_due`: general 1. El cliente "Hotel Andino" tiene sobrescritura 3. Su contrato C-000045 no define nada.
Una factura de ese cliente con el contrato C-000045 se suspende a los 3 días (fuente: `customer`). Otra factura de otro cliente sin sobrescritura, a 1 día (fuente: `global`).

## 3. Secuencia de cobranza por defecto

`billing.dunning.default_sequence` es una lista de etapas. Cada etapa se puede agregar, quitar, editar o desactivar (docs/00 §23). Valor por defecto:

| Etapa | Momento | Acciones | Canales | Plantilla | Destinatario | Copia interna | Hora | Días no hábiles |
|---|---|---|---|---|---|---|---|---|
| `renewal_30` | 30 días antes | Aviso con enlace de pago y opción de voucher | Correo, portal | `dunning.renewal_notice` | Facturación | Ninguna | 09:00 | Enviar igual |
| `renewal_15` | 15 días antes | Igual | Correo, portal | `dunning.renewal_notice` | Facturación | Ninguna | 09:00 | Enviar igual |
| `renewal_7` | 7 días antes | Igual | Correo, portal | `dunning.renewal_notice` | Facturación | Ninguna | 09:00 | Enviar igual |
| `renewal_3` | 3 días antes | Igual | Correo, portal | `dunning.renewal_notice` | Facturación | Ninguna | 09:00 | Enviar igual |
| `due_day` | Día del vencimiento | Aviso de vencimiento | Correo, portal | `dunning.due_notice` | Facturación | Ninguna | 09:00 | Enviar igual |
| `suspension` | `services.suspension.days_after_due` días después (1) | Aviso y suspensión del servicio | Correo, portal | `dunning.suspension_notice` | Facturación | Finanzas | 09:00 | Siguiente día hábil |

- La hora es la de la zona del cliente. WhatsApp se agrega como canal cuando `notifications.whatsapp.enabled` esté activo.
- La etapa de suspensión no guarda sus propios días: apunta a `services.suspension.days_after_due` (`days_setting`) para que haya una sola fuente.
- Los servicios de dominio ejecutan los avisos pero nunca la acción `suspend_service` (RN-SRV-004). Los exentos tampoco (RN-BIL-040). Un compromiso de pago abierto posterga la suspensión (RN-BIL-038).
- La baja definitiva no es una etapa: la propone el job de servicios tras `services.termination.days_after_suspension` días y la aprueba el administrador (RN-SRV-008).
- Plantillas: una por marca e idioma, con variables cliente, servicio, monto, fecha y enlace de pago.

## 4. SLA inicial

`helpdesk.sla.default_targets` (propuesta del kit, editable; sobrescribible por producto y contrato). Todos los tiempos son en horario hábil (`business_hours`), descuentan feriados de Perú y se pausan en `waiting_customer` y `waiting_provider`.

| Prioridad | Primera respuesta | Solución |
|---|---|---|
| `critical` | 1 hora hábil | 4 horas hábiles |
| `high` | 4 horas hábiles | 1 día hábil |
| `medium` | 8 horas hábiles | 3 días hábiles |
| `low` | 1 día hábil | 5 días hábiles |

El horario de atención (`business_hours`) no tiene valor en el kit: se carga en el panel antes de la puesta en marcha, junto con `helpdesk.sla.alert_recipients`.

## 5. Simulador

Antes de guardar un cambio en cobranza, dominios, certificados o SLA, la pantalla ejecuta el simulador con el valor **propuesto** (sin persistirlo) (RN-CFG-006):

- **Entrada:** un documento de ejemplo (factura, dominio, certificado o ticket) real o ficticio, y el nivel donde se hará el cambio.
- **Proceso:** el mismo `SettingsResolver` y el mismo planificador que usan los jobs (`RunDunningSequence`, `SuspendOverdueServices`, `SyncDomains`, `CheckSlaBreaches`), con el valor propuesto inyectado en la capa correspondiente. No hay una segunda implementación de la lógica.
- **Salida:** un calendario con cada aviso y acción (fecha y hora en la zona del cliente, canal, plantilla, destinatario), los días movidos por feriados o fines de semana, y qué etapas se omiten por exención, compromiso o tipo de servicio (dominio). Muestra lado a lado el calendario vigente y el propuesto.
- **Envío de prueba:** cada plantilla puede enviarse a un correo interno; no crea historial del cliente (RN-CFG-007).
- El simulador no envía avisos reales ni cambia estados.

## 6. Auditoría y reversión

- Todo cambio escribe una fila en `setting_changes` (solo inserción; el usuario de base de datos de la aplicación no puede actualizar ni borrar) y un `audit_events` (RN-CFG-004).
- Campos: usuario, fecha, key, nivel, `scope_id`, valor anterior, valor nuevo, motivo (obligatorio para cambios de cobranza y suspensión).
- **Revertir** crea un cambio nuevo cuyo valor nuevo es el anterior del cambio revertido y que guarda el id del revertido. Nunca se borra historial.
- La pantalla de cada key muestra su historial por nivel y quién lo hizo.

## 7. Permisos

| Grupo | Edita | Permiso |
|---|---|---|
| Ajustes generales (sistema, seguridad, dominios, capacidad, cloud, tickets, portal, catálogo, facturación no relacionada con cobro) | `admin` | `settings.setting.update` |
| Cobranza, recargo por mora, medios de pago (incluidas comisión, traslado, monedas, tarjetas aceptadas, plazo de abono y vigencia del intento de la pasarela de tarjetas `billing.card_gateway.*`, salvo el proveedor), suspensión, reactivación y terminación por mora, bandeja diaria (`billing.collections_inbox_days`) | `admin`, `finance` | `settings.dunning.update` |
| Pasarela de tarjetas activa (`billing.card_gateway.provider`) | `admin` | `settings.setting.update` |
| Conector web y plugin de WordPress (`web_connector.*`), apariencia del portal, el panel y los correos (`brands.theme.*`), compra en línea (`orders.online.*`), asistente con IA (`assistant.*`), respaldos y plan de recuperación (`monitoring.restore.customer_target_kinds`, `monitoring.backup_report.visible`, `system.backup.rpo_minutes`, `system.backup.rto_minutes`, `system.dr_test.frequency_days`), identidad y subdominios del sistema central (`portal.central_identity`, `system.central_domains`) | `admin` | `settings.setting.update` |
| Libro de Reclamaciones y datos personales (`complaints.*`): plazos, alertas, prefijo del correlativo, límite por IP, conservación | `admin` | `settings.setting.update` |
| Indicadores (`dashboard.*`): metas por defecto de los indicadores clave (`dashboard.targets.*`), frecuencia de cálculo (`dashboard.calculation.*`), moneda de consolidación y ventana de vencimientos. Las metas por periodo y marca se administran en P-DSH-06 (`kpi_targets`, `dashboard.kpi_target.*`), no aquí | `admin` | `settings.setting.update` |
| Editor de textos enriquecido (`editor.*`): etiquetas, atributos y esquemas de enlace permitidos por el saneado, tamaño de imágenes | `admin` | `settings.setting.update` |
| Consultas WHOIS de la web (`web_connector.whois.*`): límite por visitante y hora, captcha tras N consultas, caché, campos públicos, sugerencias y conservación | `admin` | `settings.setting.update` |
| Política de seguridad (`security.password.*`, `security.mfa.*`, `security.login_max_attempts`, `security.login_lockout_minutes`, `security.session_duration_hours`, `security.trusted_device_days`) | `admin` | `settings.setting.update`, o `identity.security_policy.update` desde la pantalla de seguridad (P-IDN-08), que escribe las mismas keys con su historial |
| Contratos y entregas de cuenta | `admin`, `documentation` | `settings.setting.update` limitado por política al grupo Contratos |
| Exención de suspensión (`services.suspension.exempt`) | Solo `admin` | `settings.setting.update` |

El rol que edita cada key está en la columna "Edita" del catálogo.

## 8. Ajustes que requieren definición

Las keys con `requires_definition: true` traen `null` (o valores parciales en JSON) porque el kit las deja "por definir", "según tarifa vigente", "según el contador" o "administrable" sin valor. Aparecen en la lista de pendientes del centro de configuración; la función que depende de ellas no inventa un valor (RN-CFG-008). Las principales: detracción (porcentaje, monto mínimo, productos, cuenta y leyenda), recargo por mora (forma, valor, días de gracia y tope), tarifas de PayPal y Global66, pasarela de tarjetas (proveedor, comisión porcentual y fija, traslado al cliente, plazo de abono y vigencia del intento de pago), nota del comprobante de exportación, proveedor de facturación electrónica, retenciones de datos, vigencias de cotización y enlaces, avisos de contratos, categorías de tickets (`helpdesk.categories`), comisión de referidos (`sales.referral_commission_percent`), costo de la hora técnica (`finance.labor_hour_cost`) y, del alcance de docs/00 §25: subdominios del sistema central (`system.central_domains`), reglas de revisión manual de compras en línea (`orders.online.manual_review_rules`), servicio de captcha (`orders.online.captcha_provider`), modelo, instrucciones, tope mensual y retención del asistente (`assistant.model`, `assistant.instructions`, `assistant.monthly_token_limit`, `assistant.conversation_retention_days`) objetivos de recuperación del sistema (`system.backup.rpo_minutes`, `system.backup.rto_minutes`), URL de la base de conocimientos de cada marca en WordPress (`web_connector.kb_url`), conservación de los envíos de formularios (`web_connector.forms.submission_retention_days`), plazo de respuesta del Libro de Reclamaciones (`complaints.response_days`, a confirmar con asesoría legal tras la Ley 31435), plazos de las solicitudes de datos personales (`complaints.privacy_response_days`) y conservación del Libro (`complaints.retention_years`); y, del alcance de docs/00 §27: las metas por defecto de los indicadores clave (`dashboard.targets.*`, salvo `dashboard.targets.complaints_on_time_percent`, que es 100 por obligación legal, y `dashboard.targets.node_usage_max_percent` y `dashboard.targets.first_response_minutes`, que heredan de `inventory.capacity_thresholds` y `helpdesk.sla.default_targets`) y la conservación de las consultas WHOIS (`web_connector.whois.retention_days`). Mientras `assistant.model` o `assistant.instructions` sigan en `null`, el asistente no se activa aunque `assistant.enabled` esté encendido; mientras los objetivos de recuperación sigan en `null`, no se puede registrar una prueba de recuperación como aprobada. Mientras `complaints.response_days` siga en `null`, el formulario del Libro de Reclamaciones no se habilita y la compra en línea no se activa. Mientras una meta `dashboard.targets.*` siga en `null` y no haya fila en `kpi_targets` para el periodo, el indicador se muestra con "sin meta" y sin semáforo; nunca se inventa una meta (RN-DSH-004). Mientras `web_connector.whois.retention_days` siga en `null`, la purga no borra consultas y el centro de configuración lo muestra como pendiente. El aviso de cookies, la política de cookies y los píxeles de marketing viven en WordPress (docs/00 §26) y no tienen ajustes en el sistema.

## 9. Catálogo de ajustes

Tabla generada desde `database/seeds/settings.json` (no editar a mano; se regenera y se valida con el script de validación). "JSON, ver detalle" remite a las secciones 3 y 4 o al archivo.

<!-- settings-table:start -->
| Key | Descripción | Defecto | Niveles | Edita |
|---|---|---|---|---|
| `billing.invoice_generation_days` | Días de anticipación con que se genera la factura en borrador antes de la próxima fecha de facturación de la suscripción. | `30` | global, brand, product, customer, contract | admin |
| `billing.invoice_generation_days_by_cycle` | Días de anticipación por ciclo de facturación (clave = ciclo del plan). Un ciclo sin valor usa billing.invoice_generation_days. | `{}` | global, brand, product, customer, contract | admin |
| `billing.invoice_consolidation` | Consolidar los servicios del cliente que vencen en la misma ventana en una factura, o emitir una factura por servicio. | null (por definir) | global, customer | admin |
| `billing.consolidation_window_days` | Tamaño de la ventana, en días, dentro de la cual los vencimientos se consolidan en una sola factura. | null (por definir) | global, customer | admin |
| `billing.currencies` | Monedas activas para documentos de venta. | `["PEN","USD"]` | global | admin |
| `billing.exchange_rate.source` | Fuente del tipo de cambio diario. | `sunat` | global | admin |
| `billing.exchange_rate.update_frequency` | Frecuencia de actualización del tipo de cambio. | `daily` | global | admin |
| `billing.exchange_rate.update_time` | Hora (HH:MM, zona de la organización) de actualización del tipo de cambio. Vacío = usa system.daily_jobs_time. | null | global | admin |
| `billing.rebilling.admin_fee_percent` | Porcentaje de administración sobre el monto del proveedor antes de impuestos, en refacturación. Se fija en cada contrato. | null | contract | admin, documentation |
| `billing.rebilling.monthly_minimum` | Mínimo mensual de administración en refacturación (importe en la moneda del contrato). Vacío = sin mínimo. | null | contract | admin, documentation |
| `billing.rebilling.exchange_rate_date` | Fecha cuyo tipo de cambio se usa cuando la moneda del proveedor difiere de la del cliente en refacturación. | null (por definir) | global | admin |
| `billing.payment_fee.invoice_presentation` | Cómo se refleja en el comprobante la comisión del medio de pago trasladada al cliente. | `separate_line` | global | admin, finance |
| `billing.payment_fee.show_before_payment` | Mostrar al cliente el recargo del medio de pago antes de pagar. | `true` | global | admin, finance |
| `billing.payment_methods.defaults` | Carga inicial de payment_methods: comisión porcentual, comisión fija y si se traslada al cliente, por medio. | JSON, ver detalle | global | admin, finance |
| `billing.card_gateway.provider` | Pasarela local de pago con tarjeta activa (conector PaymentConnector que usa el medio card_gateway). | null (por definir) | global | admin |
| `billing.card_gateway.fee_percent` | Comisión porcentual de la pasarela de tarjetas por transacción, según contrato. | null (por definir) | global | admin, finance |
| `billing.card_gateway.fee_fixed` | Comisión fija por transacción de la pasarela de tarjetas ({"amount_minor", "currency"}), según contrato. | null (por definir) | global | admin, finance |
| `billing.card_gateway.pass_to_customer` | Trasladar la comisión de la pasarela al cliente como línea aparte "Comisión por medio de pago". | null (por definir) | global | admin, finance |
| `billing.card_gateway.currencies` | Monedas en que se cobra con tarjeta. | `["PEN","USD"]` | global | admin, finance |
| `billing.card_gateway.accepted_brands` | Tarjetas y billeteras que se ofrecen en el formulario de la pasarela. | `["visa","mastercard","amex","diners"]` | global | admin, finance |
| `billing.card_gateway.settlement_days` | Plazo de abono de la pasarela en días desde la transacción, según contrato; pasado el plazo sin liquidación, la conciliación marca la transacción como pendiente. | null (por definir) | global | admin, finance |
| `billing.card_gateway.checkout_expiry_minutes` | Minutos de validez de un intento de pago con tarjeta antes de pasar a vencido. | null (por definir) | global | admin, finance |
| `billing.late_fee.enabled` | Recargo por mora activo. | `true` | global, brand, product, customer, contract | admin, finance |
| `billing.late_fee.type` | Forma del recargo por mora: porcentaje del saldo vencido o monto fijo. | null (por definir) | global, brand, product, customer, contract | admin, finance |
| `billing.late_fee.value` | Valor del recargo por mora (porcentaje o monto según billing.late_fee.type). | null (por definir) | global, brand, product, customer, contract | admin, finance |
| `billing.late_fee.grace_days` | Días de gracia después del vencimiento antes de aplicar el recargo por mora. | null (por definir) | global, brand, product, customer, contract | admin, finance |
| `billing.late_fee.max_amount` | Límite máximo del recargo por mora por factura. | null (por definir) | global, brand, product, customer, contract | admin, finance |
| `billing.late_fee.document` | Documento en que se cobra el recargo por mora. | `debit_note` | global, brand, product, customer, contract | admin, finance |
| `billing.detraction.enabled` | Aplicar detracción en facturas nacionales que cumplan las condiciones. | `true` | global | admin |
| `billing.detraction.percentage` | Porcentaje de detracción. | null (por definir) | global, product | admin |
| `billing.detraction.min_amount` | Monto mínimo del comprobante (en PEN) a partir del cual se aplica detracción. | null (por definir) | global | admin |
| `billing.detraction.products` | Productos alcanzados por la detracción (códigos de producto). | null (por definir) | global | admin |
| `billing.detraction.bank_account` | Cuenta de detracciones del Banco de la Nación que se imprime en el comprobante. | null (por definir) | global | admin |
| `billing.detraction.legend` | Leyenda de detracción que se imprime en el comprobante. | null (por definir) | global | admin |
| `billing.export.invoice_note` | Nota fija del comprobante de exportación sobre impuestos, retenciones y comisiones a cargo del cliente. | null (por definir) | global, brand | admin |
| `billing.statement.aging_buckets` | Tramos de antigüedad de deuda en días (desde, hasta; hasta vacío = sin límite). | `[[0,30],[31,60],[61,90],[91,null]]` | global | admin, finance |
| `billing.price_change.notice_days` | Días de anticipación con que se avisa un cambio de precio antes de la siguiente renovación. | null (por definir) | global, brand, product | admin |
| `billing.einvoice.provider` | Proveedor de facturación electrónica (OSE/PSE) activo. | null (por definir) | global | admin |
| `billing.dunning.default_sequence` | Secuencia de avisos y acciones de cobranza (etapas editables, activables y desactivables). Por defecto la que usa hoy la empresa: avisos a 30, 15, 7 y 3 días antes, el día del vencimiento y suspensión con aviso 1 día después. | JSON, ver detalle | global, brand, product, customer, contract | admin, finance |
| `finance.labor_hour_cost` | Costo de la hora técnica para la rentabilidad: general y por técnico ({"default": {"amount_minor", "currency"}, "users": {"<user_id>": {...}}}). | null (por definir) | global | admin, finance |
| `billing.collections_inbox_days` | Días hacia adelante que muestra la bandeja diaria de cobranza en la sección de próximos vencimientos. | `15` | global | admin, finance |
| `billing.auto_apply_credit_balance` | Aplicar automáticamente el saldo a favor del cliente a la siguiente factura que se emita. | `true` | global, customer, contract | admin, finance |
| `notifications.whatsapp.enabled` | Canal WhatsApp habilitado para avisos (requiere plantillas aprobadas por Meta). | `false` | global, brand | admin, finance |
| `services.suspension.days_after_due` | Días de mora después del vencimiento para suspender el servicio. | `1` | global, brand, product, customer, contract | admin, finance |
| `services.termination.days_after_suspension` | Días en estado suspendido tras los cuales se propone la baja definitiva (requiere respaldo y aprobación del administrador). | `10` | global, brand, product, customer, contract | admin, finance |
| `services.terminate_requires_approval` | La baja definitiva tras suspensión requiere aprobación del administrador (tarea en in_review); el sistema solo la propone. | `true` | global | admin |
| `services.reactivation.auto_on_payment` | Reactivar automáticamente el servicio suspendido al validarse el pago. | `true` | global, brand, product, customer, contract | admin, finance |
| `services.suspension.exempt` | Exento de suspensión automática (sigue recibiendo avisos). | `false` | global, product, customer, contract | admin |
| `domains.customer_notice_days` | Días antes del vencimiento comercial en que se avisa al cliente. | `[30,15,7,3]` | global, brand, product, customer, contract | admin, finance |
| `domains.internal_notice_days` | Días antes de la expiración real en el registrador en que se avisa internamente. | `[30,15,7,3]` | global, brand, product | admin |
| `domains.sync_frequency` | Frecuencia de sincronización con registradores. | `daily` | global | admin |
| `domains.transfer_out.min_days_since_registration_or_transfer` | Días posteriores al registro o a una transferencia en que no se acepta una transferencia de salida (las reglas de tld_rules prevalecen). | `60` | global | admin |
| `domains.owner_change.transfer_lock_days` | Días de bloqueo de transferencia que se avisan al cambiar el titular de un dominio genérico. | `60` | global | admin |
| `domains.confirmation_link_ttl_hours` | Vigencia del enlace de confirmación por correo de una operación de dominio. | null (por definir) | global | admin |
| `catalog.domain_prices.min_margin_percent` | Margen mínimo por extensión y registrador bajo el cual se alerta. | null (por definir) | global, product | admin |
| `catalog.hosting.allow_node_fallback` | Si el nodo preferido de un paquete de hosting no acepta cuentas nuevas o no tiene capacidad, crear la cuenta en otro nodo con capacidad; si es false, el pedido pasa a revisión manual. | `true` | global, product | admin |
| `mail.ssl.notice_days` | Días antes de la expiración en que se avisa y se crea tarea para certificados de renovación manual. | `[30,15,7]` | global, product, customer | admin |
| `mail.ssl.free_cert_alert_days` | Días antes de expirar en que un certificado gratuito no renovado genera alerta técnica. | `10` | global | admin |
| `mail.licenses.notice_days` | Días antes de la expiración de licencias (Google Workspace, Microsoft 365 y otras) en que se avisa. | `[30,15,7]` | global, product, customer | admin |
| `mail.dns_checks.frequency` | Frecuencia de verificación de MX, SPF, DKIM y DMARC y lectura de certificados publicados. | `daily` | global | admin |
| `providers.account_renewal_notice_days` | Días antes de la renovación de cada cuenta de proveedor en que se avisa internamente. | `[30,7]` | global | admin |
| `inventory.capacity_thresholds` | Umbrales de uso de nodos y planes que generan alerta. | `[70,85,95]` | global, product | admin |
| `cloud.budget_thresholds` | Umbrales del presupuesto mensual por proyecto cloud que generan alerta. | `[80,100]` | global, customer, contract | admin |
| `cloud.tagging.required_keys` | Etiquetas obligatorias para asignar un recurso cloud. | `["customer","project","environment"]` | global | admin |
| `saas.limit_alert_percent` | Porcentaje de uso del límite de un plan SaaS (usuarios, almacenamiento) que genera alerta. | null | global, product | admin |
| `helpdesk.sla.default_targets` | SLA inicial de primera respuesta y solución por prioridad (propuesta editable). Se materializa en sla_policies y sla_targets. | JSON, ver detalle | global, product, contract | admin |
| `helpdesk.sla.pause_statuses` | Estados de ticket que pausan el reloj del SLA. | `["waiting_customer","waiting_provider"]` | global | admin |
| `helpdesk.sla.holiday_country` | País cuyos feriados (tabla holidays) descuenta el SLA. | `PE` | global | admin |
| `helpdesk.sla.warning_percent` | Porcentaje del tiempo de SLA consumido al que se alerta (además de al incumplir). | `75` | global, product, contract | admin |
| `helpdesk.sla.alert_recipients` | Destinatarios de las alertas de SLA (roles o usuarios). | null (por definir) | global | admin |
| `helpdesk.auto_close.waiting_customer_days` | Días en "esperando cliente" tras los cuales el ticket se cierra solo. | `7` | global, product, contract | admin |
| `helpdesk.auto_close_notice_days` | Días antes del cierre automático en que se avisa al cliente que el ticket se cerrará si no responde. | `2` | global, product, contract | admin |
| `helpdesk.ticket_types` | Tipos de ticket habilitados en el panel y el portal (subconjunto de tickets.type). | JSON, ver detalle | global, brand | admin |
| `helpdesk.departments` | Departamentos a los que se asigna un ticket (columna tickets.department). | `["support","billing","sales"]` | global, brand | admin |
| `helpdesk.categories` | Categorías de ticket para reportes (columna tickets.category). | null (por definir) | global, brand | admin |
| `helpdesk.attachments.retention_months` | Meses de retención de adjuntos de tickets. | `12` | global | admin |
| `service_map.metrics_frequency` | Frecuencia de lectura de consumo de los componentes. | `daily` | global | admin |
| `portal.show_provider_name` | Mostrar al cliente el nombre real del proveedor en lugar de solo la marca propia. | `false` | global, brand, customer | admin |
| `portal.actions.cpanel_login.enabled` | Acción del cliente: entrar a su cPanel con sesión temporal. | `true` | global, customer | admin |
| `portal.actions.usage_view.enabled` | Acción del cliente: ver consumo y características. | `true` | global, customer | admin |
| `portal.actions.dns_change.enabled` | Acción del cliente: cambiar servidores DNS (con confirmación por correo y aviso de impacto). | `false` | global, customer | admin |
| `portal.actions.server_reboot.enabled` | Acción del cliente: solicitar reinicio de servidor (soporte aprueba, el sistema ejecuta). | `false` | global, customer | admin |
| `sales.lead.followup_alert_days` | Días sin seguimiento tras los cuales un prospecto abierto genera alerta. | null (por definir) | global, brand | admin |
| `sales.quote.validity_days` | Vigencia por defecto de una cotización. | null (por definir) | global, brand, product | admin |
| `sales.referral_commission_percent` | Comisión por defecto para enlaces de referido (se copia a referral_links.commission_rate al crear el enlace). | null (por definir) | global, product | admin |
| `contracts.expiry_notice_days` | Días antes del fin del contrato en que se avisa. | null (por definir) | global, brand, product, contract | admin, documentation |
| `contracts.account_handover.notice_days` | Días antes del fin del periodo de una cuenta administrada en que se avisa y se programa la entrega. | null (por definir) | global, contract | admin, documentation |
| `security.session_duration_hours` | Duración de la sesión. | `8` | global | admin |
| `security.login_max_attempts` | Intentos fallidos de inicio de sesión antes de bloquear temporalmente la cuenta. | `5` | global | admin |
| `security.login_lockout_minutes` | Minutos de bloqueo tras superar security.login_max_attempts. | `15` | global | admin |
| `security.mfa.required_for_staff` | Segundo factor obligatorio para el personal (tipo de usuario staff), salvo que security.mfa.required_by_role diga otra cosa para el rol. | `true` | global | admin |
| `security.mfa.required_for_customers` | Segundo factor obligatorio para los usuarios de clientes (tipo de usuario customer), salvo que security.mfa.required_by_role diga otra cosa para el rol. | `false` | global, customer | admin |
| `security.vault.reveal_limit_per_hour` | Límite de revelaciones de secretos por usuario y por hora. | `10` | global | admin |
| `security.sensitive_action_mfa_max_age_minutes` | Antigüedad máxima del MFA para revelar un acceso, ejecutar en un servidor o autorizar un reembolso. | `10` | global | admin |
| `security.password.min_length` | Longitud mínima de las contraseñas del personal y de los clientes. | `10` | global | admin |
| `security.password.complexity` | Clases de caracteres exigidas en las contraseñas: mayúsculas, minúsculas, números y símbolos. | JSON, ver detalle | global | admin |
| `security.password.expiry_days` | Días tras los que la contraseña caduca y se pide cambiarla al iniciar sesión; 0 = no caduca. | `0` | global | admin |
| `security.password.history_count` | Cantidad de contraseñas anteriores que no se pueden reutilizar; 0 = sin historial. | `5` | global | admin |
| `security.mfa.email_enabled` | Permite el segundo factor por código enviado al correo. | `true` | global | admin |
| `security.mfa.app_enabled` | Permite el segundo factor por aplicación de autenticación (TOTP). | `true` | global | admin |
| `security.mfa.required_by_role` | Obligatoriedad del segundo factor por código de rol (required u optional); sobrescribe la regla del tipo de usuario. El rol admin siempre es required. | `{"admin":"required"}` | global | admin |
| `security.mfa.email_code_ttl_minutes` | Minutos de validez de un código de acceso enviado al correo (un solo uso). | `10` | global | admin |
| `security.mfa.email_code_max_attempts` | Intentos permitidos con un mismo código enviado al correo antes de invalidarlo. | `5` | global | admin |
| `security.trusted_device_days` | Días que un dispositivo marcado como de confianza no pide el segundo factor al iniciar sesión (nunca en acciones sensibles); 0 = no se permiten dispositivos de confianza. | `30` | global | admin |
| `vault.secret.default_rotation_days` | Días por defecto hasta la fecha de rotación de un secreto nuevo. | null (por definir) | global | admin |
| `vault.one_time_link.ttl_hours` | Vigencia de un enlace de un solo uso para entregar accesos. | null (por definir) | global | admin |
| `system.daily_jobs_time` | Hora de ejecución de las tareas diarias (HH:MM, zona de la organización). | `06:00` | global | admin |
| `system.locales` | Idiomas activos de la interfaz y de las plantillas. | `["es","en"]` | global | admin |
| `system.retention.inactive_customers` | Retención de datos de clientes inactivos (por país). | null (por definir) | global | admin |
| `system.retention.technical_records` | Retención de registros técnicos (logs, monitoreo, sincronizaciones). | null (por definir) | global | admin |
| `system.retention.personal_data` | Plazos de retención de datos personales por país. | null (por definir) | global | admin |
| `system.backup.frequency` | Frecuencia del respaldo cifrado del sistema en AWS S3. | `daily` | global | admin |
| `system.backup.retention_days` | Días de retención de los respaldos del sistema en AWS S3. | `35` | global | admin |
| `system.backup.cold_storage_after_days` | Días tras los cuales un respaldo pasa a almacenamiento de bajo costo. | `30` | global | admin |
| `brands.theme.min_contrast_ratio` | Relación de contraste mínima de texto contra fondo (WCAG 2.1) que debe alcanzar cada par de colores de un tema del portal, el panel o los correos, en modo claro y oscuro, para poder publicarlo. | `4.5` | global | admin |
| `brands.theme.allowed_fonts` | Tipografías que se pueden elegir en los tokens de un tema; se sirven desde el propio servidor. | `["Inter","Roboto","Open Sans","Montserrat","Source Sans 3"]` | global | admin |
| `brands.theme.preview_link_minutes` | Minutos de validez del enlace firmado de vista previa de un tema (portal, panel y correos). | `60` | global | admin |
| `complaints.response_days` | Plazo de respuesta al consumidor de una hoja del Libro de Reclamaciones, en días hábiles; se copia a la hoja al registrarla. | null (por definir) | global | admin |
| `complaints.alert_days_before` | Días antes del vencimiento en que se avisa a documentación y al administrador por cada hoja sin responder. | `[5,1]` | global | admin |
| `complaints.code_prefix` | Prefijo del número correlativo de las hojas de la marca. | null | global, brand | admin |
| `complaints.public_limit_per_ip_per_day` | Hojas que puede enviar una misma IP por día desde la web (antiabuso; no limita el derecho a reclamar por otros canales). | `5` | global | admin |
| `complaints.retention_years` | Años que se conservan las hojas y sus respuestas para fiscalización antes de anonimizar los datos del consumidor. | null (por definir) | global | admin |
| `complaints.privacy_response_days` | Plazo de respuesta por tipo de solicitud de derechos sobre datos personales (acceso, rectificación, cancelación, oposición), en días hábiles. | JSON, ver detalle | global | admin |
| `orders.online.enabled` | Compra en línea activa en la web de la marca. Apagada, los planes muestran "Solicitar cotización". | `true` | global, brand | admin |
| `orders.online.new_customer_max_open_checkouts` | Compras en línea en curso o pagadas que puede tener un cliente nuevo dentro de la ventana; la siguiente pasa a revisión manual. | `2` | global, brand | admin |
| `orders.online.new_customer_window_days` | Días desde el alta durante los que un cliente se considera nuevo para el límite de compras en línea. | `30` | global | admin |
| `orders.online.manual_review_rules` | Reglas que mandan una compra en línea a revisión manual: total máximo por moneda, cantidad máxima de dominios, país del cliente distinto del de la IP, correo de dominio desechable. | JSON, ver detalle | global, brand | admin |
| `orders.online.checkout_expiry_hours` | Horas que una compra en línea abierta o esperando el pago con tarjeta o PayPal queda vigente antes de vencer. | `48` | global | admin |
| `orders.online.voucher_validation_alert_hours` | Horas tras las cuales una compra con voucher sin validar alerta a finanzas. | `24` | global | admin |
| `orders.online.cart_expiry_days` | Días sin actividad tras los que un carrito vence. | `30` | global | admin |
| `orders.online.abandoned_cart_after_hours` | Horas sin actividad tras las que un carrito se marca abandonado. | `24` | global, brand | admin |
| `orders.online.abandoned_cart_notice_enabled` | Enviar un aviso de carrito abandonado, solo a quien aceptó comunicaciones comerciales. | `true` | global, brand | admin |
| `orders.online.captcha_provider` | Servicio de captcha del alta de cuenta, la compra y el asistente público. | null (por definir) | global | admin |
| `orders.online.domain_check_limit_per_ip_per_hour` | Consultas de disponibilidad de dominio por IP y hora en la web pública. | `60` | global | admin |
| `assistant.enabled` | Asistente con IA activo en la web y el portal de la marca. Apagado hasta definir modelo, instrucciones y tope. | `false` | global, brand | admin |
| `assistant.model` | Modelo de Claude que usa el asistente (identificador de la API de Anthropic). | null (por definir) | global, brand | admin |
| `assistant.instructions` | Instrucciones del asistente por idioma para la marca (tono, productos que puede recomendar, cuándo derivar). Se copian a ai_assistant_profiles.instructions. | null (por definir) | global, brand | admin |
| `assistant.max_messages_per_conversation` | Mensajes del visitante o cliente por conversación; al llegar al tope la conversación pasa a limit_reached y ofrece hablar con una persona. | `30` | global, brand | admin |
| `assistant.max_output_tokens_per_reply` | Tokens máximos de cada respuesta del asistente. | `800` | global, brand | admin |
| `assistant.monthly_token_limit` | Tope mensual de tokens (entrada más salida) por marca; al alcanzarlo el asistente se apaga hasta el mes siguiente y ofrece contacto humano. | null (por definir) | global, brand | admin |
| `assistant.public_messages_per_ip_per_hour` | Mensajes por IP y hora en el asistente de la web pública. | `20` | global | admin |
| `assistant.conversation_retention_days` | Días que se conservan las conversaciones del asistente antes de anonimizarlas. | null (por definir) | global | admin |
| `monitoring.restore.customer_target_kinds` | Qué puede pedir restaurar el cliente desde el portal (sitio, base de datos, buzón, cuenta completa). | `["website","database","mailbox"]` | global, product | admin |
| `monitoring.backup_report.visible` | Mostrar al cliente el informe de respaldos de sus servicios en el portal. | `true` | global, customer | admin |
| `system.backup.rpo_minutes` | Objetivo de pérdida máxima de datos (RPO) del propio sistema, en minutos. | null (por definir) | global | admin |
| `system.backup.rto_minutes` | Objetivo de tiempo de recuperación (RTO) del propio sistema en otro servidor, en minutos. | null (por definir) | global | admin |
| `system.dr_test.frequency_days` | Cada cuántos días debe registrarse una prueba del plan de recuperación; al vencer se crea una tarea para soporte. | `90` | global | admin |
| `portal.central_identity` | Cómo se ve el sistema central para un cliente que llega desde la web de la marca: identidad de AlojamientoPlus con la marca de origen en el encabezado (central_brand) o identidad de su marca dentro del dominio central (origin_brand). | `central_brand` | global, brand | admin |
| `system.central_domains` | Subdominios del sistema central en alojamientoplus.com: portal y compra, panel interno y API. | `{"portal":null,"admin":null,"api":null}` | global | admin |
| `web_connector.cache_ttl_seconds` | Segundos que el plugin Hub Connector guarda en caché lo que lee del sistema antes de volver a pedirlo; un aviso de invalidación la renueva al instante. | `600` | global, brand | admin |
| `web_connector.stale_max_hours` | Horas durante las que el plugin sigue mostrando la última copia si el sistema no responde; pasado ese plazo muestra un aviso con los datos de contacto. | `72` | global | admin |
| `web_connector.token_expiry_days` | Días de vigencia de un token de solo lectura del plugin; 0 = sin vencimiento (se revoca a mano). | `365` | global | admin |
| `web_connector.webhook.timeout_seconds` | Segundos que el sistema espera la respuesta del plugin a un aviso de invalidación. | `5` | global | admin |
| `web_connector.webhook.max_attempts` | Intentos de entrega de un aviso de invalidación antes de marcarlo fallido y alertar. | `6` | global | admin |
| `web_connector.webhook.secret_overlap_minutes` | Minutos en que el secreto de firma anterior sigue aceptándose tras rotarlo. | `60` | global | admin |
| `web_connector.min_plugin_version` | Versión mínima del plugin aceptada por la API; una anterior recibe 426 y el plugin avisa al administrador de WordPress. | `1.0.0` | global | admin |
| `web_connector.kb_url` | URL de la base de conocimientos de la marca en WordPress, enlazada desde la ayuda del portal y del asistente. | null (por definir) | global, brand | admin |
| `web_connector.forms.captcha_required` | Exige captcha en los formularios del constructor (cada formulario puede quitarlo solo si el administrador lo permite). | `true` | global, brand | admin |
| `web_connector.forms.submissions_per_ip_per_hour` | Envíos de formularios permitidos por IP y hora. | `10` | global | admin |
| `web_connector.forms.max_file_mb` | Tamaño máximo de un archivo adjunto en un formulario. | `5` | global | admin |
| `web_connector.forms.submission_retention_days` | Días que se conservan los envíos de formularios ya derivados (los datos siguen en el prospecto o el ticket). | null (por definir) | global | admin |
| `dashboard.calculation.daily_time` | Hora local (zona de la organización) del cálculo diario y mensual de los indicadores de frecuencia daily y monthly. | `02:00` | global | admin |
| `dashboard.calculation.intraday_minutes` | Cada cuántos minutos se recalculan los indicadores de frecuencia intraday (tickets abiertos, vouchers por validar, reclamos próximos a vencer). | `60` | global | admin |
| `dashboard.calculation.history_months` | Meses hacia atrás que el job vuelve a calcular cada noche (correcciones tardías: notas de crédito, pagos validados después). | `3` | global | admin |
| `dashboard.consolidation_currency` | Moneda en que se consolidan los indicadores en dinero cuando no se filtra por moneda (tipo de cambio de la fecha de cada documento). | `PEN` | global | admin |
| `dashboard.expiring_window_days` | Días hacia adelante que cuentan como "por vencer" en servicios, dominios y facturas. | `30` | global | admin |
| `dashboard.targets.mrr_growth_percent` | Meta por defecto de crecimiento mensual del ingreso recurrente (KPI-COM-03). | null (por definir) | global, brand | admin |
| `dashboard.targets.churn_rate_percent` | Meta por defecto (máximo) de la tasa mensual de abandono de clientes (KPI-COM-07). | null (por definir) | global, brand | admin |
| `dashboard.targets.lead_conversion_percent` | Meta por defecto de la tasa de conversión de prospectos a clientes (KPI-CRM-03). | null (por definir) | global, brand | admin |
| `dashboard.targets.days_sales_outstanding` | Meta por defecto (máximo) de los días promedio de cobro (KPI-FIN-04). | null (por definir) | global | admin |
| `dashboard.targets.gross_margin_percent` | Meta por defecto (mínimo) del margen bruto por servicio (KPI-FIN-07). | null (por definir) | global, brand | admin |
| `dashboard.targets.overdue_debt_percent` | Meta por defecto (máximo) de la deuda vencida sobre la cartera (KPI-FIN-06). | null (por definir) | global | admin |
| `dashboard.targets.promise_kept_percent` | Meta por defecto (mínimo) de compromisos de pago cumplidos (KPI-COB-05). | null (por definir) | global | admin |
| `dashboard.targets.renewal_rate_percent` | Meta por defecto (mínimo) de la tasa de renovación de servicios (KPI-OPE-02). | null (por definir) | global, brand | admin |
| `dashboard.targets.backup_success_percent` | Meta por defecto (mínimo) de respaldos exitosos (KPI-OPE-06). | null (por definir) | global | admin |
| `dashboard.targets.availability_percent` | Meta por defecto (mínimo) de disponibilidad de los servicios monitoreados (KPI-OPE-07). | null (por definir) | global | admin |
| `dashboard.targets.node_usage_max_percent` | Meta por defecto (máximo) de uso de disco de los nodos de hosting (KPI-OPE-04). | null | global | admin |
| `dashboard.targets.first_response_minutes` | Meta por defecto (máximo) del tiempo promedio de primera respuesta (KPI-SOP-02). | null | global | admin |
| `dashboard.targets.sla_compliance_percent` | Meta por defecto (mínimo) del cumplimiento de SLA (KPI-SOP-04). | null (por definir) | global | admin |
| `dashboard.targets.csat_percent` | Meta por defecto (mínimo) de clientes satisfechos en las encuestas (KPI-SOP-05). | null (por definir) | global, brand | admin |
| `dashboard.targets.complaints_on_time_percent` | Meta por defecto de reclamos y quejas respondidos dentro del plazo (KPI-REC-03). | `100` | global | admin |
| `dashboard.targets.cart_abandonment_percent` | Meta por defecto (máximo) de carritos abandonados sobre carritos creados (KPI-WEB-02). | null (por definir) | global, brand | admin |
| `editor.html.allowed_tags` | Etiquetas HTML que conserva el saneado del editor enriquecido; cualquier otra se elimina al guardar (docs/10). | JSON, ver detalle | global | admin |
| `editor.html.allowed_attributes` | Atributos permitidos por etiqueta; class solo con valores del tema (prefijo hub-) y nunca style, on* ni data-*. | JSON, ver detalle | global | admin |
| `editor.html.allowed_link_schemes` | Esquemas de enlace permitidos en el editor; javascript:, data: y vbscript: siempre se eliminan. | `["https","mailto","tel"]` | global | admin |
| `editor.images.max_mb` | Tamaño máximo de una imagen insertada en el editor (se sube a files con antivirus; nunca imágenes externas). | `2` | global | admin |
| `web_connector.whois.limit_per_visitor_per_hour` | Consultas de disponibilidad y WHOIS por visitante y hora desde [hub_whois] y [hub_buscar_dominio]; al superarlo responde 429 con Retry-After. | `30` | global, brand | admin |
| `web_connector.whois.captcha_after_lookups` | Consultas por visitante en la última hora a partir de las cuales se exige captcha antes de consultar otra vez. | `10` | global, brand | admin |
| `web_connector.whois.cache_minutes` | Minutos que se reutiliza la respuesta del registrador para el mismo dominio (no se consulta al registrador en cada visita). | `10` | global | admin |
| `web_connector.whois.public_fields` | Campos del WHOIS público que se muestran de un dominio registrado; nunca nombre, correo, teléfono ni dirección del titular aunque el registro los publique. | JSON, ver detalle | global | admin |
| `web_connector.whois.suggestions_max` | Máximo de sugerencias de nombres y extensiones alternativas por búsqueda. | `8` | global | admin |
| `web_connector.whois.retention_days` | Días que se conservan las consultas WHOIS (whois_lookups) antes de purgarlas. | null (por definir) | global | admin |
<!-- settings-table:end -->

## 10. Validación del catálogo

El script `database/seeds/settings_table.py` (`python3 settings_table.py validate settings.json 09-centro-de-configuracion.md`; con `render` regenera la tabla) verifica:

1. `settings.json` es JSON válido.
2. Las keys son únicas y siguen el formato `grupo.subgrupo.nombre` en minúsculas con puntos.
3. Cada ajuste tiene tipo válido (`integer`, `decimal`, `boolean`, `string`, `enum`, `json`, `list`), niveles dentro de `global`/`brand`/`product`/`customer`/`contract`, roles del contrato, y un valor por defecto del tipo declarado (o `null` con `requires_definition`).
4. La tabla de la sección 9 es idéntica, fila por fila, a la que se genera desde el JSON.
