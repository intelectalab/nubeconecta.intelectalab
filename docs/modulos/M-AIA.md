# M-AIA · Assistant (asistente con IA)

> Módulo de código `app/Modules/Assistant` · clave de permiso `assistant` · código `AIA`.
> Fuente: `docs/00-requerimientos.md` sección 25 (apartado "Asistente con IA (Claude)"), sección 24 (CRM y WhatsApp) y sección 8 (seguridad); contrato común de nombres.

## 1. Propósito y bloque

Un asistente automático, basado en la API de Claude de Anthropic, atiende en la web de cada marca y en el portal del cliente: recomienda planes, consulta la disponibilidad de dominios, crea prospectos o tickets y deriva a una persona o a WhatsApp. En la web de la marca (WordPress) se inserta con el shortcode `[hub_asistente]` del plugin Hub Connector y habla directo con el sistema central. Sabe lo que dicen los artículos públicos de la base de conocimientos del sistema, el catálogo de la marca y sus datos de contacto y documentos legales vigentes; en el portal, además, los servicios del propio cliente en solo lectura. Nunca ve datos de otros clientes, facturas ajenas ni accesos, y nunca ejecuta acciones sobre servicios. Cada conversación queda registrada y enlazada.

- **Bloque:** D. Ventas (después de WCN, SAL y HLP).
- **Depende de:** BRD (marca), WCN (sitio WordPress de origen, datos de contacto y documentos legales; el widget se inserta con `[hub_asistente]`), CAT (catálogo), DOM (disponibilidad por `RegistrarConnector`), SAL (prospectos, reglas de asignación, WhatsApp), HLP (artículos públicos y tickets), SRV y MAP (servicios del cliente en el portal, solo lectura), CFG (ajustes), PRV y VLT (cuenta y clave de la API de Claude), AUT (auditoría).
- **Dependen de él:** PRT (asistente en el portal), WCN y el plugin Hub Connector (widget en la web), DSH (consumo).

## 2. Alcance

**Incluye**
- Perfil del asistente por marca y canal (web o portal): nombre visible, saludo por idioma que lo presenta como asistente automático, instrucciones por idioma (ajuste `assistant.instructions` de la marca), herramientas habilitadas, fuentes de conocimiento y número de WhatsApp para derivar.
- Modelo de Claude por marca (`assistant.model`) y topes administrables: mensajes por conversación, tokens por respuesta, tope mensual de tokens por marca y mensajes por IP y hora en la web.
- Herramientas: `recommend_plan` (catálogo de la marca con precio vigente), `check_domain` (disponibilidad y precio), `create_lead` (prospecto con canal `assistant`), `create_ticket` (ticket con canal `assistant`), `handoff` (persona o WhatsApp).
- Recuperación de contexto solo desde fuentes permitidas: `kb_articles` públicos y publicados de la marca, catálogo de la marca, sus datos de contacto y documentos legales vigentes (`brand_info`) y, en el portal, servicios del cliente con la misma clase de recurso del portal (sin costos, proveedor, notas internas ni accesos).
- Registro de cada mensaje y llamada a herramienta en `ai_messages` (solo inserción) y del consumo mensual en `ai_usage`.
- Enlace de la conversación al prospecto, cliente o ticket que generó; consulta desde el panel.
- Prueba en seco del perfil con herramientas simuladas.

**No incluye**
- Acciones sobre servicios (suspender, reiniciar, cambiar DNS, restaurar), pagos o cambios de datos del cliente: el asistente orienta y abre un ticket.
- Lectura de facturas, pagos, contratos o accesos (bóveda), ni datos de otros clientes.
- Entrenamiento o ajuste de modelos con datos de clientes.
- Respuestas por voz o en WhatsApp (la conversación de WhatsApp sigue en SAL con personas).

## 3. Entidades

| Tabla | Campos clave | Notas |
|---|---|---|
| `ai_assistant_profiles` | brand_id, channel (`website`/`portal`), display_name, instructions, greeting, enabled_tools, knowledge_sources, handoff_whatsapp_number_id, is_active | Uno por marca y canal |
| `ai_conversations` | ai_assistant_profile_id, brand_id, channel (`website`/`portal`), wp_site_id, visitor_token_hash, customer_id, user_id, lead_id, ticket_id, whatsapp_conversation_id, locale, model, status (`active`/`handed_off`/`limit_reached`/`closed`), handoff_channel (`agent`/`whatsapp`), messages_count, input_tokens, output_tokens, started_at, last_message_at | Enlazada a prospecto, cliente o ticket |
| `ai_messages` | ai_conversation_id, role (`user`/`assistant`/`tool`), content, tool_name, tool_input, tool_result, input_tokens, output_tokens, injection_flagged | Solo inserción |
| `ai_usage` | brand_id, period_month, conversations_count, messages_count, input_tokens, output_tokens, cost_minor, cost_currency, limit_reached_at | Una fila por marca y mes |

## 4. Casos de uso y flujos

1. **Configurar** (admin): crear el perfil de la marca para la web y para el portal, elegir herramientas y fuentes, número de WhatsApp; definir `assistant.model`, `assistant.instructions` y `assistant.monthly_token_limit` de la marca; probar en seco; activar (`assistant.enabled` y `is_active`).
2. **Conversación en la web:** el visitante abre el widget que el plugin inserta con `[hub_asistente posicion="…"]` (el navegador habla directo con `/public/assistant/...`, nunca a través de WordPress) → se crea la conversación con token de visitante (captcha si el límite por IP lo pide) → el asistente se presenta como automático y ofrece hablar con una persona.
3. **Responder:** el backend arma el contexto con las fuentes permitidas (búsqueda en artículos, páginas y catálogo de la marca), envía a la API de Claude las instrucciones del perfil, el contexto delimitado como datos y el historial, y ejecuta solo las herramientas habilitadas, validando cada parámetro en el servidor.
4. **Recomendar plan / consultar dominio:** resultados con precio vigente de la marca y moneda y enlace "Contratar" al carrito (ORD).
5. **Crear prospecto:** con nombre y correo o teléfono que da el visitante; canal `assistant`, marca, página y conversación enlazada; reglas de asignación de SAL; consentimiento comercial solo si el visitante lo marca.
6. **Derivar:** `agent` crea o actualiza el prospecto (web) o el ticket (portal) con la conversación adjunta; `whatsapp` devuelve el enlace al número de la marca y enlaza la conversación de WhatsApp cuando llega.
7. **Portal:** el cliente conversa con el asistente de su marca; puede preguntar por sus servicios (estado, vencimientos, plan, consumo publicado) en solo lectura; para cualquier acción, el asistente abre un ticket.
8. **Topes:** al llegar a `assistant.max_messages_per_conversation` la conversación pasa a `limit_reached` y ofrece contacto humano; al llegar al tope mensual de la marca el widget muestra solo las opciones de contacto hasta el mes siguiente y se avisa al administrador.
9. **Registro y consulta:** el panel lista conversaciones por marca, canal, estado y resultado; desde el detalle se enlaza a prospecto, cliente o ticket.
10. **Cierre:** el job `CloseIdleAiConversations` cierra conversaciones inactivas; la retención (`assistant.conversation_retention_days`) anonimiza el contenido al vencer.

## 5. Reglas de negocio clave

RN-AIA-001 a RN-AIA-011 (`docs/04`). El contenido de las páginas de WordPress no es fuente del asistente; la conversación registra el sitio WordPress de origen (RN-AIA-011). Se presenta siempre como asistente automático y ofrece hablar con una persona. Solo usa fuentes permitidas de su marca; en la web nunca lee servicios de clientes (`CHECK` del perfil). En el portal solo lee servicios del cliente de la sesión con la clase de recurso del portal. Las herramientas se validan en el servidor; ninguna ejecuta acciones sobre servicios ni lee facturas, accesos o datos de otros clientes. Los topes por conversación y mensual se aplican antes de llamar a la API. Cada mensaje queda registrado sin poder editarse. El contenido de usuario y de las fuentes se trata como dato, nunca como instrucción (`docs/10`, sección 11).

## 6. Estados

- `ai_conversations.status`: `active`, `handed_off`, `limit_reached`, `closed` (máquina 25 de `docs/03`).

## 7. Permisos

| Código | Rol por defecto |
|---|---|
| `assistant.profile.view` / `create` / `update` | admin |
| `assistant.conversation.view` | admin, sales, support |
| `assistant.conversation.update` (enlazar, cerrar) | admin, sales, support |
| `assistant.usage.view` | admin, sales |
| `portal.assistant_conversation.view` / `create` | customer_admin, customer_user |

La web pública no usa permisos: el acceso se limita por token de visitante, captcha y límite por IP.

## 8. Pantallas

### P-AIA-01 · Perfiles del asistente
- **Propósito:** ver el estado del asistente en cada marca y canal.
- **Rol principal:** admin
- **Columnas:** marca, canal, nombre visible, activo, modelo (ajuste resuelto), herramientas, consumo del mes frente al tope.
- **Filtros:** marca, canal, activo.
- **Acciones:** Crear perfil → `assistant.profile.create`; Activar o desactivar → `assistant.profile.update`.
- **Vacío / error:** "El asistente no está configurado"; "Activar" deshabilitado con motivo si falta `assistant.model` o `assistant.instructions` de la marca.

### P-AIA-02 · Editor del perfil y prueba
- **Propósito:** configurar el perfil y probarlo antes de activarlo.
- **Rol principal:** admin
- **Campos:** nombre visible, saludo por idioma (con aviso de asistente automático), instrucciones de la marca (solo lectura, enlace al ajuste), herramientas, fuentes, número de WhatsApp, panel de prueba con herramientas simuladas.
- **Filtros:** no aplica.
- **Acciones:** Guardar → `assistant.profile.update`; Probar en seco → `assistant.profile.update`.
- **Vacío / error:** fuente `customer_services` en un perfil web → 422; saludo sin el aviso de asistente automático → 422.

### P-AIA-03 · Conversaciones
- **Propósito:** revisar lo que conversa el asistente y su resultado.
- **Rol principal:** sales
- **Columnas:** fecha, marca, canal, visitante o cliente, estado, mensajes, resultado (prospecto, ticket, derivación), intento de inyección detectado.
- **Filtros:** marca, canal, estado, con prospecto o ticket, con alerta de inyección, rango de fechas.
- **Acciones:** Abrir detalle → `assistant.conversation.view`.
- **Vacío / error:** "Sin conversaciones en el periodo"; error de carga con reintento.

### P-AIA-04 · Detalle de conversación
- **Propósito:** leer la conversación completa y enlazarla.
- **Rol principal:** sales
- **Campos:** mensajes con hora, llamadas a herramientas con su resultado resumido, consumo, modelo, enlaces a prospecto, cliente, ticket y WhatsApp.
- **Filtros:** no aplica.
- **Acciones:** Enlazar a prospecto, cliente o ticket → `assistant.conversation.update`; Cerrar → `assistant.conversation.update`; Crear ticket desde la conversación → `helpdesk.ticket.create`.
- **Vacío / error:** contenido anonimizado por retención mostrado como tal.

### P-AIA-05 · Consumo del asistente
- **Propósito:** controlar el gasto frente al tope mensual por marca.
- **Rol principal:** admin
- **Columnas:** marca, mes, conversaciones, mensajes, tokens de entrada y salida, costo estimado, tope, fecha en que se alcanzó.
- **Filtros:** marca, rango de meses.
- **Acciones:** Abrir ajuste del tope → `settings.setting.update`.
- **Vacío / error:** "Sin consumo registrado"; tope sin definir resaltado como pendiente.

### P-AIA-06 · Asistente en la web de la marca
- **Propósito:** atender a visitantes de la web WordPress de la marca (shortcode `[hub_asistente]`).
- **Rol principal:** público
- **Campos:** aviso de asistente automático, conversación, tarjetas de plan y de dominio con "Contratar", botones "Hablar con una persona" y "WhatsApp", formulario corto de contacto para derivar.
- **Filtros:** no aplica.
- **Acciones:** Enviar mensaje → público; Hablar con una persona → público; Ir a WhatsApp → público.
- **Vacío / error:** asistente apagado o tope mensual alcanzado → solo opciones de contacto; límite por IP → captcha o espera.

### P-AIA-07 · Asistente en el portal
- **Propósito:** resolver dudas del cliente sobre sus servicios y orientar.
- **Rol principal:** customer_user
- **Campos:** conversación, servicio sobre el que pregunta (opcional), resultados con enlaces a la pantalla correspondiente del portal, botón para pasar a soporte, conversaciones anteriores.
- **Filtros:** no aplica.
- **Acciones:** Enviar mensaje → `portal.assistant_conversation.create`; Pasar a soporte (crea ticket) → `portal.assistant_conversation.create`; Ver conversaciones anteriores → `portal.assistant_conversation.view`.
- **Vacío / error:** tope alcanzado → ofrece abrir ticket; el asistente nunca muestra datos que el cliente no ve en el portal.

## 9. Eventos y jobs

- **Emite:** `AiConversationStarted`, `AiConversationHandedOff`, `AiConversationLimitReached`, `AiConversationClosed`; usa `LeadCreated` (SAL) y `TicketCreated` (HLP) al ejecutar herramientas.
- **Escucha:** publicación de artículos públicos (HLP), `LegalDocumentVersionPublished` y cambios de datos de contacto (WCN) y cambios de precio del catálogo (CAT), para reindexar fuentes.
- **Jobs:** `CloseIdleAiConversations` (cada hora); `RefreshAssistantSources` (al publicar y diario); `AggregateAiUsage` (al cerrar cada respuesta, con bloqueo por marca y mes); `PurgeAiConversations` (diario, según retención).

## 10. Integraciones y conectores

- **API de Claude (Anthropic)** mediante `AiAssistantConnector` (`docs/08`, ficha 29): mensajes con uso de herramientas; clave de API en la bóveda (`secrets` `kind = api_token`) enlazada a la cuenta del proveedor `providers.type = ai`. Modelos, límites de tasa, retención de datos del proveedor y precios: **NO VERIFICADO** hasta configurar la cuenta.
- `RegistrarConnector::checkAvailability` (DOM) para `check_domain`.

## 11. Ajustes administrables

- `assistant.enabled`, `assistant.model`, `assistant.instructions`, `assistant.max_messages_per_conversation`, `assistant.max_output_tokens_per_reply`, `assistant.monthly_token_limit`, `assistant.public_messages_per_ip_per_hour`, `assistant.conversation_retention_days`.
- Lee `orders.online.captcha_provider` para el captcha del widget.

## 12. Historias del backlog

- Perfil del asistente por marca
- Asistente en la web de la marca
- Asistente en el portal con los servicios del cliente
- Herramientas del asistente: plan, dominio, prospecto y ticket
- Derivación a una persona o a WhatsApp
- Topes de uso por conversación y mensual
- Registro y enlace de conversaciones
- Protección del asistente contra inyección de instrucciones

## 13. Criterios de terminado y pruebas obligatorias

- El primer mensaje de toda conversación dice que es un asistente automático y ofrece hablar con una persona.
- Prueba de aislamiento: desde el portal del cliente A, pedir datos del cliente B (por nombre, dominio o identificador) no devuelve nada de B; las herramientas reciben el `customer_id` de la sesión, nunca del modelo.
- Batería de inyección de instrucciones (en el mensaje, en un artículo y en un documento legal): el asistente no revela instrucciones ni secretos, no llama herramientas fuera de la lista y no cambia de marca; los intentos quedan con `injection_flagged`.
- Una herramienta con parámetros inválidos o fuera de la marca se rechaza en el servidor.
- Superar el tope por conversación pasa a `limit_reached`; superar el tope mensual apaga el widget hasta el mes siguiente (prueba con el ajuste sobrescrito por marca).
- `ai_messages` no admite `UPDATE` ni `DELETE`.
- Las respuestas del portal no contienen costos, proveedor, notas internas ni accesos (prueba de serialización de las fuentes).

## 14. Preguntas abiertas

- Modelo de Claude, instrucciones por marca y tope de uso del asistente (`docs/11`, D-22).
- Retención de conversaciones (ligada a D-14).
- Servicio de captcha (D-24).

## Anexo: nombres fuera del contrato

- Interfaz `AiAssistantConnector`; jobs `CloseIdleAiConversations`, `RefreshAssistantSources`, `AggregateAiUsage`, `PurgeAiConversations`.
- Valor `assistant` en `lead_channels.kind` y `tickets.channel`.
