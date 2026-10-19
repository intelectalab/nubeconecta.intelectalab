# Plugin WordPress: Hub Connector

Plugin oficial para conectar las páginas web públicas de las marcas (WordPress Multisite) con el sistema central **Hub** (Backend Laravel y Portal React).

## 🚀 Instalación en WordPress
1. Copia la carpeta `plugins/hub-connector` dentro del directorio `wp-content/plugins/` de tu instalación de WordPress.
2. En el panel de administración de WordPress, ve a **Plugins** y haz clic en **Activar** (o "Activar en la red" si es Multisite).
3. Ve a **Ajustes > Hub Connector** e ingresa:
   * **URL de la API Hub:** `http://localhost:8080` (o la URL de producción).
   * **URL del Portal de Clientes:** `http://localhost:3001` (para dirigir al checkout de React).
   * **Token del Sitio:** Token generado en el panel administrativo (`M-WCN`).

## 📌 Shortcodes Disponibles
Puedes pegar estos shortcodes en cualquier página de WordPress o bloque de Gutenberg:

* `[hub_planes tipo="hosting"]`: Muestra la cuadrícula de planes de hosting con precios en tiempo real y botón de contratación directa hacia el portal.
* `[hub_whois]`: Buscador de disponibilidad de dominios (`.pe`, `.com`).
* `[hub_libro_reclamaciones]`: Formulario oficial de Libro de Reclamaciones legal.
* `[hub_contacto]`: Datos de contacto y horario de la marca.
