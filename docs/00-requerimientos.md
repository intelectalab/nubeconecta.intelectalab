# Kit de desarrollo — Plataforma de gestión de hosting, cloud y dominios

> Documento maestro de requerimientos, exportado del documento de trabajo. Los nombres técnicos definitivos están en `docs/01-contrato-de-nombres.md`, `database/schema.sql` y `api/openapi.yaml`; si algo difiere, mandan esos archivos.

Oct 7, 2026 · @GSCREATIVAS

## Solicitud al área de desarrollo

Se solicita construir a medida una plataforma interna que centralice los servicios tecnológicos de cada cliente, conectada por API a los proveedores, con un panel donde el cliente ve sus servicios bajo nuestra marca.

### Problema que resuelve

- Los servicios de un cliente están repartidos entre varios proveedores y nadie tiene el mapa completo. Ejemplo real: un sitio de turismo con sistema a medida y WordPress, VPS en Contabo, CDN en Bunny.net, DNS en AWS Route 53, correo en una cuenta cPanel y envíos masivos en Elastic Email.
- Clientes, dominios, renovaciones, costos y pagos se controlan en Excel y en los paneles de cada proveedor.
- Soporte pierde tiempo ubicando dónde está cada pieza antes de atender un mantenimiento o una emergencia.
- El cliente no sabe qué tiene contratado ni cuánto consume.

### Qué debe lograr

1. **Mapa de servicios por cliente:** cada proyecto del cliente con todos sus componentes, proveedor, cuenta y dependencias.
2. **Conexión por API con los proveedores** para leer estado, consumo y vencimientos, y ejecutar las operaciones que cada API permita.
3. **Panel del cliente con nuestra marca:** servicios contratados, consumo de espacio, características básicas, vencimientos, facturas y tickets.
4. **Control de vencimientos, facturación y cobranza** en un solo lugar.
5. **Ficha de traspaso:** documento que lista todos los servicios de un cliente si decide mudarse.
6. **Migración progresiva** de las cuentas reseller de BanaHosting a servidores VPS propios.

### Servicios y proveedores a cubrir

| Servicio | Proveedores actuales | Se mantiene |
| --- | --- | --- |
| Hosting compartido | 3 cuentas reseller en BanaHosting (WHM/cPanel) | Se migra de forma progresiva a VPS propios con WHM |
| Servidores VPS y dedicados | Contabo, DigitalOcean | Sí |
| Cloud | AWS (incluye Route 53), Microsoft Azure y Google Cloud, con servidores y arquitecturas de clientes | Sí |
| Dominios | Namecheap, PoloDomains, NameSilo (más de 150 dominios) | Sí |
| Correo corporativo | cPanel, Google Workspace, Microsoft 365 (Azure) | Sí |
| Certificados SSL | Varios proveedores y certificados gratuitos | Sí |
| CDN | Bunny.net | Sí |
| Envíos masivos | Elastic Email | Sí |
| Plataformas | Moodle, WordPress, sistemas a medida | Sí |

### Decisiones ya tomadas

- **Uso interno primero, preparado para SaaS.** Todas las tablas llevan `organization_id` desde el inicio; las funciones de SaaS (registro, planes, cobro a otras empresas) no se construyen ahora.
- **Sin barreras de seguridad adicionales para el cliente.** Se confía en la seguridad de cada proveedor; el sistema solo protege las llaves API que guarda y confirma por correo las acciones de riesgo sobre dominios.
- **Credenciales acotadas.** La bóveda guarda únicamente los accesos de clientes que la empresa administra y comparte con soporte para mantenimientos y emergencias.
- **El cliente puede actualizar sus contactos de dominio y solicitar la transferencia** desde su panel.
- **Toda integración tiene alternativa manual** cuando el proveedor no ofrece API.

### Qué se entrega al área de desarrollo

- Este kit: arquitectura, modelo de datos, permisos, conectores, reglas de negocio, pruebas y despliegue.
- El backlog en CSV para Jira, con épicas e historias por módulo.
- Los tiempos, el equipo y el costo los define el área de desarrollo.

## 1. Alcance del kit y cómo usarlo

Este kit traduce el prompt maestro (26 módulos, 30 funciones adicionales, 8 flujos) y las precisiones posteriores (secciones 15 a 19) en decisiones técnicas listas para programar en Laravel, React y PostgreSQL. Lo acompaña un archivo CSV con el backlog para importar a Jira.

- **Para quién:** el área de desarrollo. Cada sección fija una decisión y la regla que el código debe cumplir.
- **Qué no incluye:** tiempos, tamaño de equipo ni presupuesto. Los define el área de desarrollo.
- **Nombre de trabajo:** el `proyecto se llama provisionalmente hub (repositorio, paquetes y funciones SQL); las tablas no llevan prefijo`. Cámbienlo cuando el producto tenga nombre comercial.
- **Regla de avance:** todo el alcance se entrega en una sola fase; el orden de construcción sigue las dependencias técnicas de la sección 13 y ningún cambio elimina funciones ya construidas.
- **Datos de prueba:** solo datos ficticios realistas. Nunca credenciales ni clientes reales en desarrollo o staging.

Tres principios ordenan todo el diseño:

1. **El servicio contratado es el centro.** Clientes, facturas, tickets, costos, credenciales y recursos técnicos se enlazan a un `service`.
2. **Lo comercial y lo técnico se separan.** Un `service` (lo que se cobra) apunta a uno o varios `resources` (lo que existe en el proveedor).
3. **Toda integración es opcional.** Cada operación funciona en modo manual asistido; el conector solo la automatiza cuando la API lo permite.

## 2. Decisiones de arquitectura

La plataforma es un monolito modular en Laravel con una API REST y dos aplicaciones React: panel interno y portal del cliente.

| Tema | Decisión | Motivo |
| --- | --- | --- |
| Estilo | Monolito modular, un módulo por contexto de negocio | Evita microservicios prematuros y permite extraer módulos después |
| Backend | Laravel (última versión estable con soporte) sobre PHP 8.3 o superior | Colas, eventos y scheduler nativos |
| Frontend | React + TypeScript + Tailwind, SPA con Vite | Panel y portal comparten librería de componentes |
| Base de datos | PostgreSQL 16 o superior | JSONB para campos personalizados, índices parciales, integridad referencial |
| Colas y caché | Redis + Laravel Horizon | Colas separadas por tipo de trabajo |
| Archivos | Almacenamiento de objetos compatible con S3, fuera de Contabo | PDF, XML, CDR, vouchers, contratos y evidencias |
| Alojamiento | VPS en Contabo; correo saliente por Elastic Email; respaldos en AWS S3 | Definido por la empresa |
| Autenticación | Laravel Sanctum (cookies para las SPA, tokens para la API pública) + MFA TOTP | Un solo mecanismo para panel, portal y API |
| Permisos | Roles y permisos por acción, más políticas por registro | Mínimo privilegio con pocos usuarios |
| Secretos | AES-256-GCM con clave fuera del repositorio y de la base | Accesos de clientes y llaves API protegidos sin agregar barreras al cliente |
| Dinero | Enteros en unidad menor (`amount_minor`) + código de moneda | Sin errores de coma flotante |
| Monedas | Soles (PEN) y dólares (USD); tipo de cambio diario | Monedas que acepta la empresa |
| Fechas | UTC en base de datos; zona horaria por usuario y por cliente | Clientes en varios países |
| Idiomas | Español e inglés desde el inicio, con archivos de traducción | Agregar un idioma no requiere código |
| Identificadores | UUID v7 como clave pública; correlativos legibles por tipo (`CLI-000123`) | No expone volúmenes ni permite enumerar |

### Alcance de tenencia

El sistema arranca con una sola organización (la empresa), con 4 marcas y un solo RUC emisor, pero se construye preparado para SaaS. La separación se resuelve con tres columnas:

- `organization_id`: empresa operadora dueña del registro. Está en toda tabla de negocio y se aplica con un filtro global; hoy existe una sola fila. Ver la sección 19.
- `brand_id`: marca comercial de origen (catálogo, plantillas, portal, reportes).
- `legal_entity_id`: entidad que emite el documento (series, impuestos, cuentas bancarias).

Un cliente es único en todo el sistema y puede tener servicios de varias marcas.

### Comunicación entre módulos

- Un módulo llama a otro solo por su interfaz pública (`Contracts/`), nunca por sus modelos.
- Los efectos secundarios viajan por eventos de dominio: `InvoicePaid`, `ServiceSuspended`, `DomainExpiring`, `BackupFailed`.
- El motor de automatizaciones y la auditoría escuchan esos eventos; no se llaman desde los controladores.

## 3. Estructura del repositorio y módulos

Un solo repositorio contiene el backend, las dos aplicaciones React y la infraestructura de despliegue.

```text
/backend
  /app/Modules/<Modulo>
    /Contracts        interfaces públicas del módulo
    /Domain           modelos, enums, value objects, eventos
    /Application      acciones (un caso de uso por clase), DTO
    /Infrastructure   repositorios, conectores, jobs
    /Http             controladores, requests, resources, rutas
    /Policies
    /Database         migraciones, factories, seeders
    /Tests            Unit, Feature
  /app/Shared         dinero, auditoría, idempotencia, exportación, campos personalizados
/frontend
  /apps/admin         panel interno
  /apps/portal        portal del cliente
  /packages/ui        componentes compartidos (tablas, formularios, modales)
  /packages/api       cliente tipado generado desde OpenAPI
/infra                Dockerfiles, compose, pipelines
/docs                 ADR, OpenAPI, manuales
```

### Módulos del backend

Los módulos funcionales del prompt y las precisiones posteriores se agrupan en 23 módulos de código.

| Módulo de código | Cubre | Depende de |
| --- | --- | --- |
| `Identity` | Usuarios, roles, permisos, MFA, sesiones (sección 5) | — |
| `Brands` | 4 marcas y la entidad emisora única | Identity |
| `Customers` | Clientes, organizaciones, contactos, ficha 360° | Brands |
| `Sales` | Prospectos, oportunidades, cotizaciones, pedido de cliente nuevo | Customers, Catalog |
| `Catalog` | Productos, planes, complementos, paquetes, marca "requiere contrato" | Brands |
| `Providers` | Cualquier proveedor y sus cuentas, propios o aportados por el cliente | Vault |
| `Services` | Servicios contratados, suscripciones, renovaciones, modalidades | Customers, Catalog |
| `ServiceMap` | Proyectos del cliente, componentes, dependencias, métricas, ficha de traspaso (sección 15) | Services, Inventory |
| `Inventory` | Nodos de hosting, servidores, migración por lotes, CMDB (sección 17) | Providers, Services |
| `Cloud` | Cuentas y proyectos de AWS, Azure, Google Cloud y otros; SaaS sobre cloud (sección 20) | Providers, Inventory |
| `Domains` | Dominios, DNS, registradores, operaciones del cliente, regularización (sección 16) | Providers, Services |
| `Mail` | Correo cPanel, Google Workspace, Microsoft 365 y certificados SSL (sección 18) | Domains |
| `Saas` | Plataformas Moodle y otros SaaS propios | Inventory, Cloud |
| `Contracts` | Contratos, adendas, autorizaciones, actas de entrega | Sales |
| `Orders` | Pedidos y aprovisionamiento | Contracts, Inventory |
| `Billing` | Facturas, refacturación, medios de pago, cobranza, conciliación | Services, Brands |
| `Finance` | Costos, distribución, rentabilidad | Billing, Inventory |
| `Helpdesk` | Tickets, SLA, base de conocimientos | Customers, Services |
| `Work` | Tareas, proyectos internos, horas, cambios | Helpdesk |
| `Vault` | Accesos de clientes compartidos con soporte y llaves API | Identity |
| `Monitoring` | Chequeos, incidentes, backups | Inventory |
| `Automation` | Reglas, notificaciones, reportes, auditoría | todos, por eventos |
| `Settings` | Centro de configuración, feriados y horario de atención (sección 23) | Identity |

El dashboard (módulo 1) y el portal del cliente (módulo 13) no son módulos de backend: consumen la API de los anteriores.

## 4. Modelo de datos

El modelo gira alrededor de `services`: cada servicio pertenece a un cliente y a una marca, se factura por una suscripción y se apoya en uno o varios recursos técnicos.

Esta sección describe el modelo a nivel funcional. Los nombres técnicos definitivos (157 tablas, columnas y estados) están en `database/schema.sql` y en `docs/01-contrato-de-nombres.md` del paquete de desarrollo; si algo difiere, mandan esos archivos.

### Columnas comunes

Toda tabla de negocio lleva `id` (UUID v7), `organization_id`, `created_at`, `updated_at`, `created_by`, `updated_by`. Las tablas con baja lógica agregan `deleted_at`. Las que admiten campos personalizados agregan `custom` (JSONB) y las etiquetas van en una tabla polimórfica `taggables`.

### Tablas principales

| Grupo | Tabla | Campos clave | Relaciones |
| --- | --- | --- | --- |
| Identidad | `users` | email, password\_hash (Argon2id), mfa\_secret, locale, timezone, type (staff o customer) | N:M `roles` |
| Identidad | `roles`, `permissions` | code, scope | N:M entre sí |
| Marcas | `brands` | name, domain, theme (JSONB), default\_legal\_entity\_id | 1:N catálogo, plantillas |
| Marcas | `legal_entities` | legal\_name, tax\_id, country, currency | 1:N `document_series`, cuentas bancarias |
| Clientes | `customers` | code, type, legal\_name, trade\_name, tax\_id\_type, tax\_id, country, currency, locale, timezone, status, origin\_brand\_id, account\_manager\_id | 1:N contactos, servicios |
| Clientes | `contacts` | customer\_id, name, email, role (técnico, administrativo, autorizado), user\_id | Acceso al portal por contacto |
| Ventas | `leads`, `lead_activities` | stage, amount\_minor, owner\_id | Se convierten en cliente y cotización |
| Ventas | `quotes`, `quote_items` | number, version, valid\_until, status | Genera contrato o pedido |
| Catálogo | `products` | code, category, brand\_id, billing\_type (recurrente o único), provisioning\_rule | 1:N `plans`, `product_addons` |
| Catálogo | `plans` | product\_id, cycle, price\_minor, currency, cost\_minor, tax\_code, limits (JSONB) | Paquetes en `bundle_items` |
| Proveedores | `providers` | name, type, portal\_url, currency | 1:N `provider_accounts` |
| Proveedores | `provider_accounts` | provider\_id, label, connector, renewal\_date, cost\_minor, status | 1:N recursos, credenciales |
| Servicios | `services` | customer\_id, brand\_id, plan\_id, status, activated\_at, commercial\_due\_date, auto\_renew | N:M `resources` por `service_resources` |
| Servicios | `subscriptions` | service\_id, cycle, next\_invoice\_date, price\_minor, currency | 1:N líneas de factura |
| Inventario | `resources` | type, provider\_account\_id, external\_id, name, status, specs (JSONB), cost\_minor, renewal\_date | Tabla base de todo activo técnico |
| Inventario | `hosting_nodes` | resource\_id, hostname, ip, disk\_quota\_mb, disk\_used\_mb, accounts\_limit, accounts\_used | 1:N `hosting_accounts` |
| Inventario | `hosting_accounts` | reseller\_account\_id, username, primary\_domain, disk\_used\_mb, service\_id (nulo si no está asociada) | Detecta cuentas no registradas |
| Inventario | `servers` | resource\_id, os, public\_ip, private\_ip, cpu, ram\_mb, disk\_gb, region, tenancy (dedicado o compartido) | 1:N `server_software`, mantenimientos |
| Inventario | `cloud_projects`, `cloud_resources` | environment, region, resource\_type, parent\_id, monthly\_cost\_minor | Árbol de recursos por proyecto |
| Inventario | `resource_dependencies` | from\_resource\_id, to\_resource\_id, kind | Grafo de la CMDB |
| Dominios | `domains` | name, tld, provider\_account\_id, customer\_id, registered\_at, registry\_expires\_at, auto\_renew, lock, dnssec, privacy, nameservers (JSONB) | Enlace a `services` para el vencimiento comercial |
| Correo | `mail_services` | domain\_id, provider, plan, seats\_purchased, seats\_used, dns\_checks (JSONB) | Enlace a `services` |
| SaaS | `saas_instances` | service\_id, product\_kind (Moodle u otro), url, version, users\_limit, users\_active, storage\_limit\_mb, plugins (JSONB) | Enlace a servidor o cuenta de hosting |
| Contratos | `contracts`, `contract_versions`, `contract_signatures` | number, starts\_at, ends\_at, status, signed\_at | Adendas como versiones |
| Pedidos | `orders`, `provisioning_runs` | status, idempotency\_key, attempts, last\_error | Un intento por fila |
| Facturación | `invoices`, `invoice_items` | legal\_entity\_id, series, number, type, currency, subtotal\_minor, tax\_minor, total\_minor, balance\_minor, due\_date, fiscal\_status | 1:N `payment_allocations` |
| Facturación | `payments` | customer\_id, method, amount\_minor, currency, fee\_minor, status, external\_id, proof\_file\_id, validated\_by | Se aplican a facturas por `payment_allocations` |
| Facturación | `credit_balances`, `coupons`, `tax_rates`, `exchange_rates`, `document_series` | — | Saldos a favor, descuentos, impuestos, tipo de cambio |
| Finanzas | `costs`, `cost_allocations` | resource\_id, period, amount\_minor, method (recursos, porcentaje, consumo, manual) | Reparte un costo entre servicios |
| Soporte | `tickets`, `ticket_messages` | number, type, status, priority, channel, sla\_policy\_id, first\_response\_due\_at, resolution\_due\_at | Enlace polimórfico a servicio, dominio, servidor o plataforma |
| Soporte | `sla_policies`, `kb_articles` | — | Base de conocimientos pública e interna |
| Trabajo | work\_`projects`, `tasks`, `task_checklist_items`, `time_entries`, `change_requests` | status, assignee\_id, due\_at, source\_type, source\_id | Tareas nacen de tickets, alertas, renovaciones |
| Bóveda | `secrets`, `secret_grants`, `secret_access_logs` | kind, ciphertext, nonce, key\_version, rotates\_at, expires\_at | Enlace polimórfico a proveedor, servidor, cliente, servicio |
| Monitoreo | `monitors`, `monitor_results`, `incidents`, `maintenances` | type, target, interval, status | N:M servicios afectados |
| Continuidad | `backup_policies`, `backup_runs`, `restore_tests` | frequency, retention, rpo, rto, encrypted | Por recurso |
| Automatización | `automation_rules`, `notification_templates`, `notification_deliveries` | event, conditions (JSONB), channel, dedupe\_key | Plantilla por idioma, país, marca |
| Transversal | `audit_events`, `idempotency_keys`, `webhook_events`, `files`, `sync_runs` | — | Ver secciones 8 y 10 |

Las tablas de los módulos agregados después se detallan en su sección: mapa de servicios (15), nodos y migración (17), cloud y SaaS (20). A la tabla anterior se suman `payment_methods` (comisión porcentual y fija, si se traslada al cliente), `payment_promises` (fecha comprometida por factura), `provider_bills` (facturas de proveedor para refacturar) y `customer_action_flags` (acciones del panel habilitadas por cliente).

### Reglas que el esquema debe garantizar

- Un dominio guarda dos fechas distintas: `registry_expires_at` (real, en el registrador) y `commercial_due_date` en su servicio (lo pactado con el cliente).
- Un recurso sin fila en `service_resources` es infraestructura sin cliente; un servicio activo sin suscripción es un servicio sin facturar. Ambos alimentan reportes de detección.
- `invoices` tiene unicidad en (`legal_entity_id`, `series`, `number`). La numeración se asigna dentro de una transacción con bloqueo de la fila de `document_series`.
- `payments.external_id` es único por método; un mismo cobro de PayPal no puede registrarse dos veces.
- Los estados usan enums de PHP respaldados por restricciones `CHECK`; las transiciones permitidas viven en una clase por entidad.
- Los importes nunca se guardan sin moneda. Los reportes consolidados convierten con `exchange_rates` a la fecha del documento.
- `audit_events` y `secret_access_logs` son solo de inserción: el usuario de base de datos de la aplicación no tiene permiso de actualizar ni borrar en ellas.

## 5. Roles y permisos

Los permisos se nombran `modulo.entidad.accion` y se validan siempre en el backend; el frontend solo oculta lo que el usuario no puede hacer.

### Acciones estándar

`view`, `create`, `update`, `delete`, `approve`, `export`, más acciones sensibles propias: `vault.secret.reveal`, `inventory.server.execute`, `billing.payment.validate`, `billing.refund.authorize`, `services.service.suspend`.

### Matriz inicial

| Rol | Usuarios | Clientes y ventas | Facturación y pagos | Infraestructura y mapa | Tickets y tareas | Bóveda | Configuración |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Administrador | Dueño o gerencia | Total | Total, aprueba suspensiones y reembolsos | Total | Total | Total | Total |
| Ventas | 1 | Total; registra cliente nuevo y pedido | Ver facturas y estado de pago | Ver mapa del cliente | Crear tickets | Sin acceso | Sin acceso |
| Finanzas | 1 | Lectura | Total; valida vouchers | Ver costos | Tickets de facturación | Sin acceso | Medios de pago y cobranza |
| Soporte | 1 | Lectura | Sin acceso | Total | Total | Revelar accesos | Sin acceso |
| Documentación y tramitación | Sugerido | Lectura | Sin acceso | Lectura | Lectura | Sin acceso | Contratos, actas, autorizaciones |
| Contador externo | Sugerido | Sin acceso | Solo lectura y exportación | Sin acceso | Sin acceso | Sin acceso | Sin acceso |
| Técnico temporal | Sugerido | Sin acceso | Sin acceso | Lo asignado | Lo asignado | Lo asignado, con vencimiento | Sin acceso |
| Cliente administrador | Por cliente | Su organización | Sus facturas, pagos y vouchers | Sus servicios en modo consulta | Sus tickets | Sin acceso | Sus contactos y usuarios |
| Cliente usuario | Por cliente | Sin acceso | Según permiso | Sus servicios en modo consulta | Sus tickets | Sin acceso | Sin acceso |

### Reglas

- **Separación de funciones con pocos usuarios:** finanzas valida los vouchers que registran el cliente o ventas; el administrador aprueba suspensiones, reembolsos y exenciones.
- **Alcance por registro:** las políticas filtran por organización del cliente. Un usuario de cliente nunca recibe filas de otra organización, aunque adivine un identificador.
- **Campos internos:** los recursos de la API del portal usan clases distintas a las del panel. Costos, márgenes, nombre del proveedor, notas internas y accesos no existen en esas respuestas, salvo el proveedor cuando se habilite para ese cliente.
- **Accesos sensibles:** revelar un acceso, ejecutar en un servidor y autorizar un reembolso exigen MFA reciente (menos de 10 minutos) y quedan en auditoría.
- **Roles personalizados:** se crean desde el panel combinando permisos; los roles iniciales se cargan por seeder y no se pueden borrar.

## 6. Conectores de integración

Cada proveedor externo se integra con un conector independiente que declara qué operaciones soporta; lo que no soporta se resuelve con una tarea manual asistida.

### Contrato del conector

```php
interface Connector
{
    public function capabilities(): CapabilitySet;      // qué operaciones admite esta cuenta
    public function testConnection(): ConnectionResult;
}

interface HostingConnector extends Connector
{
    public function listAccounts(): iterable;           // sincronización
    public function usage(): ResellerUsage;
    public function createAccount(CreateAccount $cmd): ProvisionResult;
    public function suspend(string $username, string $reason): void;
    public function unsuspend(string $username): void;
}
// Mismo patrón: ServerConnector, CloudConnector, RegistrarConnector,
// PaymentConnector, EInvoiceConnector, MailConnector, SaasConnector
```

- Antes de ejecutar, el caso de uso consulta `capabilities()`. Si la operación no existe, crea una tarea en `Work` con el procedimiento y deja el pedido en estado "esperando acción manual".
- Las credenciales del conector salen de la bóveda al momento de la llamada; nunca se guardan en `.env` ni en la configuración.
- Cada sincronización escribe una fila en `sync_runs` con inicio, fin, registros leídos, creados, actualizados y errores.
- La sincronización nunca borra: lo que desaparece en el proveedor se marca como "no encontrado" y genera una alerta.

### Mapa de conectores

La columna "Estado de la API" refleja lo conocido al redactar este kit. Cada fila debe confirmarse contra la documentación vigente y contra el tipo de cuenta real antes de construir el conector.

| Proveedor | Tipo | Estado de la API | Autenticación | Operaciones previstas | Sin API: procedimiento |
| --- | --- | --- | --- | --- | --- |
| WHM/cPanel (cuentas reseller de BanaHosting) | Hosting | WHM API 1; el alcance depende de los privilegios que el proveedor da al reseller | Token de API de WHM | Listar cuentas, consumo, crear, suspender, reactivar | Tarea manual con lista de verificación |
| Plesk | Hosting | API REST y XML | Clave de API | Listar y gestionar suscripciones | Tarea manual |
| Contabo | Servidores | API REST pública | OAuth2 con credenciales de cliente | Inventario, snapshots, estado | Alta manual de la ficha |
| DigitalOcean | Servidores y cloud | API v2 | Token personal con alcance | Inventario, snapshots, facturación | Alta manual |
| AWS | Cloud | SDK oficial | Rol IAM de solo lectura asumido por cuenta | Descubrimiento de recursos, costos y presupuestos | Registro manual del proyecto |
| Namecheap | Dominios | API con requisitos de cuenta y lista blanca de IP | Clave de API + IP autorizada | Listar, consultar vencimiento, renovar, nameservers | Importación por CSV |
| NameSilo | Dominios | API pública | Clave de API | Listar, renovar, nameservers, bloqueo | Importación por CSV |
| PoloDomains | Dominios | Por verificar | Por verificar | Solo las que se confirmen | Registro manual + recordatorio de renovación |
| PayPal | Pagos | API REST con webhooks | OAuth2 (client id y secret) | Crear orden, capturar, reembolsar, conciliar | Registro manual del pago |
| SUNAT | Facturación electrónica | A través de un proveedor autorizado (PSE u OSE) | Según proveedor elegido | Emitir factura, boleta, notas; guardar XML y CDR | Emisión externa y registro del número |
| Google Workspace | Correo | API de administración | Cuenta de servicio con delegación | Leer licencias y usuarios | Registro manual |
| Microsoft 365 | Correo | Microsoft Graph | Aplicación registrada | Leer licencias y usuarios | Registro manual |
| Moodle | SaaS | Servicios web oficiales | Token de servicio de alcance limitado | Versión, usuarios activos, complementos | Registro manual |
| Correo saliente | Notificaciones | SMTP o API del proveedor | Credenciales por marca | Enviar, recibir rebotes | — |
| Correo entrante | Tickets | IMAP o webhook de entrada | Por buzón | Crear y responder tickets | — |
| WhatsApp Business Platform | Notificaciones | API oficial con plantillas aprobadas | Token de la aplicación | Enviar avisos y recibir mensajes en la bandeja compartida | Aviso por correo |

### Conectores añadidos

| Proveedor | Tipo | Estado de la API | Operaciones previstas | Sin API: procedimiento |
| --- | --- | --- | --- | --- |
| WHM en VPS propios | Hosting | WHM API 1 con acceso root, sin las restricciones de un reseller | Todas: cuentas, paquetes, consumo, suspensión, transferencia de cuentas | — |
| Bunny.net | CDN | API REST | Zonas, tráfico y consumo | Registro manual del componente |
| Elastic Email | Envíos masivos | API REST | Estado de la cuenta, volumen enviado, límites | Registro manual |
| AWS Route 53 | DNS | Incluido en el conector AWS | Zonas y registros en lectura; escritura por permiso | Registro manual |
| Microsoft 365 (Azure) | Correo y licencias | Microsoft Graph; si se revende como socio, Partner Center | Dominios, usuarios, licencias asignadas y disponibles | Registro manual |
| Azure (suscripciones) | Cloud | Azure Resource Manager | Inventario y costos en lectura | Registro manual |
| Google Workspace | Correo y licencias | API de administración; si se revende, API de revendedor | Usuarios, licencias, uso de almacenamiento | Registro manual |
| Certificados SSL | Seguridad | Sin conector por proveedor: se lee el certificado publicado en cada dominio | Emisor, fecha de expiración, dominios cubiertos | Registro manual de certificados no publicados |
| Google Cloud | Cloud | Cloud Asset Inventory y exportación de facturación | Inventario y costos en lectura, por proyecto | Registro manual |
| Global66 | Pagos del extranjero | Por confirmar si ofrece API de cobros | Enlace de cobro y confirmación del pago, si existe API | Voucher del cliente y validación de finanzas |
| Pasarela de tarjetas local | Pagos en Perú | Por elegir; API y webhooks a verificar con el proveedor elegido | Pago con formulario alojado, confirmación por webhook, reembolso, conciliación | Transferencia con voucher |

Confirmado: se trabaja con AWS, Azure y Google Cloud, con servidores y arquitecturas de clientes. Los tres conectores cloud siguen el mismo contrato y arrancan en solo lectura; ver la sección 20.

### Reglas comunes

- **Límites:** cada conector define su tasa máxima y usa un limitador en Redis; ante un 429 reintenta con espera exponencial.
- **Reintentos:** máximo 5 intentos para lecturas. Las escrituras solo se reintentan si llevan clave de idempotencia o si se puede consultar el estado antes.
- **Errores:** se clasifican en transitorio, de credenciales, de validación y desconocido. Solo el transitorio se reintenta solo; el resto abre una alerta.
- **Webhooks entrantes:** se valida la firma, se guarda el evento crudo en `webhook_events` con su identificador externo único y se procesa en cola.
- **Solo lectura primero:** AWS, registradores y servidores arrancan con permisos de lectura. Las acciones de escritura se habilitan por cuenta, con permiso explícito y confirmación.

## 7. Facturación, pagos y cobranza

Un solo motor genera todos los documentos a partir de las suscripciones y de los cargos únicos; la emisión fiscal es un paso posterior y separado.

### Ciclo de una factura

1. **Generación.** Un job diario busca suscripciones cuya `next_invoice_date` cae dentro de la anticipación configurada y crea la factura en borrador. En la refacturación, el borrador nace al cargar la factura del proveedor.
2. **Consolidación.** Según la preferencia del cliente, agrupa los servicios que vencen en la misma ventana o emite una factura por servicio.
3. **Cálculo.** Aplica prorrateo, descuentos, cupones y saldo a favor. En la refacturación suma el porcentaje de administración sobre el monto del proveedor antes de impuestos. Luego aplica IGV, o lo omite si el producto y el cliente califican como exportación de servicios.
4. **Emisión.** Asigna serie y número del único RUC dentro de una transacción y genera el PDF con la plantilla de la marca.
5. **Emisión electrónica.** Un job envía el comprobante al proveedor de facturación electrónica, también para clientes del extranjero, y guarda XML, CDR y estado.
6. **Cobro.** Se registran pagos totales o parciales; el saldo se recalcula con las aplicaciones. Si el pago se hace con un medio con recargo, la comisión se agrega como línea aparte del comprobante.
7. **Cierre.** Con saldo cero, la factura pasa a pagada y emite `InvoicePaid`, que renueva o reactiva los servicios.

### Estados

- **Factura:** borrador, emitida, pagada parcial, pagada, vencida, anulada.
- **Estado fiscal (independiente):** no aplica, pendiente, aceptada, rechazada, anulada.
- **Pago:** reportado (hasta que finanzas lo valida), validado, rechazado, reembolsado.

### Reglas de negocio

- La factura incluye todo el monto del servicio, también el costo del proveedor cuando se refactura; la factura del proveedor se adjunta como sustento.
- Un voucher de transferencia enviado por el cliente o registrado por ventas crea un pago "reportado". Solo finanzas lo pasa a "validado".
- Un pago de PayPal se valida solo cuando llega el webhook de captura completada y coincide el importe. La comisión real se guarda en `fee_minor` como gasto.
- Medios de pago configurables: transferencia, tarjeta mediante pasarela local, PayPal, Global66 y los que se agreguen, cada uno con su comisión porcentual y fija, y si se traslada al cliente.
- Una factura emitida no se edita. Se corrige con nota de crédito o de débito enlazada.
- Monedas: soles y dólares. La tasa de IGV vive en `tax_rates` con fecha de vigencia; la condición de exportación se marca por producto y por cliente, según el criterio del contador.
- Tres importes se reportan por separado: facturado, cobrado e ingreso reconocido.

### Cobranza automática

La secuencia por defecto es la que usa hoy la empresa; se administra desde el centro de configuración (sección 23) a nivel general, por marca, producto, cliente o contrato, y el más específico gana.

| Momento | Acción por defecto |
| --- | --- |
| 30, 15, 7 y 3 días antes | Aviso de renovación con enlace de pago y opción de enviar voucher |
| Día de vencimiento | Aviso de vencimiento |
| Día siguiente al vencimiento sin pago | Suspensión del servicio y aviso al cliente y a finanzas |
| Compromiso de pago registrado | Posterga la suspensión hasta la fecha comprometida; si vence sin pago, se suspende |
| Pago validado | Reactiva el servicio y avisa |

No se suspenden dominios: se deja de renovar y se avisa con mayor anticipación. El administrador puede marcar clientes exentos. Finanzas ve cada mañana una bandeja con vencimientos, avisos enviados, compromisos y suspensiones del día.

## 8. Bóveda de credenciales y seguridad

La bóveda guarda dos cosas: los accesos de clientes que la empresa administra y comparte con soporte para mantenimientos y emergencias, y las llaves API de los proveedores que usan los conectores. No se agregan controles nuevos para el cliente; la seguridad de cada servicio sigue siendo la de su proveedor.

### Cifrado

- Los valores se cifran con AES-256-GCM antes de guardarse.
- La clave de cifrado vive en el gestor de secretos del servidor, fuera del repositorio y de la base de datos, y es distinta por entorno.
- Un respaldo de la base de datos sin esa clave no expone ningún acceso.
- Queda previsto, sin construirlo ahora, pasar a una clave maestra en KMS o Vault si el sistema se ofrece como SaaS.

### Riesgos propios de conectarse por API

| Caso | Qué puede pasar | Control mínimo |
| --- | --- | --- |
| Robo de dominio | Alguien entra a la cuenta de un cliente y pide transferencia o cambia DNS | Confirmación por correo al titular y revisión de soporte antes de entregar el código |
| Sistema comprometido | Quien entre obtiene las llaves de todos los proveedores | Llaves cifradas, con permiso mínimo y restringidas por IP cuando el proveedor lo permite |
| Cliente que ve datos de otro | Cambiar un identificador en la dirección muestra un servicio ajeno | Filtro por organización del cliente en cada consulta y prueba automática |
| Personal que se retira | Conserva accesos compartidos | Baja inmediata del usuario y lista de accesos que vio para rotarlos |

### Reglas de la bóveda

- Revelar exige permiso `vault.secret.reveal`, una concesión vigente sobre ese secreto y MFA reciente.
- Cada revelación escribe en `secret_access_logs`: usuario, secreto, motivo, IP, fecha. El valor nunca se registra.
- Las concesiones (`secret_grants`) pueden ser temporales y caducan solas. Revocar surte efecto inmediato.
- El listado de la API nunca devuelve valores. No existe exportación masiva de secretos.
- Límite de revelaciones por usuario y por hora; superarlo bloquea y alerta a seguridad.
- Cada secreto tiene fecha de rotación; un job diario crea tareas de rotación.
- Los modelos marcan los campos sensibles como ocultos y el logger aplica una lista de redacción (`password`, `token`, `secret`, `authorization`).
- Las contraseñas de los buzones de correo de clientes no se almacenan.
- Se prefieren claves SSH, tokens de alcance limitado y roles asumidos frente a contraseñas compartidas.

### Seguridad de la aplicación

| Área | Control |
| --- | --- |
| Contraseñas de usuarios | Hash Argon2id; verificación contra listas de contraseñas filtradas |
| MFA | TOTP obligatorio para personal; opcional y recomendado para clientes; códigos de recuperación |
| Sesiones | Cookies `HttpOnly`, `Secure`, `SameSite`; lista de sesiones y dispositivos con cierre remoto |
| Fuerza bruta | Límite por IP y por cuenta en inicio de sesión, MFA y recuperación |
| Entrada | Validación con Form Requests en backend y esquemas Zod en frontend |
| Salida | Cabeceras CSP, HSTS, `X-Content-Type-Options`; escape por defecto en React |
| Archivos | Tipo y tamaño validados, análisis antivirus en cola, enlaces firmados de corta duración |
| Auditoría | Solo inserción, con encadenamiento por hash entre eventos para detectar manipulación |
| Dependencias | Análisis de vulnerabilidades en cada pipeline |
| Respaldo del sistema | Copias cifradas de base de datos y archivos en AWS S3, separadas de los backups de clientes; prueba de restauración periódica |
| Privacidad | Registro de consentimientos, exportación y eliminación de datos personales a solicitud, retención definida por tipo de dato |

El nivel objetivo es OWASP ASVS nivel 2 para toda la aplicación, sin exigencias adicionales para el cliente.

## 9. Convenciones de API y frontend

La API es REST, versionada en `/api/v1`, documentada en OpenAPI 3.0.3; el cliente TypeScript del frontend se genera desde esa especificación.

### API

| Tema | Convención |
| --- | --- |
| Rutas | Sustantivos en plural y en inglés: `/api/v1/customers/{id}/services` |
| Prefijos | `/api/v1/admin/...` para el panel, `/api/v1/portal/...` para clientes, `/api/v1/public/...` para la API pública |
| Listados | `?filter[status]=active&sort=-created_at&page[size]=25&page[cursor]=...&include=customer` |
| Respuesta | `{ "data": ..., "meta": ..., "links": ... }` |
| Errores | Formato RFC 9457 (`application/problem+json`) con `code` estable y `errors` por campo |
| Escrituras sensibles | Cabecera `Idempotency-Key` obligatoria en pagos, pedidos y aprovisionamiento |
| Concurrencia | Campo `version` en el recurso; la actualización con versión antigua responde 409 |
| Acciones | Verbos como subrecurso: `POST /invoices/{id}/issue`, `POST /services/{id}/suspend` |
| Exportación | `POST /exports` crea un trabajo en cola y devuelve un enlace firmado al terminar |
| Idioma | Cabecera `Accept-Language`; los mensajes salen traducidos |

### Frontend

- **Estado del servidor:** TanStack Query. **Formularios:** React Hook Form con Zod. **Tablas:** TanStack Table con filtros, orden y paginación en servidor.
- **Rutas:** React Router con carga diferida por módulo.
- **Traducciones:** i18next; ningún texto visible queda escrito en el componente.
- **Tema:** variables CSS por marca (logo, colores) y modo claro y oscuro.
- **Permisos:** un componente `<Can permission="...">` y un guard de ruta; la lista de permisos llega al iniciar sesión.
- **Accesibilidad:** objetivo WCAG 2.1 AA; navegación completa por teclado en tablas, modales y formularios.

### Componentes base que se construyen primero

| Componente | Qué resuelve |
| --- | --- |
| `DataTable` | Columnas configurables, filtros guardados, selección múltiple, exportar, imprimir |
| `EntityForm` | Formulario por secciones con validación, borrador y aviso de cambios sin guardar |
| `DetailLayout` | Cabecera, pestañas, panel lateral de actividad e historial |
| `ConfirmDialog` | Confirmación de acciones sensibles; pide escribir el nombre del recurso o MFA |
| `GlobalSearch` | Búsqueda de clientes, dominios, servicios, tickets, facturas y servidores |
| `StatusBadge`, `MoneyCell`, `DateCell` | Estados, importes con moneda y fechas en la zona del usuario |
| `EmptyState`, `ErrorState`, `Skeleton` | Estados vacío, de error y de carga en toda pantalla |

### Pantallas principales

- **Panel interno:** dashboard, bandeja diaria de cobranza, clientes y ficha 360°, mapa de servicios por proyecto, embudo de ventas, cotizaciones, pedidos de cliente nuevo, catálogo, proveedores, nodos de hosting y migración, servidores, cuentas y proyectos cloud, dominios y regularización, correo y licencias, certificados SSL, plataformas SaaS, contratos y autorizaciones, facturas, refacturación, pagos y validación de vouchers, rentabilidad, tickets, tablero de tareas, bóveda, monitoreo e incidentes, backups, automatizaciones, base de conocimientos, reportes, auditoría, configuración (marcas, medios de pago, interruptores de acciones del cliente).
- **Portal del cliente (por marca):** resumen, mis proyectos y servicios con consumo, dominios, acceso directo a cPanel, facturas, pago en línea y envío de voucher, tickets, contratos y documentos, contactos y usuarios, notificaciones, mantenimientos, seguridad de la cuenta.

Regla de interfaz: no se entrega ningún botón sin comportamiento. Una función aún no construida no aparece en el menú.

## 10. Colas, jobs e idempotencia

Todo lo que llama a un tercero o tarda más de un segundo corre en cola; ninguna operación de dinero o de aprovisionamiento se ejecuta dos veces.

### Colas

| Cola | Uso | Reintentos |
| --- | --- | --- |
| `critical` | Webhooks de pago, validación de pagos, reactivaciones | 5, espera exponencial |
| `provisioning` | Altas, suspensiones, renovaciones en proveedores | 3, luego revisión humana |
| `billing` | Generación y emisión de facturas, emisión fiscal | 5 |
| `sync` | Sincronización con proveedores | 3 |
| `notifications` | Correo, portal, WhatsApp, webhooks salientes | 5 |
| `monitoring` | Chequeos de disponibilidad, DNS, SSL | 1 |
| `default` | Exportaciones, PDF, importaciones | 3 |

### Jobs programados

| Job | Frecuencia | Qué hace |
| --- | --- | --- |
| `GenerateRenewalInvoices` | Diario | Crea facturas de suscripciones próximas a vencer |
| `RunDunningSequence` | Diario | Envía avisos y escala la mora |
| `SyncResellerAccounts` | Cada 6 horas | Cuentas, dominios y consumo de cada reseller |
| `SyncDomains` | Diario | Fechas de expiración y estado en registradores |
| `SyncServers`, `SyncCloudResources` | Diario | Inventario y costos |
| `CheckCapacityThresholds` | Cada hora | Alertas de 70 %, 85 % y 95 % |
| `CheckSslAndDns` | Diario | SSL por vencer y registros SPF, DKIM, DMARC, MX |
| `DetectOrphans` | Diario | Servicios sin facturar, recursos sin cliente, cuentas no registradas, dominios huérfanos |
| `RotateSecretsReminder` | Diario | Tareas de rotación de credenciales |
| `CheckSlaBreaches` | Cada 5 minutos | Tickets en riesgo o fuera de SLA |
| `UpdateExchangeRates` | Diario | Tipo de cambio para reportes |
| SyncComponentMetrics | Diario | Consumo de cada componente del mapa de servicios |
| SuspendOverdueServices | Diario | Suspende al día siguiente del vencimiento, respetando compromisos y exentos |
| OffsiteBackup | Diario | Respaldo cifrado del sistema en AWS S3 |

### Idempotencia

- **API:** la cabecera `Idempotency-Key` se guarda en `idempotency_keys` con el hash de la petición y la respuesta. Una repetición devuelve la misma respuesta; la misma clave con otro cuerpo responde 422.
- **Webhooks:** el identificador del evento externo es único en `webhook_events`. Un evento repetido se confirma y se descarta.
- **Aprovisionamiento:** cada intento es una fila en `provisioning_runs`. Antes de reintentar una creación se consulta al proveedor si el recurso ya existe.
- **Notificaciones:** `dedupe_key` = evento + destinatario + entidad + periodo, con índice único.
- **Jobs:** los que generan documentos usan bloqueo por entidad (`ShouldBeUnique`) y verifican el estado dentro de la transacción.

### Flujos como máquinas de estado

Los ocho flujos del prompt (A a H) se implementan como máquinas de estado sobre `orders`, `services`, `tickets` y `change_requests`. Cada transición valida permiso, registra auditoría y emite un evento. Los pasos "revisión humana", "validación de pago" y "autorización" son estados reales, no avisos.

## 11. Pruebas y calidad

Ningún módulo se da por terminado sin pruebas automatizadas de sus reglas de negocio, sus permisos y sus casos de error.

| Tipo | Herramienta | Qué cubre |
| --- | --- | --- |
| Unitarias | Pest | Cálculo de facturas, prorrateo, impuestos, distribución de costos, transiciones de estado |
| De integración | Pest con PostgreSQL real | Endpoints, políticas, colas, numeración concurrente |
| De contrato | Respuestas grabadas por conector | Que cada conector interpreta bien al proveedor, sin llamar a producción |
| De permisos | Matriz generada | Cada endpoint contra cada rol: permitido o 403 |
| Frontend | Vitest y Testing Library | Componentes base y formularios |
| De extremo a extremo | Playwright | Los ocho flujos A a H completos |
| Estáticas | PHPStan nivel alto, Pint, ESLint, TypeScript estricto | Tipos y estilo |

### Definición de terminado por historia

- [ ] Migraciones, modelos, políticas y validaciones en backend.
- [ ] Pantallas con estados de carga, vacío y error.
- [ ] Permisos aplicados en backend y reflejados en frontend.
- [ ] Auditoría de las acciones de escritura.
- [ ] Pruebas que cubren el criterio de aceptación y al menos un caso de rechazo.
- [ ] Textos en español e inglés.
- [ ] Endpoint documentado en OpenAPI.
- [ ] Datos de demostración en el seeder.
- [ ] Ninguna función previa deja de pasar sus pruebas.

### Casos que deben probarse sí o sí

- Dos peticiones simultáneas emitiendo factura no repiten número.
- El mismo webhook de PayPal recibido tres veces registra un solo pago.
- Un usuario de cliente no accede a datos de otra organización cambiando el identificador.
- Un secreto revelado no aparece en logs, respuestas de listado ni exportaciones.
- Un reintento de creación de cuenta de hosting no crea dos cuentas.
- Un pago reportado con comprobante no reactiva el servicio hasta ser validado.

## 12. Despliegue y entornos

La aplicación se despliega con contenedores Docker, con producción en un VPS de Contabo, en tres entornos separados, cada uno con su base de datos, sus secretos y sus cuentas de proveedor de prueba.

| Entorno | Datos | Integraciones |
| --- | --- | --- |
| Desarrollo | Seeder ficticio | Conectores simulados |
| Staging | Seeder ficticio; nunca copia de producción | Sandbox de PayPal, entorno de pruebas de facturación electrónica, cuentas de prueba |
| Producción | Reales | Reales, con permisos mínimos |

### Contenedores

- `app`: PHP-FPM con el código del backend.
- `web`: Nginx que sirve la API y los archivos compilados de las dos SPA.
- `worker`: Horizon con las colas de la sección 10.
- `scheduler`: ejecuta `schedule:run` cada minuto.
- Servicios: PostgreSQL y Redis en el mismo VPS; archivos y respaldos en AWS S3; correo saliente por Elastic Email.

### Pipeline

1. Análisis estático y de dependencias.
2. Pruebas de backend y frontend.
3. Construcción de imágenes con la versión como etiqueta.
4. Despliegue automático a staging y pruebas de extremo a extremo.
5. Aprobación manual y despliegue a producción.
6. Migraciones compatibles hacia atrás: primero agregar, después retirar en una versión posterior.

### Operación

- Logs estructurados en JSON con identificador de petición, sin datos sensibles.
- Métricas de colas, tiempos de respuesta, errores y fallos de sincronización, con alertas.
- Endpoint de salud para el balanceador y para el monitoreo externo.
- Backup diario cifrado de base de datos y archivos, guardado en AWS S3 con credenciales que solo pueden escribir, con recuperación a un punto en el tiempo; los valores de RPO y RTO del propio sistema los fija la gerencia.
- Protección perimetral: WAF o proxy inverso con límite de peticiones; el panel interno puede restringirse por IP o VPN.

## 13. Alcance único y orden de construcción

Todo lo descrito en este kit se construye en una sola fase. El ingeniero a cargo define equipo, tiempos y paralelismo; esta sección solo fija qué depende de qué, para que nadie construya sobre algo que aún no existe.

| Bloque | Contenido | Depende de |
| --- | --- | --- |
| A. Cimientos | Repositorio, Docker, pipeline, despliegue en Contabo, correo por Elastic Email, respaldos en AWS S3, `organization_id`, identidad, roles y permisos, auditoría, 4 marcas y entidad emisora, componentes base, centro de configuración | — |
| B. Núcleo comercial | Clientes y contactos, catálogo, proveedores, servicios y suscripciones, bóveda | A |
| C. Inventario y mapa | Nodos de hosting, servidores, cloud, dominios, correo, SSL, SaaS, mapa de servicios, CMDB | B |
| D. Ventas | CRM básico, canales de captación, cotizaciones, contratos editables, pedidos | B |
| E. Facturación y cobro | Facturas, refacturación, medios de pago, cobranza, recargos, detracciones, finanzas y rentabilidad | B, D |
| F. Soporte | Help desk, SLA, tareas, base de conocimientos, monitoreo, backups de clientes | B, C |
| G. Portal del cliente | Consulta de servicios, pagos y vouchers, tickets, acciones con interruptor, acceso a cPanel | C, E, F |
| H. Integraciones | Conectores de hosting, registradores, nubes, correo, pagos, facturación electrónica, WhatsApp, redes sociales, firma electrónica | Cada conector, del módulo que alimenta |
| I. Migración y puesta en marcha | Importación de los 400 clientes, conciliación con proveedores, capacitación | B, C, E |

Los bloques B a H pueden avanzar en paralelo una vez cerrado A, respetando la columna de dependencias. El backlog en CSV etiqueta cada historia con su bloque.

### Criterios que se mantienen

1. **El mapa de servicios funciona primero con registro manual.** Los conectores solo lo completan con datos leídos por API.
2. **Marcas, organización e idiomas desde los cimientos.** Evita rehacer tablas y pantallas.
3. **Ningún valor de negocio en el código.** Todo plazo, porcentaje o texto de aviso vive en el centro de configuración (sección 23).
4. **Toda integración tiene alternativa manual.** Si un proveedor no da API, la función se entrega igual con tarea asistida.

### Migración desde Excel

1. Plantillas CSV por entidad para los unos 400 clientes: clientes, contactos, servicios, dominios (con titular), cuentas de hosting, servidores, cuentas cloud, costos.
2. Asistente de importación con vista previa, validación fila por fila y reporte de errores descargable.
3. Deduplicación de clientes por documento fiscal, correo y nombre normalizado, con fusión manual.
4. Carga en staging, revisión con el equipo y carga final en producción.
5. Conciliación: totales de dominios, cuentas y servicios contra cada proveedor antes de dejar el Excel.

### Las 30 funciones adicionales del prompt

Las 30 funciones adicionales del prompt están dentro del alcance y repartidas en los bloques A a I: importación y deduplicación, asistente de migración, búsqueda global, etiquetas y campos personalizados, saldos a favor, renovaciones agrupadas, promociones, solicitudes internas, encuestas, aceptación de términos, bolsas de horas, licencias, detección de servicios sin facturar, sin contrato e infraestructura sin cliente, renovaciones de proveedores, CMDB, portal de estado, cambios y problemas, incidentes de seguridad, presupuestos cloud, bajas seguras, afiliados, comisiones, API pública, webhooks, SSO y privacidad.

## 14. Supuestos y pendientes por verificar

La mayoría de las definiciones ya están cerradas (secciones 21 a 24); quedan estas, y ninguna impide empezar por los cimientos.

| Pendiente | Afecta a | Necesario antes de |
| --- | --- | --- |
| Proveedor de facturación electrónica, elegido con la tabla de requisitos de la sección 21 | Emisión electrónica | Conector de facturación electrónica |
| Qué productos califican como exportación y la configuración inicial de detracciones, según el contador | Impuestos | Puesta en marcha |
| Si Global66 ofrece API de cobros | Medios de pago | Conector de Global66 |
| Privilegios de WHM que entrega BanaHosting a las cuentas reseller | Migración a nodos propios | Conector WHM |
| API de PoloDomains y requisitos de API de Namecheap | Conectores de registrador | Conectores de registrador |
| Reglas de transferencia y cambio de titular de .pe, .cl, .mx y .co | Operaciones de dominio del cliente | Habilitar esas operaciones |
| Cuenta, región y retención del bucket de AWS S3 | Respaldos | Cimientos |
| Servicio de firma electrónica | Contratos | Conector de firma |
| Programas de socio de Google Workspace y Microsoft | Conectores de revendedor | Esos conectores |
| Herramienta de monitoreo a integrar | Monitoreo | Conector de monitoreo |
| Plazos de retención de datos personales por país | Privacidad y bajas | Puesta en marcha |
| Valores iniciales del SLA y del recargo por mora | Soporte y cobranza | Puesta en marcha (se cargan en el panel) |
| Pasarela de pago con tarjeta, elegida con la tabla de requisitos de la sección 21 | Medios de pago, portal | Conector de la pasarela |

### Supuestos tomados

- Una sola empresa operadora al inicio; el modelo queda preparado para SaaS, pero sus funciones no se construyen ahora.
- Cuatro usuarios internos (administrador, ventas, finanzas, soporte); la separación de funciones se aplica con aprobaciones del administrador.
- El estado de las API de la sección 6 corresponde a lo conocido al redactar; no se consultó la documentación vigente de cada proveedor.
- Los nombres de tablas, rutas y código van en inglés; la interfaz y la documentación, en español.

## 15. Mapa de servicios del cliente

Cada cliente tiene proyectos, y cada proyecto una lista de componentes que indica qué es, en qué proveedor y cuenta está y de qué depende; es la función central del sistema.

### Tablas

| Tabla | Campos clave | Notas |
| --- | --- | --- |
| `client_projects` | customer\_id, name, description, status, technical\_owner\_id | Ejemplo: "Web de turismo" |
| `project_components` | project\_id, kind, public\_label, resource\_id, provider\_account\_id, service\_id, visible\_to\_customer, notes\_internal | Un componente por pieza del proyecto |
| `component_dependencies` | from\_component\_id, to\_component\_id, kind | "El sitio depende del DNS", "el correo depende del dominio" |
| `component_metrics` | component\_id, metric, value, unit, measured\_at | Consumo leído por API: espacio, tráfico, buzones, envíos |

Tipos de componente (`kind`): servidor, hosting, dominio, DNS, CDN, correo, envíos masivos, certificado SSL, base de datos, almacenamiento, sitio WordPress, sistema a medida, plataforma Moodle, licencia, otro.

### Ejemplo: cliente con sitio de turismo

| Componente | Proveedor y cuenta | Vista de soporte | Vista del cliente |
| --- | --- | --- | --- |
| Servidor | Contabo, cuenta principal | IP, sistema operativo, accesos, costo, respaldos | "Servidor": espacio usado y disponible, memoria, estado |
| Sistema a medida | Alojado en el servidor | Repositorio, versión, base de datos | "Sistema de reservas": activo |
| Sitio WordPress | Alojado en el servidor | Versión, complementos, accesos | "Sitio web": activo |
| CDN | Bunny.net | Zona, origen, tráfico | "Red de entrega": tráfico del mes |
| DNS | AWS Route 53 | Zona y registros | "DNS": activo |
| Dominio | Namecheap | Fechas real y comercial, bloqueo | "Dominio": vence el día indicado |
| Correo | Cuenta cPanel en un nodo de hosting | Buzones, cuotas, registros SPF, DKIM, DMARC | "Correo": buzones y espacio usado |
| Envíos masivos | Elastic Email | Cuenta, límites, reputación | "Envíos masivos": enviados en el mes |
| Certificado SSL | Emisor del certificado | Emisor, expiración, dónde está instalado | "Certificado": vigente hasta la fecha indicada |

### Reglas

- **Dos vistas, una sola fuente.** La vista del cliente usa `public_label` y solo las métricas marcadas como públicas. Costos, cuentas, accesos y notas internas no viajan en la API del portal.
- **Nombre del proveedor configurable.** Un ajuste por organización decide si el cliente ve el proveedor real o solo la marca propia. Por defecto, solo la marca.
- **Componentes sin API.** Se registran a mano y se marcan como "sin sincronización"; muestran datos fijos y la fecha de la última revisión.
- **Consumo.** Un job diario llena `component_metrics` desde cada conector; el panel muestra el último valor y su fecha.
- **Impacto.** Al abrir un ticket o un incidente sobre un componente, el sistema muestra los componentes que dependen de él.
- **Ficha de traspaso.** Un botón genera un PDF con todos los componentes del cliente, proveedor, datos de configuración no sensibles y los pasos de entrega. Los accesos se entregan aparte, por canal seguro.
- **Completitud.** Un reporte lista clientes con servicios activos que no tienen proyecto ni componentes registrados.

## 16. Operaciones de dominio desde el panel del cliente

El cliente puede actualizar sus contactos y solicitar la transferencia de su dominio; ambas acciones pasan por una confirmación porque son el camino habitual del robo de dominios.

| Operación | Quién la inicia | Flujo | Restricciones |
| --- | --- | --- | --- |
| Ver datos del dominio | Cliente | Lectura directa | — |
| Cambiar contactos (administrativo, técnico, facturación) | Cliente administrador | Formulario, confirmación por correo, envío al registrador por API | Según lo que admita cada registrador |
| Cambiar titular | Cliente administrador | Solicitud, validación de soporte, envío al registrador | En dominios genéricos exige confirmación del titular y puede bloquear la transferencia 60 días |
| Cambiar servidores DNS | Cliente administrador | Confirmación por correo, envío por API | Aviso de que puede dejar sin servicio el sitio y el correo |
| Solicitar transferencia de salida | Cliente administrador | Solicitud, verificación de identidad y de deudas, desbloqueo, entrega del código de autorización | No disponible en los 60 días posteriores al registro o a una transferencia |
| Renovar | Cliente | Pago validado, renovación por API | — |

- Cada dominio guarda quién figura como titular: la empresa o el cliente. El reporte de dominios lo muestra para regularizar los que deban pasar a nombre del cliente.
- Sin API en el registrador, la misma solicitud crea una tarea para soporte con los pasos.
- Las reglas de los dominios .pe y de otros dominios de país se documentan por extensión antes de habilitar estas operaciones.
- Queda por confirmar, por registrador, qué operaciones permite su API: contactos, bloqueo y código de autorización.

## 17. Nodos de hosting propios y migración desde BanaHosting

Una cuenta reseller y un VPS propio con WHM se modelan igual, como un nodo de hosting con capacidad, cuentas y clientes; cambia solo qué permite hacer el conector.

| Aspecto | Reseller BanaHosting | VPS propio con WHM |
| --- | --- | --- |
| Acceso por API | Limitado a los privilegios del reseller | Completo (root) |
| Capacidad | Límite contratado | Recursos del servidor |
| Copias de seguridad | Del proveedor | Responsabilidad propia: se registran en el módulo de backups |
| Actualizaciones y seguridad | Del proveedor | Responsabilidad propia: tareas recurrentes |
| Costo | Plan del reseller | Servidor más licencia de cPanel según número de cuentas |
| Correo | IP del proveedor | Reputación de IP propia: se vigila en el monitoreo |

### Migración por lotes

1. Elegir el nodo destino; el sistema valida que tenga capacidad.
2. Armar el lote de cuentas y ordenarlo por tamaño y riesgo.
3. Por cada cuenta: respaldo, copia al destino, prueba del sitio y del correo, cambio de DNS, verificación y baja en el origen.
4. Cada cuenta tiene estado propio: pendiente, copiada, en prueba, DNS cambiado, verificada, cerrada o revertida.
5. El mapa de servicios del cliente se actualiza solo al cerrar la cuenta.
6. Un tablero muestra el avance: cuentas migradas, pendientes y espacio liberado en cada reseller.

El costo de un nodo propio se reparte entre sus clientes con la distribución de costos del módulo de finanzas.

## 18. Correo corporativo y certificados SSL

El correo y los certificados se registran como componentes del mapa de servicios, con sus licencias, vencimientos y verificación de DNS.

### Correo por proveedor

| Proveedor | Qué se registra | Qué ve el cliente | Qué se factura |
| --- | --- | --- | --- |
| cPanel | Cuenta, buzones, cuota y uso | Buzones y espacio usado | Plan de hosting o correo |
| Google Workspace | Dominio, edición, licencias compradas y asignadas, renovación | Licencias y usuarios | Licencias por usuario |
| Microsoft 365 (Azure) | Inquilino, dominio, planes, licencias compradas y asignadas, renovación | Licencias y usuarios | Licencias por usuario |

- Se registra quién es el titular de la cuenta en el proveedor: la empresa o el cliente. Define quién paga al proveedor y qué se entrega en un traspaso.
- Verificación diaria de los registros MX, SPF, DKIM y DMARC, con aviso si cambian o faltan.
- Alerta cuando las licencias asignadas superan las facturadas al cliente.
- No se guardan contraseñas de buzones.

### Certificados SSL

| Campo | Detalle |
| --- | --- |
| Dominios cubiertos | Uno, varios o comodín |
| Emisor y tipo | Gratuito con renovación automática o de pago |
| Proveedor de compra | Solo para certificados de pago; con costo y precio de venta |
| Fechas | Emisión y expiración |
| Dónde está instalado | Servidor, cuenta de hosting, CDN o balanceador |
| Renovación | Automática o manual, con responsable |

- Un job diario lee el certificado publicado en cada dominio y actualiza emisor y expiración.
- Avisos a 30, 15 y 7 días para los certificados de renovación manual; cada aviso crea una tarea.
- Un certificado gratuito que no se renovó a 10 días de expirar genera una alerta técnica.

## 19. Preparación para SaaS

Se recomienda construir el sistema para uso propio pero con la base de datos y el código listos para varias empresas; convertirlo después sin esa base obliga a rehacer cada tabla y cada consulta.

### Qué se hace ahora

- `organization_id` en toda tabla de negocio, con filtro global y índices que lo incluyen.
- Una prueba automática que falla si una consulta devuelve datos de otra organización.
- Llaves API, marcas, entidades legales, plantillas, series y ajustes pertenecen a la organización; nada de la empresa queda escrito en el código.
- Archivos, colas y caché con el identificador de la organización en su ruta o clave.
- Los conectores reciben sus credenciales por parámetro, nunca de la configuración global.

### Qué se deja para cuando se decida vender

- Registro de nuevas empresas y alta automática.
- Planes, límites y cobro de la suscripción al SaaS.
- Panel de administración de la plataforma y soporte a empresas clientes.
- Clave maestra por organización en KMS o Vault y auditoría reforzada.
- Términos de servicio, tratamiento de datos de terceros y aislamiento de alto volumen.

### Condición para dar el paso

Usar el sistema en la operación propia durante al menos un ciclo completo de renovaciones antes de ofrecerlo. Al vender el SaaS, la empresa pasa a custodiar llaves API de otras empresas de hosting, lo que eleva la exigencia de seguridad y de soporte.

## 20. Arquitecturas multi-nube y servicios SaaS sobre cloud

AWS, Azure y Google Cloud se tratan con un mismo modelo: cuenta del proveedor, proyecto cloud, recursos y costos; sobre ese modelo se registran las arquitecturas de cada cliente y las plataformas SaaS que la empresa opera para varios clientes.

### Equivalencias entre nubes

| Concepto en el sistema | AWS | Azure | Google Cloud |
| --- | --- | --- | --- |
| Cuenta del proveedor | Cuenta (u organización) | Inquilino y suscripción | Organización y cuenta de facturación |
| Proyecto cloud | Cuenta o conjunto de etiquetas | Grupo de recursos | Proyecto |
| Servidor | EC2 | Máquina virtual | Compute Engine |
| Base de datos | RDS | Azure SQL y bases gestionadas | Cloud SQL |
| Almacenamiento | S3 | Blob Storage | Cloud Storage |
| DNS | Route 53 | Azure DNS | Cloud DNS |
| Acceso de lectura | Rol IAM asumido | Entidad de servicio con rol Lector | Cuenta de servicio con rol Visor |
| Costos | Cost Explorer y presupuestos | Cost Management | Exportación de facturación |

### Modalidades de servicio

| Modalidad | Quién es dueño de la cuenta cloud | Cómo se factura | Qué ve el cliente |
| --- | --- | --- | --- |
| Arquitectura dedicada en cuenta de la empresa | La empresa | Costo del proveedor más administración | Sus recursos, consumo y costo acordado |
| Arquitectura administrada en cuenta del cliente | El cliente | Solo administración y soporte | Sus recursos; el pago al proveedor lo hace él |
| SaaS sobre arquitectura compartida | La empresa | Plan por usuarios, almacenamiento o módulos | Su instancia: plan, uso y límites; nunca la infraestructura |
| Cuenta nueva administrada con entrega al final del periodo | La empresa durante el periodo; el cliente al finalizar | Factura del proveedor más un porcentaje de administración | Sus recursos, el costo del proveedor y el porcentaje aplicado |

Las modalidades son un catálogo configurable: se pueden agregar otras sin programar, definiendo titular de la cuenta, forma de facturar y qué ve el cliente.

### Refacturación con porcentaje y entrega de cuenta

1. Se abre una cuenta nueva en el proveedor para el cliente y se registra con fecha de inicio y de fin del periodo.
2. Cada mes se carga la factura del proveedor: por API cuando existe, o subiendo el documento.
3. El sistema genera la factura al cliente: importe del proveedor, más el porcentaje de administración pactado en el contrato, más impuestos.
4. La factura del proveedor queda adjunta como sustento y visible para el cliente.
5. Si la moneda del proveedor difiere de la del cliente, se aplica el tipo de cambio de la fecha de la factura.
6. Antes del fin del periodo el sistema avisa y abre el flujo de entrega: lista de verificación, cambio de titular y de medio de pago, retiro de los accesos de la empresa, rotación de credenciales y acta de entrega firmada.
7. Tras la entrega, el servicio pasa a "entregado": se conserva el historial y termina la facturación, o continúa como administración en cuenta del cliente si así se acuerda.

El porcentaje se define por contrato y admite mínimo mensual. Un reporte compara lo facturado por cada proveedor con lo refacturado, para detectar meses sin cobrar.

### Cualquier proveedor, incluidos los que trae el cliente

- Los proveedores son datos, no código: se da de alta uno nuevo (por ejemplo IBM Cloud para servicios de IA educativa) desde el panel, con sus cuentas, contactos, moneda y costos.
- Un proveedor sin conector funciona completo en modo manual: componentes en el mapa de servicios, vencimientos, costos, facturas del proveedor adjuntas y accesos en la bóveda.
- Se registra el origen del proveedor: propio de la empresa o aportado por el cliente.
- Un conector específico se construye solo cuando el volumen de clientes en ese proveedor lo justifica; el contrato de conectores de la sección 6 permite agregarlo sin tocar el resto.
- Para servicios que no son infraestructura (IA, APIs de terceros, licencias), el componente registra plan, consumo y límite en las unidades del proveedor.

### SaaS sobre arquitectura compartida

- Una **plataforma SaaS** (`saas_platforms`) es un producto que corre sobre un proyecto cloud y atiende a varios clientes.
- Cada cliente tiene una **instancia** (`saas_instances`) con plan, usuarios, almacenamiento, dominio y fecha de renovación.
- La instancia aparece en el mapa de servicios del cliente como un solo componente; la arquitectura que la sostiene solo se ve en la vista de soporte.
- El costo mensual de la arquitectura se reparte entre las instancias por usuarios activos, almacenamiento o porcentaje fijo, con el módulo de finanzas.
- Un incidente en un recurso compartido lista automáticamente todas las instancias y clientes afectados.
- Alerta cuando una instancia supera los límites de su plan, para facturar el excedente o proponer una ampliación.

### Reglas

- **Etiquetado obligatorio.** Cada recurso cloud lleva etiquetas de cliente, proyecto y ambiente; el descubrimiento usa esas etiquetas para asignarlo. Un recurso sin etiquetas aparece como "sin cliente asignado".
- **Solo lectura por defecto.** El sistema no crea ni borra recursos cloud; las acciones se hacen en el proveedor y el sistema las refleja al sincronizar.
- **Cuenta del cliente.** Cuando la cuenta es del cliente, se registra su autorización y el acceso de lectura puede revocarlo él en cualquier momento.
- **Presupuesto por proyecto.** Alertas al 80 % y 100 % del presupuesto mensual.
- **Ambientes.** Desarrollo, pruebas y producción se registran por separado y se pueden ocultar al cliente.

## 21. Definiciones del negocio y prioridades

Con unos 400 clientes, un solo RUC, 4 marcas y cuatro usuarios internos, el sistema debe resolver ante todo tres problemas: finanzas olvida cobrar, soporte no lleva orden en sus trabajos y ventas avisa los clientes nuevos por WhatsApp. Esta sección reúne las definiciones del negocio que el resto del kit ya aplica.

### Definiciones confirmadas

| Tema | Definición | Efecto en el sistema |
| --- | --- | --- |
| Entidad emisora | Un solo RUC emite para Perú y el extranjero | Una sola `legal_entity`; las marcas solo cambian la presentación |
| Monedas | Soles (PEN) y dólares (USD) | Solo dos monedas activas; tipo de cambio diario para reportes |
| Contenido de la factura | Incluye todo el monto del servicio, también el costo del proveedor cuando se refactura | Una línea por servicio con el importe total; el detalle del proveedor va como anexo |
| Contratos | Todo servicio complejo lleva contrato y documentación, a cargo del área de documentación y tramitación | El producto se marca "requiere contrato"; no se activa sin contrato firmado |
| Pagos del extranjero | PayPal, Global66 y otros que se agreguen | Medios de pago configurables, cada uno con su comisión |
| Recargo por medio de pago | PayPal y similares agregan un porcentaje por transacción | Recargo configurable por medio, mostrado antes de pagar |
| Suspensión | Se suspende a clientes que no pagan; una promesa de pago solo posterga la suspensión hasta la fecha prometida | Registro de compromisos de pago con fecha; si se incumple, la cobranza continúa sola |
| Dominios | Algunos a nombre del cliente y otros de la empresa | Campo titular y reporte para regularizar |
| Google Workspace y Microsoft 365 | Cuentas creadas por la empresa para cada cliente; meta: ser proveedor oficial | Hoy registro manual; conector de revendedor cuando se obtenga la condición de socio |
| Panel del cliente | Solo consulta; para crear buzones entra a su cPanel con un clic | Acceso directo a cPanel con sesión temporal generada por WHM |
| Acciones del cliente | Cambiar DNS y reiniciar servidor con permiso previo; construidas pero apagadas | Interruptor por acción y por cliente |
| Pagos en el panel | Pago en línea y envío de voucher de transferencia | Ambos incluidos |
| Tickets | Hoy solo WhatsApp | Help desk completo, con WhatsApp como canal |
| Alojamiento del sistema | VPS en Contabo; correo saliente por Elastic Email | Respaldos en AWS S3 |
| Volumen | Alrededor de 400 clientes | Migración desde Excel con asistente e importación por lotes |

### Definiciones adicionales

| Tema | Definición | Efecto en el sistema |
| --- | --- | --- |
| Marcas | 4 marcas comerciales bajo un solo RUC | 4 filas en `brands`, todas con la misma entidad emisora; plantillas, portal y correos por marca |
| Porcentaje de administración | Se calcula sobre el monto del proveedor antes de impuestos; sin mínimo fijo, según contrato | Porcentaje y mínimo opcional por contrato; el IGV se aplica después sobre el total |
| Pasarela de tarjetas local | Incluida; proveedor por elegir | El cliente paga desde el panel con tarjeta o por transferencia con voucher; la comisión de la pasarela va como línea aparte si se traslada |
| Exportación de servicios | La empresa está inscrita en el Registro de Exportadores de Servicios | Clientes del extranjero se facturan como exportación en los productos que el contador valide |
| Recargo por medio de pago | Va como línea aparte en el comprobante | Línea "Comisión por medio de pago" generada al pagar con PayPal u otro medio con recargo |
| Dominios de país | Unos 30 .pe, además .cl, .mx y .co; genéricos .com, .net, .org | Reglas por extensión para transferencia, cambio de titular y renovación |
| Titularidad de dominios | Se regularizan los que están a nombre de la empresa | Proyecto de regularización con estado por dominio |
| Proveedor visible al cliente | Oculto por defecto; solo se muestra si se indica | Ajuste por cliente y por servicio, apagado por defecto |
| Cuentas cloud del cliente | Siempre con autorización expresa y documento que la sustente | No se registra la cuenta sin el documento adjunto |
| Etiquetado cloud | Hoy no hay; los técnicos etiquetarán | Tarea de etiquetado por cuenta antes de la primera sincronización |
| Respaldos del sistema | AWS S3, fuera de Contabo | Bucket de AWS S3 con versionado, cifrado y credenciales que solo pueden escribir; prueba de restauración periódica |
| Avisos de vencimiento | 30, 15, 7 y 3 días antes, y el día del vencimiento | Secuencia por defecto, editable por producto, cliente o contrato |
| Suspensión | Apenas termina el plazo | Suspensión el día siguiente al vencimiento, editable |

**Respaldos.** Se guardan fuera de Contabo para que un problema con esa cuenta (bloqueo, pago fallido, acceso robado) no se lleve también las copias. Se usará AWS S3: bucket propio del sistema, con versionado y bloqueo contra borrado durante el periodo de retención, paso a almacenamiento de bajo costo tras 30 días, y un usuario de acceso que solo puede subir archivos, nunca borrarlos.

**Suspensión inmediata.** Funciona igual que hoy, pero con tres salvaguardas: no se suspenden dominios (se deja de renovar), un compromiso de pago registrado posterga la suspensión hasta su fecha, y el administrador puede marcar clientes exentos.

### Acciones del cliente con interruptor

| Acción | Estado inicial | Cómo funciona al activarse |
| --- | --- | --- |
| Entrar a su cPanel | Activa | Botón que abre cPanel con una sesión temporal; no se muestra la contraseña |
| Ver consumo y características | Activa | Datos leídos por API |
| Cambiar servidores DNS | Construida, apagada | Confirmación por correo y aviso de impacto |
| Reiniciar servidor | Construida, apagada | El cliente solicita, soporte aprueba y el sistema ejecuta por API |
| Crear buzones u otras acciones de cPanel desde el panel | No se construye ahora | Se hace dentro de cPanel |

El interruptor existe a nivel general y por cliente; activarlo queda en auditoría.

### Usuarios y roles

Cuatro usuarios internos (administrador, ventas, finanzas y soporte) más tres roles sugeridos: documentación y tramitación, contador externo y técnico temporal. La matriz completa está en la sección 5.

### Del WhatsApp al sistema

1. **Ventas registra el cliente nuevo y su pedido en el sistema**, en lugar de avisar por WhatsApp. El pedido notifica a finanzas y crea las tareas de soporte.
2. **Finanzas recibe la cobranza ya armada:** cada mañana ve qué vence, qué se envió y quién no pagó. Los avisos salen solos.
3. **Soporte trabaja con tickets y tareas:** todo pedido de cliente, aunque llegue por WhatsApp, se registra como ticket. Los mensajes de WhatsApp Business llegan a la bandeja compartida y crean el ticket directamente.

### Qué debe funcionar primero al poner en marcha

1. Clientes, servicios, dominios y vencimientos, con la migración de los 400 clientes.
2. Facturación, cobranza automática, pago en línea y voucher.
3. CRM básico y pedido de cliente nuevo desde ventas.
4. Help desk mínimo y tareas para soporte.
5. Mapa de servicios y panel del cliente en modo consulta.

### Medios de pago

| Medio | Uso | Comisión | Integración |
| --- | --- | --- | --- |
| Transferencia nacional | Clientes en Perú | Sin recargo | Voucher en el panel y validación de finanzas |
| PayPal | Clientes del extranjero | Porcentaje más fijo por transacción, según tarifa vigente | API con webhooks |
| Global66 | Clientes del extranjero | Según tarifa vigente | Confirmar si ofrece API o enlaces de cobro; si no, registro manual con comprobante |
| Pasarela de tarjetas local | Clientes en Perú | Porcentaje y monto fijo según contrato con la pasarela | Incluida: pago con tarjeta de crédito o débito desde el panel con formulario alojado por la pasarela; proveedor por elegir (Niubiz, Izipay, Culqi, Mercado Pago u otro) |

- Cada medio guarda su comisión (porcentaje y monto fijo) y si se traslada al cliente.
- El recargo se muestra al cliente antes de pagar. Va como línea aparte "Comisión por medio de pago" en el comprobante.
- La comisión real cobrada por el medio se registra como gasto para la rentabilidad.
- Agregar un medio nuevo es configurar un conector de pago; los manuales funcionan solo con voucher.

### Pago con tarjeta: requisitos para elegir la pasarela

El cliente paga una o varias facturas con tarjeta de crédito o débito desde su panel. El formulario de la tarjeta lo muestra la pasarela (formulario alojado o embebido con tokenización), de modo que los datos de la tarjeta nunca pasan por los servidores de la empresa; esto reduce las obligaciones de seguridad de pagos (PCI DSS) al mínimo.

| Requisito | Por qué |
| --- | --- |
| Formulario alojado o tokenizado | El sistema no recibe ni guarda números de tarjeta |
| Cobro en soles y dólares | Las dos monedas de facturación |
| API documentada con entorno de pruebas | Integración y pruebas sin cobros reales |
| Webhooks firmados de pago aprobado, rechazado y reembolsado | El pago se valida solo con la confirmación de la pasarela, sin depender de que el cliente vuelva a la página |
| Reembolso total o parcial por API | Notas de crédito y devoluciones |
| Consulta de transacciones y reporte de liquidación | Conciliación de lo cobrado con lo abonado en banco |
| Tarjetas Visa, Mastercard, American Express y Diners como mínimo; Yape u otras billeteras si las ofrece | Comodidad del cliente |
| Autenticación 3-D Secure | Menos fraude y contracargos |
| Comisión y plazo de abono por contrato | Se cargan como ajustes del medio de pago |

Reglas: el pago con tarjeta se valida automáticamente al recibir el webhook aprobado con importe coincidente, sin pasar por finanzas; cada transacción guarda su identificador externo único; la comisión real se registra como gasto; un contracargo abre una alerta para finanzas y deja la factura con saldo pendiente. Candidatas a evaluar: Niubiz, Izipay, Culqi y Mercado Pago; no se compararon sus condiciones actuales.

### Facturación electrónica: cómo elegir proveedor

La emisión se hace a través de un OSE o PSE autorizado por SUNAT, o con el sistema gratuito de SUNAT. Para usar un OSE, la empresa registra su certificado digital en SUNAT Operaciones en Línea (SOL) y autoriza al operador; la autorización rige desde el día calendario siguiente ([Alegra](https://blog.alegra.com/peru/ose-operador-de-servicios-electronicos/)).

| Requisito para el proveedor | Por qué |
| --- | --- |
| API REST documentada con entorno de pruebas | El sistema emite sin intervención manual |
| Facturas, boletas, notas de crédito y débito, en soles y dólares | Todos los documentos que se emiten hoy |
| Facturas a clientes del extranjero sin RUC | Clientes de otros países |
| Respuesta con XML, CDR y PDF, o enlace a ellos | Respaldo de cada documento |
| Consulta de estado y reenvío de rechazados | Corregir errores sin emitir de nuevo |
| Anulación y comunicación de baja | Errores de emisión |
| Precio por documento o plan mensual acorde a unos 400 clientes | Costo previsible |
| Soporte en Perú y conservación de documentos | Obligaciones de archivo |

Candidatos a evaluar con esa tabla: Nubefact, Efact, Bizlinks, el facturador de Odoo u otros operadores autorizados, y el sistema gratuito de SUNAT si el volumen lo permite. No se compararon precios ni funciones actuales.

**Clientes del extranjero.** Un servicio a un cliente no domiciliado puede no estar gravado con IGV si califica como exportación de servicios; para eso el prestador debe estar inscrito en el Registro de Exportadores de Servicios de SUNAT, entre otros requisitos ([SUNAT](https://emprender.sunat.gob.pe/principales-impuestos/impuesto-general-las-ventas-igv/exportacion-servicios)). El contador debe confirmar qué servicios califican; el sistema permite marcar cada producto y cada cliente como gravado o exportación.

### Pendientes que siguen abiertos

- Qué proveedor de facturación electrónica se elegirá.
- Si Global66 ofrece API de cobros para la cuenta de la empresa.
- Qué productos califican como exportación de servicios, según el contador.
- Reglas de transferencia y cambio de titular de .pe, .cl, .mx y .co, documentadas antes de habilitar esas operaciones.
- Plazo de los programas de socio de Google Workspace y Microsoft.

## 22. Análisis frente al mercado

Ningún producto del mercado cubre a la vez la facturación de hosting, la operación de soporte y la documentación por cliente; el kit las une, pero le faltaban 14 funciones que esas plataformas ya resuelven y que se agregan aquí.

### Tres familias de productos

| Familia | Ejemplos | En qué son fuertes | Qué no resuelven para esta empresa |
| --- | --- | --- | --- |
| Facturación y automatización de hosting | WHMCS, Blesta, HostBill, Upmind | Facturas recurrentes, avisos y suspensión automática, dominios, módulos de cPanel, portal del cliente | Arquitecturas multi-nube, mapa de servicios, refacturación con porcentaje, facturación electrónica SUNAT |
| PSA para proveedores de servicios administrados | HaloPSA, SuperOps | Contratos, bolsas de horas, SLA, tickets, proyectos, rentabilidad por cliente y por técnico | Dominios, hosting, sincronización con registradores y WHM |
| Documentación de clientes | IT Glue, Hudu | Activos, relaciones, contraseñas, procedimientos por cliente | Facturación, cobranza, portal comercial |

Como referencia de lo que un sistema de este tipo deja configurable, WHMCS permite fijar desde el panel los días de generación de facturas, un aviso antes del vencimiento y hasta tres avisos de mora, hasta cinco avisos de renovación de dominios, días de suspensión y de terminación, recargos por mora, cierre de tickets inactivos y retención de datos ([WHMCS](https://whmcsdocs.devops.cpanel.net/8-13/system/automation/automation-settings)). HaloPSA reúne contratos, bolsas de horas, SLA, portal propio y rentabilidad por cliente y técnico ([HaloPSA](https://usehalo.com/halopsa/solutions/msp/)). Hudu e IT Glue centran su oferta en documentación, contraseñas, activos y procedimientos ([Hudu](https://www.hudu.com/itglue-alternative)).

### Funciones que faltaban

| # | Función | Lo hace el mercado | Decisión para el kit |
| --- | --- | --- | --- |
| 1 | Centro de configuración de avisos y plazos | Facturación de hosting | Todo administrable desde el panel (sección 23) |
| 2 | Terminación tras suspensión | Facturación de hosting | Baja definitiva a los 10 días de suspendido (administrable), con respaldo previo y aprobación |
| 3 | Recargo por mora | Facturación de hosting | Activo, con monto administrable; por defecto en nota de débito |
| 4 | Estado de cuenta y antigüedad de deuda | Facturación y PSA | Estado de cuenta en PDF por cliente; deuda por tramos de 0-30, 31-60, 61-90 y más de 90 días |
| 5 | Detracciones y retenciones de IGV | No aplica fuera de Perú | Detracción solo en facturas nacionales, administrable; retención registrada como pago parcial; fuera de Perú el cliente asume sus impuestos y comisiones |
| 6 | Precios de dominios por extensión | Facturación de hosting | Costo y precio por extensión y registrador, con alerta si el margen cae |
| 7 | Ajuste masivo de precios con aviso | Facturación de hosting | Cambio de precio por producto con aviso antes de la siguiente renovación |
| 8 | Correo de bienvenida con datos del servicio | Facturación de hosting | Plantilla por producto al activar; accesos por enlace de un solo uso |
| 9 | Destinatarios por tipo de aviso | Facturación y PSA | Cada aviso va al rol de contacto que corresponde |
| 10 | Procedimientos por proyecto del cliente | Documentación | Pestaña de procedimientos en el mapa de servicios |
| 11 | Entrega segura de accesos al cliente | Documentación | Enlace de un solo uso con vencimiento |
| 12 | Rentabilidad por técnico y horas no facturadas | PSA | Reporte de horas registradas contra facturadas |
| 13 | Avisos de cobranza por WhatsApp | Facturación con módulos | Canal adicional con plantillas aprobadas por Meta |
| 14 | Cierre automático de tickets inactivos | Facturación y PSA | Cierre a los N días en "esperando cliente", administrable |

### Lo que se descarta a propósito

- **Cobro automático con tarjeta guardada:** el pago con tarjeta es por factura y a iniciativa del cliente; no se guardan tarjetas ni se cobra de forma automática.
- **Antifraude en pedidos:** los clientes llegan por ventas, no por compra en línea abierta.
- **Tienda en línea con carrito:** ya no se descarta: se incluye para servicios simples (sección 25); los servicios complejos siguen pasando por ventas y contrato.
- **Monitoreo propio completo:** se integra una herramienta existente.

### Por qué construir y no comprar

Un WHMCS más un PSA más una herramienta de documentación cubrirían buena parte de lo pedido, pero dejarían fuera lo que hace distinta a la empresa: la facturación electrónica peruana, la refacturación con porcentaje, las arquitecturas multi-nube y el mapa de servicios. Además obligarían a pagar tres licencias y a sincronizar clientes entre tres sistemas. Con un área de desarrollo propia, construir es razonable si se respeta el orden de dependencias.

## 23. Centro de configuración

Toda regla de avisos, plazos y automatizaciones trae un valor por defecto y se administra desde el panel, sin programar; el área de desarrollo no debe escribir ningún día, porcentaje ni texto de aviso en el código.

### Reglas generales

- **Niveles:** cada ajuste se define a nivel general y puede sobrescribirse por marca, producto, cliente o contrato. Gana el más específico, y la pantalla muestra de dónde viene el valor vigente.
- **Auditoría:** cada cambio registra quién, cuándo, valor anterior y valor nuevo, y puede revertirse.
- **Vista previa:** antes de guardar, un simulador muestra el calendario de avisos y acciones para una factura o un dominio de ejemplo.
- **Prueba:** cada plantilla puede enviarse de prueba a un correo interno.
- **Permisos:** solo el administrador cambia ajustes generales; finanzas administra los de cobranza.

### Secuencia de avisos de cobranza

La secuencia es una lista de etapas que se agregan, quitan, editan o desactivan. Por defecto trae la que usa hoy la empresa.

| Campo de cada etapa | Opciones | Valor por defecto |
| --- | --- | --- |
| Momento | N días antes, el día del vencimiento o N días después | 30, 15, 7 y 3 días antes; el día; 1 día después |
| Acción | Enviar aviso, crear tarea para finanzas, suspender servicio | Aviso en todas; suspensión 1 día después |
| Canales | Correo, portal, WhatsApp (cuando esté activo) | Correo y portal |
| Plantilla | Una por marca e idioma, con variables (cliente, servicio, monto, fecha, enlace de pago) | Plantilla estándar por etapa |
| Destinatario | Rol de contacto: facturación, administrativo, técnico | Facturación |
| Copia interna | Finanzas, ventas responsable, ninguno | Finanzas en la suspensión |
| Hora de envío | Hora del día en la zona del cliente | 9:00 |
| Días no hábiles | Enviar igual o pasar al siguiente día hábil | Siguiente día hábil para suspensiones |
| Estado | Activa o inactiva | Activa |

### Catálogo de ajustes administrables

| Grupo | Ajuste | Valor por defecto |
| --- | --- | --- |
| Facturación | Días de anticipación para generar facturas, por ciclo | 30 días |
| Facturación | Consolidar servicios del cliente en una factura | Según cliente |
| Facturación | Recargo por mora: porcentaje o monto, días de gracia | Activo; porcentaje o monto y días de gracia se fijan en el panel |
| Facturación | Comisión por medio de pago y si se traslada al cliente | PayPal: sí; transferencia: no |
| Facturación | Fuente y hora de actualización del tipo de cambio | SUNAT, actualización diaria |
| Servicios | Días de mora para suspender | 1 |
| Servicios | Días suspendido para terminar (baja definitiva) | 10 días; requiere aprobación |
| Servicios | Reactivar automáticamente al validar el pago | Sí |
| Servicios | Clientes y productos exentos de suspensión | Ninguno |
| Dominios | Avisos al cliente antes del vencimiento comercial | 30, 15, 7 y 3 días |
| Dominios | Avisos internos antes de la expiración real | 30, 15, 7 y 3 días |
| Dominios | Frecuencia de sincronización con registradores | Diaria |
| Certificados y licencias | Avisos antes de la expiración | 30, 15 y 7 días |
| Proveedores | Avisos antes de la renovación de cada cuenta | 30 y 7 días |
| Capacidad | Umbrales de uso de nodos y planes | 70, 85 y 95 % |
| Cloud | Umbrales de presupuesto por proyecto | 80 y 100 % |
| Tickets | SLA de primera respuesta y resolución por prioridad | Administrable; valores iniciales en la tabla de SLA |
| Tickets | Días en "esperando cliente" antes de cerrar | 7 días |
| Tickets | Retención de adjuntos | 12 meses |
| Mapa de servicios | Frecuencia de lectura de consumo | Diaria |
| Panel del cliente | Mostrar nombre del proveedor | No |
| Panel del cliente | Acciones habilitadas: cambiar DNS, reiniciar servidor | Apagadas |
| Seguridad | Duración de sesión, MFA obligatorio, límite de revelaciones por hora | 8 horas, sí para personal, 10 |
| Sistema | Hora de las tareas diarias | 6:00 |
| Sistema | Retención de clientes inactivos y de registros técnicos | Por definir según ley aplicable |
| Sistema | Respaldos: frecuencia y retención en AWS S3 | Diario; 35 días |

### SLA de soporte

El SLA se administra por prioridad y puede sobrescribirse por producto o contrato. Los tiempos corren solo en el horario de atención configurado, descuentan feriados de Perú y se pausan en "esperando cliente" y "esperando proveedor". Los valores iniciales son una propuesta para editar.

| Prioridad | Primera respuesta | Solución | Ejemplo |
| --- | --- | --- | --- |
| Crítica | 1 hora | 4 horas | Sitio o correo caído |
| Alta | 4 horas | 1 día hábil | Función importante con falla |
| Media | 8 horas | 3 días hábiles | Consulta técnica o cambio menor |
| Baja | 1 día hábil | 5 días hábiles | Solicitud sin urgencia |

Ajustes del SLA: horario de atención por día de la semana, calendario de feriados, alertas al 75 % del tiempo y al incumplir, y destinatarios de la alerta.

### Detracciones y recargo por mora

- **Detracción:** se aplica solo a facturas nacionales, según la normativa peruana vigente. El porcentaje, el monto mínimo, los productos alcanzados y la cuenta del Banco de la Nación se administran en el panel; el comprobante incluye la leyenda y el monto de la detracción. El contador valida la configuración inicial. Fuera de Perú no se aplica detracción: los impuestos, retenciones y comisiones bancarias o de pago del país del cliente corren por cuenta del cliente. Así se indica en el contrato y en una nota fija del comprobante de exportación, y el monto facturado no se reduce por esos conceptos.
- **Retención de IGV:** si el cliente es agente de retención, el pago recibido es menor al total; finanzas registra el comprobante de retención y la factura queda saldada.
- **Recargo por mora:** activo. Se define como porcentaje o monto fijo, con días de gracia y límite máximo, y se emite por defecto en una nota de débito; también puede configurarse para agregarse en la siguiente factura. Puede desactivarse por cliente o contrato.

### Registro de avisos

Cada aviso enviado queda en el historial del cliente con fecha, canal, destinatario, plantilla, estado de entrega y si fue abierto cuando el canal lo informa. Finanzas puede reenviar un aviso o enviar uno manual desde la factura.

## 24. CRM básico, cotizaciones y contratos editables

El CRM básico saca las ventas del WhatsApp con prospectos, embudo, seguimientos y canales de captación; las cotizaciones y la redacción de contratos dentro del sistema completan el ciclo comercial.

### CRM básico

| Función | Detalle |
| --- | --- |
| Prospectos | Nombre, empresa, contacto, servicio de interés, marca y canal de origen (WhatsApp, web, referido, otro) |
| Embudo | Nuevo, contactado, propuesta enviada, negociación, ganado o perdido (con motivo); etapas administrables |
| Seguimientos | Actividad con fecha y recordatorio; alerta de prospectos sin seguimiento en N días |
| Conversión | El prospecto ganado pasa a cliente y pedido con un clic; el pedido avisa a finanzas, soporte y, si el servicio es complejo, a documentación |
| Oportunidades sobre clientes | Renovaciones y ventas adicionales sugeridas desde el mapa de servicios (por ejemplo, cliente con hosting sin SSL ni correo) |
| Vista de ventas | Tablero por etapa, seguimientos del día y valor estimado del embudo por moneda |

### Canales de captación

Cada prospecto entra con su canal de origen registrado automáticamente cuando el canal lo permite; los canales se crean y administran desde el panel.

| Canal | Cómo entra al sistema | Datos que guarda |
| --- | --- | --- |
| Landing y web de cada marca | Formulario insertable (script o iframe) y endpoint con clave por formulario; protección anti-spam | Marca, página, campaña y parámetros UTM |
| WhatsApp | WhatsApp Business Platform: bandeja compartida; desde cada conversación se crea prospecto, ticket o se vincula a un cliente | Número, conversación, marca del número |
| Mailing | Las campañas se envían desde Elastic Email; el sistema sincroniza listas por marca, servicio y estado, y recibe bajas y rebotes | Lista, campaña, baja |
| Redes sociales | Formularios de clientes potenciales de Facebook e Instagram por webhook | Página, formulario, campaña |
| Referidos | Registro manual o enlace de referido del cliente | Cliente que refiere |
| Llamadas, eventos y otros | Registro manual eligiendo el canal | Canal y nota |

- **Consentimiento:** cada contacto guarda si aceptó recibir comunicaciones comerciales; una baja en Elastic Email o en el portal se respeta en todos los canales.
- **Reporte por canal:** prospectos recibidos, convertidos, tiempo de conversión y monto facturado por canal, marca y periodo.
- **Asignación:** reglas administrables para asignar el prospecto al vendedor según marca o canal; aviso inmediato al asignado.

### Cotizaciones

- Cargos únicos y recurrentes en la misma cotización, en soles o dólares.
- Plantilla PDF por marca e idioma; vigencia administrable.
- Versiones: cada cambio genera una nueva versión y se conserva el historial.
- Envío por correo desde el sistema y registro de aceptación o rechazo.
- Conversión a contrato o pedido sin volver a digitar.

### Contratos editables

| Función | Detalle |
| --- | --- |
| Plantillas | Por tipo de servicio y marca, editadas en un editor de texto enriquecido |
| Variables | Cliente, RUC o documento, servicios, montos, moneda, porcentaje de administración, plazos, SLA, fechas |
| Cláusulas reutilizables | Biblioteca administrada por documentación: confidencialidad, SLA, impuestos fuera de Perú, recargo por mora, entrega de cuenta, autorización de acceso cloud |
| Borrador | Edición libre con historial de cambios y comentarios internos |
| Aprobación | El administrador aprueba antes de enviar al cliente |
| Firma | Se sube el contrato firmado (escaneado o con firma digital) y pasa a vigente; además, integración con un servicio de firma electrónica a elegir |
| Bloqueo | Un contrato firmado no se edita; los cambios se hacen con adenda enlazada como nueva versión |
| Vencimiento | Avisos antes del fin del contrato, administrables en el centro de configuración |

Estados del contrato: borrador, en revisión, aprobado, enviado, firmado y vigente, vencido, terminado. Un servicio marcado "requiere contrato" no se activa hasta que su contrato esté vigente.

## 25. Web multimarca con CMS, compra en línea, asistente con IA y respaldos ampliados

Cada marca tiene su propia web administrada desde un CMS dentro del sistema, pero todas llevan al cliente al sistema central en alojamientoplus.com para comprar, pagar, consultar sus servicios y pedir soporte.

> **Actualización del 8 de octubre:** las webs públicas se harán en WordPress, no con un CMS dentro del sistema. Las subsecciones de CMS, apariencia de la web, CSS, scripts de marketing, cookies, blog, páginas de error y SEO de esta sección quedan reemplazadas por la sección 26. Siguen vigentes: dominios y sistema central, compra en línea, asistente con IA, respaldos ampliados, apariencia del portal, panel y correos, administración de paquetes y Libro de Reclamaciones.

### Dominios y sitios

| Dominio | Qué muestra | A dónde lleva |
| --- | --- | --- |
| www.alojamientoplus.com | Web de AlojamientoPlus administrada desde el CMS | Al sistema central en el mismo dominio |
| Sistema central en alojamientoplus.com (por ejemplo mi.alojamientoplus.com y admin.alojamientoplus.com; subdominios por confirmar) | Portal del cliente, carrito y pago, panel interno, API | — |
| www.servercreativo.com y los dominios de las otras marcas | Solo la web CMS de esa marca, con su logo, colores, páginas y catálogo | "Mi cuenta", "Contratar", "Pagar" y "Soporte" llevan al sistema central en alojamientoplus.com, con la marca de origen registrada |

- La marca de origen viaja en cada enlace hacia el sistema central: queda en el prospecto, el cliente, el pedido y la factura, y define plantillas de correo y comprobante.
- Cómo se ve el sistema central para un cliente que llega desde otra marca (identidad de AlojamientoPlus, o la de su marca dentro del dominio central) es un ajuste por marca; por defecto, identidad de AlojamientoPlus con la marca de origen indicada en el encabezado.
- Cada dominio de marca apunta al mismo servidor; el sistema identifica el sitio por el dominio de la petición y emite su certificado SSL automáticamente.

### CMS (módulo nuevo)

| Función | Detalle |
| --- | --- |
| Sitios | Uno por dominio de marca: logo, colores, tipografías, favicon, menús, pie de página, redes, datos de contacto |
| Páginas por bloques | Portada, planes, comparador de planes, verificador de dominio, preguntas frecuentes, testimonios reales, formulario de captación, llamado a la acción, texto libre, imágenes |
| Catálogo en la web | Los bloques de planes leen el catálogo del sistema filtrado por marca y moneda; el precio de la web siempre es el que se factura |
| Blog y novedades | Artículos con categorías y autor |
| SEO | Título y descripción por página, URLs amigables, sitemap, redirecciones, datos estructurados, imágenes optimizadas |
| Publicación | Borrador, revisión, publicación programada, historial de versiones y vuelta a una versión anterior |
| Idiomas | Español e inglés por página |
| Formularios | Ligados a los formularios de captación del CRM |
| Promociones | Banners ligados a cupones, con fecha de inicio y fin |
| Medios | Biblioteca de imágenes y archivos por sitio |

Las páginas públicas se generan en el servidor para que los buscadores las lean completas, y se guardan en caché.

### Compra en línea de servicios simples

Los productos marcados "venta en línea" en el catálogo (hosting compartido, dominios, SSL, correo) se compran desde la web; el resto muestra "Solicitar cotización" y entra al CRM.

1. El cliente elige el plan y el ciclo en la web de cualquier marca.
2. Configura el dominio: registrar uno nuevo (con consulta de disponibilidad al registrador), transferir uno o usar uno propio.
3. Revisa el carrito, aplica un cupón y ve el total en soles o dólares.
4. Crea su cuenta o inicia sesión en el sistema central y acepta los términos.
5. Paga con tarjeta o PayPal, o elige transferencia y sube el voucher (el pedido queda pendiente hasta la validación).
6. Con el pago validado, el sistema crea el pedido, la factura, la cuenta de hosting en el nodo con capacidad, registra el dominio y envía el correo de bienvenida.

Controles: verificación del correo, captcha, límite de pedidos por cliente nuevo, revisión manual de pedidos fuera de lo habitual, y aviso de carrito abandonado solo a quien aceptó comunicaciones.

### Asistente con IA (Claude)

| Aspecto | Definición |
| --- | --- |
| Dónde | En la web de cada marca y en el portal del cliente |
| Qué sabe | Artículos públicos de la base de conocimientos, páginas del CMS y catálogo de la marca; en el portal, además, los servicios del propio cliente en solo lectura |
| Qué puede hacer | Recomendar un plan, consultar disponibilidad de un dominio, crear un prospecto o un ticket, derivar a una persona o a WhatsApp |
| Qué no puede hacer | Ver datos de otros clientes, facturas ajenas o accesos; ejecutar acciones sobre servicios |
| Transparencia | Se presenta como asistente automático y ofrece hablar con una persona |
| Control de uso | Tope por conversación y mensual, modelo e instrucciones por marca, todo administrable |
| Registro | Cada conversación queda guardada y enlazada al prospecto, cliente o ticket |

### Respaldos y restauración ampliados

- **Solicitud de restauración desde el portal:** el cliente pide restaurar un sitio, una base de datos o un buzón a una fecha; soporte aprueba, se ejecuta y queda como ticket con evidencia.
- **Integración con la herramienta de respaldos de los servidores cPanel** (por ejemplo JetBackup, por confirmar cuál usan): lectura de respaldos reales y restauración por API si la herramienta lo permite; si no, tarea asistida.
- **Informe de respaldos para el cliente:** último respaldo exitoso y restauraciones realizadas, visibles en su panel.
- **Plan de recuperación del propio sistema:** procedimiento escrito para levantarlo en otro servidor desde AWS S3, con prueba periódica registrada y objetivos de pérdida máxima de datos y de tiempo de recuperación administrables.

### Apariencia administrable

Los estilos se cambian desde el panel, sin programar, con vista previa antes de publicar e historial para volver a una versión anterior.

| Dónde | Qué se administra |
| --- | --- |
| Web CMS de cada marca | Logo, favicon, colores principal, secundario y de acento, tipografías, estilo de botones y bordes, encabezado y pie de página |
| Portal del cliente y carrito | Los mismos tokens, por marca, cuando el ajuste de identidad lo permita |
| Panel interno | Color principal, logo y modo claro u oscuro por defecto |
| Correos y comprobantes | Logo, colores y pie por marca |

Los estilos son tokens de diseño (colores, tipografías, radios) guardados por marca; el sistema comprueba el contraste mínimo de texto contra fondo antes de publicar.

### Administración de paquetes de hosting, VPS y dominios

| Catálogo | Qué se administra |
| --- | --- |
| Paquetes de hosting | Nombre por marca, recursos (espacio, ancho de banda, cuentas de correo, bases de datos, sitios), paquete de WHM asociado, nodo preferido, precios por ciclo en soles y dólares, complementos, venta en línea sí o no, orden y destacado en la web, vigencia |
| Planes VPS | CPU, RAM, disco, transferencia, sistema operativo, administrado o no, proveedor y plan de origen con su costo, precios por ciclo, complementos (respaldos, licencia cPanel, IP adicional) |
| Dominios por extensión | Registrador por defecto, costo de registro, renovación y transferencia, precio de venta por moneda, margen mínimo con alerta, reglas de la extensión, venta en línea sí o no |
| Paquetes combinados | Hosting + dominio + SSL + correo con precio propio |

Todo cambio de precio queda con fecha de vigencia; los clientes con servicios activos reciben aviso antes de la siguiente renovación, según la regla de ajuste masivo de precios. La web CMS muestra el catálogo publicado al instante.

### Cumplimiento legal de las webs

Cada sitio de marca incluye las páginas y mecanismos que exige la venta en línea en Perú, administrables desde el CMS y con historial de versiones.

| Elemento | Detalle |
| --- | --- |
| Libro de Reclamaciones virtual | Enlace visible en todas las páginas; formulario con datos del consumidor, servicio contratado, monto, tipo (reclamo o queja), detalle y pedido; número correlativo por marca; constancia automática al correo del consumidor; ticket interno con plazo de respuesta (la Ley 31435 redujo los plazos; el valor exacto se confirma con asesoría legal y queda administrable); alertas antes del vencimiento; registro conservado para fiscalización y exportable |
| Términos y condiciones | Por marca y por tipo de servicio, con versión y fecha; el cliente acepta la versión vigente al comprar y queda registrada |
| Política de privacidad | Tratamiento de datos personales, finalidades, derechos del titular y canal para ejercerlos (Ley 29733); registro de solicitudes de acceso, rectificación y eliminación |
| Política de cookies y aviso de consentimiento | Banner con aceptar, rechazar y configurar por categoría (necesarias, analítica, publicidad); el consentimiento se guarda con fecha y versión y puede cambiarse en cualquier momento |
| Otras páginas | Política de reembolsos y cancelaciones, acuerdo de nivel de servicio (SLA), política de uso aceptable, aviso legal con datos de la empresa y el RUC |

Los textos legales los redacta o valida la asesoría legal de la empresa; el sistema solo los publica, versiona y registra su aceptación.

### Scripts de marketing y analítica

- Integraciones por sitio, sin tocar código: Google Tag Manager, Google Analytics 4, Google Ads (conversiones), Meta Pixel (Facebook e Instagram), TikTok Pixel, LinkedIn Insight, Microsoft Clarity o Hotjar, y un campo de script personalizado para otros.
- Cada script se asigna a una categoría de cookies y solo se carga después del consentimiento del visitante para esa categoría.
- Eventos de conversión estándar enviados por el sistema: vista de plan, inicio de compra, compra completada (con importe y moneda), formulario de contacto enviado.
- Los scripts nunca se cargan en el portal del cliente ni en el panel interno.
- Solo el administrador puede agregar o editar scripts personalizados, y cada cambio queda en auditoría.

### Estilos CSS personalizados

- Además de los tokens de apariencia, cada sitio admite CSS propio a nivel de sitio y de página, y clases personalizadas en cada bloque.
- Editor con resaltado de sintaxis, vista previa antes de publicar e historial de versiones con reversión.
- El CSS se valida y se limpia de construcciones peligrosas (importaciones externas no permitidas, expresiones); solo editan administrador y ventas con permiso de CMS.

### Blog y base de conocimientos en WordPress

El blog y la base de conocimientos se escriben en WordPress (una instalación por cada uno, o la misma con secciones distintas); el sistema los conecta y decide qué se muestra en cada web de marca.

| Función | Detalle |
| --- | --- |
| Conexión | URL del WordPress y credencial de solo lectura (contraseña de aplicación) por fuente; prueba de conexión; los datos se leen por la API REST de WordPress |
| Enlaces en el menú | "Blog" y "Base de conocimientos" se agregan al menú de cada sitio, con texto, orden y destino administrables |
| Categorías | Por sitio de marca se eligen las categorías de WordPress que se muestran; las demás quedan ocultas en esa web |
| Bloques en el CMS | "Últimos artículos" y "Artículos de ayuda" para cualquier página, con categorías, cantidad y orden elegibles |
| Forma de mostrar | Dentro de la web de la marca, con su diseño (recomendado, conserva el dominio para buscadores), o enlace directo al WordPress |
| Sincronización | Copia en caché de títulos, extractos, imágenes, categorías y contenido, actualizada con frecuencia administrable y al instante si WordPress avisa por webhook |
| Base de conocimientos | Los artículos sincronizados alimentan la búsqueda de ayuda del portal y del asistente con IA; los artículos internos para soporte siguen en el sistema |
| SEO | Cada artículo mostrado en la web de marca lleva enlace canónico para no duplicar contenido con el WordPress |

Si WordPress no responde, la web sigue mostrando la última copia sincronizada y avisa al administrador.

### Páginas de error

- Cada sitio de marca tiene su página 404 (página no encontrada) y su página de error del servidor, editables en el CMS con el tema de la marca: mensaje, buscador de dominios, enlaces sugeridos (planes, dominios, soporte, Mi cuenta) y acceso al Libro de Reclamaciones en el pie.
- Responden con el código HTTP correcto (404 o 500) para no afectar el posicionamiento.
- El sistema registra las URL que dan 404 con su cantidad de visitas y origen, para crear redirecciones desde el CMS con un clic.

### SEO y palabras clave

Cada página, artículo mostrado y plan del catálogo tiene su ficha SEO administrable desde el CMS.

| Elemento | Detalle |
| --- | --- |
| Palabras clave | Una palabra clave principal y varias secundarias por página; el sistema las usa para analizar la página, no como etiqueta meta keywords (los buscadores principales la ignoran) |
| Análisis en el editor | Indica si la palabra clave principal aparece en el título, el encabezado principal, la URL, el primer párrafo y los textos alternativos de imágenes; longitud del texto, enlaces internos y palabra clave repetida en otra página del mismo sitio |
| Título y descripción | Con contador de caracteres y vista previa de cómo se vería en el buscador |
| URL amigable | Editable, con redirección automática si se cambia |
| Redes sociales | Imagen, título y descripción para Facebook, LinkedIn y X, con vista previa |
| Datos estructurados | Organización, migas de pan, preguntas frecuentes, artículos y planes como productos con precio y moneda |
| Indexación | Indexar o no la página, enlace canónico, versiones en español e inglés enlazadas, sitemap y robots.txt por sitio |
| Google Search Console | Verificación del sitio, envío del sitemap y lectura de clics, impresiones y posición por palabra clave para mostrarlas junto a cada página |
| Rendimiento | Imágenes optimizadas y carga diferida, con medición de velocidad por página |

### Pendientes de esta sección

- Subdominios definitivos del sistema central.
- Identidad visual del sistema central para clientes de otras marcas.
- Herramienta de respaldos que usan los servidores cPanel.
- Modelo de Claude, instrucciones por marca y tope de uso del asistente.
- Migración del contenido de las webs actuales al CMS.

## 26. Webs en WordPress conectadas por shortcodes, servicios personalizados y ajustes del 8 de octubre

Las webs de las marcas se construyen en WordPress y muestran, mediante un plugin propio, todo lo que vive en el sistema: catálogo, precios, formularios, datos de contacto, Libro de Reclamaciones y asistente. El sistema no tiene CMS.

### Reparto entre WordPress y el sistema

| Vive en WordPress | Vive en el sistema y se muestra en WordPress por shortcode |
| --- | --- |
| Páginas y su diseño, menús, FAQ, blog, base de conocimientos, página 404, SEO y palabras clave (Rank Math o Yoast), aviso de cookies, píxeles de Google, Meta y TikTok, CSS personalizado | Catálogo y precios de todos los servicios, buscador de dominios, botones de contratar, formularios, teléfonos, correos y WhatsApp por marca, documentos legales con versión, Libro de Reclamaciones, asistente con IA, estado de los servicios |

Cada marca es un sitio de **WordPress Multisite** con su propio dominio, tema, logo y colores, administrados desde un solo WordPress. El carrito, el pago y el portal del cliente siguen en el sistema central en alojamientoplus.com.

### Plugin "Hub Connector"

- Lo desarrolla el área de desarrollo y se instala en el WordPress Multisite.
- Cada sitio se conecta con un token de solo lectura propio de su marca, creado en el panel del sistema; el token se puede revocar.
- Guarda en caché lo que lee, con duración administrable; el sistema avisa al plugin por webhook cuando cambia un precio, un plan o un dato de contacto, y el plugin renueva su caché al instante.
- Si el sistema no responde, la web muestra la última copia guardada.
- Cada shortcode tiene su bloque equivalente en el editor de WordPress, para insertarlo sin escribir código.
- En el panel del sistema hay un generador: se elige el servicio, el formato y las opciones, y se copia el shortcode listo.

### Shortcodes

| Shortcode | Qué muestra | Opciones principales |
| --- | --- | --- |
| `[hub_planes]` | Tarjetas de planes de una categoría | tipo (hosting, reseller, vps, dedicado, cloud, correo, ssl, web, tienda, moodle, licencia, soporte o un tipo personalizado), ids, destacados, ciclo, moneda, columnas |
| `[hub_plan]` | Un plan con su precio y botón | id, ciclo, moneda |
| `[hub_comparador]` | Tabla comparativa de planes | tipo, ids, características a mostrar |
| `[hub_paquete]` | Paquete combinado | id |
| `[hub_dominios]` | Precios por extensión | extensiones, moneda |
| `[hub_buscar_dominio]` | Buscador con disponibilidad real | extensiones sugeridas |
| `[hub_boton_contratar]` | Botón que lleva al carrito del sistema con el plan elegido | plan, ciclo, texto |
| `[hub_formulario]` | Formulario configurado en el sistema | id |
| `[hub_contacto]` | Teléfono, correo, WhatsApp, dirección u horario de la marca | campo, formato |
| `[hub_documento_legal]` | Términos, privacidad, reembolsos, SLA, uso aceptable, en su versión vigente | tipo |
| `[hub_libro_reclamaciones]` | Formulario legal; el sistema guarda, numera y responde | — |
| `[hub_asistente]` | Asistente con IA de la marca | posición |
| `[hub_estado_servicios]` | Estado de plataformas e incidentes públicos | — |
| `[hub_promocion]` | Promoción vigente ligada a un cupón | id |
| `[hub_selector_moneda]` | Cambio entre soles y dólares para los precios mostrados | — |

Todo servicio nuevo, incluidos los personalizados, queda disponible de inmediato en `[hub_planes]` y `[hub_plan]` sin cambios en el plugin.

### Formularios, contacto y documentos legales en el sistema

- **Constructor de formularios:** campos (texto, correo, teléfono, lista, casillas, archivo), obligatoriedad, validaciones, casilla de consentimiento, captcha, destino (prospecto en el CRM, ticket o correo), responsable y mensaje de confirmación.
- **Datos de contacto por marca:** teléfonos, correos, WhatsApp, dirección y horario, editables en el panel y reflejados en todas las webs.
- **Documentos legales:** se redactan y versionan en el sistema, porque el carrito registra qué versión aceptó cada cliente; WordPress los muestra por shortcode.
- **Conversiones:** al terminar una compra, el sistema devuelve al cliente a una página de agradecimiento en WordPress, donde los píxeles registran la conversión con importe y moneda.

### Catálogo completo y servicios personalizados

Categorías del catálogo: hosting compartido, hosting reseller, VPS, servidores dedicados, cloud, dominios, certificados SSL, correo corporativo (cPanel, Google Workspace, Microsoft 365), páginas web, tiendas virtuales, plataformas Moodle, licencias, soporte y mantenimiento, desarrollo a medida y servicios personalizados.

Un **servicio personalizado** se crea desde el panel sin programar:

| Elemento | Detalle |
| --- | --- |
| Identidad | Nombre, categoría (existente o nueva), descripción, icono, marcas donde se ofrece |
| Campos propios | Los datos que se piden al contratar o que soporte completa: texto, número, lista, fecha, archivo, casilla |
| Precio y ciclo | Único o recurrente, ciclos, precios en soles y dólares, costo y proveedor opcionales |
| Entrega | Lista de tareas plantilla para soporte, contrato obligatorio o no |
| Mapa de servicios | Tipo de componente que crea en el proyecto del cliente |
| Portal | Qué datos ve el cliente |
| Venta | En línea o solo por cotización; shortcode disponible al instante |

### Ajustes pedidos sobre el prototipo

- **Seguridad administrable:** longitud mínima y complejidad de contraseñas, caducidad e historial; segundo factor por código al correo o por aplicación de autenticación; obligatorio u opcional por rol y por tipo de usuario (personal o cliente); intentos antes del bloqueo, duración de sesión y dispositivos de confianza.
- **Usuarios y roles:** crear roles nuevos y asignarles permisos uno por uno desde una matriz por módulo y acción; copiar un rol existente como base.
- **CRM:** vista de lista y vista Kanban, con los prospectos arrastrables entre etapas.
- **Soporte:** bandeja de tickets con detalle, conversación con el cliente, notas internas, asignación, SLA y vinculación con servicios.
- **Libro de Reclamaciones:** los registros se pueden marcar como prueba y solo esos se pueden eliminar, con registro de quién lo hizo; los reclamos reales se conservan por obligación legal.

## 27. Indicadores, editor de textos y shortcodes adicionales

### Panel de indicadores (KPI)

El panel de indicadores reúne en una sola vista la salud comercial, financiera, operativa y de soporte, con filtros por periodo, marca, moneda, categoría de servicio y responsable, comparación con el periodo anterior y metas administrables por indicador.

| Grupo | Indicadores |
| --- | --- |
| Comercial | Ingresos recurrentes mensuales y anuales, clientes activos, nuevos y perdidos, tasa de abandono, ingreso promedio por cliente, valor de vida del cliente, ventas por canal y por marca, ventas en línea frente a cotización |
| CRM | Valor del embudo por etapa, tasa de conversión por etapa y por canal, ciclo de venta promedio, prospectos sin seguimiento |
| Finanzas | Facturado, cobrado y reconocido; días promedio de cobro; deuda por antigüedad; margen bruto por servicio, proveedor y cliente; costos de proveedores; refacturación; comisiones de medios de pago; recargos por mora |
| Cobranza | Facturas por vencer y vencidas, compromisos de pago cumplidos e incumplidos, suspensiones y reactivaciones, vouchers por validar |
| Operación | Servicios por vencer y tasa de renovación, dominios por vencer, uso de nodos de hosting, avance de la migración, respaldos exitosos, disponibilidad e incidentes |
| Soporte | Tickets abiertos, tiempo de primera respuesta, tiempo de solución, cumplimiento de SLA, satisfacción del cliente, carga por técnico |
| Reclamos | Reclamos y quejas recibidos, respondidos dentro del plazo, próximos a vencer |
| Web | Pedidos en línea, carritos abandonados, conversión por marca, búsquedas de dominio y registros |

Cada indicador tiene definición y fórmula documentadas, enlace al detalle que lo explica y exportación.

Cada indicador genera su propio tablero: al hacer clic en una tarjeta (por ejemplo, Clientes activos) se abre una página del indicador con su resumen, la evolución, los desgloses y la tabla con los registros que lo forman (en el ejemplo, los clientes activos), con búsqueda, filtros por dimensión y estado, orden por columna, totales y exportación. El total de la tabla coincide con el valor de la tarjeta y se recalcula al filtrar.

### Editor de textos enriquecido

Los textos que redacta el equipo se escriben con un editor de texto enriquecido (negrita, cursiva, listas, enlaces, tablas, imágenes, variables insertables y vista previa): documentos legales, plantillas de contrato y cláusulas, plantillas de correo y avisos, respuestas predefinidas y respuestas de tickets, mensajes de confirmación de formularios, descripciones de productos y servicios personalizados, y la respuesta del Libro de Reclamaciones. El contenido se guarda limpio de código peligroso y conserva historial de versiones donde aplica.

### Libro de Reclamaciones

- **Vista pública:** el formulario como lo ve el consumidor en la web (por shortcode), con los campos del reglamento, y la hoja de reclamación con su número, que se envía como constancia.
- **Respuesta:** redactada con el editor enriquecido, a partir de plantillas, con vista previa de la carta y envío al correo del consumidor; queda registrada con fecha y responsable.

### Shortcodes adicionales

| Shortcode | Qué muestra | Opciones principales |
| --- | --- | --- |
| `[hub_whois]` | Búsqueda de dominio con disponibilidad, precio por extensión, sugerencias de nombres y extensiones alternativas, datos WHOIS públicos de dominios ya registrados (respetando la privacidad), y botones para registrar o transferir que llevan al carrito | extensiones, sugerencias, mostrar WHOIS, moneda |
| `[hub_servidores]` | Planes de VPS y servidores dedicados con CPU, RAM, disco, transferencia, sistema operativo, ubicación y administración; filtros y configurador de complementos (respaldos, licencia cPanel, IP adicional) con precio en vivo | tipo (vps, dedicado), ids, filtros, configurador, ciclo, moneda |

La consulta WHOIS y de disponibilidad se hace en el sistema contra los registradores conectados, con límite de consultas por visitante y captcha ante abuso.
