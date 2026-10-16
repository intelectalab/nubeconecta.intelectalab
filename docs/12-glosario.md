# Glosario

| Término | Significado en este sistema | Nombre técnico |
|---|---|---|
| Organización | Empresa dueña de los datos. Hoy hay una sola; existe para poder ofrecer el sistema como SaaS | `organizations`, `organization_id` |
| Marca | Una de las 4 marcas comerciales; cambia la presentación (logo, portal, plantillas), no quien emite | `brands` |
| Entidad emisora | El único RUC que emite comprobantes para Perú y el extranjero | `legal_entities` |
| Cliente | Persona o empresa que contrata servicios; es único aunque compre a varias marcas | `customers` |
| Contacto | Persona del cliente con un rol (facturación, técnico, administrativo); puede tener usuario de portal | `contacts` |
| Prospecto | Posible cliente en el CRM básico, con canal de origen | `leads` |
| Canal de captación | Origen de un prospecto: landing, WhatsApp, mailing, redes, referido, manual | `lead_channels` |
| Servicio | Lo que se cobra al cliente (hosting, dominio, VPS, licencia, soporte…) | `services` |
| Suscripción | Ciclo y precio con que se factura un servicio recurrente | `subscriptions` |
| Recurso | Lo que existe en un proveedor (cuenta de hosting, servidor, recurso cloud); un servicio se apoya en uno o varios | `resources`, `service_resources` |
| Modalidad | Forma de prestar y cobrar un servicio cloud: cuenta propia, cuenta del cliente, SaaS compartido, cuenta nueva con entrega | `service_modalities`, `cloud_accounts.modality` |
| Mapa de servicios | Proyectos del cliente con sus componentes, proveedores y dependencias; vista de soporte y vista del cliente | `client_projects`, `project_components` |
| Componente | Pieza de un proyecto del cliente (servidor, CDN, DNS, correo, sistema a medida…) | `project_components` |
| Ficha de traspaso | PDF con todos los servicios del cliente para entregarlos si se muda; sin accesos | `handover_documents` |
| Nodo de hosting | Cuenta reseller (BanaHosting) o VPS propio con WHM | `hosting_nodes` |
| Proveedor / cuenta de proveedor | Empresa externa (Contabo, AWS, Namecheap…) y cada cuenta que se tiene en ella | `providers`, `provider_accounts` |
| Conector | Clase que habla con la API de un proveedor y declara qué operaciones soporta | `app/Modules/*/Infrastructure/Connectors` |
| Modo manual asistido | Cuando un proveedor no tiene API para algo, el sistema crea una tarea con los pasos | `tasks` |
| Fecha real / fecha comercial | Expiración en el registrador vs. vencimiento pactado con el cliente | `domains.registry_expires_at`, `services.commercial_due_date` |
| Titular del dominio | Quién figura como dueño legal: la empresa o el cliente | `domains.holder` |
| Refacturación | Factura al cliente del costo de un proveedor más un porcentaje de administración (antes de impuestos) | `provider_bills` |
| Detracción | Retención peruana sobre facturas nacionales que corresponda; administrable | ajustes `billing.detraction.*` |
| Retención de IGV | Monto que retiene un cliente agente de retención; se registra como pago parcial | `payments.kind` |
| Exportación de servicios | Servicio a cliente no domiciliado sin IGV, si califica | `invoices.tax_treatment = export` |
| Voucher | Comprobante de transferencia que sube el cliente; el pago queda `reported` hasta que finanzas lo valida | `payments` |
| Pasarela de tarjetas | Proveedor local (por elegir: Niubiz, Izipay, Culqi, Mercado Pago u otro) que cobra con tarjeta de crédito o débito; el formulario es suyo y el sistema nunca ve los datos de la tarjeta | `payment_methods.kind = card_gateway`, `PaymentConnector` |
| Formulario alojado o tokenizado | Página o formulario embebido de la pasarela donde el cliente escribe la tarjeta; deja el alcance PCI DSS del sistema al mínimo | `payment_checkouts.external_session_id` |
| Intento de pago con tarjeta | Pago iniciado desde el portal para una o varias facturas; se aprueba solo con el webhook de la pasarela | `payment_checkouts` |
| 3-D Secure | Verificación adicional del banco emisor durante el pago con tarjeta; la hace la pasarela | — |
| PCI DSS | Norma de seguridad de datos de tarjetas; con formulario alojado el sistema queda con el alcance mínimo | `docs/10`, sección 10 |
| Comisión por medio de pago | Recargo trasladado al cliente como línea aparte del comprobante; distinto de la comisión real que cobra el medio (gasto) | `invoice_items.kind = payment_surcharge`, `payments.fee_minor` |
| Reembolso | Devolución total o parcial de un pago, con solicitud de finanzas, autorización del administrador y nota de crédito | `payment_refunds` |
| Contracargo | Desconocimiento de un cargo con tarjeta pedido por el titular a su banco; la factura vuelve a tener saldo y finanzas recibe una alerta | `payment_disputes`, `payments.status = charged_back` |
| Liquidación | Reporte de la pasarela con lo cobrado, la comisión real y lo abonado en banco; se concilia con los pagos | `payment_settlement_lines` |
| Compromiso de pago | Fecha en que el cliente promete pagar; posterga la suspensión | `payment_promises` |
| Secuencia de cobranza | Etapas de aviso y acción alrededor del vencimiento, administrables | `dunning_sequences`, `dunning_stages` |
| Interruptor | Permiso por acción para que el cliente haga algo desde el portal (DNS, reinicio) | `customer_action_flags` |
| Centro de configuración | Pantalla donde se administran plazos, porcentajes, plantillas y reglas, con herencia por niveles | `settings` |
| Bóveda | Almacén cifrado de accesos de clientes compartidos con soporte y de llaves API | `secrets` |
| Enlace de un solo uso | Enlace con vencimiento para entregar un acceso sin enviarlo por chat | `one_time_links` |
| SLA | Tiempos comprometidos de respuesta y solución por prioridad, en horario hábil | `sla_policies`, `sla_targets` |
| Bloque A–I | Grupos de construcción por dependencias técnicas (docs/00 §13); no son fases de entrega | etiqueta `bloque-X` del backlog |
| Sitio web de marca | Web pública de una marca, hecha en WordPress Multisite (un sitio por marca con su dominio) y conectada al sistema con el plugin Hub Connector | `wp_sites` |
| WordPress Multisite | Una sola instalación de WordPress con un sitio por marca; allí viven páginas, menús, blog, ayuda, SEO, cookies, píxeles y CSS | Fuera del sistema (`docs/13`) |
| Plugin Hub Connector | Plugin propio para WordPress que muestra por shortcode o bloque lo que vive en el sistema y renueva su caché con avisos firmados | `docs/13-plugin-wordpress-hub-connector.md` |
| Shortcode | Etiqueta como `[hub_planes tipo="hosting"]` que el editor pega en WordPress y el plugin reemplaza por el contenido del sistema; cada uno tiene su bloque de Gutenberg | Generador P-WCN-03 |
| Token del sitio | Credencial de solo lectura con la que el plugin de un sitio lee la API del sistema; se revoca desde el panel | `wp_site_tokens` |
| Aviso de invalidación | Webhook firmado que el sistema envía al plugin cuando cambia un precio, un plan, un contacto o un documento legal, para que renueve su caché | `wp_cache_invalidations` |
| Constructor de formularios | Formularios armados en el panel (campos, consentimiento, captcha, destino y responsable) que la web muestra con `[hub_formulario]` | `web_forms`, `web_form_fields`, `web_form_submissions` |
| Datos de contacto de la marca | Teléfonos, correos, WhatsApp, dirección y horario de cada marca, mostrados en sus webs | `brand_contact_points` |
| Sistema central | Portal del cliente, carrito y pago, panel y API en alojamientoplus.com, al que llevan todas las webs de marca | `system.central_domains` |
| Marca de origen | Marca de la web desde la que llegó el cliente; queda en el prospecto, el cliente, el pedido y la factura | `customers.origin_brand_id` |
| Tema de marca | Conjunto versionado de tokens de diseño (colores, tipografías, radios) de una marca para el portal, el panel y los correos, publicado con contraste verificado | `brand_themes`, `brand_theme_versions` |
| Documento legal | Términos y condiciones, privacidad, reembolsos, SLA, uso aceptable o aviso legal de una marca, con versiones; la web lo muestra con `[hub_documento_legal]` (la política de cookies vive en WordPress) | `legal_documents`, `legal_document_versions` |
| Aceptación de términos | Registro inalterable de qué versión de un texto legal aceptó un usuario y cuándo | `legal_acceptances` |
| Libro de Reclamaciones | Registro virtual obligatorio de reclamos (disconformidad con el servicio) y quejas (malestar con la atención) por marca | `complaints`, `complaint_responses` |
| Reclamo / queja | Tipos de hoja del Libro: `claim` (reclamo) y `grievance` (queja) | `complaints.complaint_type` |
| Constancia | PDF que recibe el consumidor al registrar una hoja, con su número y plazo de respuesta | `complaints.acknowledgement_file_id` |
| Solicitud de datos personales | Pedido del titular de acceso, rectificación, cancelación u oposición (Ley 29733) | `privacy_requests` |
| Carrito / compra en línea | Selección de servicios simples desde la web y su confirmación con pago en el sistema central | `carts`, `checkout_sessions` |
| Ficha por marca | Cómo se vende un producto en una marca: nombre, orden, destacado y venta en línea | `product_listings` |
| Asistente | Asistente automático basado en la API de Claude en la web (`[hub_asistente]`) y el portal de cada marca | `ai_assistant_profiles`, `ai_conversations` |
| Solicitud de restauración | Pedido de restaurar un sitio, una base de datos o un buzón a una fecha, aprobado por soporte | `restore_requests` |
| Plan de recuperación | Procedimiento para levantar el sistema en otro servidor desde AWS S3, con pruebas periódicas registradas | `dr_tests` |
| Servicio personalizado | Servicio que el administrador crea sin programar, con sus campos propios, entrega, componente del mapa y modo de venta | `service_types`, `service_type_fields`, `service_field_values` |
| Catálogo completo | Categorías fijas (hosting, reseller, VPS, dedicados, cloud, dominios, SSL, correo, páginas web, tiendas, Moodle, licencias, soporte, desarrollo a medida) más las personalizadas | `product_categories.kind` |
| Política de seguridad | Reglas administrables de contraseñas, segundo factor, bloqueo, sesión y dispositivos de confianza | Ajustes `security.*` |
| Código al correo | Segundo factor enviado por correo: vence, admite pocos intentos y se usa una vez | `email_login_codes` |
| Dispositivo de confianza | Navegador que no pide el segundo factor al iniciar sesión durante un plazo | `trusted_devices` |
| Rol del sistema / rol personalizado | Rol inicial que no se borra / rol creado o copiado por el administrador con su matriz de permisos | `roles.is_system`, `role_permissions` |
| Kanban del CRM | Vista del embudo por etapas donde los prospectos se arrastran; cada cambio queda en el historial | `lead_stage_changes` |
| Hoja de prueba | Hoja del Libro de Reclamaciones marcada como prueba; la única que se puede eliminar, con constancia | `complaints.is_test`, `complaint_deletions` |
| Indicador (KPI) | Medida del negocio con código, definición, fórmula sobre las tablas, frecuencia de cálculo, dirección deseada y meta; se agrupa en Comercial, CRM, Finanzas, Cobranza, Operación, Soporte, Reclamos y Web | `kpi_definitions`, docs/14 |
| Meta de indicador | Valor que se espera de un indicador por marca y periodo; si no hay, se usa la meta por defecto del centro de configuración | `kpi_targets`, ajustes `dashboard.targets.*` |
| Valor calculado | Resultado de un indicador por día o mes y dimensión (marca, moneda, categoría, responsable), con numerador y denominador | `kpi_snapshots` |
| Dirección deseada | Si el indicador mejora al subir (`up`) o al bajar (`down`); define el semáforo | `kpi_definitions.direction` |
| Editor de textos enriquecido | Editor con formato, tablas, imágenes propias, variables y vista previa con que el equipo redacta textos; guarda HTML saneado | `RichTextEditor`, ajustes `editor.html.*` |
| Saneado | Limpieza del HTML que deja solo etiquetas y atributos permitidos y quita código peligroso | `POST /admin/rich-text/sanitize` |
| Versión de texto | Copia guardada de un texto enriquecido cada vez que se edita, con autor y fecha; restaurar crea una nueva | `rich_text_versions` |
| Plantilla de carta | Plantilla de la respuesta del Libro de Reclamaciones por marca | `notification_templates.category` = `complaint_response` |
| Respuesta predefinida | Texto reutilizable para responder tickets | `notification_templates.category` = `canned_reply` |
| Vista pública del Libro | El formulario del Libro tal como lo ve el consumidor, revisable desde el panel | P-LRC-08, `GET /public/wp/complaint-form` |
| Hoja de reclamación | La hoja numerada que registró el consumidor, enviada como constancia con un enlace propio y en PDF | `complaints.sheet_token_hash`, P-LRC-10 |
| Vista previa de la carta | La carta completa como la recibirá el consumidor; solo se envía lo que se previsualizó | `complaint_responses.preview_sha256` |
| WHOIS / RDAP | Datos públicos de registro de un dominio (registrador, fechas, estado, servidores de nombres); el sistema nunca muestra datos personales del titular | `[hub_whois]`, `web_connector.whois.public_fields` |
| Consulta WHOIS | Cada búsqueda de un visitante en la web; base del límite por visitante y del captcha | `whois_lookups` |
| Configurador de servidores | Parte de `[hub_servidores]` donde el visitante elige ciclo, sistema operativo y complementos y ve el total al instante | `product_addons`, `vps_plan_specs` |
