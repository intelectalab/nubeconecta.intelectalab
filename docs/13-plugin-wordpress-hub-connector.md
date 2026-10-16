# 13 — Plugin WordPress "Hub Connector"

Especificación del plugin que muestra en las webs WordPress de las marcas lo que vive en el sistema (docs/00 §26; los shortcodes `[hub_whois]` y `[hub_servidores]`, el formulario del Libro con su hoja de reclamación y el texto enriquecido saneado son de docs/00 §27). Es un entregable aparte del área de desarrollo, con su propio repositorio de código PHP. El lado del sistema (sitios conectados, tokens, webhooks, generador de shortcodes, formularios, contacto y documentos legales) está en `docs/modulos/M-WCN.md`; la API que consume, en `api/openapi.yaml` (`/public/wp/...`, esquema `wpSiteToken`); el webhook de invalidación, en `docs/06-api.md`; la ficha de integración, en `docs/08-integraciones.md` (ficha 33). Las historias son las de las épicas "Plugin WordPress Hub Connector" y "Shortcodes de WHOIS y servidores" del backlog.

Nombres de código, clases, rutas, opciones y claves en inglés; textos visibles en español e inglés.

## 1. Propósito y límites

**Hace:** leer del sistema, con el token de solo lectura de su sitio, el catálogo y los precios, los precios de dominios, paquetes, promociones, datos de contacto, documentos legales, definiciones de formularios, estado de los servicios, planes de VPS y servidores dedicados con complementos, el formulario del Libro de Reclamaciones y la configuración de la marca; reenviar, sin guardar, las búsquedas de dominio y WHOIS del visitante; guardarlos en caché; pintarlos con shortcodes y bloques de Gutenberg equivalentes; renovar la caché al recibir un aviso firmado del sistema; seguir mostrando la última copia si el sistema no responde.

**No hace:**
- No escribe en el sistema, salvo reenviar sin guardar los envíos de formularios y del Libro de Reclamaciones cuando el sitio usa el modo de reenvío (sección 9) y las búsquedas de `[hub_whois]` (siempre por reenvío, sección 9).
- No guarda datos personales en WordPress: ni envíos, ni reclamos, ni conversaciones del asistente, ni la elección de moneda asociada a una persona.
- No genera páginas, menús, metaetiquetas, sitemaps, datos estructurados, aviso de cookies, píxeles ni CSS de la web: eso lo hacen WordPress, su tema y sus plugins (Rank Math o Yoast, el plugin de cookies y el de caché que se elijan; `docs/11`, D-32 y D-33).
- No calcula precios: muestra los que entrega el sistema, que son los mismos del carrito y de la factura (RN-WCN-007). La única operación es la suma del configurador de `[hub_servidores]`, que suma importes entregados por el sistema para el mismo ciclo y moneda, sin redondeos ni impuestos propios; el carrito recalcula y vale el del carrito (RN-WCN-019).
- No contiene el carrito, el pago ni el portal: enlaza al sistema central (`central_urls` de `GET /public/wp/site`).

## 2. Requisitos

| Elemento | Requisito |
|---|---|
| WordPress | Multisite; versión mínima declarada en la cabecera del plugin (`Requires at least`), por confirmar con el hosting de la red (`docs/11`, D-29) |
| PHP | Versión mínima declarada en la cabecera (`Requires PHP`), por confirmar con el hosting (D-29) |
| Extensiones | `openssl` (cifrado de credenciales y HMAC), `json` |
| Salida HTTP | El servidor de WordPress debe poder llamar a la URL del sistema por HTTPS |
| Entrada HTTP | La ruta REST `/wp-json/hub-connector/v1/invalidate` debe ser accesible desde el sistema (sin bloqueo del firewall ni de la caché de página) |
| Dependencias | Ninguna en tiempo de ejecución fuera de WordPress; las de desarrollo (PHPUnit, PHPCS, herramientas de bloques) no se empaquetan |

## 3. Arquitectura

Plugin único, activado **por red** y configurado **por sitio**. Sin tablas propias: usa opciones y transients del sitio (y una opción de red para los valores por defecto).

```
hub-connector/
  hub-connector.php                 cabecera, constantes, autoload, arranque
  uninstall.php                     borra opciones y transients de todos los sitios
  src/
    Plugin.php                      registra servicios y hooks
    Admin/SettingsPage.php          ajustes por sitio (Ajustes > Hub Connector)
    Admin/NetworkSettingsPage.php   valores por defecto de la red
    Admin/Notices.php               avisos al administrador (token revocado, plugin desactualizado, sistema caído)
    Api/HubClient.php               cliente HTTP (wp_remote_get / wp_remote_post), cabeceras, errores
    Api/Endpoints.php               mapa de endpoints de /public/wp
    Cache/CacheStore.php            transients frescos y última copia, índice de claves por alcance
    Cache/PageCachePurger.php       purga de la caché de página de plugins compatibles
    Rest/InvalidateController.php   POST /wp-json/hub-connector/v1/invalidate
    Rest/RelayController.php        reenvío opcional de formularios y reclamos (modo de reenvío)
    Rest/WhoisController.php        reenvío de las búsquedas de [hub_whois] con la IP del visitante (sin guardar nada)
    Security/SecretBox.php          cifrado de token y secreto en opciones
    Security/SignatureVerifier.php  verificación de X-Hub-Signature
    Shortcodes/AbstractShortcode.php  validación de atributos contra listas cerradas
    Shortcodes/<Name>Shortcode.php  un archivo por shortcode (sección 8)
    Blocks/BlockRegistry.php        registra los bloques dinámicos desde block.json
    Render/Templates.php            plantillas sobreescribibles por el tema (hub-connector/<plantilla>.php)
    I18n/TextDomain.php             carga del dominio de texto hub-connector
  blocks/<name>/block.json          un bloque por shortcode
  assets/                           JS y CSS mínimos (selector de moneda, buscador de dominios y WHOIS, configurador de servidores, formularios, asistente)
  languages/                        hub-connector-es_ES.po/.mo, hub-connector-en_US.po/.mo, .pot
  templates/                        plantillas HTML por defecto
  tests/                            PHPUnit (unitarias e integración con la suite de WordPress)
```

Reglas de diseño:
- Cada shortcode es una clase que (1) normaliza y valida sus atributos, (2) pide los datos al `HubClient` a través del `CacheStore`, (3) renderiza una plantilla. El bloque equivalente reutiliza la misma clase (`render_callback`), así shortcode y bloque producen el mismo HTML.
- Las plantillas se pueden sobreescribir desde el tema (`<tema>/hub-connector/plans.php`), de modo que el diseño de la web lo controla el tema de WordPress, no el plugin. Las clases CSS usan el prefijo `hub-` y el CSS del plugin es mínimo y desactivable por sitio.
- Todo hook propio usa el prefijo `hub_connector_` (por ejemplo, el filtro `hub_connector_template_path` y la acción `hub_connector_cache_invalidated`).

## 4. Activación por red y configuración por sitio

- **Activación:** "Activar en la red". Al activarse no llama al sistema; cada sitio queda "sin conectar" hasta que su administrador lo configure. Los shortcodes de un sitio sin conectar no muestran nada al visitante y muestran un aviso solo a quien puede editar (`edit_posts`).
- **Ajustes por sitio** (Ajustes > Hub Connector, capacidad `manage_options` y nonce):

| Opción (`hub_connector_settings`) | Detalle |
|---|---|
| `hub_url` | URL base de la API del sistema (HTTPS obligatorio) |
| `token` | Token de solo lectura del sitio, creado en el panel (P-WCN-02); se guarda cifrado y se muestra solo con sus últimos cuatro caracteres |
| `webhook_secret` | Secreto de firma del sitio, creado en el panel; cifrado, nunca se vuelve a mostrar |
| `previous_webhook_secret` | El secreto anterior durante la rotación (sección 6) |
| `submission_mode` | `direct` (el navegador envía al sistema) o `relay` (el plugin reenvía sin guardar) |
| `load_default_css` | Cargar o no el CSS mínimo del plugin |
| `default_currency` | Moneda inicial de los precios; por defecto, la de la marca |

- **Cifrado de credenciales:** AES-256-GCM con una clave derivada de las sales de `wp-config.php` (`AUTH_KEY` y `SECURE_AUTH_SALT`) y el id del sitio. Si cambian las sales, el plugin pide volver a pegar el token y el secreto.
- **Probar conexión:** llama a `GET /public/wp/site` y muestra la marca, los idiomas, las monedas, la duración de la caché, la versión mínima del plugin, si el asistente y el Libro están activos, y la URL de la ruta de invalidación que debe registrarse en el panel del sistema como `webhook_url`. Después, el administrador del sistema pulsa "Probar webhook" en P-WCN-02 y el plugin debe responder 200 a un aviso `all`.
- **Valores de red** (Ajustes de red > Hub Connector, `manage_network_options`): `hub_url` por defecto y `submission_mode` por defecto; el token y el secreto siempre son por sitio.

## 5. Autenticación y cliente HTTP

- Todas las lecturas van desde el **servidor** de WordPress, nunca desde el navegador, con:
  - `Authorization: Bearer <token del sitio>`
  - `X-Hub-Plugin-Version: <versión del plugin>`
  - `Accept-Language: es` o `en` según el idioma del sitio (y el parámetro `lang` donde la operación lo admite)
  - `User-Agent: HubConnector/<versión>; WordPress/<versión>; <home_url>`
- Tiempo de espera corto (por defecto 5 s, filtrable) y sin reintentos en la petición del visitante: si falla, se usa la última copia (sección 7) y la renovación se reintenta en segundo plano (WP-Cron).
- La marca y el sitio salen del token: el plugin nunca envía ids de marca en las lecturas.

| Uso | Operación | Endpoint |
|---|---|---|
| Configuración del sitio | `wpGetSite` | `GET /public/wp/site` |
| Categorías y tipos | `wpListCatalogCategories` | `GET /public/wp/catalog/categories` |
| Planes de una categoría o tipo | `wpListPlans` | `GET /public/wp/catalog/plans?type=&ids=&featured=&cycle=&currency=&lang=` |
| Un plan | `wpGetPlan` | `GET /public/wp/catalog/plans/{id}` |
| Comparador | `wpComparePlans` | `GET /public/wp/catalog/compare` |
| Paquete | `wpGetBundle` | `GET /public/wp/catalog/bundles/{id}` |
| Precios de dominios | `wpListDomainPrices` | `GET /public/wp/catalog/domain-prices?tlds=&currency=` |
| Promoción | `wpGetPromotion` | `GET /public/wp/promotions/{id}` |
| Contacto | `wpGetContact` | `GET /public/wp/contact?field=` |
| Documento legal vigente | `wpGetLegalDocument` | `GET /public/wp/legal-documents/{kind}` |
| Definición de formulario | `wpGetWebForm` | `GET /public/wp/forms/{code}` |
| Estado de los servicios | `wpGetServiceStatus` | `GET /public/wp/service-status` |
| Planes de VPS y dedicados con complementos | `wpListServerPlans` | `GET /public/wp/servers?type=&ids=&location=&os=&managed=&min_ram_mb=&cycle=&currency=&lang=` |
| Búsqueda de dominio, WHOIS y sugerencias (reenvío, sin caché) | `wpLookupDomain` | `GET /public/wp/whois?domain=&tlds=&suggestions=&whois=&currency=&captcha_token=` con cabecera `X-Hub-Visitor-Ip` |
| Formulario del Libro de Reclamaciones | `wpGetComplaintForm` | `GET /public/wp/complaint-form` |

Respuestas de error y comportamiento:

| Código | Significado | Qué hace el plugin |
|---|---|---|
| 401 | Token revocado, vencido o inválido | Usa la última copia; aviso persistente al administrador del sitio ("el token fue revocado: crea uno nuevo en el panel del sistema"); no reintenta hasta que cambie el token |
| 404 | Plan, paquete, promoción, formulario o documento inexistente o de otra marca | No muestra el bloque; aviso solo a editores con el atributo que falló |
| 422 / 400 | Atributo inválido | No muestra el bloque; aviso solo a editores |
| 426 | Versión del plugin menor que `web_connector.min_plugin_version` | Usa la última copia; aviso al administrador para actualizar |
| 429 | Límite de peticiones | Usa la última copia y respeta `Retry-After` antes de renovar. En `[hub_whois]`: con `code = rate_limited` muestra "Intenta de nuevo en unos minutos"; con `code = captcha_required` muestra el captcha y reintenta con `captcha_token` |
| 5xx o sin respuesta | Sistema caído | Usa la última copia (sección 7) |

## 6. Caché y webhook de invalidación

### Caché

- Cada respuesta se guarda en un **transient del sitio** con la duración `cache_ttl_seconds` que entrega `GET /public/wp/site` (`web_connector.cache_ttl_seconds`, por marca).
- Clave: `hubc_<hash corto de endpoint + parámetros normalizados + idioma>`. Un índice en una opción del sitio relaciona cada clave con su **alcance** e ids, para borrar solo lo afectado.
- Junto a cada transient fresco se guarda su **última copia** (otro transient con duración `stale_max_hours`) para el respaldo de la sección 7.
- La renovación es perezosa (al vencer, en la siguiente visita) y protegida contra estampidas: una sola petición renueva una clave a la vez (bloqueo breve con `add_option`), las demás sirven la copia anterior.
- Los resultados del buscador de dominios y de `[hub_whois]`, del asistente, de los envíos, del Libro y de su hoja de reclamación **no** se guardan en caché. `[hub_servidores]` sí (alcances `catalog` y `plan`) y el formulario del Libro también (alcance `legal_document`, porque cambia con los datos legales de la marca).

### Ruta de invalidación

`POST /wp-json/hub-connector/v1/invalidate` (ruta REST pública del sitio; la autenticación es la firma).

Cuerpo (docs/06): `event_id`, `scope`, `keys`, `brand`, `sent_at`. Cabecera `X-Hub-Signature: t=<marca de tiempo>,v1=<hex>`.

Verificación, en este orden:
1. Leer el **cuerpo crudo** (antes de decodificar el JSON).
2. Calcular `HMAC-SHA256("<t>.<cuerpo crudo>", webhook_secret)` y compararlo con `v1` en tiempo constante (`hash_equals`). Durante una rotación se acepta también `previous_webhook_secret`; el administrador del sitio lo borra al terminar (el sistema deja de firmar con el viejo tras `web_connector.webhook.secret_overlap_minutes`).
3. Rechazar si `|ahora − t|` supera 5 minutos.
4. Descartar si el `event_id` ya se procesó (lista de los últimos `event_id` en un transient de 24 h): responde 200 sin hacer nada.
5. Comprobar que `brand` es la marca del sitio.

Respuestas: 200 procesado o repetido; 401 firma inválida o marca de tiempo vieja (sin tocar la caché); 400 cuerpo inválido; 409 marca distinta.

Qué borra cada alcance:

| `scope` | Entradas que borra |
|---|---|
| `catalog` | Categorías, planes, comparador, paquetes y servidores (todas o las de `keys`, códigos de categoría o tipo) |
| `plan` | El plan de `keys` y toda lista o comparador que lo contenga |
| `bundle` | El paquete de `keys` |
| `domain_prices` | Precios de dominios |
| `promotion` | La promoción de `keys` |
| `contact` | Datos de contacto |
| `legal_document` | El documento de `keys` (tipo e idioma) |
| `form` | La definición del formulario de `keys` |
| `service_status` | Estado de los servicios |
| `all` | Todo, incluida la configuración del sitio |

Después de borrar, el plugin dispara `hub_connector_cache_invalidated` (alcance y claves) y purga la caché de página (sección 12). No renueva en ese momento: la siguiente visita trae el dato nuevo.

## 7. Última copia cuando el sistema no responde

- Si la renovación falla (sin respuesta, 5xx, 401, 426 o 429), el shortcode se pinta con la **última copia** guardada, sin aviso al visitante.
- Pasadas `stale_max_hours` sin renovar, en lugar del bloque se muestra un aviso breve y amable ("No pudimos cargar esta información. Escríbenos o llámanos:") con los datos de contacto de la marca de la última copia de `contact`. Si tampoco hay copia de contacto, el bloque no muestra nada.
- **Nunca** se muestra al visitante un error técnico, un código HTTP, una traza ni la URL del sistema.
- El administrador del sitio ve en Ajustes > Hub Connector la última renovación correcta, el último error y cuántas entradas se están sirviendo desde la última copia.

## 8. Shortcodes

Reglas comunes:
- Los atributos se escriben en español, como en docs/00 §26, y se validan contra **listas cerradas**; un valor fuera de lista hace que el bloque no se muestre y avisa a los editores.
- `ids` acepta ids o códigos separados por coma. `moneda` acepta `PEN` o `USD`; si se omite, se usa la moneda elegida por el visitante con `[hub_selector_moneda]` o la moneda por defecto del sitio.
- `ciclo` acepta `mensual`, `trimestral`, `semestral`, `anual`, `bienal`, `trienal` (se traducen a `monthly`, `quarterly`, `semiannual`, `annual`, `biennial`, `triennial`); si el plan no tiene ese ciclo se muestra el más corto disponible.
- Los botones de contratar enlazan al carrito del sistema central (`central_urls.cart`) con el plan, el ciclo, la marca de origen y el sitio; si `orders.online.enabled` está apagado para ese plan, el sistema entrega en su lugar el enlace "Solicitar cotización".

| Shortcode | Bloque | Atributos (valores y defecto) | Datos |
|---|---|---|---|
| `[hub_planes]` | `hub-connector/planes` | `tipo` (obligatorio: `shortcode_type` de una categoría o tipo personalizado activo; tabla de abajo), `ids` (opcional), `destacados` (`si`/`no`, defecto `no`), `ciclo` (defecto `anual`), `moneda`, `columnas` (`1` a `4`, defecto `3`) | `wpListPlans` |
| `[hub_plan]` | `hub-connector/plan` | `id` (obligatorio), `ciclo`, `moneda` | `wpGetPlan` |
| `[hub_comparador]` | `hub-connector/comparador` | `tipo` (obligatorio), `ids` (opcional), `caracteristicas` (claves separadas por coma; defecto: las que marca el catálogo como comparables) | `wpComparePlans` |
| `[hub_paquete]` | `hub-connector/paquete` | `id` (obligatorio) | `wpGetBundle` |
| `[hub_dominios]` | `hub-connector/dominios` | `extensiones` (por ejemplo `.pe,.com.pe,.com`; defecto: todas las vendibles), `moneda` | `wpListDomainPrices` |
| `[hub_buscar_dominio]` | `hub-connector/buscar-dominio` | `sugeridas` (extensiones separadas por coma; defecto: las de la marca) | El navegador consulta `GET /public/domain-availability` en el sistema (sin token, CORS limitado a los orígenes del sitio); sin caché |
| `[hub_boton_contratar]` | `hub-connector/boton-contratar` | `plan` (obligatorio), `ciclo`, `texto` (defecto "Contratar" / "Order now") | `wpGetPlan` para validar el plan y su enlace |
| `[hub_formulario]` | `hub-connector/formulario` | `id` (obligatorio: código del formulario de la marca) | `wpGetWebForm`; envío en sección 9 |
| `[hub_contacto]` | `hub-connector/contacto` | `campo` (`telefono`, `correo`, `whatsapp`, `direccion`, `horario`, `todos`; defecto `todos`), `formato` (`texto`, `enlace`, `boton`, `lista`; defecto `enlace`) | `wpGetContact` |
| `[hub_documento_legal]` | `hub-connector/documento-legal` | `tipo` (obligatorio: `terminos`, `privacidad`, `reembolsos`, `sla`, `uso-aceptable`, `aviso-legal`), `categoria` (opcional, solo para `terminos`: código de categoría del catálogo) | `wpGetLegalDocument` |
| `[hub_libro_reclamaciones]` | `hub-connector/libro-reclamaciones` | — | Formulario legal; envío a `POST /public/complaints` (sección 9); se muestra solo si `complaints_enabled` |
| `[hub_asistente]` | `hub-connector/asistente` | `posicion` (`flotante-derecha`, `flotante-izquierda`, `en-linea`; defecto `flotante-derecha`) | El navegador conversa con `/public/assistant/conversations` del sistema; se carga solo si `assistant_enabled` |
| `[hub_estado_servicios]` | `hub-connector/estado-servicios` | — | `wpGetServiceStatus` |
| `[hub_promocion]` | `hub-connector/promocion` | `id` (obligatorio) | `wpGetPromotion`; fuera de vigencia no muestra nada |
| `[hub_selector_moneda]` | `hub-connector/selector-moneda` | — | Monedas de `wpGetSite` |
| `[hub_whois]` | `hub-connector/whois` | `extensiones` (por ejemplo `.pe,.com.pe,.com`; defecto: las vendibles destacadas de la marca), `sugerencias` (`si`/`no`, defecto `si`), `mostrar_whois` (`si`/`no`, defecto `si`), `moneda` | El navegador consulta la ruta de reenvío del plugin `/wp-json/hub-connector/v1/whois` (nonce), que llama a `wpLookupDomain` con el token y la IP del visitante; sin caché. Disponibilidad, precio por extensión, sugerencias, WHOIS público y botones Registrar y Transferir al carrito |
| `[hub_servidores]` | `hub-connector/servidores` | `tipo` (`vps`, `dedicado`; defecto ambos), `ids` (opcional), `filtros` (`si`/`no`, defecto `si`), `configurador` (`si`/`no`, defecto `si`), `ciclo` (defecto `mensual`), `moneda` | `wpListServerPlans`; filtros y configurador de complementos con precio en vivo |

Equivalencias de `tipo` con las categorías fijas del catálogo (`product_categories.kind` → `shortcode_type`, sembradas por CAT; el administrador puede crear más):

| Categoría (`kind`) | `tipo` |
|---|---|
| `shared_hosting` | `hosting` |
| `reseller_hosting` | `reseller` |
| `vps` | `vps` |
| `dedicated_server` | `dedicado` |
| `cloud` | `cloud` |
| `ssl` | `ssl` |
| `email` | `correo` |
| `website` | `web` |
| `online_store` | `tienda` |
| `moodle` | `moodle` |
| `license` | `licencia` |
| `support` | `soporte` |
| `custom_development` | `desarrollo` |
| `domain` | (sin `tipo`: se usan `[hub_dominios]` y `[hub_buscar_dominio]`) |
| `custom` y tipos de servicio personalizados | el `shortcode_type` que se definió al crearlos |

La lista cerrada de `tipo` no está escrita en el plugin: es la de `GET /public/wp/catalog/categories`, de modo que **un servicio personalizado nuevo funciona al instante sin cambiar el plugin**.

Detalles de presentación:
- `[hub_planes]` y `[hub_plan]`: nombre, descripción corta, características principales, precio con moneda y ciclo, precio de renovación si difiere, etiqueta de destacado y botón de contratar. Para el selector de moneda, el plugin pide los precios en **todas** las monedas de la marca y las pinta con `data-currency`; el JS solo cambia cuál se ve, así la página es cacheable.
- `[hub_comparador]`: tabla con encabezados de fila y columna (`<th scope>`), desplazable en móvil.
- `[hub_selector_moneda]`: botones PEN/USD; guarda la elección en `localStorage` (sin cookie ni dato personal) y cambia todos los precios de la página.
- `[hub_documento_legal]`: título, versión, fecha de vigencia y texto (HTML saneado con `wp_kses_post`).
- Texto enriquecido (docs/00 §27): los documentos legales, los mensajes de confirmación de formularios y las descripciones de productos y servicios personalizados llegan ya saneados por el sistema (`editor.html.allowed_tags`); el plugin los imprime con `wp_kses_post`, sin interpretar variables ni scripts (RN-WCN-020).
- `[hub_whois]`: caja de búsqueda con botón; por cada extensión, el resultado (disponible, registrado, reservado, no soportado o "no pudimos verificar") con precio de registro, renovación y transferencia en la moneda elegida; sugerencias de nombres y extensiones alternativas; si el dominio está registrado y `mostrar_whois="si"`, sus datos públicos (registrador, fechas de creación y vencimiento, estado y servidores de nombres), **nunca** nombre, correo, teléfono ni dirección del titular; botones "Registrar" y "Transferir" que llevan a `central_urls.cart` con el dominio, la acción (`register` o `transfer`), la marca y el sitio. Cuando el sistema responde `captcha_required`, el bloque muestra el captcha (`captcha.provider` y `captcha.site_key` de `wpGetSite`) y repite la búsqueda con el token. Los resultados se anuncian con `aria-live="polite"`. Límites: `whois.limit_per_visitor_per_hour` y `whois.captcha_after_lookups` de `wpGetSite` para avisar antes de tiempo.
- `[hub_servidores]`: tarjetas o tabla (según el ancho) con CPU (y procesador en dedicados), RAM, disco y tipo, transferencia ("sin límite" si viene vacía), sistemas operativos, ubicación y si es administrado; precio en el ciclo elegido. Con `filtros="si"`, filtros por ubicación, sistema operativo, RAM y administración, con los valores que entrega el sistema. Con `configurador="si"`, al elegir un plan se abre el configurador: ciclo, sistema operativo y complementos (respaldos, licencia cPanel, IP adicional, los obligatorios ya marcados) con el total en vivo, que es la suma de los importes del sistema para ese ciclo y moneda; "Contratar" lleva al carrito con el plan, el ciclo, el sistema operativo y los complementos. El cambio de total se anuncia con `aria-live`. Un plan sin venta en línea muestra "Solicitar cotización".

## 9. Formularios y Libro de Reclamaciones

- `[hub_formulario]` pinta los campos de la definición (texto, área de texto, correo, teléfono, lista, casillas, archivo), la casilla de consentimiento con su texto y el enlace a la política vigente, el captcha (`captcha.provider` y `captcha.site_key` de `wpGetSite`) y un campo trampa oculto `website`.
- `[hub_libro_reclamaciones]` pinta el formulario legal desde la definición de `wpGetComplaintForm` (datos del proveedor: razón social, RUC y dirección; tipo reclamo o queja, datos del consumidor, menor de edad y apoderado, bien contratado, monto, detalle, pedido del consumidor, declaración, plazo de respuesta) y el captcha; al enviarlo a `POST /public/complaints` muestra el número de la hoja que devuelve el sistema, el enlace a la hoja de reclamación (constancia pública `GET /public/complaints/sheets/{token}`, que el sistema también envía al correo) y el aviso de que llegará una copia. Si `enabled` es `false`, muestra "Libro en habilitación" con el correo de contacto.
- **Modo `direct`** (por defecto): el navegador envía al sistema (`POST /public/web-forms/{code}/submissions` con `site_id`, `values`, `file_tokens`, `consent`, `captcha_token`, `page_url`, `utm`; o `POST /public/complaints`), con `Idempotency-Key` generado en el navegador. El sistema exige que el origen esté en `wp_sites.allowed_origins`.
- **`[hub_whois]` siempre por reenvío**: el navegador llama a `GET /wp-json/hub-connector/v1/whois` (con nonce); el plugin agrega el token y la cabecera `X-Hub-Visitor-Ip` con la IP del visitante (según la configuración de proxy de confianza del sitio) y reenvía a `wpLookupDomain` sin guardar nada (ni la IP, ni el dominio, ni la respuesta) ni cachear la respuesta.
- **Modo `relay`**: el navegador envía a `POST /wp-json/hub-connector/v1/relay/form/{code}` o `/relay/complaint` (con nonce de WordPress), y el plugin lo reenvía al sistema en la misma petición, **sin guardar nada** (ni en la base, ni en logs, ni en transients), conservando la `Idempotency-Key`. Los archivos se reenvían en memoria respetando `web_connector.forms.max_file_mb`.
- Validación en el navegador según la definición, para ayudar al visitante; la validación que vale es la del sistema. Los errores 422 se muestran junto a cada campo; 429 muestra "Intenta de nuevo en unos minutos".
- Tras el envío: mensaje de confirmación del formulario o redirección a su `redirect_url`.

## 10. Bloques de Gutenberg

- Un bloque dinámico por shortcode (`hub-connector/<nombre>`, categoría "Hub Connector"), definido en `blocks/<nombre>/block.json` con **los mismos atributos** que su shortcode.
- El bloque se guarda como comentario con atributos (`<!-- wp:hub-connector/planes {"tipo":"hosting","columnas":3} /-->`) y se **renderiza en el servidor** con la misma clase del shortcode; no guarda HTML en el contenido.
- `hub-connector/whois` y `hub-connector/servidores` (docs/00 §27) tienen los atributos de su shortcode: `extensiones` como campo de texto validado contra las extensiones vendibles, `sugerencias` y `mostrar_whois` como `ToggleControl`, `tipo` como `SelectControl` (`vps`, `dedicado`, ambos), `ids` como selector múltiple de planes, `filtros` y `configurador` como `ToggleControl`, `ciclo` y `moneda` como `SelectControl`. En el editor, la vista previa de `hub-connector/whois` muestra un resultado de ejemplo sin consultar al registrador.
- Panel lateral con controles: listas cerradas como `SelectControl` (los valores de `tipo`, formularios, documentos y promociones se cargan del sistema a través de una ruta REST del plugin solo para editores, `GET /wp-json/hub-connector/v1/editor/options`, con capacidad `edit_posts`), números como `RangeControl`, sí/no como `ToggleControl`.
- Vista previa en el editor con `ServerSideRender`.
- El generador del panel del sistema (P-WCN-03) entrega tanto el shortcode como el marcado del bloque, intercambiables.

## 11. Accesibilidad (WCAG 2.1 AA)

- HTML semántico: listas para tarjetas de planes, `<table>` con `<caption>` y `scope` en el comparador, `<label>` asociado a cada campo, `fieldset` y `legend` en casillas.
- Botones reales (`<button>`, `<a>` con texto descriptivo: "Contratar Hosting Básico anual", no solo "Contratar").
- Precios legibles por lectores de pantalla (moneda y ciclo en texto, no solo símbolos).
- Errores de formulario con `aria-invalid`, `aria-describedby` y un resumen enfocable; resultados del buscador de dominios y de `[hub_whois]`, cambios de moneda y del total del configurador de `[hub_servidores]` anunciados con `aria-live="polite"`.
- El configurador de `[hub_servidores]` usa `fieldset` y `legend` por grupo de complementos; la tabla de servidores usa `<th scope>` y se desplaza en móvil.
- Navegación completa con teclado, foco visible y orden lógico; el asistente flotante se abre y cierra con teclado y atrapa el foco mientras está abierto.
- Contraste: el CSS mínimo del plugin cumple 4.5:1 y hereda colores del tema; si el tema los cambia, la responsabilidad del contraste es del tema.
- Enlaces `tel:`, `mailto:` y `https://wa.me/...` con texto accesible en `[hub_contacto]`.

## 12. Idiomas

- Dominio de texto `hub-connector`; todo texto visible con `__()`, `_e()`, `esc_html__()` y `_n()`; textos JS con `wp_set_script_translations`.
- Traducciones incluidas: español (`es_ES`, también para `es_PE`) e inglés (`en_US`); archivo `.pot` para otras.
- El idioma de los datos (nombres de planes, documentos, formularios) lo entrega el sistema según `lang`/`Accept-Language`, tomado del idioma del sitio o del plugin multilingüe que se elija (D-33).
- Formato de montos y fechas según el idioma (`number_format_i18n`, `date_i18n`) con la moneda del precio.

## 13. Seguridad

- **Escape de toda salida** según contexto: `esc_html`, `esc_attr`, `esc_url`, `wp_kses_post` para el texto legal; ningún dato del sistema se imprime sin escapar, aunque venga del propio sistema.
- **Atributos validados** contra listas cerradas y tipos (`absint`, expresiones de código `^[a-z0-9-]+$`).
- **Ajustes** protegidos con capacidad (`manage_options`, `manage_network_options`) y nonce; la ruta del editor exige `edit_posts`; la de reenvío exige nonce y respeta un límite por IP del lado del sistema.
- **Credenciales**: token y secreto cifrados en opciones (sección 4); nunca se envían al navegador, ni aparecen en HTML, JS, logs o respuestas REST; el token solo viaja del servidor de WordPress al sistema por HTTPS con verificación de certificado (`sslverify` siempre activo).
- **Webhook**: firma HMAC en tiempo constante, ventana de 5 minutos, `event_id` repetidos descartados, cuerpo limitado en tamaño.
- **Ningún dato personal en WordPress**: no se guardan envíos, reclamos, conversaciones, búsquedas de dominio ni direcciones IP; el modo `relay` y el reenvío de `[hub_whois]` no escriben nada. La IP del visitante solo viaja al sistema en `X-Hub-Visitor-Ip` para el límite por visitante, que la convierte en un HMAC.
- **WHOIS respetando la privacidad**: el plugin solo pinta los campos que entrega el sistema (`web_connector.whois.public_fields`); nunca consulta WHOIS por su cuenta.
- **Sin scripts de terceros** cargados por el plugin, salvo el del proveedor de captcha en las páginas con formulario o Libro, y su propio JS.
- Se recomienda segundo factor para los administradores de la red (fuera del plugin).

## 14. Compatibilidad con SEO y caché de página

- **Rank Math y Yoast:** el plugin no genera metaetiquetas, títulos, sitemaps ni datos estructurados, ni modifica `wp_head` salvo para encolar su CSS y JS. El contenido de los shortcodes se renderiza en el servidor, así los buscadores y los análisis de contenido del plugin de SEO lo leen.
- **Caché de página:** al procesar un aviso, `PageCachePurger` purga la caché de página con la API de los plugins que estén activos (detectados por función o clase existente): WP Rocket (`rocket_clean_domain`), LiteSpeed Cache (acción `litespeed_purge_all`), W3 Total Cache (`w3tc_flush_all`), WP Super Cache (`wp_cache_clear_cache`) y Cloudflare (acción del plugin oficial); otros se integran con la acción `hub_connector_cache_invalidated`. La lista definitiva depende del plugin de caché elegido (D-33).
- La ruta `/wp-json/hub-connector/v1/*` (incluida `/whois`) se excluye de la caché de página y de la minificación; las páginas con `[hub_whois]` son cacheables porque la búsqueda ocurre en el navegador.
- El JS del plugin es pequeño, diferido y no bloquea el renderizado; el del asistente se carga solo en las páginas con `[hub_asistente]` y al interactuar.

## 15. Pruebas

- **Unitarias (PHPUnit):** validación de atributos de cada shortcode; claves y alcances de caché; verificación de firma (válida, inválida, marca de tiempo vieja, secreto anterior en rotación, `event_id` repetido); cifrado y descifrado de credenciales; mapeo de errores HTTP a comportamiento (sección 5).
- **Integración (suite de WordPress, `WP_UnitTestCase`, en Multisite):** activación por red y configuración por sitio; cada shortcode y su bloque producen el mismo HTML; renovación de caché; última copia con el sistema simulado caído; aviso tras `stale_max_hours`; desinstalación borra opciones y transients de todos los sitios.
- **Extremo a extremo** contra un **sistema simulado** que responde con los ejemplos del OpenAPI: el precio mostrado es el del sistema; `[hub_whois]` con un dominio libre lleva al carrito con `register`, con uno registrado no muestra datos del titular, con `captcha_required` muestra el captcha y reintenta, y no deja rastro en la base de WordPress; el total del configurador de `[hub_servidores]` es igual al del carrito; un tipo de servicio personalizado nuevo aparece sin cambiar el plugin; un aviso firmado invalida solo lo afectado; un token revocado (401) mantiene la última copia y avisa al administrador; un envío de formulario en modo `relay` no deja rastro en la base de WordPress.
- **Estilo y seguridad:** PHPCS con WordPress Coding Standards (incluidas las reglas de escape y validación), PHPStan, y ESLint para el JS de bloques.
- **Accesibilidad:** axe sobre las plantillas por defecto.
- **Matriz:** versiones mínima y última de WordPress y PHP declaradas en la cabecera.

## 16. Empaquetado y actualizaciones

- Versionado semántico; `X-Hub-Plugin-Version` lleva esa versión y el sistema exige `web_connector.min_plugin_version`.
- El paquete `hub-connector-<versión>.zip` se genera en CI sin dependencias de desarrollo, con `.pot` actualizado, y se firma (suma SHA-256 y firma del paquete publicadas junto al zip).
- Actualización desde un **repositorio privado**: el plugin consulta un manifiesto de versión (filtro `pre_set_site_transient_update_plugins`) y muestra el aviso estándar de actualización en el panel de red; la descarga verifica la firma antes de instalar.
- Registro de cambios en el paquete; las versiones que cambian el contrato con el sistema suben la versión mayor y se coordinan con `web_connector.min_plugin_version`.
- Desinstalar (`uninstall.php`) borra las opciones y transients de todos los sitios; desactivar no borra nada.

## 17. Preguntas abiertas

- Hosting y estructura del WordPress Multisite, versiones de WordPress y PHP (`docs/11`, D-29).
- Tema y constructor de páginas y su compatibilidad con bloques (D-32).
- Plugins de SEO, de cookies, de caché o CDN y multilingüe que se usarán (D-33).
- Proveedor de captcha (D-24).
- Qué registradores permiten disponibilidad, WHOIS o RDAP y sugerencias por API para mostrarlos en una web pública (`docs/08`, NO VERIFICADO; D-35).
- Proxy de confianza del hosting de WordPress para leer la IP real del visitante (`X-Forwarded-For`), necesario para el límite de `[hub_whois]` (D-29).
- Repositorio privado y firma de paquetes para las actualizaciones del plugin.

## Anexo: nombres fuera del contrato

Nombres propios del plugin, que no son tablas ni permisos del sistema: opción `hub_connector_settings`, prefijos de transient `hubc_`, rutas REST `/wp-json/hub-connector/v1/invalidate`, `/wp-json/hub-connector/v1/relay/form/{code}`, `/wp-json/hub-connector/v1/relay/complaint`, `/wp-json/hub-connector/v1/whois` y `/wp-json/hub-connector/v1/editor/options`, cabecera `X-Hub-Visitor-Ip`, bloques `hub-connector/<nombre>`, dominio de texto `hub-connector`, hooks `hub_connector_*` y clases de la sección 3.
