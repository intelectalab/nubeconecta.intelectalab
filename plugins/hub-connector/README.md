# Plugin WordPress: Hub Connector

Conecta las webs públicas de las marcas (WordPress Multisite) con el sistema central Hub. Contrato completo en `docs/13-plugin-wordpress-hub-connector.md`.

## Instalación
1. Copia `plugins/hub-connector` en `wp-content/plugins/` y actívalo en la red ("Activar en la red").
2. En cada sitio, **Ajustes > Hub Connector**:
   - **URL del sistema (API):** HTTPS obligatorio (HTTP solo si `wp_get_environment_type()` es `local` o `development`). Se añade `/api/v1` si falta.
   - **Marca del sitio:** código de la marca; los avisos de otra marca se rechazan (409).
   - **Clave del sitio:** token de solo lectura creado en el panel (Conector web > Tokens). Después solo se ven sus últimos 4 caracteres.
   - **Secreto de avisos** y **secreto anterior** (solo durante una rotación). No se vuelven a mostrar.
   - Modo de envío de formularios, CSS mínimo y moneda inicial.
3. **Probar conexión** llama a `GET /public/wp/site`, muestra la marca, las monedas, la caché y la URL de invalidación que hay que registrar como `webhook_url` en el panel.

## Seguridad
- El token y los secretos se guardan cifrados en `wp_options` con AES-256-GCM (openssl). La clave se deriva con HKDF de `AUTH_KEY` y `SECURE_AUTH_SALT` de `wp-config.php` más el id del sitio. Si cambian las sales, un aviso pide volver a pegarlos. Los valores que versiones anteriores guardaban en claro se cifran solos.
- Lecturas solo desde el servidor: `Authorization: Bearer <token>`, `X-Hub-Plugin-Version`, `Accept-Language`, `User-Agent`. Tiempo de espera de 5 s (filtro `hub_connector_http_timeout`), sin redirecciones, `sslverify` siempre activo y sin reintentos en la visita.
- Webhook `POST /wp-json/hub-connector/v1/invalidate`: `X-Hub-Signature: t=<ts>,v1=HMAC-SHA256("t.cuerpo")` con el secreto actual o el anterior, ventana de 5 min, `event_id` repetidos descartados, cuerpo de 64 KB como máximo. Respuestas: 200, 400, 401 y 409.
- Toda salida se escapa (`esc_html`, `esc_attr`, `esc_url`) y los atributos se validan contra listas cerradas.

## Caché
- Transient `hubc_<hash>` con `cache_ttl_seconds` de la marca (filtro `hub_connector_cache_ttl`) y última copia con `stale_max_hours`. Se renueva con `If-None-Match`, así que un 304 no vuelve a bajar los datos.
- El webhook borra solo las entradas del alcance (`catalog`, `plan`, `contact`, …, `all`) y conserva la última copia. Después dispara `hub_connector_cache_invalidated` y purga la caché de página (WP Rocket, W3TC, WP Super Cache, LiteSpeed).
- Si el sistema falla (sin respuesta, 5xx, 401, 426 o 429), el sitio sirve la última copia. Un 401 no se reintenta hasta que cambie el token, un 426 hasta que se actualice el plugin, un 429 espera lo que diga `Retry-After` y, sin respuesta o con 5xx, deja de consultar durante 60 s (valor propio, la doc no lo fija). Sin copia, el sitio muestra un aviso amable con el contacto de la marca.
- Un bloqueo con `add_option` evita que varias visitas renueven la misma clave a la vez.

## Shortcodes disponibles
| Shortcode | Atributos |
|---|---|
| `[hub_planes]` | `tipo` (obligatorio; lista de `GET /public/wp/catalog/categories`), `ids`, `destacados` (`si`/`no`), `ciclo` (`mensual`…`trienal`, por defecto `anual`), `moneda` (`PEN`/`USD`), `columnas` (`1`–`4`) |
| `[hub_plan]` | `id` (uuid del plan), `ciclo`, `moneda` |
| `[hub_boton_contratar]` | `plan` (uuid), `ciclo`, `texto` |
| `[hub_contacto]` | `campo` (`telefono`, `correo`, `whatsapp`, `direccion`, `horario`, `todos`), `formato` (`texto`, `enlace`, `boton`, `lista`) |
| `[hub_selector_moneda]` | — (guarda la elección en `localStorage`) |

Sin `moneda`, el sitio pide los precios en todas las monedas de la marca y el selector solo cambia cuál se ve, así la página se puede cachear. Si un atributo es inválido o el sitio no está conectado, el visitante no ve nada y los editores ven un aviso.

Estos shortcodes ya están registrados, pero no pintan nada hasta que el sistema publique sus datos: `hub_comparador`, `hub_paquete`, `hub_dominios`, `hub_buscar_dominio`, `hub_formulario`, `hub_documento_legal`, `hub_libro_reclamaciones`, `hub_asistente`, `hub_estado_servicios`, `hub_promocion`, `hub_whois` y `hub_servidores`.

## Plantillas y estilos
- Para sobreescribir una plantilla, cópiala de `templates/` a `<tema>/hub-connector/<nombre>.php`: `plans`, `plan`, `plan-card`, `buy-button`, `contact`, `currency-switcher`, `unavailable`. También existe el filtro `hub_connector_template_path`.
- El CSS mínimo (`assets/hub-connector.css`) se puede desactivar en cada sitio y usa los tokens `--hub-*`. Si `GET /public/wp/site` entrega `theme.tokens`, se aplican; solo se aceptan colores y medidas válidos.

## Pendiente
- `central_urls.cart` y `quote` (D-19/D-20): hoy el sistema solo entrega `portal`, así que los botones de contratar no se muestran hasta que existan.
- Tokens del tema de marca en `/public/wp/site`.
- Endpoints de los shortcodes pendientes, modo `relay`, `[hub_whois]` con reenvío, bloques de Gutenberg, ajustes de red, renovación en segundo plano con WP-Cron, traducciones `.po`/`.mo` y empaquetado firmado.
