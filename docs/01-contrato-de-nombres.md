# 01 — Contrato común de nombres

Fuente única de nombres del paquete: tablas, columnas relevantes, los valores de **todas** las columnas de estado y tipo tal como quedaron en `database/schema.sql`, los espacios de permisos `portal.*` y `dashboard.*`, los códigos DSH y PRT, el prefijo `/api/v1/auth` y los eventos de dominio de `docs/03`. `tools/verificar_coherencia.py` comprueba que este archivo, el esquema, el OpenAPI, los seeds y los documentos digan lo mismo.

Este archivo manda sobre cualquier nombre inventado. Si un documento necesita una tabla, estado o permiso que no está aquí, se agrega con el mismo estilo (primero en `database/schema.sql` o en `api/openapi.yaml`, que son la fuente) y se actualiza este archivo.

## Reglas generales
- Idioma: documentación en español; tablas, columnas, rutas de API, códigos de permiso y código en inglés.
- Nombre de trabajo del proyecto: `hub`. Las tablas NO llevan prefijo.
- Base de datos: PostgreSQL 16+. Claves `uuid` (UUID v7 generado por la aplicación; en SQL `DEFAULT gen_random_uuid()` como respaldo).
- Toda tabla de negocio lleva: `id uuid PK`, `organization_id uuid NOT NULL REFERENCES organizations(id)`, `created_at timestamptz`, `updated_at timestamptz`, `created_by uuid NULL`, `updated_by uuid NULL` y `version integer NOT NULL DEFAULT 1` (concurrencia optimista: un `PATCH` con versión vieja responde 409). Con baja lógica: `deleted_at timestamptz NULL`. Campos personalizados: `custom jsonb NOT NULL DEFAULT '{}'`.
- Excepciones: `organizations` y `permissions` no llevan `organization_id`; las tablas solo de inserción no llevan `updated_at`, `updated_by` ni `version`; las tablas técnicas `idempotency_keys`, `code_sequences`, `mfa_recovery_codes`, `email_login_codes`, `password_histories`, `role_permissions`, `user_roles` y `taggables` no llevan `version`; `personal_access_tokens` sigue el formato de Sanctum (clave `bigint`).
- Dinero: `<campo>_minor bigint` + `currency char(3)` con CHECK `currency IN ('PEN','USD')` (salvo costos de proveedores, que admiten cualquier ISO 4217 en `cost_currency`).
- Fechas en UTC (`timestamptz`); fechas de negocio sin hora como `date`.
- Estados: columnas `text` con CHECK contra la lista de abajo (el código usa enums de PHP respaldados).
- Tablas solo de inserción: `audit_events`, `secret_access_logs`, `setting_changes`, `notification_deliveries`, `webhook_events`, más las agregadas `notification_delivery_events` y `webhook_event_processings`, `ai_messages` (registro de conversaciones del asistente, docs/00 §25), `legal_acceptances` (aceptación de documentos legales, docs/00 §25), y `lead_stage_changes` (historial de etapas del CRM) y `complaint_deletions` (constancia de hojas de prueba eliminadas del Libro de Reclamaciones), docs/00 §26. y `rich_text_versions` (historial del editor de textos enriquecido, docs/00 §27). `complaint_responses` no se edita y solo se borra junto con una hoja de prueba; `whois_lookups` no se edita y solo la borra la purga por retención; `complaints` solo admite `DELETE` de hojas con `is_test = true` (trigger): el Libro de Reclamaciones real se conserva para fiscalización.
- Monto, días, porcentajes y textos de aviso NUNCA en el código: van en `settings` o en tablas de configuración.

## Módulos de código (backend, `app/Modules/<Nombre>`), clave de permiso y código corto
| Módulo | clave permiso | código | Contiene |
|---|---|---|---|
| Identity | identity | IDN | organizations, users, roles del sistema y personalizados con matriz de permisos, política de seguridad administrable, MFA por aplicación TOTP o por código al correo, dispositivos de confianza, sesiones |
| Settings | settings | CFG | centro de configuración, feriados, horario de atención |
| Brands | brands | BRD | marcas, entidad emisora, cuentas bancarias, series; temas por marca para el portal y el carrito, el panel y los correos (tokens de diseño con vista previa, contraste mínimo, historial y reversión) |
| Customers | customers | CUS | clientes, contactos, consentimientos |
| Sales | sales | SAL | CRM básico con vista de lista y Kanban (historial de etapas), canales de captación, WhatsApp, mailing, cotizaciones |
| Catalog | catalog | CAT | catálogo completo por categorías fijas y personalizadas, productos, planes, complementos, paquetes combinados; fichas por marca, fichas técnicas de paquetes de hosting y planes VPS, extensiones de dominio con costos, precios y margen mínimo; tipos de servicio personalizados con campos propios |
| Providers | providers | PRV | proveedores y cuentas de proveedor |
| Services | services | SRV | servicios contratados, suscripciones, modalidades, interruptores del cliente, valores de los campos propios de servicios personalizados |
| ServiceMap | service_map | MAP | proyectos del cliente, componentes, dependencias, métricas, procedimientos, ficha de traspaso |
| Inventory | inventory | INV | recursos, nodos de hosting, cuentas de hosting, servidores, migración, CMDB |
| Cloud | cloud | CLD | cuentas cloud, proyectos, recursos, presupuestos |
| Domains | domains | DOM | dominios, operaciones del cliente, reglas por extensión, regularización, consultas de disponibilidad y WHOIS desde las webs (`[hub_whois]`) con límite por visitante y captcha |
| Mail | mail | MAI | correo, licencias por usuario, certificados SSL |
| Saas | saas | SAA | plataformas SaaS e instancias (Moodle y otros) |
| Contracts | contracts | CTR | plantillas, cláusulas, contratos, versiones, firmas, entregas de cuenta |
| Orders | orders | ORD | pedidos y aprovisionamiento; carrito y compra en línea de servicios simples (checkout) |
| Billing | billing | BIL | facturas, notas, emisión electrónica, medios de pago (incluida la pasarela de tarjetas), pagos, reembolsos, contracargos, liquidaciones, cobranza, recargos, detracciones, refacturación |
| Finance | finance | FIN | costos, distribución, rentabilidad |
| Helpdesk | helpdesk | HLP | bandeja de tickets con conversación, notas internas, asignación, SLA y vínculo a servicios; base de conocimientos del sistema; encuestas |
| Work | work | WRK | tareas, proyectos internos, horas, cambios, problemas |
| Vault | vault | VLT | accesos, concesiones, bitácora, enlaces de un solo uso |
| Monitoring | monitoring | MON | monitores, incidentes, mantenimientos, backups, solicitudes de restauración, herramienta de respaldos de los nodos, plan de recuperación del sistema |
| Automation | automation | AUT | reglas, plantillas (avisos, respuestas predefinidas, cartas de respuesta del Libro y confirmaciones de formularios), editor de textos enriquecido con saneado e historial de versiones, avisos, webhooks, sincronizaciones, importaciones, exportaciones, auditoría |
| WebConnector | web_connector | WCN | conector con las webs de WordPress Multisite (docs/00 §26): sitios conectados por marca, tokens de solo lectura revocables, webhooks firmados de invalidación de caché, generador de shortcodes, constructor de formularios con sus envíos, datos de contacto por marca, documentos legales versionados con aceptación registrada y la API pública que consume el plugin Hub Connector. El sistema no tiene CMS: páginas, menús, blog, SEO, página 404, cookies, píxeles y CSS viven en WordPress |
| Complaints | complaints | LRC | Libro de Reclamaciones virtual por marca (correlativo, constancia, plazo, respuesta, exportación para fiscalización, hojas de prueba eliminables con constancia) y solicitudes de derechos sobre datos personales de la Ley 29733 (docs/00 §25 y §26) |
| Assistant | assistant | AIA | asistente con IA (API de Claude) en la web WordPress de cada marca (`[hub_asistente]`) y en el portal: perfiles por marca, conversaciones, consumo (docs/00 §25) |
| Dashboard | dashboard | DSH | panel de indicadores (KPI) con catálogo, metas y valores calculados (docs/14), vencimientos, capacidad y búsqueda global (no es módulo de negocio: lee a los demás y solo escribe sus tablas `kpi_*`) |
| Portal | portal | PRT | portal del cliente por marca (no es módulo de backend) |

No son módulos de backend: Dashboard y Portal (consumen la API de los demás módulos). Desde docs/00 §27, Dashboard guarda su catálogo de indicadores, sus metas y los valores que calcula el job `ComputeKpiSnapshots` (`kpi_definitions`, `kpi_targets`, `kpi_snapshots`), sin escribir en tablas de otros módulos. Tienen código corto (`x-module` = `DSH` y `PRT`) y clave de permiso propia (`dashboard.*` y `portal.*`) porque sus operaciones necesitan permisos distintos de los del panel.

## Tablas canónicas por módulo
- IDN: organizations, users, roles, permissions, role_permissions, user_roles, user_sessions, mfa_recovery_codes, email_login_codes, trusted_devices, password_histories, audit_events, idempotency_keys, files, tags, taggables, custom_field_definitions
- CFG: settings (key, scope_type: global|brand|product|customer|contract, scope_id, value jsonb), setting_changes, holidays, business_hours
- BRD: brands, legal_entities, bank_accounts, document_series, brand_themes, brand_theme_versions
- CUS: customers, contacts, communication_consents, customer_notes
- SAL: lead_channels, lead_forms, pipeline_stages, leads, lead_stage_changes, lead_activities, assignment_rules, referral_links, whatsapp_numbers, whatsapp_conversations, whatsapp_messages, mailing_lists, mailing_list_members, quotes, quote_versions, quote_items
- CAT: product_categories, products, plans, plan_prices, product_addons, bundle_items, domain_tld_prices, domain_extensions, product_listings, hosting_package_specs, vps_plan_specs, service_types, service_type_fields
- PRV: providers, provider_accounts, provider_contacts
- SRV: service_modalities, services, service_resources, subscriptions, service_status_history, customer_action_flags, service_field_values
- MAP: client_projects, project_components, component_dependencies, component_metrics, project_procedures, handover_documents
- INV: resources, hosting_nodes, hosting_accounts, servers, server_software, maintenances, migration_batches, migration_items, resource_dependencies
- CLD: cloud_accounts, cloud_projects, cloud_resources, cloud_budgets
- DOM: domains, domain_contacts, domain_operations, tld_rules, domain_regularizations, whois_lookups
- MAI: mail_services, mail_dns_checks, seat_licenses, ssl_certificates
- SAA: saas_platforms, saas_instances
- CTR: contract_templates, contract_clauses, contracts, contract_versions, contract_comments, contract_signatures, account_handovers
- ORD: orders, order_items, provisioning_runs, carts, cart_items, checkout_sessions
- BIL: invoices, invoice_items, einvoice_submissions, payment_methods, payments, payment_allocations, payment_promises, credit_balances, coupons, tax_rates, exchange_rates, provider_bills, dunning_sequences, dunning_stages, dunning_events
- FIN: costs, cost_allocations
- HLP: sla_policies, sla_targets, tickets, ticket_messages, ticket_links, kb_categories, kb_articles, satisfaction_surveys
- WRK: work_projects, tasks, task_checklist_items, task_dependencies, time_entries, change_requests, problems
- VLT: secrets, secret_grants, secret_access_logs, one_time_links
- MON: monitors, monitor_results, incidents, incident_affected, maintenance_windows, backup_policies, backup_runs, restore_tests, alerts, backup_tool_accounts, restore_requests, dr_tests
- AUT: automation_rules, automation_runs, notification_templates, notification_deliveries, webhook_endpoints, webhook_events, outbound_webhook_deliveries, sync_runs, imports, exports, rich_text_versions
- WCN: wp_sites, wp_site_tokens, wp_cache_invalidations, web_forms, web_form_fields, web_form_submissions, brand_contact_points, legal_documents, legal_document_versions, legal_acceptances
- LRC: complaints, complaint_responses, complaint_deletions, privacy_requests
- AIA: ai_assistant_profiles, ai_conversations, ai_messages, ai_usage
- DSH: kpi_definitions, kpi_targets, kpi_snapshots

Las tablas de LRC, AIA, el carrito y el checkout de ORD, las de restauración y recuperación de MON, los temas de BRD (`brand_themes`, `brand_theme_versions`) y las de administración de paquetes de CAT (`domain_extensions`, `product_listings`, `hosting_package_specs`, `vps_plan_specs`) se agregaron al contrato con el alcance de docs/00 §25. Con docs/00 §26 el sistema deja de tener CMS: se eliminaron las tablas de páginas, bloques, versiones, menús, novedades, redirecciones, URLs 404, medios, CSS propio, Search Console, fuentes y caché de WordPress, consentimiento de cookies y scripts de marketing (cms_*, seo_search_console_stats, wordpress_sources, wp_categories, wp_posts_cache, cookie_consents, marketing_scripts), y se agregaron las de WCN, los servicios personalizados de CAT y SRV (`service_types`, `service_type_fields`, `service_field_values`), la seguridad de IDN (`email_login_codes`, `trusted_devices`, `password_histories`), el historial de etapas de SAL (`lead_stage_changes`) y la constancia de hojas de prueba de LRC (`complaint_deletions`). Con docs/00 §27 se agregaron las tablas del panel de indicadores de DSH (`kpi_definitions`, `kpi_targets`, `kpi_snapshots`), el historial del editor de textos enriquecido de AUT (`rich_text_versions`) y el registro de consultas WHOIS de DOM (`whois_lookups`).

### Tablas agregadas (fuera de la lista canónica)

| Tabla | Módulo | Para qué |
|---|---|---|
| `code_sequences` | IDN | Correlativos legibles por tipo (`CLI-000123`, `TKT-…`) con la función `hub_next_code()`. |
| `personal_access_tokens` | IDN | Tabla estándar de Laravel Sanctum (clave `bigint`) para los tokens de la API pública, con `organization_id` y `customer_id` agregados; expuesta como `/admin/api-tokens`. |
| `bank_statement_lines` | BIL | Líneas del extracto bancario para la conciliación (P-BIL-09). |
| `payment_checkouts` | BIL | Intentos de pago con tarjeta desde el portal (una o varias facturas, importe con recargo, sesión del formulario alojado por la pasarela). Nunca guarda datos de tarjeta. |
| `payment_refunds` | BIL | Reembolsos totales o parciales con solicitud, autorización y ejecución por API o manual. |
| `payment_disputes` | BIL | Contracargos de pagos con tarjeta (P-BIL-16). |
| `payment_settlement_lines` | BIL | Líneas del reporte de liquidación de la pasarela para la conciliación (P-BIL-17). |
| `notification_delivery_events` | AUT | Estados de entrega de cada aviso (`notification_deliveries` es solo de inserción). |
| `webhook_event_processings` | AUT | Cada intento de procesamiento de un webhook (`webhook_events` es solo de inserción). |

### Columnas relevantes agregadas o fijadas

| Columna | Regla |
|---|---|
| `version` | Concurrencia optimista en toda tabla que se actualiza (ver excepciones). Por eso las versiones de negocio se llaman `quote_versions.version_number`, `contract_versions.version_number`, `saas_instances.app_version` y `server_software.installed_version`. |
| `services.show_provider` | Sobrescritura por servicio del ajuste `portal.show_provider_name`: `NULL` hereda, `true`/`false` fija. No existe `show_provider_name` como columna. |
| `services.label` | Etiqueta del servicio visible al cliente. |
| `payment_methods.pass_to_customer` | La comisión del medio se traslada al cliente como línea aparte (también con `kind = card_gateway`). |
| `payments.status = charged_back` | Pago con tarjeta revertido por contracargo: sus aplicaciones se revierten y la factura vuelve a tener saldo. |
| `hosting_nodes.capacity_thresholds`, `accepts_new_accounts`, `cpanel_license_tier` | Umbral por nodo (sobrescribe `inventory.capacity_thresholds`), nodo cerrado a cuentas nuevas y tramo de licencia cPanel. |
| `customer_action_flags.action` | Interruptores `cpanel_login`, `usage_view`, `dns_change`, `server_reboot`; cada uno corresponde a un ajuste `portal.actions.*.enabled`. |
| `change_requests.kind`, `target_type`, `target_id`, `plan`, `scheduled_until` | Tipo de cambio (incluye `server_reboot` y `dns_change` pedidos desde el portal) y objeto afectado. |
| `tasks.requires_approval`, `approved_by`, `approved_at`, `parent_id`, `is_template`, `template_id`, `recurrence`, `is_sensitive` | Aprobación de tareas (`work.task.approve`), plantillas y tareas recurrentes. |
| `tickets.department`, `category`, `level` | Valores de `helpdesk.departments` y `helpdesk.categories`; nivel de soporte. |
| `cloud_resources.kind`, `is_shared`, `assignment_status` | Tipo normalizado entre nubes y asignación a cliente. |
| `contracts.kind` | `contract` o `terms` (términos aceptados en el portal). Las adendas son `contract_versions` con `kind = addendum`. |
| `products.sellable_online` | Marca "venta en línea": el producto se compra desde la web de la marca; si es `false`, la web muestra "Solicitar cotización" y entra al CRM (docs/00 §25). |
| `products.service_type_id` | Producto de un tipo de servicio personalizado (`service_types`): hereda sus campos propios, tareas de entrega, contrato obligatorio, componente del mapa y datos del portal (docs/00 §26). |
| `product_categories.kind`, `shortcode_type`, `is_system` | Tipo fijo del catálogo completo (las categorías nuevas del administrador son `custom`), valor del atributo `tipo` de `[hub_planes]` y marca de categoría inicial no borrable. |
| `orders.channel`, `orders.checkout_session_id` | `sales` (registrado por ventas) u `online` (generado por una compra en línea pagada); `checkout_session_id` es único: una compra genera un solo pedido. |
| `payments.checkout_session_id`, `payment_checkouts.checkout_session_id` | Pago de una compra en línea antes de que exista la factura; un intento con tarjeta paga facturas o una compra, nunca ambas. |
| `backup_runs.backup_tool_account_id`, `backup_runs.external_id` | Respaldo leído de la herramienta del nodo cPanel, sin duplicados por id externo. |
| `brands.theme` | Caché de los tokens de la versión publicada en `brand_theme_versions` (portal, panel y correos); se reescribe al publicar o revertir un tema y nunca se edita a mano. |
| `brand_themes.published_version_id` | Versión publicada del tema de la marca; índice único parcial `brand_theme_versions_one_published_uq`: una sola versión `published` por marca. |
| `domain_tld_prices.domain_extension_id`, `domain_tld_prices.customers_notified_at` | Ficha de la extensión a la que pertenece el precio y fecha del aviso a clientes con dominios activos cuando cambia el precio de renovación. |
| `product_listings.sellable_online` | Venta en línea en esa marca; solo vale si además `products.sellable_online` es `true`. |
| `ai_assistant_profiles.instructions` | Copia por marca y canal del ajuste `assistant.instructions`. |
| `tickets.channel = web_form` | Ticket creado desde la web: un formulario del constructor con destino ticket, el Libro de Reclamaciones o una solicitud de datos personales. |
| `complaints.number`, `complaints.code` | Correlativo por marca tomado con `hub_next_code()` sobre la entidad `complaint:<código de marca>` (único por organización, marca y número); `code` es el número visible en la constancia. |
| `complaints.response_days`, `complaints.due_at` | Copia del plazo `complaints.response_days` vigente al registrar la hoja y su vencimiento; cambiar el ajuste no altera hojas ya registradas. |
| `complaints.is_test`, `test_marked_at`, `test_marked_by`, `test_reason` | Hoja de prueba: la única que se puede eliminar (trigger `complaints_guard`); al eliminarla queda la constancia en `complaint_deletions` con su número. Una hoja respondida no se marca como prueba y una de prueba no vuelve a ser real. |
| `carts.wp_site_id`, `ai_conversations.wp_site_id`, `complaints.wp_site_id`, `web_form_submissions.wp_site_id` | Sitio WordPress conectado desde donde llegó el visitante (antes cms_site_id). |
| `wp_sites.base_url` | URL pública del sitio, solo HTTPS y única en todo el sistema (índice `wp_sites_base_url_uq` sobre `lower(base_url)`). |
| `wp_site_tokens.token_hash`, `scope` | Solo el hash del token del plugin; `scope` siempre `read`. Un token revocado no se reactiva (trigger `wp_site_tokens_guard`). |
| `secrets.owner_type = wp_site` | Secreto HMAC con que el sistema firma los webhooks de invalidación al plugin de ese sitio. |
| `service_field_values.field_type` | Copia del tipo del campo por clave foránea compuesta (`service_type_field_id`, `field_type`) → `service_type_fields (id, field_type)`; el CHECK exige la columna de valor de ese tipo. |
| `users.mfa_method`, `failed_login_count`, `locked_until`, `must_change_password` | Segundo factor activo (`totp` o `email`), intentos fallidos y bloqueo (`security.login_max_attempts`, `security.login_lockout_minutes`) y cambio de contraseña obligatorio (`security.password.expiry_days`). |
| `roles.is_system`, `roles.copied_from_role_id` | Roles del seeder: no se borran ni cambian de código o audiencia (trigger `roles_guard`); rol personalizado copiado de otro. Un rol de cliente solo recibe permisos `portal.*` (trigger `role_permissions_audience`). |
| `email_login_codes.consumed_at`, `invalidated_at` | Código al correo de un solo uso: consumido o invalidado no vuelve a valer, y no se consume vencido (trigger `email_login_codes_guard`). |
| `ticket_messages.is_internal` | Nota interna: solo del personal y por el canal `internal`; nunca se muestra al cliente. |
| `notification_templates.category`, `notification_templates.content_format` | Plantillas del editor enriquecido por uso (aviso, respuesta predefinida de ticket, carta de respuesta del Libro, confirmación de formulario) y formato (`html` saneado o `plain` para WhatsApp); una carta del Libro es siempre correo HTML (docs/00 §27). |
| `complaint_responses.body_html`, `template_id`, `previewed_at`, `preview_sha256` | Carta de respuesta escrita con el editor enriquecido a partir de una plantilla; se envía exactamente lo que se previsualizó (CHECK del hash) y queda con responsable (`responded_by`) y fecha (`sent_at`). `body` guarda el texto plano para la exportación. |
| `complaints.sheet_token_hash` | Hash del token del enlace a la hoja de reclamación pública (constancia); el token no se guarda. |
| `vps_plan_specs.location`, `cpu_model`, `disk_type` | Ubicación, procesador y tipo de disco de VPS y servidores dedicados para `[hub_servidores]`. |
| `whois_lookups.visitor_hash` | HMAC de la IP del visitante: base del límite `web_connector.whois.limit_per_visitor_per_hour` y del captcha; la IP no se guarda. |
| `kpi_definitions.target_setting_key`, `kpi_targets.target_value`, `kpi_targets.target_minor` | Meta por defecto del indicador (`dashboard.targets.*`) y meta por marca y periodo, en la unidad del indicador o en dinero con moneda. |
| `rich_text_versions.sanitizer_profile`, `html_sha256` | Huella de la lista de etiquetas y atributos aplicada (`editor.html.*`) y hash del HTML saneado de cada versión. |
| Dinero en el OpenAPI | Una propiedad `Money`/`ProviderMoney` llamada `x` corresponde a las columnas `x_minor` + `currency` (o `cost_currency`). |

## Estados canónicos

Valores tal como quedaron en los `CHECK` de `database/schema.sql` (fuente única; el OpenAPI y los documentos usan los mismos). Incluye todas las columnas de estado y de tipo, agrupadas por módulo. El estado de pago "en validación" no existe: el voucher queda en `reported` hasta que finanzas lo valida. El pago con tarjeta nace `validated` con el webhook aprobado de la pasarela.


### IDN

- `organizations.status`: `active`, `suspended`
- `users.type`: `staff`, `customer`
- `users.status`: `active`, `disabled`
- `users.mfa_method`: `totp`, `email`
- `email_login_codes.purpose`: `login`, `step_up`, `enroll`
- `roles.audience`: `staff`, `customer`
- `audit_events.actor_type`: `user`, `system`, `connector`, `api`
- `files.scan_status`: `pending`, `clean`, `infected`, `failed`
- `files.visibility`: `internal`, `customer`
- `custom_field_definitions.field_type`: `text`, `number`, `date`, `boolean`, `select`, `multiselect`, `url`

### CFG

- `settings.scope_type`: `global`, `brand`, `product`, `customer`, `contract`
- `setting_changes.scope_type`: `global`, `brand`, `product`, `customer`, `contract`

### BRD

- `brands.status`: `active`, `inactive`
- `bank_accounts.account_type`: `checking`, `savings`, `detraction`
- `document_series.document_type`: `invoice`, `receipt`, `credit_note`, `debit_note`
- `brand_theme_versions.surfaces`: `portal`, `admin`, `email`
- `brand_theme_versions.status`: `draft`, `published`, `archived`

### CUS

- `customers.type`: `company`, `individual`
- `customers.tax_id_type`: `ruc`, `dni`, `ce`, `passport`, `foreign_tax_id`, `other`
- `customers.status`: `active`, `inactive`
- `customers.tax_treatment`: `taxed`, `export`
- `customers.invoice_consolidation`: `consolidated`, `per_service`
- `contacts.roles`: `billing`, `administrative`, `technical`, `authorized`
- `communication_consents.channel`: `all`, `email`, `whatsapp`, `sms`, `phone`
- `communication_consents.purpose`: `marketing`, `terms`, `privacy`
- `communication_consents.source`: `portal`, `form`, `elastic_email`, `whatsapp`, `manual`, `import`, `checkout`

### SAL

- `lead_channels.kind`: `web_form`, `whatsapp`, `mailing`, `social`, `referral`, `call`, `event`, `assistant`, `other`
- `pipeline_stages.outcome`: `open`, `won`, `lost`
- `leads.status`: `open`, `won`, `lost`
- `lead_stage_changes.source`: `board_drag`, `form`, `created`, `conversion`, `automation`, `api`
- `lead_activities.type`: `call`, `whatsapp`, `email`, `meeting`, `note`, `follow_up`
- `assignment_rules.strategy`: `fixed`, `round_robin`
- `whatsapp_conversations.status`: `open`, `closed`
- `whatsapp_messages.direction`: `inbound`, `outbound`
- `whatsapp_messages.type`: `text`, `image`, `document`, `audio`, `video`, `template`, `other`
- `whatsapp_messages.status`: `received`, `sent`, `delivered`, `read`, `failed`
- `mailing_list_members.status`: `subscribed`, `unsubscribed`, `bounced`, `complained`
- `quotes.status`: `draft`, `sent`, `accepted`, `rejected`, `expired`
- `quote_items.charge_type`: `one_time`, `recurring`
- `quote_items.cycle`: `monthly`, `quarterly`, `semiannual`, `annual`, `biennial`, `triennial`

### CAT

- `products.billing_type`: `recurring`, `one_time`
- `products.provisioning_rule`: `manual`, `automatic`
- `plans.cycle`: `monthly`, `quarterly`, `semiannual`, `annual`, `biennial`, `triennial`, `one_time`
- `domain_tld_prices.operation`: `register`, `renew`, `transfer`, `restore`
- `product_categories.kind`: `shared_hosting`, `reseller_hosting`, `vps`, `dedicated_server`, `cloud`, `domain`, `ssl`, `email`, `website`, `online_store`, `moodle`, `license`, `support`, `custom_development`, `custom`
- `service_types.status`: `draft`, `active`, `archived`
- `service_types.sale_mode`: `online`, `quote_only`
- `service_types.component_kind`: `server`, `hosting`, `domain`, `dns`, `cdn`, `email`, `bulk_email`, `ssl_certificate`, `database`, `storage`, `wordpress_site`, `custom_system`, `moodle_platform`, `license`, `other`
- `service_type_fields.field_type`: `text`, `number`, `select`, `date`, `file`, `checkbox`
- `service_type_fields.filled_by`: `customer`, `staff`
- `vps_plan_specs.disk_type`: `ssd`, `nvme`, `hdd`

### PRV

- `providers.type`: `hosting`, `server`, `cloud`, `registrar`, `email`, `ssl`, `cdn`, `bulk_email`, `payment`, `einvoice`, `saas`, `dns`, `ai`, `other`
- `providers.origin`: `company`, `customer`
- `providers.status`: `active`, `inactive`
- `provider_accounts.owner`: `company`, `customer`
- `provider_accounts.status`: `active`, `suspended`, `closed`

### SRV

- `service_modalities.account_owner`: `company`, `customer`, `company_then_customer`
- `service_modalities.billing_mode`: `plan`, `provider_cost_plus_fee`, `fee_only`, `usage_plan`
- `service_modalities.customer_visibility`: `own_resources`, `own_resources_and_cost`, `instance_only`
- `services.status`: `pending`, `active`, `suspended`, `terminated`, `cancelled`, `handed_over`
- `subscriptions.cycle`: `monthly`, `quarterly`, `semiannual`, `annual`, `biennial`, `triennial`
- `subscriptions.status`: `active`, `paused`, `cancelled`
- `service_status_history.from_status`: `pending`, `active`, `suspended`, `terminated`, `cancelled`, `handed_over`
- `service_status_history.to_status`: `pending`, `active`, `suspended`, `terminated`, `cancelled`, `handed_over`
- `service_status_history.trigger_source`: `manual`, `dunning`, `payment`, `order`, `handover`, `system`
- `customer_action_flags.action`: `cpanel_login`, `usage_view`, `dns_change`, `server_reboot`
- `service_field_values.field_type`: `text`, `number`, `select`, `date`, `file`, `checkbox`

### MAP

- `client_projects.status`: `active`, `inactive`, `archived`
- `project_components.kind`: `server`, `hosting`, `domain`, `dns`, `cdn`, `email`, `bulk_email`, `ssl_certificate`, `database`, `storage`, `wordpress_site`, `custom_system`, `moodle_platform`, `license`, `other`
- `project_components.environment`: `production`, `staging`, `testing`, `development`
- `project_components.sync_mode`: `api`, `manual`
- `component_dependencies.kind`: `hosted_on`, `depends_on`, `resolves_via`, `delivers_via`, `sends_via`, `secured_by`, `other`
- `component_metrics.source`: `api`, `manual`
- `project_procedures.kind`: `maintenance`, `emergency`, `deployment`, `handover`, `other`
- `handover_documents.status`: `generated`, `delivered`, `superseded`

### INV

- `resources.type`: `hosting_node`, `hosting_account`, `server`, `cloud_resource`, `domain`, `mail_service`, `ssl_certificate`, `cdn_zone`, `bulk_email_account`, `dns_zone`, `saas_instance`, `database`, `storage`, `license`, `other`
- `resources.status`: `active`, `suspended`, `stopped`, `terminated`, `not_found`
- `resources.sync_mode`: `api`, `manual`
- `servers.tenancy`: `dedicated`, `shared`
- `hosting_nodes.kind`: `reseller`, `own_vps`
- `hosting_nodes.panel`: `whm`, `plesk`, `other`
- `hosting_nodes.status`: `active`, `migrating_out`, `retired`
- `hosting_accounts.status`: `active`, `suspended`, `terminated`, `not_found`
- `server_software.kind`: `os`, `panel`, `web_server`, `database`, `runtime`, `application`, `agent`, `other`
- `maintenances.kind`: `update`, `security_patch`, `os_upgrade`, `backup_check`, `reputation_check`, `other`
- `maintenances.status`: `scheduled`, `done`, `skipped`
- `migration_batches.status`: `planned`, `in_progress`, `completed`, `cancelled`
- `migration_items.risk`: `low`, `medium`, `high`
- `migration_items.status`: `pending`, `copied`, `testing`, `dns_changed`, `verified`, `closed`, `reverted`
- `resource_dependencies.kind`: `hosted_on`, `depends_on`, `resolves_via`, `delivers_via`, `sends_via`, `secured_by`, `backs_up_to`, `other`

### CLD

- `cloud_accounts.platform`: `aws`, `azure`, `gcp`, `digitalocean`, `other`
- `cloud_accounts.owner`: `company`, `customer`
- `cloud_accounts.modality`: `dedicated_company_account`, `managed_customer_account`, `shared_saas`, `managed_new_account_handover`
- `cloud_accounts.tagging_status`: `pending`, `in_progress`, `done`
- `cloud_accounts.status`: `active`, `access_revoked`, `handed_over`, `closed`
- `cloud_projects.environment`: `production`, `staging`, `testing`, `development`
- `cloud_resources.status`: `active`, `stopped`, `terminated`, `not_found`
- `cloud_resources.kind`: `server`, `database`, `storage`, `dns`, `network`, `load_balancer`, `other`
- `cloud_resources.assignment_status`: `assigned`, `unassigned`

### DOM

- `domains.holder`: `company`, `customer`
- `domains.status`: `active`, `expired`, `redemption`, `pending_transfer`, `transferred_out`, `not_found`
- `domains.sync_mode`: `api`, `manual`
- `domain_contacts.role`: `registrant`, `admin`, `tech`, `billing`
- `domain_operations.type`: `contact_change`, `owner_change`, `nameserver_change`, `transfer_out`, `transfer_in`, `renewal`
- `domain_operations.status`: `requested`, `email_confirmed`, `in_review`, `sent`, `completed`, `rejected`, `cancelled`
- `domain_regularizations.target_holder`: `company`, `customer`
- `domain_regularizations.status`: `pending`, `in_progress`, `completed`, `cancelled`
- `whois_lookups.query_kind`: `availability`, `whois`, `suggestions`
- `whois_lookups.result`: `available`, `registered`, `reserved`, `unsupported`, `unknown`, `rate_limited`, `captcha_required`

### MAI

- `mail_services.provider_kind`: `cpanel`, `google_workspace`, `microsoft_365`, `other`
- `mail_services.account_owner`: `company`, `customer`
- `mail_services.status`: `active`, `suspended`, `cancelled`
- `mail_services.sync_mode`: `api`, `manual`
- `mail_dns_checks.record_type`: `MX`, `SPF`, `DKIM`, `DMARC`
- `mail_dns_checks.result`: `ok`, `missing`, `changed`, `invalid`
- `ssl_certificates.kind`: `free_auto`, `paid`
- `ssl_certificates.installed_on_type`: `server`, `hosting_account`, `cdn`, `load_balancer`, `other`
- `ssl_certificates.renewal_mode`: `automatic`, `manual`
- `ssl_certificates.status`: `valid`, `expiring`, `expired`, `revoked`, `unknown`

### SAA

- `saas_platforms.product_kind`: `moodle`, `wordpress`, `custom`, `other`
- `saas_platforms.cost_allocation_method`: `active_users`, `storage`, `fixed_percent`
- `saas_platforms.status`: `active`, `inactive`
- `saas_instances.product_kind`: `moodle`, `wordpress`, `custom`, `other`
- `saas_instances.status`: `active`, `suspended`, `terminated`

### CTR

- `contract_clauses.category`: `confidentiality`, `sla`, `foreign_taxes`, `late_fee`, `account_handover`, `cloud_access_authorization`, `other`
- `contracts.status`: `draft`, `in_review`, `approved`, `sent`, `signed_active`, `expired`, `terminated`
- `contracts.kind`: `contract`, `terms`
- `contract_versions.kind`: `original`, `addendum`
- `contract_signatures.signer_party`: `customer`, `company`
- `contract_signatures.method`: `scanned_upload`, `digital_certificate`, `esign_provider`
- `contract_signatures.status`: `pending`, `signed`, `declined`
- `account_handovers.status`: `scheduled`, `in_progress`, `completed`

### ORD

- `orders.status`: `draft`, `approved`, `payment_validated`, `provisioning`, `testing`, `active`, `manual_review`, `failed`, `cancelled`
- `provisioning_runs.status`: `running`, `succeeded`, `failed`
- `provisioning_runs.error_class`: `transient`, `credentials`, `validation`, `unknown`
- `orders.channel`: `sales`, `online`
- `carts.status`: `open`, `abandoned`, `converted`, `expired`
- `cart_items.domain_action`: `register`, `transfer`, `existing`
- `checkout_sessions.status`: `open`, `manual_review`, `awaiting_payment`, `awaiting_validation`, `paid`, `completed`, `expired`, `cancelled`

### BIL

- `payment_methods.kind`: `bank_transfer`, `paypal`, `global66`, `card_gateway`, `other`
- `invoices.type`: `invoice`, `receipt`, `credit_note`, `debit_note`
- `invoices.status`: `draft`, `issued`, `partially_paid`, `paid`, `overdue`, `void`
- `invoices.fiscal_status`: `not_applicable`, `pending`, `accepted`, `rejected`, `voided`
- `invoices.tax_treatment`: `taxed`, `export`
- `invoice_items.kind`: `service`, `one_time`, `rebilling`, `payment_surcharge`, `late_fee`, `adjustment`
- `einvoice_submissions.operation`: `issue`, `void`, `status_query`, `resend`
- `einvoice_submissions.status`: `queued`, `sent`, `accepted`, `rejected`, `error`
- `payments.kind`: `payment`, `igv_withholding`
- `payments.status`: `reported`, `validated`, `rejected`, `refunded`, `charged_back`
- `payments.reported_via`: `portal`, `sales`, `finance`, `webhook`, `import`
- `payment_checkouts.status`: `created`, `approved`, `declined`, `expired`, `cancelled`
- `payment_refunds.status`: `requested`, `processing`, `succeeded`, `failed`
- `payment_disputes.status`: `open`, `evidence_submitted`, `won`, `lost`
- `payment_disputes.reported_via`: `webhook`, `finance`
- `payment_promises.status`: `open`, `kept`, `broken`
- `credit_balances.direction`: `credit`, `debit`
- `credit_balances.source_type`: `overpayment`, `credit_note`, `manual`, `invoice_application`
- `coupons.discount_type`: `percent`, `fixed`
- `provider_bills.source`: `api`, `upload`
- `provider_bills.status`: `pending`, `rebilled`, `not_rebillable`
- `dunning_sequences.scope_type`: `global`, `brand`, `product`, `customer`, `contract`
- `dunning_stages.action`: `send_notice`, `create_finance_task`, `suspend_service`
- `dunning_stages.recipient_contact_role`: `billing`, `administrative`, `technical`
- `dunning_stages.internal_copy`: `finance`, `account_manager`, `none`
- `dunning_stages.non_business_day`: `send_anyway`, `next_business_day`
- `dunning_stages.channels`: `email`, `portal`, `whatsapp`
- `dunning_events.action`: `send_notice`, `create_finance_task`, `suspend_service`
- `dunning_events.status`: `scheduled`, `done`, `skipped_promise`, `skipped_exempt`, `skipped_paid`, `failed`
- `bank_statement_lines.status`: `unmatched`, `matched`, `difference`
- `payment_settlement_lines.transaction_type`: `charge`, `refund`, `chargeback`, `adjustment`
- `payment_settlement_lines.status`: `unmatched`, `matched`, `difference`

### FIN

- `costs.kind`: `provider_recurring`, `provider_one_time`, `license`, `payment_fee`, `other`
- `costs.allocation_method`: `resources`, `percentage`, `usage`, `manual`, `none`

### HLP

- `sla_policies.scope_type`: `global`, `product`, `contract`
- `sla_targets.priority`: `critical`, `high`, `medium`, `low`
- `tickets.type`: `incident`, `request`, `question`, `billing`, `complaint`, `security`
- `tickets.status`: `new`, `open`, `in_progress`, `waiting_customer`, `waiting_provider`, `escalated`, `resolved`, `closed`, `reopened`
- `tickets.priority`: `critical`, `high`, `medium`, `low`
- `tickets.channel`: `email`, `portal`, `whatsapp`, `phone`, `internal`, `monitoring`, `assistant`, `web_form`
- `ticket_messages.author_type`: `staff`, `customer`, `system`
- `ticket_messages.channel`: `email`, `portal`, `whatsapp`, `phone`, `internal`
- `ticket_links.linkable_type`: `service`, `domain`, `server`, `saas_instance`, `project_component`, `resource`, `hosting_account`, `incident`, `problem`, `change_request`, `task`
- `kb_categories.visibility`: `public`, `internal`
- `kb_articles.visibility`: `public`, `internal`
- `kb_articles.status`: `draft`, `published`, `archived`

### WRK

- `work_projects.status`: `planned`, `active`, `on_hold`, `completed`, `cancelled`
- `problems.status`: `open`, `investigating`, `known_error`, `resolved`, `closed`
- `change_requests.risk`: `low`, `medium`, `high`
- `change_requests.status`: `draft`, `submitted`, `approved`, `rejected`, `scheduled`, `implemented`, `failed`, `closed`
- `change_requests.kind`: `standard`, `normal`, `emergency`, `server_reboot`, `dns_change`
- `tasks.status`: `todo`, `in_progress`, `blocked`, `in_review`, `done`, `cancelled`
- `tasks.priority`: `critical`, `high`, `medium`, `low`
- `tasks.source_type`: `manual`, `ticket`, `alert`, `renewal`, `order`, `dunning`, `domain_operation`, `secret_rotation`, `certificate`, `maintenance`, `migration`, `change_request`, `handover`, `sync`, `procedure`, `restore_request`

### VLT

- `secrets.kind`: `ssh`, `sftp`, `ftp`, `cpanel`, `whm`, `plesk`, `panel`, `cloud`, `registrar`, `database`, `app_admin`, `api_token`, `private_key`, `other`
- `secrets.owner_type`: `provider_account`, `server`, `hosting_account`, `cloud_account`, `domain`, `resource`, `saas_instance`, `service`, `customer`, `webhook_endpoint`, `wp_site`
- `secret_access_logs.action`: `reveal`, `copy`, `connector_use`, `reveal_denied`, `one_time_link`
- `one_time_links.purpose`: `credential_delivery`, `domain_auth_code`, `welcome_access`, `account_handover`

### MON

- `monitors.type`: `http`, `keyword`, `ping`, `port`, `dns`, `ssl`, `heartbeat`, `mail_reputation`, `external`
- `monitors.status`: `up`, `down`, `degraded`, `paused`, `unknown`
- `monitor_results.status`: `up`, `down`, `degraded`
- `incidents.kind`: `availability`, `performance`, `security`, `data`, `other`
- `incidents.severity`: `critical`, `high`, `medium`, `low`
- `incidents.status`: `open`, `monitoring`, `resolved`
- `incident_affected.affected_type`: `resource`, `service`, `project_component`, `saas_instance`, `customer`
- `maintenance_windows.status`: `scheduled`, `in_progress`, `completed`, `cancelled`
- `backup_policies.responsibility`: `company`, `provider`, `customer`
- `backup_policies.frequency`: `hourly`, `daily`, `weekly`, `monthly`
- `backup_runs.status`: `running`, `succeeded`, `failed`, `partial`
- `restore_tests.result`: `passed`, `failed`
- `alerts.type`: `capacity`, `sync_failure`, `connector_error`, `credential_error`, `not_found`, `orphan`, `ssl_expiring`, `dns_change`, `budget`, `license_overuse`, `plan_limit`, `sla`, `security`, `reveal_limit`, `margin`, `chargeback`, `other`
- `alerts.severity`: `critical`, `high`, `medium`, `low`
- `alerts.status`: `open`, `acknowledged`, `resolved`
- `backup_tool_accounts.tool`: `jetbackup`, `cpanel_backup`, `other`
- `backup_tool_accounts.status`: `active`, `inactive`
- `restore_requests.target_kind`: `website`, `database`, `mailbox`, `full_account`
- `restore_requests.requested_via`: `portal`, `support`
- `restore_requests.status`: `requested`, `approved`, `rejected`, `in_progress`, `completed`, `failed`, `cancelled`
- `restore_requests.execution_mode`: `api`, `assisted`
- `dr_tests.result`: `passed`, `failed`, `partial`

### AUT

- `automation_runs.status`: `running`, `succeeded`, `failed`, `skipped`
- `notification_templates.channel`: `email`, `portal`, `whatsapp`
- `notification_templates.category`: `notice`, `canned_reply`, `complaint_response`, `form_confirmation`
- `notification_templates.content_format`: `html`, `plain`
- `notification_deliveries.channel`: `email`, `portal`, `whatsapp`
- `notification_delivery_events.status`: `queued`, `sent`, `delivered`, `opened`, `bounced`, `failed`, `complained`
- `webhook_endpoints.direction`: `inbound`, `outbound`
- `webhook_endpoints.provider`: `paypal`, `card_gateway`, `whatsapp`, `meta_leads`, `elastic_email`, `einvoice`
- `webhook_events.provider`: `paypal`, `card_gateway`, `whatsapp`, `meta_leads`, `elastic_email`, `einvoice`
- `webhook_event_processings.status`: `processed`, `ignored`, `failed`
- `outbound_webhook_deliveries.status`: `pending`, `succeeded`, `failed`
- `sync_runs.status`: `running`, `succeeded`, `partial`, `failed`
- `imports.entity`: `customers`, `contacts`, `services`, `domains`, `hosting_accounts`, `servers`, `cloud_accounts`, `costs`, `bank_statement_lines`, `payment_settlement_lines`
- `imports.status`: `uploaded`, `validating`, `validated`, `importing`, `completed`, `failed`, `cancelled`
- `exports.report`: `customers`, `leads`, `quotes`, `services`, `client_projects`, `resources`, `cloud_resources`, `domains`, `mail_services`, `ssl_certificates`, `saas_instances`, `providers`, `products`, `contracts`, `orders`, `invoices`, `payments`, `costs`, `tickets`, `tasks`, `time_entries`, `users`, `audit_events`, `setting_changes`, `complaints`, `legal_acceptances`, `kpi_values`, `kpi_records`
- `exports.format`: `csv`, `xlsx`, `pdf`
- `exports.status`: `queued`, `running`, `completed`, `failed`, `expired`
- `rich_text_versions.owner_type`: `notification_template`, `contract_template`, `contract_clause`, `kb_article`, `web_form`, `product`, `service_type`

### WCN

- `wp_sites.status`: `pending`, `active`, `disabled`
- `wp_site_tokens.scope`: `read`
- `wp_cache_invalidations.scope`: `catalog`, `plan`, `bundle`, `domain_prices`, `promotion`, `contact`, `legal_document`, `form`, `service_status`, `all`
- `wp_cache_invalidations.status`: `pending`, `delivered`, `failed`
- `web_forms.status`: `draft`, `active`, `inactive`
- `web_forms.destination`: `lead`, `ticket`, `email`
- `web_forms.ticket_type`: `incident`, `request`, `question`, `billing`, `complaint`, `security`
- `web_forms.consent_purpose`: `marketing`, `privacy`
- `web_form_fields.field_type`: `text`, `textarea`, `email`, `phone`, `select`, `checkboxes`, `file`
- `web_form_fields.maps_to`: `name`, `email`, `phone`, `company`, `subject`, `message`
- `web_form_submissions.status`: `received`, `routed`, `failed`, `spam`
- `brand_contact_points.kind`: `phone`, `email`, `whatsapp`, `address`, `hours`
- `legal_documents.kind`: `terms`, `privacy`, `refunds`, `sla`, `acceptable_use`, `legal_notice`
- `legal_document_versions.status`: `draft`, `published`, `superseded`
- `legal_acceptances.context`: `checkout`, `signup`, `portal`

### LRC

- `complaints.complaint_type`: `claim`, `grievance`
- `complaints.consumer_document_type`: `dni`, `ce`, `passport`, `ruc`
- `complaints.status`: `received`, `in_progress`, `answered`, `closed`
- `privacy_requests.request_type`: `access`, `rectification`, `cancellation`, `opposition`
- `privacy_requests.requester_document_type`: `dni`, `ce`, `passport`, `ruc`
- `privacy_requests.status`: `received`, `in_progress`, `answered`, `rejected`

### AIA

- `ai_assistant_profiles.channel`: `website`, `portal`
- `ai_assistant_profiles.enabled_tools`: `recommend_plan`, `check_domain`, `create_lead`, `create_ticket`, `handoff`
- `ai_assistant_profiles.knowledge_sources`: `kb_articles`, `catalog`, `brand_info`, `customer_services`
- `ai_conversations.channel`: `website`, `portal`
- `ai_conversations.status`: `active`, `handed_off`, `limit_reached`, `closed`
- `ai_conversations.handoff_channel`: `agent`, `whatsapp`
- `ai_messages.role`: `user`, `assistant`, `tool`
- `ai_messages.tool_name`: `recommend_plan`, `check_domain`, `create_lead`, `create_ticket`, `handoff`

### DSH

- `kpi_definitions.kpi_group`: `commercial`, `crm`, `finance`, `collections`, `operations`, `support`, `complaints`, `web`
- `kpi_definitions.unit`: `money`, `count`, `percent`, `days`, `hours`, `minutes`, `score`
- `kpi_definitions.direction`: `up`, `down`
- `kpi_definitions.frequency`: `intraday`, `daily`, `monthly`
- `kpi_definitions.dimensions`: `brand`, `currency`, `product_category`, `owner`
- `kpi_targets.period_type`: `month`, `quarter`, `year`
- `kpi_snapshots.period_type`: `day`, `month`

Notas: `invoices.type` = factura, boleta, nota de crédito, nota de débito. `cloud_accounts.owner` y `domains.holder` = empresa o cliente. Las columnas de moneda (`currency`, `default_currency`, `fee_currency`) admiten `PEN` y `USD`; `cost_currency` admite cualquier código ISO 4217.

## Permisos

Formato `<clave_modulo>.<entidad>.<accion>` en inglés, minúsculas, entidad en singular snake_case. Acciones estándar: view, create, update, delete, approve, export. El catálogo completo (641 códigos) es `database/seeds/permissions.json`, generado desde los `x-permission` de `api/openapi.yaml`: todo permiso que se cite en un documento o en `roles.json` existe como `x-permission` de al menos una operación real.

- Acciones especiales: `billing.invoice.issue`, `billing.invoice.void`, `billing.payment.validate`, `billing.refund.authorize`, `inventory.hosting_account.login`, `inventory.server.execute`, `services.service.suspend`, `services.service.terminate`, `vault.secret.reveal`, además de `settings.setting.update`, `settings.dunning.update`, `domains.operation.approve` y `contracts.contract.approve` del contrato original.
- Contracargos (entidad `payment_dispute`, acciones estándar): `billing.payment_dispute.view`, `billing.payment_dispute.create` (registro manual cuando la pasarela no avisa por webhook), `billing.payment_dispute.update` (notas, descargos y cierre). Solicitar un reembolso usa `billing.payment.validate`; autorizarlo, `billing.refund.authorize`.
- Aprobaciones (`approve`): `automation.import.approve`, `brands.theme.approve`, `contracts.account_handover.approve`, `contracts.contract.approve`, `domains.operation.approve`, `monitoring.restore_request.approve`, `orders.checkout_session.approve`, `orders.order.approve`, `providers.provider_account.approve`, `web_connector.legal_document.approve`, `work.change_request.approve`, `work.task.approve`. En los temas de marca, `approve` es publicar una versión o volver a una anterior; en los documentos legales, publicar la versión validada por la asesoría legal; en la compra en línea, aprobar o rechazar una compra atípica; en restauraciones, aprobar o rechazar la solicitud.
- Exportaciones (`export`): `billing.invoice.export`, `billing.payment.export`, `catalog.product.export`, `cloud.cloud_resource.export`, `complaints.complaint.export`, `contracts.contract.export`, `customers.customer.export`, `domains.domain.export`, `finance.cost.export`, `helpdesk.ticket.export`, `identity.audit_event.export`, `identity.user.export`, `inventory.resource.export`, `mail.mail_service.export`, `mail.ssl_certificate.export`, `orders.order.export`, `providers.provider.export`, `saas.saas_instance.export`, `sales.lead.export`, `sales.quote.export`, `service_map.client_project.export`, `services.service.export`, `dashboard.kpi.export`, `settings.setting_change.export`, `work.task.export`, `work.time_entry.export`. Cada una es el `x-permission` de `POST /api/v1/admin/<recurso>/exports` (o de la exportación de datos personales del cliente).
- Acceso a cPanel: soporte desde el panel usa `inventory.hosting_account.login`; el cliente desde el portal usa `portal.cpanel_session.create` (sujeto al interruptor `cpanel_login`).
- Espacio `dashboard.*` (panel interno): `dashboard.search.view`, `dashboard.summary.view` y, por docs/00 §27, el panel de indicadores: `dashboard.kpi.view` (catálogo y detalle), `dashboard.kpi.update` (activar, ordenar y recalcular), `dashboard.kpi.export`, un permiso de valores por grupo (`dashboard.kpi_commercial.view`, `dashboard.kpi_crm.view`, `dashboard.kpi_finance.view`, `dashboard.kpi_collections.view`, `dashboard.kpi_operations.view`, `dashboard.kpi_support.view`, `dashboard.kpi_complaints.view`, `dashboard.kpi_web.view`) y las metas `dashboard.kpi_target.view`, `dashboard.kpi_target.create`, `dashboard.kpi_target.update`, `dashboard.kpi_target.delete`.
- Espacio `portal.*` (solo roles de cliente; nunca se asigna a personal interno): `portal.account.update`, `portal.account.view`, `portal.assistant_conversation.create`, `portal.assistant_conversation.view`, `portal.backup_report.view`, `portal.consent.update`, `portal.contact.create`, `portal.contact.delete`, `portal.contact.update`, `portal.contact.view`, `portal.contract.update`, `portal.contract.view`, `portal.cpanel_session.create`, `portal.domain.view`, `portal.domain_operation.create`, `portal.domain_operation.view`, `portal.invoice.view`, `portal.kb_article.view`, `portal.legal_acceptance.create`, `portal.legal_document.view`, `portal.maintenance.view`, `portal.notification.update`, `portal.notification.view`, `portal.order.create`, `portal.order.view`, `portal.payment.create`, `portal.payment.view`, `portal.quote.update`, `portal.quote.view`, `portal.restore_request.create`, `portal.restore_request.update`, `portal.restore_request.view`, `portal.server_action.create`, `portal.service.view`, `portal.ticket.create`, `portal.ticket.view`, `portal.user.create`, `portal.user.delete`, `portal.user.view`.
- Entidades de permiso que no son tabla: `finance.profitability`, `dashboard.summary`, `dashboard.search`, `identity.security_policy` (keys `security.*` de `settings`), `web_connector.shortcode` (generador, no guarda nada), `automation.rich_text` (sanear, previsualizar, variables e imágenes del editor enriquecido), los grupos de valores `dashboard.kpi_commercial`, `dashboard.kpi_crm`, `dashboard.kpi_finance`, `dashboard.kpi_collections`, `dashboard.kpi_operations`, `dashboard.kpi_support`, `dashboard.kpi_complaints` y `dashboard.kpi_web` (leen `kpi_snapshots`) y las del espacio `portal.*`.
- Entidades de permiso de WCN, BRD y AIA cuyo nombre omite el prefijo de la tabla: `web_connector.site` (`wp_sites`), `web_connector.site_token` (`wp_site_tokens`), `web_connector.cache_invalidation` (`wp_cache_invalidations`), `web_connector.form` (`web_forms` y `web_form_fields`), `web_connector.form_submission` (`web_form_submissions`), `web_connector.contact_point` (`brand_contact_points`), `web_connector.legal_document` (`legal_documents` y `legal_document_versions`), `web_connector.legal_acceptance` (`legal_acceptances`), `brands.theme` (`brand_themes` y `brand_theme_versions`), `assistant.profile` (`ai_assistant_profiles`), `assistant.conversation` (`ai_conversations` y `ai_messages`), `assistant.usage` (`ai_usage`).
- Entidades de permiso de docs/00 §26 en otros módulos: `catalog.service_type` (`service_types` y `service_type_fields`), `services.service_field_value` (`service_field_values`), `identity.trusted_device` (`trusted_devices`), `helpdesk.ticket_link.view` (vínculos del ticket) y `complaints.complaint.delete` (marcar como prueba y eliminar solo hojas de prueba).
- Entidades de permiso de la administración de paquetes (CAT): `catalog.product_listing`, `catalog.hosting_package_spec`, `catalog.vps_plan_spec` y `catalog.domain_extension`; los cambios de precio programados de una extensión usan `catalog.domain_tld_price.update`.
- Entidades de permiso de docs/00 §27 cuyo nombre omite el prefijo o el plural de la tabla: `dashboard.kpi` (`kpi_definitions` y `kpi_snapshots`), `dashboard.kpi_target` (`kpi_targets`), `automation.rich_text_version` (`rich_text_versions`) y `domains.whois_lookup` (`whois_lookups`).
- Entidades de permiso de LRC: `complaints.complaint` (`complaints`), `complaints.complaint_response` (`complaint_responses`), `complaints.privacy_request` (`privacy_requests`).
- Espacios `assistant.*` (AIA) y `complaints.*` (LRC): claves de permiso de los módulos agregados por docs/00 §25; `web_connector.*` (WCN), del módulo de docs/00 §26, que reemplaza al antiguo `cms.*`.

## Roles (códigos)
admin, sales, finance, support, documentation, external_accountant, temp_technician, customer_admin, customer_user

Son los roles del sistema (`roles.is_system`): no se borran ni cambian de código o audiencia. El administrador crea roles personalizados (o copia uno existente) y les asigna permisos desde la matriz por módulo y acción. Los roles de cliente (`customer_admin`, `customer_user` y los personalizados de audiencia `customer`) solo reciben permisos `portal.*`. Patrones y exclusiones por rol: `database/seeds/roles.json`.

## API
Base `/api/v1`. Prefijos: `/api/v1/admin/...` (panel), `/api/v1/portal/...` (cliente), `/api/v1/public/...` (API pública y formularios de captación; `/api/v1/public/wp/...` es la API de lectura del plugin Hub Connector con el token del sitio), `/api/v1/webhooks/<proveedor>` (entrantes) y `/api/v1/auth/...` (inicio de sesión, MFA y sesiones, compartido por panel y portal; no lleva `x-permission`). Recursos en plural inglés kebab-case: `/admin/customers/{id}/services`, `/admin/service-map/projects`. Acciones como subrecurso: `POST /admin/invoices/{id}/issue`. Errores RFC 9457. Cabecera `Idempotency-Key` obligatoria en pagos, pedidos, aprovisionamiento, emisión de facturas y operaciones de dominio. Cada operación del panel y del portal declara `x-permission` y `x-module` (código corto, incluidos `DSH` y `PRT`). Exportaciones: `POST /admin/<recurso>/exports` con su permiso `<modulo>.<entidad>.export`. Los esquemas del OpenAPI declaran `x-table` (tabla de `schema.sql`) y marcan con `x-derived` las propiedades que no son columna.

## Eventos de dominio

Nombres en inglés, PascalCase, en pasado; se emiten después del commit de la transición (ver `docs/03-maquinas-de-estado.md`). Los jobs programados que actúan como sistema son clases, no eventos: `CheckSlaBreaches`, `GenerateRenewalInvoices`, `SuspendOverdueServices`, `SyncDomains`, y los de docs/00 §25 y §26: `DetectAbandonedCarts`, `ExpireCheckoutSessions`, `CompletePaidCheckout`, `CloseIdleAiConversations`, `SyncBackupTools`, `CheckDrTestDue`, `SendDomainPriceChangeNotices`, `CheckComplaintDeadlines`, `CheckPrivacyRequestDeadlines`, `SendWpCacheInvalidations`, `RouteWebFormSubmission`, `PurgeWebFormSubmissions`, `PurgeEmailLoginCodes`, `PurgePasswordHistories`, y los de docs/00 §27: `ComputeKpiSnapshots` y `PurgeWhoisLookups`.

- AccountHandover: `AccountHandoverCompleted`, `AccountHandoverScheduled`, `AccountHandoverStarted`
- AiConversation: `AiConversationClosed`, `AiConversationHandedOff`, `AiConversationLimitReached`, `AiConversationStarted`
- Cart: `CartAbandoned`, `CartConverted`, `CartCreated`, `CartExpired`, `CartRecovered`
- CheckoutSession: `CheckoutSessionApproved`, `CheckoutSessionCancelled`, `CheckoutSessionCompleted`, `CheckoutSessionExpired`, `CheckoutSessionPaid`, `CheckoutSessionPaymentFailed`, `CheckoutSessionPaymentReported`, `CheckoutSessionPaymentStarted`, `CheckoutSessionReviewRequired`, `CheckoutSessionStarted`
- Complaint: `ComplaintAnswered`, `ComplaintClosed`, `ComplaintDeadlineApproaching`, `ComplaintMarkedAsTest`, `ComplaintReceived`, `ComplaintStarted`, `ComplaintTestDeleted`
- LegalDocumentVersion: `LegalDocumentVersionPublished`, `LegalDocumentVersionSuperseded`
- PrivacyRequest: `PrivacyRequestAnswered`, `PrivacyRequestIdentityVerified`, `PrivacyRequestReceived`, `PrivacyRequestRejected`
- BrandTheme: `BrandThemeCreated`, `BrandThemeVersionArchived`, `BrandThemeVersionDrafted`, `BrandThemeVersionPublished`, `BrandThemeVersionReverted`
- Contract: `ContractApproved`, `ContractDrafted`, `ContractExpired`, `ContractRenewed`, `ContractReturned`, `ContractSent`, `ContractSigned`, `ContractSubmitted`, `ContractTerminated`
- ContractVersion: `ContractVersionCreated`
- DomainOperation: `DomainOperationApproved`, `DomainOperationCancelled`, `DomainOperationCompleted`, `DomainOperationConfirmed`, `DomainOperationInReview`, `DomainOperationRejected`, `DomainOperationRequested`, `DomainOperationSent`
- Incident: `IncidentMitigated`, `IncidentOpened`, `IncidentReopened`, `IncidentResolved`
- Invoice: `InvoiceDrafted`, `InvoiceIssued`, `InvoiceOverdue`, `InvoicePaid`, `InvoicePartiallyPaid`, `InvoiceReopened`, `InvoiceVoided`
- Lead: `LeadCreated`, `LeadLost`, `LeadStageChanged`, `LeadWon`
- MigrationItem: `MigrationItemClosed`, `MigrationItemCopied`, `MigrationItemDnsChanged`, `MigrationItemQueued`, `MigrationItemRetry`, `MigrationItemReverted`, `MigrationItemTesting`, `MigrationItemVerified`
- Order: `OrderActivated`, `OrderApproved`, `OrderCancelled`, `OrderCreated`, `OrderFailed`, `OrderManualReviewRequired`, `OrderPaymentValidated`, `OrderProvisioned`, `OrderProvisioningStarted`
- PaymentPromise: `PaymentPromiseBroken`, `PaymentPromiseCreated`, `PaymentPromiseKept`
- Payment: `PaymentChargedBack`, `PaymentRefunded`, `PaymentReinstated`, `PaymentRejected`, `PaymentReported`, `PaymentValidated`
- PaymentCheckout: `PaymentCheckoutApproved`, `PaymentCheckoutCancelled`, `PaymentCheckoutCreated`, `PaymentCheckoutDeclined`, `PaymentCheckoutExpired`
- PaymentDispute: `PaymentDisputeEvidenceSubmitted`, `PaymentDisputeLost`, `PaymentDisputeOpened`, `PaymentDisputeWon`
- PaymentRefund: `PaymentRefundAuthorized`, `PaymentRefundFailed`, `PaymentRefundRequested`, `PaymentRefundSucceeded`
- Quote: `QuoteAccepted`, `QuoteCreated`, `QuoteExpired`, `QuoteRejected`, `QuoteSent`
- QuoteVersion: `QuoteVersionCreated`
- RestoreRequest: `RestoreRequestApproved`, `RestoreRequestCancelled`, `RestoreRequestCompleted`, `RestoreRequestFailed`, `RestoreRequestRejected`, `RestoreRequestStarted`, `RestoreRequested`
- DrTest: `DrTestFailed`, `DrTestRecorded`
- Service: `ServiceActivated`, `ServiceCancelled`, `ServiceCreated`, `ServiceHandedOver`, `ServiceReactivated`, `ServiceSuspended`, `ServiceTerminated`
- Subscription: `SubscriptionCancelled`, `SubscriptionPaused`, `SubscriptionResumed`, `SubscriptionStarted`
- Task: `TaskBlocked`, `TaskCancelled`, `TaskCompleted`, `TaskCreated`, `TaskReturned`, `TaskStarted`, `TaskSubmittedForReview`, `TaskUnblocked`
- Ticket: `TicketAssigned`, `TicketClosed`, `TicketCreated`, `TicketEscalated`, `TicketReopened`, `TicketResolved`, `TicketResumed`, `TicketStarted`, `TicketWaiting`
- Role: `RoleCopied`, `RoleCreated`, `RoleDeleted`, `RolePermissionsChanged`
- SecurityPolicy: `SecurityPolicyChanged`
- ServiceType: `ServiceTypeActivated`, `ServiceTypeArchived`, `ServiceTypeCreated`
- TrustedDevice: `TrustedDeviceAdded`, `TrustedDeviceRevoked`
- User (seguridad): `UserLocked`, `UserMfaDisabled`, `UserMfaEnabled`, `UserPasswordChanged`, `UserUnlocked`
- WebForm: `WebFormActivated`, `WebFormDeactivated`
- WebFormSubmission: `WebFormSubmissionFailed`, `WebFormSubmissionMarkedSpam`, `WebFormSubmissionReceived`, `WebFormSubmissionRouted`
- WpCacheInvalidation: `WpCacheInvalidationDelivered`, `WpCacheInvalidationFailed`
- WpSite: `WpSiteActivated`, `WpSiteCreated`, `WpSiteDisabled`
- WpSiteToken: `WpSiteTokenCreated`, `WpSiteTokenRevoked`
