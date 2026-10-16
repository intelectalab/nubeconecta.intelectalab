# 05 — Permisos y roles

Define los 9 roles iniciales, su matriz, la separación de funciones, el alcance por registro, los campos ocultos en el portal y las acciones que exigen MFA reciente. Fuente: `docs/00-requerimientos.md` secciones 5, 8, 15, 16, 21, 23, 25, 26 y 27; nombres según `docs/01-contrato-de-nombres.md`. El seeder lee `database/seeds/roles.json`; el catálogo de permisos (`permissions.json`) se genera con `tools/generar_permisos.py` desde el OpenAPI (`x-permission` de cada operación).

## 1. Formato de permisos

- Formato del contrato: `<clave_modulo>.<entidad>.<accion>`, en inglés y minúsculas; entidad en singular `snake_case` (por ejemplo `billing.payment_promise.view`, `service_map.project_component.view`).
- Acciones estándar: `view`, `create`, `update`, `delete`, `approve`, `export`.
- Acciones especiales del contrato: `vault.secret.reveal`, `inventory.server.execute`, `billing.payment.validate`, `billing.refund.authorize`, `billing.invoice.issue`, `services.service.suspend`, `services.service.terminate`, `settings.setting.update`, `settings.dunning.update`, `domains.operation.approve`, `contracts.contract.approve`.
- Los permisos se validan siempre en el backend (políticas de Laravel). El frontend solo oculta (`<Can permission="...">` y guard de ruta), con la lista que llega al iniciar sesión.

### Patrones en `roles.json`

| Patrón | Significado |
| --- | --- |
| `billing.*` | Todo el módulo: equivale a `billing.*.*`. |
| `customers.*.view` | La acción `view` en todas las entidades del módulo. |
| `*.*.delete` | Solo en `deny`: la acción `delete` en cualquier módulo. |
| `*` | Todos los permisos. Solo en `admin`. |

- `deny` se aplica después de `permissions` y siempre gana.
- El seeder expande los patrones contra `permissions.json`. Un patrón que no coincide con ningún permiso existente hace fallar el seeder (evita errores de tipeo silenciosos).
- Al crear un permiso nuevo en el OpenAPI, los roles con comodín lo reciben al volver a correr el seeder; la prueba de matriz (sección 8) detecta cualquier efecto no deseado.

## 2. Roles iniciales

Los nueve roles se cargan por seeder, tienen `system = true` (`roles.is_system`) y no se pueden borrar ni cambiar de código o audiencia (docs/00, sección 5; la base lo impide con el trigger `roles_guard`). El administrador crea roles personalizados desde el panel (P-IDN-04), desde cero o copiando uno existente (`POST /admin/roles/{id}/copy`), y les asigna permisos uno por uno desde la matriz por módulo y acción (`GET /admin/permissions/matrix`, `PUT /admin/roles/{id}/permissions`); un rol personalizado de audiencia `customer` solo admite permisos `portal.*` (trigger `role_permissions_audience`). Crear, copiar o editar roles es solo del administrador (`identity.role.*`) y queda en auditoría con la lista anterior.

| Código | Rol | Tipo | Usuarios (kit) |
| --- | --- | --- | --- |
| `admin` | Administrador | Personal | Dueño o gerencia |
| `sales` | Ventas | Personal | 1 |
| `finance` | Finanzas | Personal | 1 |
| `support` | Soporte | Personal | 1 |
| `documentation` | Documentación y tramitación | Personal | Sugerido |
| `external_accountant` | Contador externo | Personal | Sugerido |
| `temp_technician` | Técnico temporal | Personal | Sugerido |
| `customer_admin` | Cliente administrador | Cliente (portal) | Por cliente |
| `customer_user` | Cliente usuario | Cliente (portal) | Por cliente |

## 3. Matriz

Matriz de docs/00 (sección 5) traducida a módulos. "Total" = todas las acciones del módulo; "Ver" = `view`; "—" = sin acceso.

| Área (módulos) | admin | sales | finance | support | documentation | external_accountant | temp_technician | customer_admin | customer_user |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Clientes y ventas (`customers`, `sales`) | Total | Total; registra cliente nuevo y pedido (`orders.order.create`) | Ver | Ver | Ver | — | — | Su cliente y sus contactos | — |
| Facturación y pagos (`billing`, `finance`) | Total; aprueba reembolsos | Ver facturas y estado de pago; registra voucher (`reported`) | Total; valida vouchers, solicita reembolsos y gestiona contracargos (`billing.payment_dispute.*`); sin `billing.refund.authorize` | — | — | Ver y exportar `billing` | — | Sus facturas, pagos (tarjeta, PayPal) y vouchers | Según permiso que otorgue su administrador |
| Infraestructura y mapa (`service_map`, `inventory`, `cloud`, `domains`, `mail`, `saas`, `providers`, `monitoring`) | Total | Ver mapa del cliente | Ver costos | Total | Ver | — | Lo asignado | Sus servicios en consulta | Sus servicios en consulta |
| Tickets y tareas (`helpdesk`, `work`) | Total | Crear tickets (ve los propios) | Tickets de facturación | Total | Ver | — | Lo asignado | Sus tickets | Sus tickets |
| Bóveda (`vault`) | Total | — | — | Revelar accesos (con concesión) | — | — | Lo asignado, con vencimiento | — | — |
| Conector web: sitios WordPress y tokens (`web_connector.site`, `web_connector.site_token`) | Total; único que registra o da de baja sitios y crea, ve o revoca tokens (MFA reciente al crear) | Edita sitios, prueba el webhook y los activa o desactiva; sin tokens | — | — | — | — | — | — | — |
| Apariencia del portal, el panel y los correos (`brands.theme`) | Total; único que publica o revierte un tema (`brands.theme.approve`) | Crea y edita borradores, verifica contraste y abre la vista previa | — | — | — | — | — | — | — |
| Formularios, envíos, generador e invalidación (`web_connector.form`, `web_connector.form_submission`, `web_connector.shortcode`, `web_connector.cache_invalidation`) | Total | Total | — | Ver envíos | — | — | — | — | — |
| Datos de contacto por marca (`web_connector.contact_point`) | Total | Total | — | Ver | — | — | — | — | — |
| Documentos legales (`web_connector.legal_document`, `web_connector.legal_acceptance`) | Total | Edita y publica versiones validadas por la asesoría legal; ve aceptaciones | — | — | — | — | — | Acepta términos en el portal | Acepta términos en el portal |
| Tipos de servicio personalizados (`catalog.service_type`) y campos propios de servicios (`services.service_field_value`) | Total; único que crea, edita, activa o archiva tipos | Ve los tipos y los usa en cotizaciones | Ver tipos | Ve tipos; completa y corrige campos propios de servicios | Ver | — | — | Ve los campos visibles de sus servicios | Ve los campos visibles de sus servicios |
| Seguridad, roles y dispositivos (`identity.security_policy`, `identity.role`, `identity.trusted_device`) | Total; único que cambia la política de seguridad (MFA reciente), crea, copia y edita roles y su matriz, y revoca dispositivos de otros | — | — | — | — | — | — | Sus dispositivos de confianza (`/auth`) | Sus dispositivos de confianza (`/auth`) |
| Libro de Reclamaciones y datos personales (`complaints`) | Total; único que marca hojas como prueba y elimina solo hojas de prueba (`complaints.complaint.delete`, MFA reciente) | — | — | Ver | Total salvo `complaints.complaint.delete`: toma, responde, cierra y exporta | — | — | — | — |
| Catálogo de paquetes (`catalog.product_listing`, `catalog.hosting_package_spec`, `catalog.vps_plan_spec`, `catalog.domain_extension`) | Total | Administra fichas por marca, fichas técnicas de hosting y VPS y extensiones de dominio (sin dar de baja extensiones); ve el resto del catálogo; no cambia precios ni ve costos | — | — | — | — | — | Ve el catálogo público de su marca | Ve el catálogo público de su marca |
| Compra en línea (`orders.cart`, `orders.checkout_session`) | Total | Ver carritos y compras | Total; aprueba o rechaza compras atípicas | Ver compras | — | — | — | Confirma y paga sus compras (`portal.order.*`) | Ve sus pedidos; paga si su administrador se lo otorga |
| Asistente con IA (`assistant`) | Total; único que configura perfiles | Ver y enlazar conversaciones; ver consumo | — | Ver y enlazar conversaciones | — | — | — | Conversa en el portal | Conversa en el portal |
| Restauraciones y plan de recuperación (`monitoring.restore_request`, `monitoring.backup_tool_account`, `monitoring.dr_test`) | Total | — | — | Total (no aprueba lo que registró por el cliente) | — | — | Ver | Informe de respaldos; pide y cancela restauraciones | Informe y solicitudes en consulta; pedir si su administrador se lo otorga |
| Panel de indicadores (`dashboard.kpi`, grupos de valores y `dashboard.kpi_target`) | Total; único que fija metas, activa indicadores y recalcula | Comercial, CRM y Web; ve metas; exporta | Finanzas y Cobranza; ve metas; exporta | Soporte, Operación y Reclamos; ve metas; exporta | Reclamos; ve metas | — | — | — | — |
| Editor de textos enriquecido (`automation.rich_text`, `automation.rich_text_version`) | Total | Usa el editor y ve el historial | Usa el editor y ve el historial | Usa el editor y ve el historial | Usa el editor, ve y restaura versiones | — | — | — | — |
| Consultas WHOIS de las webs (`domains.whois_lookup`) | Ver | — | — | Ver (por `domains.*`) | Ver (por `domains.*.view`) | — | — | — | — |
| Configuración (`settings`, `contracts`, `brands`, `identity`) | Total | — | Medios de pago y cobranza (`billing.payment_method.*`, `settings.dunning.update`) | — | Contratos, actas, autorizaciones (`contracts.*` sin `approve`) | — | — | Sus contactos y usuarios | — |

Lista exacta de patrones y exclusiones por rol: `database/seeds/roles.json`.

### Interpretaciones tomadas al traducir la matriz

- **Finanzas — `finance.*`:** el kit le da "Total" en facturación y pagos y "ver costos" en infraestructura. Se incluye el módulo `finance` completo (costos, distribución, rentabilidad) porque forma parte de la gestión financiera; en infraestructura solo recibe `view` de recursos, cuentas de proveedor y presupuestos cloud.
- **Soporte — `orders.provisioning_run.*`:** el aprovisionamiento es parte de la infraestructura ("Total"). Soporte no suspende ni termina servicios: lo aprueba el administrador.
- **Soporte — `work.*` sin `work.task.approve`:** soporte gestiona tareas y aprueba solicitudes de cambio (`work.change_request.approve`), pero aprobar tareas en revisión (`work.task.approve`) queda para `admin`, como indica `docs/modulos/M-WRK.md`.
- **Soporte — `vault.one_time_link.create`:** permite entregar accesos al cliente por enlace de un solo uso (docs/00, sección 22, funciones 8 y 11); exige las mismas condiciones que revelar.
- **Usuarios de cliente — solo espacio `portal.*`:** `customer_admin` y `customer_user` reciben únicamente permisos `portal.<entidad>.<acción>`, que son los `x-permission` de las operaciones `/api/v1/portal/...`. Nunca reciben permisos del panel (`/admin`), aunque un rol se edite. Detalle en `docs/modulos/M-PRT.md`, sección 7.
- **Conector web — admin conecta, ventas administra el contenido** (docs/00 §26): ventas recibe `web_connector.*` salvo `web_connector.site.create`, `web_connector.site.delete` y `web_connector.site_token.*` (registrar o dar de baja un sitio y emitir o revocar su token de solo lectura son del administrador, con MFA reciente al crear el token). Ventas administra formularios, envíos, datos de contacto, documentos legales (incluida la publicación de una versión validada por la asesoría legal), el generador de shortcodes y la invalidación manual. Soporte ve los envíos y los datos de contacto. El sistema ya no tiene CMS: páginas, SEO, cookies, píxeles y CSS se administran en WordPress con sus propios usuarios.
- **Temas — admin y ventas editan, admin publica** (docs/00 §25 y §26): ventas recibe `brands.theme.view`, `create` y `update`; publicar o revertir (`brands.theme.approve`) cambia lo que ven todos los clientes de la marca en el portal, el panel y los correos y por eso queda en el administrador.
- **Catálogo — admin y ventas** (docs/00 §25): ventas administra lo comercial y técnico del paquete (fichas por marca, fichas de hosting y VPS, extensiones); los precios (`catalog.plan_price.*`, `catalog.domain_tld_price.*`) y los costos siguen fuera de ventas. Si el negocio quiere que ventas también programe precios, basta agregar esos patrones a su rol (pendiente en `docs/11`, T-25).
- **Servicios personalizados — el administrador define** (docs/00 §26): solo `admin` tiene `catalog.service_type.create`, `update` y `delete`; todo el personal los ve (`catalog.*.view`); soporte completa los campos propios de los servicios (`services.service_field_value.*`).
- **Seguridad y roles — solo el administrador** (docs/00 §26): `identity.security_policy.update` (con MFA reciente), `identity.role.*` (crear, copiar, matriz, borrar personalizados) e `identity.trusted_device.delete` sobre otros usuarios son del administrador (`*`); cada usuario gestiona sus propios dispositivos de confianza, segundo factor y contraseña en `/auth`, sin permiso.
- **Libro de Reclamaciones — documentación y administrador responden** (docs/00 §25 y §26): `documentation` recibe `complaints.*` (hojas, respuestas, solicitudes de datos personales y exportación para fiscalización) salvo `complaints.complaint.delete`, que está en su `deny`: marcar una hoja como prueba y eliminar solo hojas de prueba es del administrador, con MFA reciente; `support` solo ve, porque el ticket interno de la hoja ya está en su bandeja.
- **Asistente — el administrador configura:** solo `admin` tiene `assistant.profile.*` y edita los ajustes `assistant.*`; ventas y soporte ven y enlazan conversaciones (`assistant.conversation.view` / `update`) para seguir prospectos y tickets.
- **Compra en línea — finanzas revisa:** las compras atípicas las aprueban o rechazan `finance` y `admin` (`orders.checkout_session.approve`), igual que validan vouchers; ventas solo ve carritos y compras para el seguimiento comercial.
- **Restauraciones — soporte ejecuta:** soporte recibe todo `monitoring.*` (incluidas `restore_request`, `backup_tool_account` y `dr_test`); la regla de no aprobar lo propio está en `restrictions` de `roles.json`.
- **Cliente — reiniciar servidor:** `portal.server_action.create` (`POST /portal/services/{id}/reboot-requests`): crea una solicitud de cambio (`change_requests.kind = server_reboot`) que soporte aprueba (`work.change_request.approve`) y el sistema ejecuta con `inventory.server.execute` (docs/00, sección 21). Cambiar DNS es `portal.domain_operation.create` con tipo `nameserver_change`. Ambos dependen del interruptor en `customer_action_flags` (`server_reboot`, `dns_change`), apagado por defecto.

### Acceso a cPanel: dos permisos, dos caminos

| Quién | Desde | Permiso | Operación | Condiciones |
| --- | --- | --- | --- | --- |
| Soporte (`admin`, `support`) | Panel interno | `inventory.hosting_account.login` | `POST /api/v1/admin/hosting-accounts/{id}/cpanel-session` (`createAdminCpanelSession`) | Sesión temporal de WHM (`create_user_session`), sin mostrar contraseña; queda en `audit_events`. No depende de interruptores. |
| Cliente (`customer_admin`, `customer_user`) | Portal | `portal.cpanel_session.create` | `POST /api/v1/portal/services/{id}/cpanel-session` (`portalCreateCpanelSession`) | Interruptor `cpanel_login` activo (general o del cliente; activo por defecto, docs/00, sección 21); solo servicios propios; sin interruptor responde 403 `flag_disabled`; queda en `audit_events`. |

`inventory.hosting_account.login` nunca se asigna a roles de cliente; `portal.cpanel_session.create` nunca se asigna a roles internos.

### Indicadores por grupo (docs/00 §27)

- Cada grupo del panel de indicadores tiene su permiso de valores (`dashboard.kpi_commercial.view`, `dashboard.kpi_crm.view`, `dashboard.kpi_finance.view`, `dashboard.kpi_collections.view`, `dashboard.kpi_operations.view`, `dashboard.kpi_support.view`, `dashboard.kpi_complaints.view`, `dashboard.kpi_web.view`). `dashboard.kpi.view` abre el catálogo y el detalle, pero solo devuelve indicadores de los grupos permitidos; `dashboard.kpi.export` exporta solo esos grupos.
- Interpretación tomada: "finanzas, ventas y soporte ven su grupo" se traduce en Finanzas y Cobranza para `finance`; Comercial, CRM y Web para `sales` (la web es canal de venta); Soporte y Operación para `support`, más Reclamos porque ya ve el Libro (`complaints.complaint.view`); `documentation`, que atiende el Libro, ve Reclamos. Las metas (`dashboard.kpi_target.create`, `update` y `delete`) quedan en `admin`.
- El editor de textos enriquecido (`automation.rich_text.*`) lo usan todos los roles internos que redactan; restaurar versiones (`automation.rich_text_version.create`) es de `admin` y `documentation`, y siempre exige además poder editar el registro dueño.

## 4. Separación de funciones

Con cuatro usuarios internos la separación se aplica con aprobaciones del administrador (docs/00, secciones 5 y 14).

| Regla | Implementación |
| --- | --- |
| Finanzas valida los vouchers que registran el cliente o ventas | `billing.payment.create` deja el pago en `reported`. Solo `finance` y `admin` tienen `billing.payment.validate`. Política: quien registró el pago (`payments.created_by`) no puede validarlo. Si el administrador es la única persona disponible, la validación exige motivo y queda en auditoría. |
| El administrador aprueba suspensiones, reembolsos y exenciones | `billing.refund.authorize`, `services.service.suspend` (manual), `services.service.terminate` y la edición de exenciones de suspensión (ajuste de `settings` del grupo Servicios) solo para `admin`. La suspensión automática del job `SuspendOverdueServices` actúa como sistema y queda en auditoría. |
| Aprobación de contratos | Documentación redacta; `contracts.contract.approve` solo `admin` (docs/00, sección 24). |
| Ajustes | Solo `admin` cambia ajustes generales (`settings.setting.update`); `finance` administra los de cobranza (`settings.dunning.update`) (docs/00, sección 23). |
| Operaciones de dominio del cliente | El cliente las inicia; soporte las revisa (`domains.operation.approve`). Quien registró la solicitud en nombre del cliente no la aprueba. |
| Escritura en proveedores | Habilitar escritura en una cuenta de proveedor (`providers.provider_account.approve`) solo `admin`. |
| Pago de PayPal | Se valida solo con el webhook de captura completada y el importe coincidente; ninguna persona lo valida a mano salvo conciliación con motivo. |
| Restauraciones | El cliente (`portal.restore_request.create`) o soporte (`monitoring.restore_request.create`) la piden; soporte la aprueba (`monitoring.restore_request.approve`). Quien la registró en nombre del cliente no la aprueba, salvo admin con motivo. |
| Compra en línea | El pago de la compra se valida igual que cualquier pago (webhook o finanzas); la revisión de compras atípicas es de `finance` o `admin` y nunca del cliente ni de ventas. |
| Sitios y tokens del plugin | Solo el administrador registra sitios y crea o revoca tokens; el token es de solo lectura y su valor se muestra una vez. |
| Publicación del tema de una marca | Ventas prepara el borrador y verifica el contraste; solo el administrador publica o revierte (`brands.theme.approve`). |
| Política de seguridad y roles | Solo el administrador la cambia, con MFA reciente; un rol del sistema no se borra ni cambia de código. |
| Documentos legales | Quien publica una versión (`web_connector.legal_document.approve`) registra quién de la asesoría legal la validó y cuándo; sin esa validación la base rechaza la publicación. |
| Libro de Reclamaciones | La respuesta al consumidor (`complaints.complaint_response.create`) no se edita; las hojas reales no se borran (la base no lo permite). Solo el administrador marca una hoja como prueba y elimina hojas de prueba, y cada eliminación deja constancia en `complaint_deletions`. Quien responde queda registrado. |
| Pago con tarjeta | Se valida solo con el webhook firmado de pago aprobado de la pasarela e importe coincidente con el intento; no pasa por finanzas ni por ninguna persona. Reembolsos: finanzas solicita (`billing.payment.validate`) y el administrador autoriza (`billing.refund.authorize`, MFA reciente); quien solicita no autoriza salvo el administrador. Contracargos: los registra el sistema o finanzas (`billing.payment_dispute.create`) y los cierra finanzas (`billing.payment_dispute.update`). |

Cada aprobación y cada denegación quedan en `audit_events`.

## 5. Alcance por registro

| Alcance | Roles | Regla |
| --- | --- | --- |
| `organization` | Personal interno salvo técnico temporal | Filtro global por `organization_id` en toda consulta (docs/00, sección 19). |
| `assigned` | `temp_technician` | Solo registros asignados y vigentes: tareas y tickets donde es responsable, recursos enlazados a esas tareas y concesiones de bóveda (`secret_grants`) no vencidas. |
| `own_created` | `sales` en tickets | Ve los tickets que creó. |
| `customer` | `customer_admin`, `customer_user` | Además del filtro por organización, cada consulta del portal filtra por el `customer_id` del contacto del usuario. |

Reglas:

- Un usuario de cliente nunca recibe filas de otro cliente aunque adivine un identificador. Respuesta: **404**, no 403, para no confirmar que el registro existe.
- El filtro vive en las políticas y en un *scope* global de Eloquent, no en los controladores.
- La prueba automática de la sección 8 falla si una consulta devuelve datos de otra organización o de otro cliente.
- El técnico temporal se crea con fecha de vencimiento obligatoria; al vencer, el usuario se desactiva y sus concesiones caducan. Al darlo de baja, el sistema lista los accesos que vio para rotarlos (docs/00, sección 8).

## 6. Campos ocultos en el portal

Los recursos de la API del portal (`/api/v1/portal/...`) usan clases de recurso distintas de las del panel; los campos siguientes no existen en esas respuestas (no basta con ocultarlos en React).

| Campo o dato | Excepción |
| --- | --- |
| Costos (`cost_minor`, `cost_currency`, `monthly_cost_minor`), márgenes, rentabilidad, costos asignados | Modalidad de cuenta nueva con entrega: el cliente ve el costo del proveedor y el porcentaje aplicado (docs/00, sección 20). |
| Nombre del proveedor, `provider_account_id`, etiqueta de la cuenta | Si se habilita por cliente o por servicio (ajuste apagado por defecto). |
| Notas internas (`notes_internal`, `customer_notes`, comentarios internos de contratos y tickets) | Ninguna. |
| Accesos y cualquier dato de `secrets` | Entrega por enlace de un solo uso, fuera de la API del portal. |
| `external_id` del proveedor, IP, hostname de nodos, datos de configuración internos | Ninguna. El cliente ve `public_label` y las métricas marcadas públicas (docs/00, sección 15). |
| Arquitectura compartida que sostiene una instancia SaaS | Ninguna: el cliente ve su instancia como un componente. |
| Ambientes marcados como ocultos | Ninguna. |
| Usuarios internos que actuaron (más allá del nombre visible del agente en tickets) | Ninguna. |
| Nodo, herramienta de respaldos, ubicación, id externo y tarea interna de una restauración o respaldo | Ninguna: el informe de respaldos y las solicitudes de restauración del portal usan recursos propios. |
| Paquete de WHM, nodo preferido, proveedor y plan de origen de un plan VPS, costos y margen de una extensión de dominio | Ninguna: el catálogo público y el portal muestran solo recursos, nombre de la marca y precio. |
| Señales de riesgo y motivo interno de revisión de una compra en línea | Ninguna: el cliente ve "estamos revisando tu pedido". |
| Datos que el asistente no puede usar (otros clientes, facturas, accesos, costos, proveedor, notas internas) | Ninguna: las fuentes del asistente del portal se arman con los mismos recursos del portal. |
| Píxeles, etiquetas de marketing y analítica | Ninguna: el sistema no los administra ni los carga en el portal, el carrito ni el panel interno; los gestiona cada sitio WordPress con sus propios plugins (docs/00 §26). |
| Campos propios de un servicio personalizado fuera de `portal_fields` | Ninguna: el portal muestra solo los campos visibles del tipo. |
| Hojas del Libro de Reclamaciones de otros consumidores; IP y navegador de consentimientos y aceptaciones | Ninguna: la consulta pública de una hoja exige código y correo, y responde 404 si no coinciden. |

Una prueba de serialización por recurso del portal verifica que estos campos no aparecen.

## 7. MFA reciente y acciones sensibles

- **Exigen MFA reciente (menos de `security.sensitive_action_mfa_max_age_minutes` minutos, 10 por defecto) y quedan en auditoría:** `vault.secret.reveal`, `inventory.server.execute`, `billing.refund.authorize` (docs/00, sección 5) y, por docs/00 §26, `complaints.complaint.delete` (marcar como prueba y eliminar hojas de prueba), `web_connector.site_token.create` (emitir el token del plugin) e `identity.security_policy.update` (lista `mfa_recent` de `roles.json`). Un dispositivo de confianza nunca reemplaza el MFA reciente.
- Revelar exige además una concesión vigente sobre ese secreto y respeta el límite de revelaciones por hora (por defecto 10; superarlo bloquea y alerta) (docs/00, secciones 8 y 23).
- Segundo factor por aplicación TOTP o por código al correo, obligatorio u opcional según la política administrable: por rol (`security.mfa.required_by_role`, gana) o por tipo de usuario (`security.mfa.required_for_staff`, por defecto obligatorio; `security.mfa.required_for_customers`, por defecto opcional y recomendado); el rol `admin` siempre lo exige (docs/00 §8 y §26). Los clientes no tienen acciones que exijan MFA reciente.
- Si la MFA no es reciente, la API responde un problema RFC 9457 con `code` estable (por ejemplo `mfa_required`) y el frontend abre `ConfirmDialog` para pedir el código y reintentar.

## 8. Pruebas obligatorias

- Matriz generada: cada endpoint contra cada rol — permitido o 403 (404 en el portal para filas ajenas) (docs/00, sección 11).
- Cambiar el identificador en la URL del portal no devuelve datos de otro cliente.
- Un pago reportado no reactiva el servicio hasta ser validado; quien lo registró no puede validarlo.
- Las acciones con MFA reciente (`vault.secret.reveal`, `inventory.server.execute`, `billing.refund.authorize`, `complaints.complaint.delete`, `web_connector.site_token.create`, `identity.security_policy.update`) fallan sin MFA y funcionan dentro de la ventana.
- Los roles del sistema no se pueden borrar ni cambiar de código; un rol copiado tiene los mismos permisos que el original; un rol personalizado de cliente rechaza permisos fuera de `portal.*`.
- Serialización del portal sin los campos de la sección 6 (incluidos el informe de respaldos, las solicitudes de restauración, la compra en línea y las fuentes del asistente).
- El asistente del portal no devuelve datos de otro cliente aunque el mensaje pida un identificador ajeno.
- `sales` no registra sitios WordPress, no ve ni crea tokens del plugin y no configura el asistente; `sales` no aprueba compras atípicas; `sales` recibe 403 al crear un tipo de servicio personalizado.
- `sales` crea y edita un borrador de tema pero recibe 403 al publicarlo o revertirlo; `sales` edita fichas de catálogo pero recibe 403 al cambiar precios; `sales` edita formularios, contacto y documentos legales.
- El catálogo público y el portal no devuelven paquete de WHM, nodo preferido, proveedor ni plan de origen.
- Solo `admin` cambia la política de seguridad y los roles; cualquier otro rol recibe 403 en `/admin/security-policy` y `/admin/roles`.
- `documentation` responde una hoja del Libro de Reclamaciones pero recibe 403 al marcarla como prueba o eliminarla; `sales` y `finance` reciben 403 en `/admin/complaints`; `support` solo la ve.
- Ninguna respuesta del portal ni del panel incluye scripts de marketing; ninguna respuesta de `/public/wp` incluye costos, proveedor ni datos de otra marca.
- `finance` recibe 403 en `/admin/kpi-values/commercial` y `sales` en `/admin/kpi-values/finance`; `support` ve Soporte, Operación y Reclamos; la exportación de indicadores solo incluye los grupos del rol; solo `admin` crea o cambia metas (`/admin/kpi-targets`).
- `sales` usa el editor y ve el historial pero recibe 403 al restaurar una versión; `documentation` restaura una versión de una cláusula; nadie restaura una versión de un registro que no puede editar.
- `GET /public/wp/whois` no acepta tokens de otra marca ni funciona sin token de sitio; `/admin/whois-lookups` lo ven `admin`, `support` y `documentation` (lectura); `sales` y `finance` reciben 403.

## Nombres usados fuera del contrato

- Permisos nuevos (todos existen como `x-permission` en `api/openapi.yaml` y por eso en `permissions.json`): `inventory.hosting_account.login` (soporte entra a cPanel), `billing.invoice.void`, `work.task.approve`, las exportaciones por recurso `<modulo>.<entidad>.export` (`POST /admin/<recurso>/exports`) y el espacio `portal.*` completo.
- Permisos de tablas agregadas, con el formato del contrato: `billing.payment_dispute.view`, `billing.payment_dispute.create`, `billing.payment_dispute.update` (contracargos de pagos con tarjeta; `finance` los recibe por `billing.*` y `external_accountant` el de ver por `billing.*.view`).
- Permisos derivados de tablas del contrato, con el formato del contrato (todos existen en el OpenAPI): `billing.payment_promise.*`, `billing.payment_method.*`, `cloud.cloud_budget.view`, `customers.communication_consent.*`, `monitoring.maintenance_window.view`, `orders.provisioning_run.*`, `service_map.client_project.view`, `service_map.project_component.view`, `services.service_resource.*`, `vault.one_time_link.create`, `work.change_request.create`, `work.time_entry.create`.
- Claves de permiso nuevas de docs/00 §25: `assistant` (AIA) y `complaints` (LRC); permisos `orders.cart.view`, `orders.checkout_session.*`, `monitoring.restore_request.*`, `monitoring.backup_tool_account.*`, `monitoring.dr_test.*` y `portal.order.*`, `portal.restore_request.*`, `portal.backup_report.view`, `portal.assistant_conversation.*`; temas por marca `cms.theme.*`, CSS propio `cms.custom_css.*`, URLs 404 `cms.not_found_hit.*`, Search Console `cms.search_console_stat.view`, fuentes WordPress `cms.wordpress_source.*`, textos legales `cms.legal_document.*`, `cms.legal_acceptance.view`, `cms.cookie_consent.view`, scripts `cms.marketing_script.*`, la clave `complaints` (LRC: `complaints.complaint.*`, `complaints.complaint_response.create`, `complaints.privacy_request.*`), `portal.legal_document.view`, `portal.legal_acceptance.create` y administración de paquetes `catalog.product_listing.*`, `catalog.hosting_package_spec.*`, `catalog.vps_plan_spec.*`, `catalog.domain_extension.*`.
- Por docs/00 §26: clave `web_connector` (WCN), que reemplaza a `cms` (WEB) y sus permisos `cms.*`; `brands.theme.*` (antes `cms.theme.*`); `catalog.service_type.*`, `services.service_field_value.*`, `identity.security_policy.*`, `identity.trusted_device.*`, `helpdesk.ticket_link.view` y `complaints.complaint.delete`. El catálogo quedó en 621 permisos con §26.
- Por docs/00 §27: `dashboard.kpi.view`, `dashboard.kpi.update`, `dashboard.kpi.export`, los ocho permisos de valores por grupo (`dashboard.kpi_commercial.view` … `dashboard.kpi_web.view`), `dashboard.kpi_target.*`, `automation.rich_text.*` (no es tabla), `automation.rich_text_version.*` y `domains.whois_lookup.view`; restricción `kpi_groups` en `roles.json`. El catálogo queda en 641 permisos.
- Claves de `roles.json`: `scope` (`organization`, `assigned`, `own_created`, `customer`), `deny`, `restrictions`, `grantable_by_customer_admin`, `mfa_recent`.
- Ajuste: `security.sensitive_action_mfa_max_age_minutes` (lo cita `roles.json` en `mfa_recent.max_age_setting_key`). Código de problema: `mfa_required`.
