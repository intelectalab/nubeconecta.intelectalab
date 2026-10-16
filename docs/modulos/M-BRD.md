# M-BRD · Brands (marcas, entidad emisora, cuentas bancarias y series)

> Módulo de código `app/Modules/Brands` · clave de permiso `brands` · código `BRD`.
> Fuente: `docs/00-requerimientos.md` secciones 2 (alcance de tenencia), 21, 9, 25 (sistema central y "Apariencia administrable") y 26 (webs en WordPress: los temas solo aplican al portal, el panel y los correos); contrato común de nombres.

## 1. Propósito y bloque

Registra las 4 marcas comerciales con su identidad (logo, colores, dominio, remitente, portal) y la única entidad emisora (un RUC) con sus cuentas bancarias y series de comprobantes. Las marcas cambian la presentación; la entidad emisora fija lo fiscal. Desde docs/00 §25 y §26 también administra el **tema de cada marca** para el portal y el carrito, el panel interno y los correos y comprobantes (tokens de diseño versionados con vista previa, contraste mínimo, historial y reversión); la web pública de cada marca usa su tema de WordPress.

- **Bloque:** A. Cimientos.
- **Depende de:** IDN.
- **Dependen de él:** CUS (marca de origen), CAT, BIL (series, plantillas, cuentas bancarias), AUT (plantillas por marca), PRT (portal por marca), SAL, CTR, MON (portal de estado por marca), WCN (sitios WordPress, datos de contacto y documentos legales por marca), ORD (marca de origen del carrito y la compra en línea), AIA (perfil del asistente por marca).

## 2. Alcance

**Incluye**
- CRUD de marcas: nombre, dominio del portal, remitente de correo, tema (logo, colores) para modo claro y oscuro, idioma por defecto, entidad emisora por defecto.
- Entidad emisora única con datos fiscales (razón social, RUC, dirección fiscal, país, moneda).
- Cuentas bancarias en PEN y USD, incluida la cuenta del Banco de la Nación para detracciones.
- Series de comprobantes por tipo (factura, boleta, nota de crédito, nota de débito) con correlativo bloqueado por transacción.
- Resolución de la marca a partir del dominio con que se entra al portal.
- Marca de origen (docs/00 §25): la web WordPress de cada marca lleva, por los shortcodes del plugin (WCN), al sistema central en alojamientoplus.com con la marca en cada enlace; esa marca queda en el prospecto, el cliente (`customers.origin_brand_id`), el pedido, la factura y define plantillas de correo y comprobante.
- Identidad del sistema central por marca: ajuste `portal.central_identity` (identidad de AlojamientoPlus con la marca de origen en el encabezado, o identidad de la marca dentro del dominio central).
- Temas por marca (`brand_themes`, `brand_theme_versions`): logo, favicon, colores principal, secundario y de acento (claro y oscuro), tipografías de `brands.theme.allowed_fonts`, botones, radios, encabezado y pie; superficies portal y carrito (cuando `portal.central_identity` lo permite), panel interno y correos y comprobantes; vista previa con enlace firmado (`brands.theme.preview_link_minutes`), verificación de contraste mínimo (`brands.theme.min_contrast_ratio`), historial y reversión. La versión publicada se copia como caché en `brands.theme`.
- Datos de la empresa para las webs de la marca (docs/00 §25): razón social, RUC y domicilio de la entidad emisora alimentan el aviso legal, la constancia del Libro de Reclamaciones (LRC) y los datos estructurados de organización; cada marca tiene sus propios documentos legales y datos de contacto (WCN, `legal_documents`, `brand_contact_points`) y su Libro de Reclamaciones con correlativo propio (`complaints.code_prefix`). La política de cookies vive en WordPress.

**No incluye**
- Más de una entidad emisora operativa (el modelo lo admite, pero hoy hay un solo RUC).
- Plantillas de documentos y notificaciones (las guardan AUT, BIL, SAL y CTR por marca).
- Catálogo por marca (CAT filtra por `brand_id`).
- Las webs públicas, sus dominios, su tema y su SSL: viven en WordPress Multisite; el sistema solo registra los sitios conectados (WCN, `wp_sites`). Documentos legales y datos de contacto (WCN) y Libro de Reclamaciones (LRC).

## 3. Entidades

| Tabla | Campos clave | Notas |
|---|---|---|
| `brands` | code, name, portal_domain, email_from_name, email_from, theme (jsonb: logo_file_id, colores claro/oscuro), locale, default_legal_entity_id, status_page_slug | 4 filas iniciales |
| `legal_entities` | legal_name, tax_id (RUC), tax_id_type, country, currency, fiscal_address, einvoice_provider_ref | 1 fila |
| `bank_accounts` | legal_entity_id, bank_name, account_number, cci, currency, account_type (`checking`/`savings`/`detraction`), show_on_invoice | PEN y USD; Banco de la Nación para detracciones |
| `document_series` | legal_entity_id, document_type (`invoice`/`receipt`/`credit_note`/`debit_note`), series, next_number, is_active | Bloqueo de fila al asignar número |
| `brand_themes` | brand_id, name, published_version_id, published_at | Uno por marca |
| `brand_theme_versions` | brand_theme_id, brand_id, version_number, tokens, surfaces (`portal`/`admin`/`email`), logo_file_id, favicon_file_id, status (`draft`/`published`/`archived`), change_note, restored_from_version_id, contrast_min_ratio, contrast_lowest_ratio, contrast_report, contrast_checked_at, preview_token_hash, preview_expires_at, published_at, published_by, archived_at | Una sola `published` por marca |

## 4. Casos de uso y flujos

1. **Configurar las 4 marcas** con identidad, dominio del portal y remitente; todas apuntan a la misma entidad emisora.
2. **Configurar la entidad emisora** con datos fiscales, cuentas bancarias y series.
3. **Asignar número** (interfaz pública usada por BIL): dentro de la transacción de emisión, `SELECT ... FOR UPDATE` sobre la fila de `document_series`, toma `next_number`, incrementa y confirma.
4. **Resolver marca del portal:** la petición al portal trae el host; BRD devuelve la marca y su tema para la SPA. En el sistema central (un solo dominio para todas las marcas) la marca sale del parámetro de marca de origen del enlace, guardado en la sesión, y la identidad la fija `portal.central_identity` de esa marca.
5. **Cambiar el tema de una marca** (ventas prepara, admin publica): borrador vacío o copiado de la versión publicada → editar tokens con vista previa del portal, el carrito, el panel y un correo → "Verificar contraste" mide cada par texto/fondo en modo claro y oscuro contra `brands.theme.min_contrast_ratio` (editar tokens borra la verificación) → el administrador publica: la versión anterior pasa a `archived`, se reescribe `brands.theme` y el portal, el panel y las plantillas de correo renuevan su caché. Volver a una versión anterior crea una copia nueva y la publica con el control vigente; si ya no alcanza el mínimo, queda como borrador (422).

## 5. Reglas de negocio clave

Las 4 marcas usan la misma entidad emisora y comparten numeración por serie, de modo que el RUC tiene una sola numeración correlativa sin saltos ni repeticiones. Una serie con documentos emitidos no se borra ni cambia de tipo; solo se desactiva. Cambiar el tema de una marca no altera documentos ya emitidos (el PDF se genera al emitir y se guarda). Los clientes y servicios guardan su marca de origen; un cliente puede tener servicios de varias marcas. El dominio del portal es único por marca. Toda entrada al sistema central desde una web de marca conserva la marca de origen hasta el prospecto, el cliente, el pedido y la factura (RN-WCN-008). Cada marca tiene un solo tema y una sola versión publicada, solo publicable con contraste verificado; los tokens son declarativos y el tema nunca se aplica a la web pública (RN-BRD-001 a RN-BRD-005).

## 6. Estados

- `brand_theme_versions.status`: `draft`, `published`, `archived` (máquina 26 de `docs/03`). Las series usan `is_active`.

## 7. Permisos

| Código | Rol por defecto |
|---|---|
| `brands.brand.view` | todo el personal |
| `brands.brand.create` / `update` / `delete` | admin |
| `brands.legal_entity.view` / `update` | admin; finance (lectura) |
| `brands.bank_account.view` / `create` / `update` / `delete` | admin; finance (lectura) |
| `brands.document_series.view` / `create` / `update` | admin |
| `brands.theme.view` / `create` / `update` (borradores, contraste, vista previa) | admin, sales |
| `brands.theme.approve` (publicar o revertir el tema) | admin |

`GET /public/brand-themes/{brand}` (tokens publicados para el portal y el carrito) no usa permisos.

## 8. Pantallas

### P-BRD-01 · Marcas
- **Propósito:** listar las marcas y su configuración básica.
- **Rol principal:** admin
- **Columnas:** logo, nombre, dominio del portal, remitente, entidad emisora, idioma por defecto, clientes de origen.
- **Filtros:** búsqueda por nombre.
- **Acciones:** Crear marca → `brands.brand.create`; Editar → `brands.brand.update`.
- **Vacío / error:** vacío con botón crear (solo antes del seeder); error de carga con reintento.

### P-BRD-02 · Detalle de marca
- **Propósito:** editar identidad, tema claro/oscuro, dominio del portal, remitente y página de estado.
- **Rol principal:** admin
- **Campos:** nombre, código, logo, colores (claro y oscuro) con vista previa del portal, dominio del portal, remitente, idioma por defecto, entidad emisora, slug del portal de estado, identidad del sistema central para clientes de esta marca (`portal.central_identity`), tema publicado (enlace a P-BRD-04) y sitios WordPress de la marca (enlace a P-WCN-01).
- **Filtros:** no aplica.
- **Acciones:** Guardar → `brands.brand.update`; Vista previa del portal → `brands.brand.view`.
- **Vacío / error:** 422 si el dominio ya pertenece a otra marca; aviso de contraste insuficiente de colores (WCAG AA).

### P-BRD-03 · Entidad emisora, cuentas y series
- **Propósito:** mantener los datos fiscales del único RUC, sus cuentas bancarias y sus series.
- **Rol principal:** admin
- **Campos:** razón social, RUC, dirección fiscal, moneda; cuentas (banco, número, CCI, moneda, uso, mostrar en comprobante); series (tipo, serie, siguiente número, activa).
- **Filtros:** tipo de documento.
- **Acciones:** Editar datos fiscales → `brands.legal_entity.update`; Agregar cuenta → `brands.bank_account.create`; Editar cuenta → `brands.bank_account.update`; Crear serie → `brands.document_series.create`; Desactivar serie → `brands.document_series.update`.
- **Vacío / error:** advertencia si falta una serie activa por tipo de documento o una cuenta en PEN/USD; 409 al intentar borrar una serie usada.

### P-BRD-04 · Temas por marca
- **Propósito:** ver el tema publicado de cada marca y su historial.
- **Rol principal:** admin
- **Columnas:** marca, versión publicada, publicada por y cuándo, superficies, peor contraste medido, borradores abiertos; historial con versión, estado, nota de cambio y origen de la reversión.
- **Filtros:** marca, estado.
- **Acciones:** Crear tema → `brands.theme.create`; Nuevo borrador → `brands.theme.update`; Volver a esta versión → `brands.theme.approve`; Descartar borrador → `brands.theme.update`.
- **Vacío / error:** marca sin tema → usa el tema por defecto del sistema y lo indica; revertir a una versión que ya no alcanza el contraste mínimo → 422 y queda como borrador.

### P-BRD-05 · Editor de tema con vista previa
- **Propósito:** cambiar la apariencia del portal, el panel y los correos de una marca sin programar.
- **Rol principal:** sales
- **Campos:** logo, favicon, colores principal, secundario y de acento (claro y oscuro), tipografía de la lista permitida, estilo de botones y bordes, encabezado y pie; superficies; vista previa en vivo del portal, el carrito, el panel y un correo; informe de contraste por par texto/fondo.
- **Filtros:** modo claro u oscuro; superficie.
- **Acciones:** Guardar borrador → `brands.theme.update`; Verificar contraste → `brands.theme.update`; Enlace de vista previa → `brands.theme.view`; Publicar → `brands.theme.approve`.
- **Vacío / error:** par bajo el mínimo marcado en rojo y "Publicar" deshabilitado con el motivo; tipografía fuera de la lista o `url(` en los tokens → 422.

## 9. Eventos y jobs

- **Emite:** `BrandUpdated`, `DocumentSeriesChanged`, `BrandThemeCreated`, `BrandThemeVersionDrafted`, `BrandThemeVersionPublished`, `BrandThemeVersionReverted`, `BrandThemeVersionArchived` (el portal, el panel y las plantillas de AUT escuchan la publicación para renovar su caché).
- **Escucha:** ninguno.
- **Jobs:** ninguno.

## 10. Integraciones y conectores

- Ninguna directa. `einvoice_provider_ref` guarda la referencia de la entidad en el proveedor de facturación electrónica (BIL).

## 11. Ajustes administrables

- Propios: `brands.theme.min_contrast_ratio`, `brands.theme.allowed_fonts`, `brands.theme.preview_link_minutes`.
- Es además un **nivel** de ajustes (`scope_type = brand`) para otros módulos; en particular `portal.central_identity`, `web_connector.cache_ttl_seconds`, `web_connector.kb_url`, `web_connector.forms.captcha_required`, `orders.online.enabled`, `assistant.enabled`, `assistant.model`, `assistant.instructions` y `complaints.code_prefix` se ajustan por marca.

## 12. Historias del backlog

- Gestión de marcas comerciales
- Entidad emisora única y series
- Cuatro marcas bajo un RUC
- Portal personalizado por marca
- Identidad del sistema central por marca
- Enlaces al sistema central con marca de origen
- Políticas de reembolsos, SLA, uso aceptable y aviso legal
- Libro de Reclamaciones virtual por marca
- Datos de contacto por marca

Épica "Apariencia del portal, panel y correos":
- Tokens de diseño por marca
- Vista previa y verificación de contraste del tema
- Publicación, historial y reversión del tema
- Tema aplicado al portal, carrito, panel y correos

## 13. Criterios de terminado y pruebas obligatorias

- Seeder crea 4 marcas y una entidad emisora; las 4 apuntan a ella.
- Dos asignaciones de número concurrentes sobre la misma serie no repiten número (prueba con PostgreSQL real y dos conexiones).
- El portal resuelve la marca por dominio y aplica su tema en modo claro y oscuro.
- Borrar una serie con documentos responde 409.
- Un cliente que entra al sistema central desde la web de otra marca ve la identidad configurada para esa marca y la marca de origen queda en su registro.
- El aviso legal y la constancia del Libro de Reclamaciones de cada marca muestran la razón social y el RUC de la entidad emisora.
- Un segundo tema para la misma marca y una segunda versión publicada a la vez → rechazados; publicar sin verificación de contraste o con un par bajo el mínimo → rechazado; una superficie `website` → rechazada; `sales` recibe 403 al publicar o revertir.
- Revertir crea una versión nueva y deja una sola publicada; el portal (con `origin_brand`), el panel y los correos muestran los tokens nuevos tras publicar, sin redeploy.
- Tokens con CSS, `url(` o fuentes fuera de la lista → 422; el enlace de vista previa vencido → 404 y nunca se indexa.

## 14. Preguntas abiertas

- Las series exactas dependen del proveedor de facturación electrónica que se elija (pregunta abierta de M-BIL).
- Identidad visual del sistema central para clientes de otras marcas (`docs/11`, D-20).
- Valor definitivo del contraste mínimo y lista de tipografías con licencia web (`docs/11`, T-24).

## Anexo: nombres fuera del contrato

- Tablas `brand_themes` y `brand_theme_versions` (docs/00 §25), pasadas del antiguo módulo WEB a BRD con docs/00 §26, y permiso `brands.theme.*`; endpoints `/admin/brand-themes/...` y `GET /public/brand-themes/{brand}`.
