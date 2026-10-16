# 08 — Integraciones y conectores

Este documento define el contrato de conectores en PHP y una ficha por proveedor. Se basa en `docs/00-requerimientos.md` (secciones 6, 8, 10, 12, 15 a 27) y en `docs/01-contrato-de-nombres.md`. Cuando ambos difieren, prevalecen las secciones 13 a 27 del kit y los nombres del contrato.

## Cómo leer las fichas

- **Verificado (fuente):** dato confirmado en la documentación oficial vigente durante la preparación de este paquete (octubre de 2026). La URL está en la sección *Fuentes*.
- **Según kit:** dato que el kit da como conocido. No se reconsultó al preparar el kit; se confirma contra la documentación y el tipo de cuenta real antes de construir (docs/00, sección 6, "Mapa de conectores").
- **NO VERIFICADO:** el kit lo marca "por verificar/por confirmar", o la consulta no encontró documentación pública. No se programa nada que dependa de ese dato hasta confirmarlo.
- Ninguna ficha agrega capacidades que el kit no prevé. Una operación que el proveedor no permita se resuelve con la alternativa manual (docs/00, sección 6: tarea en `Work` y pedido en `manual_review`).

## Reglas comunes a todos los conectores

Aplican a todas las fichas; cada ficha solo indica lo que cambia.

| Tema | Regla |
| --- | --- |
| Capacidades | El caso de uso llama a `capabilities()` antes de ejecutar. Si la capacidad no está, crea una tarea en `tasks` con el procedimiento y deja el pedido en `orders.status = manual_review`. |
| Credenciales | Salen de la bóveda (`secrets`, enlazado a `provider_accounts`) en el momento de la llamada y se pasan por parámetro al conector. Nunca en `.env`, `config/` ni en `settings` (docs/00, secciones 6 y 19). El valor no se cachea fuera de la memoria del proceso del job. |
| Solo lectura primero | AWS, Azure, Google Cloud, registradores y servidores arrancan en lectura. La escritura se habilita por cuenta (`provider_accounts`), con permiso `providers.provider_account.approve` y confirmación; queda en `audit_events`. |
| Sincronización | Job en cola `sync`. Cada corrida escribe una fila en `sync_runs` (inicio, fin, leídos, creados, actualizados, errores). Nunca borra: lo que desaparece en el proveedor se marca "no encontrado" y abre una alerta en `alerts`. La frecuencia es un ajuste en `settings`, con el valor por defecto que fija el kit. |
| Métricas | El job diario `SyncComponentMetrics` escribe en `component_metrics` lo que cada conector exponga (espacio, tráfico, buzones, envíos). |
| Límites | Cada conector declara su tasa máxima y usa un limitador en Redis por `provider_account_id`. Ante 429 o equivalente: espera exponencial. |
| Reintentos | Lecturas: máximo 5. Escrituras: solo si llevan clave de idempotencia o si se puede consultar el estado antes (docs/00, sección 10). Aprovisionamiento: cada intento es una fila en `provisioning_runs`; antes de reintentar una creación se consulta si el recurso ya existe. |
| Errores | Se clasifican en `transient`, `credentials`, `validation`, `unknown`. Solo `transient` se reintenta solo; el resto abre una alerta y, si hay pedido, lo deja en `manual_review`. |
| Webhooks entrantes | Ruta `/api/v1/webhooks/<proveedor>`. Se valida la firma, se guarda el evento crudo en `webhook_events` con su identificador externo único y se procesa en cola. Un evento repetido se confirma y se descarta. |
| Registro | Logs JSON sin datos sensibles; la lista de redacción (`password`, `token`, `secret`, `authorization`) se amplía con `key`, `apikey`, `accesskey`, `client_secret` y con las cadenas de consulta de URL de proveedores que llevan la clave en la URL (ver NameSilo). |
| Pruebas | Pruebas de contrato con respuestas grabadas por conector; en desarrollo, conectores simulados; en staging, sandbox o cuentas de prueba; nunca credenciales reales fuera de producción (docs/00, secciones 11 y 12). |

## Contrato de conectores (PHP)

Ubicación sugerida: la interfaz base y los objetos compartidos en `app/Shared/Connectors`; cada implementación en `app/Modules/<Modulo>/Infrastructure/Connectors`. La firma de `HostingConnector` repite la de docs/00, sección 6; el resto sigue el mismo patrón.

```php
<?php

declare(strict_types=1);

namespace App\Shared\Connectors;

/** Base de todo conector (docs/00, sección 6). */
interface Connector
{
    /** Qué operaciones admite ESTA cuenta (depende de la API y de los privilegios reales). */
    public function capabilities(): CapabilitySet;

    public function testConnection(): ConnectionResult;
}

/** Conector que aporta consumo al mapa de servicios (component_metrics). */
interface ProvidesMetrics
{
    /** @return iterable<MetricReading> métrica, valor, unidad, fecha de medición */
    public function metrics(string $externalId): iterable;
}

/* ---------- Hosting: WHM/cPanel (reseller y nodos propios), Plesk ---------- */

interface HostingConnector extends Connector, ProvidesMetrics
{
    /** @return iterable<HostingAccountData> */
    public function listAccounts(): iterable;
    public function usage(): ResellerUsage;
    public function createAccount(CreateAccount $cmd): ProvisionResult;
    public function suspend(string $username, string $reason): void;
    public function unsuspend(string $username): void;
    /** Sesión temporal para "Entrar a su cPanel" (docs/00, sección 21). Nunca devuelve contraseña. */
    public function createUserSession(string $username): TemporarySessionUrl;
    /** Solo nodos con privilegios completos (WHM root). */
    public function listPackages(): iterable;
    public function transferAccount(TransferAccount $cmd): ProvisionResult;
}

/* ---------- Registradores de dominio ---------- */

interface RegistrarConnector extends Connector
{
    /** @return iterable<DomainData> nombre, expiración real, bloqueo, nameservers, privacidad */
    public function listDomains(): iterable;
    public function getDomain(string $domain): DomainData;
    public function renew(string $domain, int $years, string $idempotencyKey): ProvisionResult;
    public function setNameservers(string $domain, array $nameservers, string $idempotencyKey): void;
    public function setLock(string $domain, bool $locked): void;
    public function updateContacts(string $domain, DomainContacts $contacts, string $idempotencyKey): void;
    /** Se llama solo con domain_operations.status = in_review aprobado por soporte (docs/00, secciones 8 y 16). */
    public function getAuthCode(string $domain): SensitiveString;
    /** Disponibilidad para el carrito, [hub_buscar_dominio] y [hub_whois] (docs/00 §25 y §27); sin respuesta → status unknown, nunca "disponible". */
    public function checkAvailability(string $domain): AvailabilityResult;
    /** WHOIS o RDAP público de un dominio registrado; el conector devuelve solo campos no personales (registrador, fechas, estado, nameservers). docs/00 §27. */
    public function whois(string $domain): WhoisData;
    /** @return iterable<DomainSuggestion> sugerencias de nombres y extensiones, si el registrador las ofrece (docs/00 §27). */
    public function suggest(string $name, array $tlds): iterable;
}

/* ---------- Nubes y servidores: AWS, Azure, Google Cloud, Contabo, DigitalOcean, Bunny.net ---------- */

interface CloudConnector extends Connector, ProvidesMetrics
{
    /** @return iterable<CloudResourceData> tipo, región, etiquetas cliente/proyecto/ambiente, padre */
    public function discoverResources(): iterable;
    /** @return iterable<CostLine> periodo, servicio, monto en unidad menor, cost_currency */
    public function costs(Period $period): iterable;
    /** @return iterable<BudgetStatus> */
    public function budgets(): iterable;
    /** DNS gestionado (Route 53 y equivalentes): lectura; escritura solo con permiso habilitado. */
    public function listDnsZones(): iterable;
    public function listDnsRecords(string $zoneId): iterable;
    public function upsertDnsRecord(string $zoneId, DnsRecord $record, string $idempotencyKey): void;
}

/** Variante para proveedores de VPS (docs/00, sección 6: "ServerConnector"). */
interface ServerConnector extends CloudConnector
{
    /** @return iterable<ServerData> SO, IP, CPU, RAM, disco, región, estado */
    public function listServers(): iterable;
    public function listSnapshots(string $serverExternalId): iterable;
    /** Acción "Reiniciar servidor": construida pero apagada por interruptor (docs/00, sección 21). */
    public function restart(string $serverExternalId, string $idempotencyKey): void;
}

/* ---------- Pagos ---------- */

interface PaymentConnector extends Connector
{
    /**
     * PayPal: orden con URL de aprobación. Pasarela de tarjetas: sesión del formulario alojado o token
     * para el formulario embebido (URL o token y clave pública). Nunca recibe datos de tarjeta.
     */
    public function createOrder(PaymentOrder $order, string $idempotencyKey): PaymentOrderResult;
    /** Solo si el medio separa autorización y captura (PayPal); la pasarela de tarjetas suele capturar sola. */
    public function capture(string $externalOrderId, string $idempotencyKey): PaymentCaptureResult;
    /** Total o parcial: $amount puede ser menor que el pago. */
    public function refund(string $externalCaptureId, Money $amount, string $idempotencyKey): RefundResult;
    /** Valida firma y normaliza el evento (aprobado, rechazado, reembolso, contracargo); no aplica pagos (eso lo hace Billing en cola critical). */
    public function parseWebhook(InboundWebhook $request): NormalizedEvent;
    /** Estado de una transacción u orden: se consulta antes de marcar vencido un intento y antes de reintentar un reembolso. */
    public function getTransaction(string $externalId): TransactionData;
    /** @return iterable<SettlementLine> para conciliación: id externo, tipo, bruto, comisión real, neto, fecha y referencia de abono */
    public function listTransactions(Period $period): iterable;
}

/* ---------- Facturación electrónica (OSE/PSE) ---------- */

interface EInvoiceConnector extends Connector
{
    public function submit(EInvoiceDocument $doc, string $idempotencyKey): EInvoiceResult;   // XML, CDR, PDF o enlaces
    public function status(string $externalId): EInvoiceResult;
    public function resend(string $externalId, string $idempotencyKey): EInvoiceResult;
    public function void(string $externalId, string $reason, string $idempotencyKey): EInvoiceResult; // comunicación de baja
    public function parseWebhook(InboundWebhook $request): NormalizedEvent;
}

/* ---------- Correo corporativo y licencias: Google Workspace, Microsoft 365 ---------- */

interface MailConnector extends Connector, ProvidesMetrics
{
    /** @return iterable<MailDomainData> */
    public function listDomains(): iterable;
    /** @return iterable<MailUserData> sin contraseñas (docs/00, sección 18) */
    public function listUsers(string $domain): iterable;
    /** @return iterable<SeatLicenseData> plan, compradas, asignadas, renovación */
    public function listLicenses(): iterable;
}

/* ---------- Plataformas SaaS: Moodle ---------- */

interface SaasConnector extends Connector, ProvidesMetrics
{
    public function instanceInfo(): SaasInstanceInfo;   // versión, usuarios activos, almacenamiento
    /** @return iterable<PluginData> */
    public function listPlugins(): iterable;
}

/* ---------- Mensajería saliente/entrante: WhatsApp, correo transaccional, listas de mailing ---------- */

interface MessagingConnector extends Connector
{
    public function send(OutboundMessage $msg, string $dedupeKey): DeliveryResult;
    public function parseWebhook(InboundWebhook $request): NormalizedEvent;   // entregas, rebotes, bajas, mensajes entrantes
    /** Plantillas aprobadas por el proveedor (WhatsApp). */
    public function listTemplates(): iterable;
    /** Listas de mailing (Elastic Email): sincroniza miembros y lee bajas/rebotes. */
    public function syncList(MailingListData $list, iterable $members): SyncResult;
    public function listSuppressions(\DateTimeImmutable $since): iterable;
}

/* ---------- Captación de prospectos: Meta Lead Ads ---------- */

interface LeadSourceConnector extends Connector
{
    public function parseWebhook(InboundWebhook $request): NormalizedEvent;
    /** Recupera el detalle del prospecto a partir del id recibido en el webhook. */
    public function fetchLead(string $externalLeadId): LeadData;
}

/* ---------- Firma electrónica (proveedor por elegir) ---------- */

interface SignatureConnector extends Connector
{
    public function createEnvelope(SignatureRequest $req, string $idempotencyKey): SignatureEnvelope;
    public function status(string $envelopeId): SignatureEnvelope;
    public function downloadSigned(string $envelopeId): StoredFile;
    public function parseWebhook(InboundWebhook $request): NormalizedEvent;
}

/* ---------- Monitoreo (herramienta por elegir) ---------- */

interface MonitoringConnector extends Connector
{
    /** @return iterable<MonitorData> */
    public function listMonitors(): iterable;
    public function upsertMonitor(MonitorDefinition $def, string $idempotencyKey): MonitorData;
    public function parseWebhook(InboundWebhook $request): NormalizedEvent;   // caída / recuperación
}

/* ---------- Almacenamiento de objetos: archivos del sistema y respaldos en AWS S3 ---------- */

interface StorageConnector extends Connector
{
    /** Escritura sin sobrescritura ni borrado para respaldos (credencial solo escritura). */
    public function put(string $key, StreamInterface $body, StorageOptions $opts): StoredObject;
    public function head(string $key): ?StoredObject;
    /** Requiere credencial distinta (solo lectura), usada únicamente en restauración. */
    public function get(string $key): StreamInterface;
}
/* ---------- Alcance de docs/00 §25 y §26: asistente, respaldos y webs en WordPress ---------- */

/** Asistente con IA (API de Claude). Una cuenta de proveedor providers.type = ai. */
interface AiAssistantConnector extends Connector
{
    /** Instrucciones del perfil, contexto como datos delimitados, historial y herramientas permitidas. */
    public function respond(AssistantRequest $request): AssistantReply;   // texto, llamadas a herramientas y tokens usados
}

/** Herramienta de respaldos de los nodos cPanel (por ejemplo JetBackup; por confirmar). */
interface BackupToolConnector extends Connector
{
    /** @return iterable<BackupPointData> respaldos reales por cuenta y tipo (sitio, base de datos, buzón) */
    public function listBackups(string $accountExternalId, Period $period): iterable;
    public function restore(RestoreTarget $target, \DateTimeInterface $point, string $idempotencyKey): RestoreJob;
    public function restoreStatus(string $jobId): RestoreJob;
}

/**
 * Aviso de invalidación de caché al plugin Hub Connector de un sitio WordPress conectado (WCN).
 * No lee nada de WordPress: solo envía el webhook firmado a wp_sites.webhook_url con el secreto del sitio.
 */
interface WordpressPluginNotifier extends Connector
{
    public function invalidate(WpSiteTarget $site, CacheInvalidation $invalidation, string $idempotencyKey): InvalidationResult;   // código HTTP y error
    public function ping(WpSiteTarget $site): InvalidationResult;   // aviso de prueba con alcance "all"
}

/** Verificación de captcha en el servidor (proveedor por elegir). */
interface CaptchaVerifier extends Connector
{
    public function verify(string $token, ?string $ipHash): bool;
}
```

Notas del contrato:

- Las funciones que una cuenta no puede ejecutar no lanzan error de API: `capabilities()` no las incluye y el caso de uso nunca las llama.
- `CapabilitySet` contiene valores de un enum PHP `Capability` (por ejemplo `hosting.accounts.list`, `registrar.contacts.update`, `cloud.dns.write`). Se calcula en `testConnection()` y se guarda en `provider_accounts` para mostrar en el panel qué hace cada cuenta.
- Las firmas exactas de los DTO se fijan en el código; aquí solo se nombran.
- Un proveedor sin conector usa `ManualConnector` (capacidades vacías): todo pasa a tarea asistida (docs/00, sección 20).

## Fichas por conector

### 1. WHM/cPanel — cuentas reseller de BanaHosting

| Campo | Detalle |
| --- | --- |
| Propósito | Inventario de las 3 cuentas reseller: cuentas cPanel, dominios, consumo; suspensión por cobranza; acceso directo a cPanel desde el portal; origen de la migración a nodos propios (docs/00, sección 17). |
| Interfaz | `HostingConnector` (módulo Inventory; tablas `hosting_nodes`, `hosting_accounts`, `resources`). |
| Capacidades previstas | Listar cuentas, consumo, crear, suspender, reactivar (docs/00, sección 6); sesión temporal de cPanel (docs/00, sección 21). Todas condicionadas a los privilegios del reseller. |
| Autenticación | Token de API de WHM (según kit). |
| Dónde vive la credencial | `secrets` con `kind = whm`, enlazado a la `provider_account` de cada reseller. |
| Permisos mínimos | Token del reseller limitado a las funciones listadas; si WHM permite restringir el token por IP, se restringe a la IP del VPS del sistema. |
| Webhooks | No previstos. |
| Sincronización | `SyncResellerAccounts`, cola `sync`; frecuencia por defecto cada 6 horas (ajuste). Una cuenta en el reseller sin `service_id` se reporta como "no registrada" en `DetectOrphans`. |
| Límites y reintentos | Limitador por nodo; suspensión/reactivación se reintenta solo tras consultar el estado actual de la cuenta. Creación: consulta previa de existencia por usuario y dominio. |
| Errores | Privilegio insuficiente se clasifica `credentials` y retira la capacidad de `capabilities()` hasta nueva prueba. |
| Alternativa manual | Tarea con lista de verificación (docs/00, sección 6). |
| Qué verificar antes de construir | **NO VERIFICADO:** privilegios de WHM que entrega BanaHosting a las cuentas reseller (docs/00, sección 14): qué funciones de API están habilitadas, si se puede crear sesión de usuario, si hay restricción por IP del token. Confirmar con una cuenta real y registrar el resultado en `capabilities()`. |

### 2. WHM en VPS propios (nodos de hosting)

| Campo | Detalle |
| --- | --- |
| Propósito | Nodos propios destino de la migración; gestión completa de cuentas. |
| Interfaz | `HostingConnector`, misma implementación que el punto 1 con capacidades completas. |
| Capacidades previstas | Todas: cuentas, paquetes, consumo, suspensión, transferencia de cuentas (docs/00, sección 6, conectores añadidos). |
| Autenticación | Token de API de WHM con acceso root (según kit). |
| Dónde vive la credencial | `secrets` `kind = whm`; acceso SSH al nodo en `secrets` `kind = ssh` (clave, no contraseña). |
| Permisos mínimos | Token root dedicado al sistema, distinto del que usan los técnicos; restringido por IP cuando WHM lo permita. |
| Webhooks | No previstos. |
| Sincronización | Igual que el punto 1. Además `CheckCapacityThresholds` cada hora (umbrales 70/85/95 % en `settings`). |
| Límites y reintentos | Transferencia de cuentas como `migration_items` con estado propio (`pending` a `closed`/`reverted`); cada paso es idempotente o consulta estado. |
| Errores | Igual que el punto 1. |
| Alternativa manual | No aplica (kit: "—"), pero cada paso de migración puede marcarse a mano. |
| Qué verificar antes de construir | Funciones de WHM API 1 disponibles en la versión instalada y método de restricción del token. Licencia de cPanel según número de cuentas (dato de costo, no del conector). |

### 3. Plesk

| Campo | Detalle |
| --- | --- |
| Propósito | Servidores con Plesk administrados para clientes. |
| Interfaz | `HostingConnector`. |
| Capacidades previstas | Listar y gestionar suscripciones (docs/00, sección 6). |
| Autenticación | Clave de API (según kit). API REST y XML. |
| Dónde vive la credencial | `secrets` `kind = plesk`. |
| Permisos mínimos | Clave creada para el sistema, no la del administrador personal. |
| Webhooks | No previstos. |
| Sincronización | Mismo job y frecuencia que hosting (ajuste). |
| Límites y reintentos | Reglas comunes. |
| Errores | Reglas comunes. |
| Alternativa manual | Tarea manual. |
| Qué verificar antes de construir | Versión de Plesk de cada servidor y si la API REST cubre suscripciones o hay que usar la XML. No consultado al preparar el kit. |

### 4. Contabo

| Campo | Detalle |
| --- | --- |
| Propósito | VPS de clientes y el VPS donde corre el propio sistema: inventario, snapshots, estado. |
| Interfaz | `ServerConnector`. |
| Capacidades previstas | Inventario, snapshots, estado (docs/00, sección 6). Reinicio solo con el interruptor "Reiniciar servidor" activado (docs/00, sección 21). |
| Autenticación | **Verificado:** OAuth2 con *password grant*; requiere ClientId, ClientSecret, API User (correo de acceso) y API Password, obtenidos del panel del cliente; token en `https://auth.contabo.com/auth/realms/contabo/protocol/openid-connect/token`; se envía como `Authorization: Bearer`. Base `https://api.contabo.com/v1/`. |
| Dónde vive la credencial | Los cuatro valores en un solo `secrets` `kind = cloud` (JSON cifrado). El token de acceso vive solo en memoria/Redis cifrado hasta su vencimiento. |
| Permisos mínimos | **Verificado:** la API ofrece gestión de usuarios y roles con permisos por API o por recurso. Se crea un usuario de API propio del sistema con rol de lectura; la escritura (reinicio) en un rol aparte que se habilita por cuenta. |
| Webhooks | No se encontraron en la documentación consultada. |
| Sincronización | `SyncServers`, diario (ajuste). |
| Límites y reintentos | **Verificado:** cada petición exige cabecera `x-request-id` con UUID v4 (útil como clave de correlación; guardarlo en `sync_runs`/`provisioning_runs`). 429 indica límite alcanzado; no se publica la cifra: limitador conservador configurable. |
| Errores | Reglas comunes; 401 renueva token una vez y luego `credentials`. |
| Alternativa manual | Alta manual de la ficha del servidor. |
| Qué verificar antes de construir | El kit dice "OAuth2 con credenciales de cliente"; la documentación vigente pide además usuario y contraseña de API: confirmar que la contraseña de API sea distinta de la del panel. Tasa máxima numérica: NO VERIFICADO. La API también expone almacenamiento de objetos, DNS, etiquetas y auditoría; **no se usan** porque el kit no los prevé. |

### 5. DigitalOcean

| Campo | Detalle |
| --- | --- |
| Propósito | Servidores y recursos cloud de clientes. |
| Interfaz | `ServerConnector`. |
| Capacidades previstas | Inventario, snapshots, facturación (docs/00, sección 6). |
| Autenticación | API v2 con token personal con alcance (según kit). |
| Dónde vive la credencial | `secrets` `kind = api_token`. |
| Permisos mínimos | Token de solo lectura mientras la cuenta esté en lectura. |
| Webhooks | No previstos. |
| Sincronización | `SyncServers` y `SyncCloudResources`, diario (ajuste). |
| Límites y reintentos | Reglas comunes; respetar cabeceras de límite si las envía. |
| Errores | Reglas comunes. |
| Alternativa manual | Alta manual. |
| Qué verificar antes de construir | Alcances disponibles para tokens de solo lectura y endpoint de facturación. No consultado al preparar el kit. |

### 6. AWS (incluye Route 53)

| Campo | Detalle |
| --- | --- |
| Propósito | Descubrimiento de recursos, costos y presupuestos de cuentas propias y de clientes (docs/00, sección 20); zonas DNS de Route 53. |
| Interfaz | `CloudConnector` (módulo Cloud; tablas `cloud_accounts`, `cloud_projects`, `cloud_resources`, `cloud_budgets`). |
| Capacidades previstas | Descubrimiento, costos (Cost Explorer) y presupuestos; Route 53: zonas y registros en lectura, escritura por permiso (docs/00, sección 6). El sistema no crea ni borra recursos (docs/00, sección 20). |
| Autenticación | SDK oficial; rol IAM de solo lectura asumido por cuenta (según kit). |
| Dónde vive la credencial | `secrets` `kind = cloud`: identificador del rol a asumir y, si aplica, identificador externo. La identidad base del sistema que asume roles se guarda también en la bóveda. |
| Permisos mínimos | Rol de lectura de inventario, costos y presupuestos; escritura de Route 53 en un rol separado que solo se usa si la cuenta tiene escritura habilitada. Cuenta del cliente: autorización expresa y documento adjunto antes de registrar (docs/00, sección 21); el cliente puede revocar el rol. |
| Webhooks | No previstos. |
| Sincronización | `SyncCloudResources` diario (ajuste). Recursos sin etiquetas cliente/proyecto/ambiente quedan "sin cliente asignado". Alertas de presupuesto al 80 % y 100 % (ajuste). |
| Límites y reintentos | Reintentos del SDK más las reglas comunes. |
| Errores | Rol revocado por el cliente: `credentials`, alerta y marca de la cuenta como sin acceso. |
| Alternativa manual | Registro manual del proyecto. |
| Qué verificar antes de construir | Políticas IAM exactas de lectura y costos; si Cost Explorer está activado en cada cuenta. Tarea de etiquetado previa a la primera sincronización (docs/00, sección 21). No consultado al preparar el kit. |

### 7. AWS S3 — respaldos del sistema y archivos

| Campo | Detalle |
| --- | --- |
| Propósito | Respaldo diario cifrado de base de datos y archivos del sistema (`OffsiteBackup`), fuera de Contabo; almacenamiento de archivos compatible con S3 (docs/00, secciones 2, 12 y 21). Separado de los backups de clientes. |
| Interfaz | `StorageConnector`. |
| Capacidades previstas | Subir objetos; consultar existencia; leer solo en restauración. |
| Autenticación | Credencial de AWS dedicada. |
| Dónde vive la credencial | Fuera de la base: en el gestor de secretos del servidor, igual que la clave de cifrado (un respaldo no puede depender de la base que respalda). Ver `10-seguridad-y-privacidad.md`. |
| Permisos mínimos | Credencial de respaldo que solo puede subir, nunca borrar ni sobrescribir; credencial de restauración distinta, guardada fuera del servidor y usada solo en pruebas de restauración. Bucket con versionado, cifrado y bloqueo contra borrado durante la retención; paso a almacenamiento de bajo costo tras 30 días (docs/00, sección 21). |
| Webhooks | No. |
| Sincronización | `OffsiteBackup` diario; frecuencia y retención en `settings` (por defecto diario y 35 días, docs/00, sección 23). Cada corrida en `backup_runs`; restauraciones en `restore_tests`. |
| Límites y reintentos | Subida multiparte con reintento por parte; nombre de objeto con fecha y `organization_id` (docs/00, sección 19). |
| Errores | Fallo de respaldo emite `BackupFailed` y alerta. |
| Alternativa manual | No aplica: si falla, se corrige; no hay registro manual de un respaldo. |
| Qué verificar antes de construir | **NO VERIFICADO (pendiente de docs/00, sección 14):** cuenta, región y retención del bucket. Modo de bloqueo de objetos compatible con la retención elegida. |

### 8. Microsoft Azure

| Campo | Detalle |
| --- | --- |
| Propósito | Inventario y costos de suscripciones en lectura. |
| Interfaz | `CloudConnector`. |
| Capacidades previstas | Inventario y costos en lectura (Azure Resource Manager y Cost Management). DNS de Azure en lectura si existe en la cuenta. |
| Autenticación | Entidad de servicio con rol Lector (según docs/00, sección 20). |
| Dónde vive la credencial | `secrets` `kind = cloud` (inquilino, id de aplicación y secreto o certificado). |
| Permisos mínimos | Lector a nivel de suscripción o grupo de recursos, más lectura de costos. |
| Webhooks | No previstos. |
| Sincronización | `SyncCloudResources` diario (ajuste). |
| Límites y reintentos | Reglas comunes. |
| Errores | Secreto de la aplicación vencido: `credentials` y tarea de rotación. |
| Alternativa manual | Registro manual. |
| Qué verificar antes de construir | Rol exacto para leer costos; vencimiento de secretos de la aplicación. No consultado al preparar el kit. |

### 9. Google Cloud

| Campo | Detalle |
| --- | --- |
| Propósito | Inventario y costos por proyecto. |
| Interfaz | `CloudConnector`. |
| Capacidades previstas | Cloud Asset Inventory y exportación de facturación, en lectura (docs/00, sección 6). |
| Autenticación | Cuenta de servicio con rol Visor (según docs/00, sección 20). |
| Dónde vive la credencial | `secrets` `kind = cloud` (clave JSON de la cuenta de servicio) o `private_key`. |
| Permisos mínimos | Visor de inventario y acceso al conjunto de datos de exportación de facturación. |
| Webhooks | No previstos. |
| Sincronización | `SyncCloudResources` diario (ajuste). |
| Límites y reintentos | Reglas comunes. |
| Errores | Reglas comunes. |
| Alternativa manual | Registro manual. |
| Qué verificar antes de construir | Que la exportación de facturación esté activada por cuenta de facturación. No consultado al preparar el kit. |

### 10. IBM Cloud y otros proveedores (modo manual)

| Campo | Detalle |
| --- | --- |
| Propósito | Cualquier proveedor sin conector, incluidos los que aporta el cliente (ejemplo del kit: IBM Cloud para IA educativa). |
| Interfaz | `ManualConnector` (sin capacidades). |
| Capacidades previstas | Ninguna por API. Funciona completo en manual: componentes en el mapa, vencimientos, costos, facturas del proveedor adjuntas (`provider_bills`) y accesos en la bóveda (docs/00, sección 20). |
| Autenticación / credencial | Accesos que soporte necesite, en `secrets` (`kind` según corresponda). |
| Webhooks / sincronización | No. Componentes marcados "sin sincronización" con fecha de última revisión (docs/00, sección 15). |
| Alternativa manual | Es el modo de operación. |
| Qué verificar antes de construir | Nada para construir ahora: un conector específico solo se construye cuando el volumen lo justifique, sin tocar el resto (docs/00, sección 20). |

### 11. Namecheap

| Campo | Detalle |
| --- | --- |
| Propósito | Parte de los más de 150 dominios: vencimiento real, renovación, nameservers. |
| Interfaz | `RegistrarConnector` (módulo Domains). |
| Capacidades previstas | Listar, consultar vencimiento, renovar, nameservers (docs/00, sección 6). Contactos, bloqueo y código de autorización: solo si se confirman (docs/00, sección 16). |
| Autenticación | **Verificado:** parámetros `ApiUser`, `ApiKey` (se emite al habilitar el acceso a API) y `UserName`; `ClientIp` se envía como parámetro. Respuestas en XML. |
| Dónde vive la credencial | `secrets` `kind = registrar`. |
| Permisos mínimos | **Verificado:** debe autorizarse al menos una IPv4 en lista blanca antes de que la API funcione; no admite IPv6. Se autoriza solo la IP del VPS del sistema. |
| Webhooks | No se encontraron. |
| Sincronización | `SyncDomains` diario (ajuste "Frecuencia de sincronización con registradores", docs/00, sección 23). Actualiza `domains.registry_expires_at`; nunca toca `commercial_due_date`. |
| Límites y reintentos | Renovación con clave de idempotencia y consulta previa de la fecha de expiración (si ya cambió, no se reintenta). Tasa máxima: NO VERIFICADO. |
| Errores | IP no autorizada: `credentials`. |
| Alternativa manual | Importación por CSV. |
| Qué verificar antes de construir | **NO VERIFICADO:** requisitos de cuenta para habilitar la API en producción (la página oficial dice que existen, pero no los lista; se consultan con soporte) — pendiente de docs/00, sección 14. Tasa máxima. Operaciones de contactos, bloqueo y código de autorización. **Verificado:** existe sandbox en `https://api.sandbox.namecheap.com/xml.response`, para staging. Si el VPS cambia de IP, actualizar la lista blanca antes del cambio. |

### 12. NameSilo

| Campo | Detalle |
| --- | --- |
| Propósito | Parte de los dominios. |
| Interfaz | `RegistrarConnector`. |
| Capacidades previstas | Listar, renovar, nameservers, bloqueo (docs/00, sección 6). Contactos y código de autorización: por confirmar (docs/00, sección 16). |
| Autenticación | **Verificado:** clave de API enviada como parámetro `key` en la URL; formato `https://www.namesilo.com/api/OPERACION?version=1&type=...&key=...`; solo HTTPS; todas las operaciones por GET; respuesta XML o JSON. |
| Dónde vive la credencial | `secrets` `kind = registrar`. |
| Permisos mínimos | Restricción por IP: NO VERIFICADO (no figura en la página consultada). |
| Webhooks | No se encontraron. |
| Sincronización | `SyncDomains` diario (ajuste). |
| Límites y reintentos | Como la clave viaja en la URL, el cliente HTTP del conector no registra URLs completas y el logger redacta el parámetro `key`. Tasa máxima: NO VERIFICADO. |
| Errores | Reglas comunes. **Verificado:** la propia documentación advierte que algunas operaciones cambian el dominio sin las validaciones del panel web; el conector valida antes de llamar. |
| Alternativa manual | Importación por CSV. |
| Qué verificar antes de construir | Lista de operaciones exacta (la página consultada no la mostró), restricción por IP, tasa máxima. **Verificado:** existe sandbox; las credenciales se piden a NameSilo. |

### 13. PoloDomains

| Campo | Detalle |
| --- | --- |
| Propósito | Parte de los dominios. |
| Interfaz | `RegistrarConnector` solo si se confirma una API; mientras tanto `ManualConnector`. |
| Capacidades previstas | Solo las que se confirmen (docs/00, sección 6). |
| Autenticación | **NO VERIFICADO** (kit: "por verificar"). La búsqueda al preparar el kit no encontró documentación pública de API de PoloDomains. |
| Dónde vive la credencial | Si existe API: `secrets` `kind = registrar`. Mientras tanto, el acceso al panel para soporte en `secrets` `kind = panel`. |
| Permisos mínimos / webhooks / sincronización / límites | NO VERIFICADO. Sin conector, la expiración se carga a mano y se vigila con recordatorio. |
| Alternativa manual | Registro manual más recordatorio de renovación (docs/00, sección 6); las operaciones del cliente (sección 16) crean tarea para soporte. |
| Qué verificar antes de construir | **NO VERIFICADO:** existencia de API, autenticación, operaciones, entorno de pruebas. Pedir la documentación directamente al proveedor (pendiente de docs/00, sección 14). |

### 14. Bunny.net

| Campo | Detalle |
| --- | --- |
| Propósito | Componente "CDN" del mapa de servicios: zonas, tráfico y consumo (docs/00, sección 6). |
| Interfaz | `CloudConnector` (solo `discoverResources`, `costs` y `metrics`). |
| Capacidades previstas | Zonas, tráfico y consumo. |
| Autenticación | **Verificado:** cabecera `AccessKey` con la clave de API de la cuenta (en la configuración de la cuenta, "API Keys"). La API principal cubre zonas *pull*, estadísticas y facturación, entre otros; ejemplo `GET https://api.bunny.net/pullzone`. |
| Dónde vive la credencial | `secrets` `kind = api_token`. |
| Permisos mínimos | La clave documentada es de cuenta (acceso amplio). Alcances reducidos o claves de solo lectura: NO VERIFICADO. Mientras no se confirme, el conector solo hace GET y la clave se rota con la frecuencia de `settings`. |
| Webhooks | No previstos. |
| Sincronización | `SyncComponentMetrics` diario (ajuste "Frecuencia de lectura de consumo"). |
| Límites y reintentos | Tasa máxima: NO VERIFICADO (no figura en la página consultada). |
| Errores | Reglas comunes. |
| Alternativa manual | Registro manual del componente. |
| Qué verificar antes de construir | Claves de alcance limitado, tasa máxima y endpoints exactos de estadísticas. La Storage API es aparte y no se usa. |

### 15. Elastic Email — correo transaccional del sistema y listas de mailing

| Campo | Detalle |
| --- | --- |
| Propósito | (a) Correo saliente del sistema por marca: avisos, cobranza, tickets (docs/00, secciones 2 y 6). (b) Campañas: sincronizar listas por marca, servicio y estado y recibir bajas y rebotes (docs/00, sección 24). (c) Componente "Envíos masivos" de clientes: estado de cuenta, volumen enviado, límites (docs/00, sección 6). |
| Interfaz | `MessagingConnector` para (a) y (b); `ProvidesMetrics` para (c). |
| Capacidades previstas | Enviar, recibir rebotes; sincronizar listas; leer bajas; leer volumen y límites. No se construyen campañas dentro del sistema: se envían desde Elastic Email. |
| Autenticación | **Verificado:** API REST v4 (`https://api.elasticemail.com/v4`) con clave de API. Nombre exacto de la cabecera: NO VERIFICADO (la página consultada describe la clave `apikey`; confirmar antes de programar). Alternativa del kit: SMTP con credenciales por marca. |
| Dónde vive la credencial | `secrets` `kind = api_token`, una por marca (kit: "credenciales por marca"). |
| Permisos mínimos | **Verificado:** cada clave se crea con niveles de acceso por operación (por ejemplo `SendHttp`, `ModifyContacts`, `ViewReports`) y puede restringirse a un rango de IP (`RestrictAccessToIPRange`). Se crean claves separadas: envío transaccional (solo envío), listas (contactos y bajas), lectura de estadísticas (solo reportes), todas restringidas a la IP del VPS. |
| Webhooks | **Verificado:** notificaciones por eventos (enviado, abierto, clic, baja, entre otros). Ruta `/api/v1/webhooks/elastic-email`; actualizan `notification_deliveries` (solo inserción: cada evento es una fila nueva) y `communication_consents`. Método de firma del webhook: NO VERIFICADO; si no hay firma, se usa secreto en la URL más lista de IP. |
| Sincronización | Listas: job en cola `sync` al cambiar miembros y diario; bajas y rebotes también por consulta de supresiones como respaldo del webhook. Frecuencia en `settings`. |
| Límites y reintentos | **Verificado:** hasta 20 conexiones concurrentes y 600 s de tiempo máximo por petición. Envíos con `dedupe_key` (docs/00, sección 10) para no duplicar avisos. |
| Errores | Rebote duro o queja: se marca el contacto y se respeta en todos los canales (docs/00, sección 24). |
| Alternativa manual | Componente de clientes: registro manual. Correo del sistema: sin alternativa manual (kit: "—"); se vigila con alerta. |
| Qué verificar antes de construir | Cabecera exacta de autenticación, firma de webhooks, cuota diaria del plan contratado, configuración de dominio remitente (SPF/DKIM) por marca. |

### 16. Google Workspace

| Campo | Detalle |
| --- | --- |
| Propósito | Correo corporativo de clientes: dominio, edición, licencias compradas y asignadas, usuarios, almacenamiento (docs/00, sección 18). |
| Interfaz | `MailConnector` (módulo Mail; tablas `mail_services`, `seat_licenses`, `mail_dns_checks`). |
| Capacidades previstas | Leer licencias y usuarios; uso de almacenamiento. Conector de revendedor cuando se obtenga la condición de socio. Hoy: registro manual (docs/00, sección 21). |
| Autenticación | Cuenta de servicio con delegación (según kit). |
| Dónde vive la credencial | `secrets` `kind = cloud` o `private_key`, por inquilino del cliente. |
| Permisos mínimos | Alcances de solo lectura de usuarios, licencias e informes. No se guardan contraseñas de buzones. |
| Webhooks | No previstos. |
| Sincronización | Diario (ajuste). Alerta cuando licencias asignadas superan las facturadas. |
| Límites y reintentos | Reglas comunes. |
| Errores | Delegación revocada: `credentials`. |
| Alternativa manual | Registro manual (modo inicial). |
| Qué verificar antes de construir | **NO VERIFICADO:** programa de socio/revendedor de Google Workspace y su plazo (docs/00, secciones 14 y 21). Alcances exactos de lectura. |

### 17. Microsoft 365

| Campo | Detalle |
| --- | --- |
| Propósito | Inquilino, dominios, usuarios, licencias asignadas y disponibles (docs/00, secciones 6 y 18). |
| Interfaz | `MailConnector`. |
| Capacidades previstas | Lectura por Microsoft Graph; Partner Center si se revende como socio. Hoy: registro manual. |
| Autenticación | Aplicación registrada (según kit). |
| Dónde vive la credencial | `secrets` `kind = cloud` (inquilino, id de aplicación, secreto o certificado). |
| Permisos mínimos | Permisos de aplicación de solo lectura de usuarios, dominios y licencias, con consentimiento del administrador del inquilino. |
| Webhooks | No previstos. |
| Sincronización | Diario (ajuste). |
| Límites y reintentos | Reglas comunes; respetar `Retry-After` si lo envía. |
| Errores | Consentimiento retirado: `credentials`. |
| Alternativa manual | Registro manual. |
| Qué verificar antes de construir | **NO VERIFICADO:** programa de socio de Microsoft y su plazo. Permisos de Graph exactos. |

### 18. PayPal

| Campo | Detalle |
| --- | --- |
| Propósito | Pago en línea de clientes del extranjero desde el portal; conciliación; comisión real. |
| Interfaz | `PaymentConnector` (módulo Billing; tablas `payments`, `payment_methods`, `payment_allocations`). |
| Capacidades previstas | Crear orden, capturar, reembolsar, conciliar (docs/00, sección 6). |
| Autenticación | OAuth2 con client id y secret (según kit). |
| Dónde vive la credencial | `secrets` `kind = api_token`; distinta en staging (sandbox) y producción. |
| Permisos mínimos | Aplicación dedicada al sistema. Reembolso solo con `billing.refund.authorize` y MFA reciente. |
| Webhooks | Ruta `/api/v1/webhooks/paypal`, cola `critical`. El pago pasa a `validated` solo con el webhook de captura completada y si coincide el importe (docs/00, sección 7). `payments.external_id` único por método: el mismo webhook tres veces registra un solo pago (docs/00, sección 11). |
| Sincronización | Conciliación diaria de transacciones; comisión real en `fee_minor` como gasto. |
| Límites y reintentos | Todas las escrituras con `Idempotency-Key` (contrato, sección API). |
| Errores | Importe distinto: el pago queda `reported` y alerta a finanzas. |
| Alternativa manual | Registro manual del pago con voucher y validación de finanzas. |
| Qué verificar antes de construir | Método de verificación de firma de webhooks y nombre del evento de captura completada en la versión vigente. No consultado al preparar el kit. |

### 19. Global66

| Campo | Detalle |
| --- | --- |
| Propósito | Cobros de clientes del extranjero. |
| Interfaz | `PaymentConnector` solo si existe API; mientras tanto medio de pago manual. |
| Capacidades previstas | Enlace de cobro y confirmación del pago, **si existe API** (docs/00, sección 6). |
| Autenticación | **NO VERIFICADO.** La búsqueda al preparar el kit solo encontró páginas comerciales de Global66 para empresas (pagos y envíos), sin documentación pública de API para desarrolladores. |
| Dónde vive la credencial | Si existe API: `secrets` `kind = api_token`. |
| Permisos mínimos / webhooks / sincronización / límites | NO VERIFICADO. |
| Alternativa manual | Voucher del cliente y validación de finanzas (docs/00, sección 6); es el modo inicial. La comisión se configura en `payment_methods`. |
| Qué verificar antes de construir | **NO VERIFICADO (pendiente de docs/00, secciones 14 y 21):** si Global66 ofrece API de cobros o enlaces de cobro para la cuenta de la empresa. Consultar con el ejecutivo de la cuenta. |

### 20. Pasarela de tarjetas local (proveedor por elegir)

| Campo | Detalle |
| --- | --- |
| Propósito | Pago con tarjeta de crédito o débito de una o varias facturas desde el portal, en soles y dólares, con 3-D Secure; reembolso total o parcial; contracargos; conciliación con el reporte de liquidación (docs/00, secciones 6, 7 y 21). |
| Interfaz | `PaymentConnector` (módulo Billing; tablas `payment_methods` con `kind = card_gateway`, `payment_checkouts`, `payments`, `payment_refunds`, `payment_disputes`, `payment_settlement_lines`). Un conector por pasarela detrás de la misma interfaz; la activa la fija `billing.card_gateway.provider`. |
| Capacidades previstas | `createOrder()`: sesión del formulario alojado o token del formulario embebido (devuelve URL o token y clave pública; nunca recibe datos de tarjeta). `parseWebhook()`: pago aprobado, rechazado, reembolsado y contracargo. `refund()`: total o parcial. `getTransaction()`: estado de una transacción (vencimiento del intento, reintentos). `listTransactions()`: transacciones y liquidaciones. `capture()` solo si la pasarela separa autorización y captura. |
| Autenticación | **NO VERIFICADO** (proveedor por elegir). Lo habitual es una clave secreta de comercio para la API del servidor y una clave pública para el formulario del navegador. |
| Dónde vive la credencial | Clave secreta en `secrets` `kind = api_token` y secreto de firma de webhooks en la bóveda, enlazados a la `provider_accounts` de la pasarela (`providers.type = payment`); distintos en el entorno de pruebas y en producción. La clave pública tampoco va en el código: se lee de la cuenta del proveedor. |
| Permisos mínimos | Credencial de comercio dedicada al sistema. Solicitar reembolso: `billing.payment.validate`; autorizarlo: `billing.refund.authorize` con MFA reciente. Contracargos: `billing.payment_dispute.*`. |
| Webhooks | `/api/v1/webhooks/card-gateway` (`cardGatewaySignature`: HMAC del cuerpo crudo, comparado en tiempo constante), cola `critical`. Evento crudo en `webhook_events` con `provider = card_gateway` e id externo único; un duplicado se confirma y se descarta. Pago aprobado con importe y moneda iguales al intento → pago `validated` sin finanzas (RN-BIL-059); rechazado → intento `declined`; reembolso → `payment_refunds` `succeeded`; contracargo → `payment_disputes` y pago `charged_back` (RN-BIL-061). |
| Sincronización | `SyncCardGatewaySettlements` diario con `listTransactions()` y fila en `sync_runs`, o importación del reporte en CSV; las líneas van a `payment_settlement_lines` y se concilian por id externo (RN-BIL-064). `ExpireCardCheckouts` consulta `getTransaction()` antes de marcar vencido un intento. |
| Límites y reintentos | Creación de la sesión y reembolso con la `Idempotency-Key` recibida por la API. Antes de reintentar un reembolso se consulta su estado. Tasa máxima: NO VERIFICADO. |
| Errores | Importe distinto: pago `reported` y alerta a finanzas. Firma inválida: 401 sin procesar. Reembolso o contracargo de una transacción desconocida: alerta `connector_error`. Credencial vencida: `credentials` y alerta. Una tarjeta rechazada no es error del conector: el intento queda `declined` con el código de la pasarela. |
| Seguridad (PCI DSS) | Formulario alojado o tokenizado por la pasarela: el sistema no recibe, transmite ni guarda número, vencimiento ni código de seguridad; no hay tarjetas guardadas ni cobro recurrente (docs/00, secciones 21 y 22). Ver `docs/10`, sección 10. |
| Alternativa manual | Transferencia con voucher y validación de finanzas (docs/00, sección 6). Además: sin webhook de contracargo, finanzas lo registra (`POST /admin/payment-disputes`); sin liquidaciones por API, se importa el CSV; sin reembolso por API, se registra el reembolso hecho en el panel de la pasarela con su referencia. |
| Qué verificar antes de construir | **NO VERIFICADO (pendiente D-18, `docs/11`):** pasarela elegida y todo lo que sigue. No se programa nada que dependa de estos datos hasta confirmarlos con la documentación y el contrato de la pasarela elegida. |

Requisitos para elegir la pasarela (docs/00, sección 21):

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

Lista de verificación por candidata (todo **NO VERIFICADO**; candidatas del kit: Niubiz, Izipay, Culqi y Mercado Pago, sin comparar sus condiciones actuales):

- Tipo de formulario (redirección a página alojada o formulario embebido con tokenización en el navegador) y versión de 3-D Secure.
- Cobro en PEN y USD con la misma cuenta de comercio, y moneda de abono.
- Eventos de webhook disponibles (aprobado, rechazado, reembolsado, contracargo y su resolución), método de firma, nombre de la cabecera, reintentos y unicidad del id del evento.
- Reembolso parcial por API, plazos y si admite varios reembolsos sobre una transacción.
- Consulta de transacción por id y reporte de liquidación: por API o archivo, formato y campos (id de transacción, bruto, comisión, neto, fecha y referencia de abono).
- Marcas aceptadas y billeteras (Yape u otras) que se pueden ofrecer en el mismo formulario.
- Entorno de pruebas con tarjetas de prueba y simulación de rechazo, reembolso y contracargo.
- Comisión porcentual y fija, plazo de abono y cuenta de abono según contrato (se cargan en `billing.card_gateway.*`).
- Obligaciones PCI DSS que la pasarela exige al comercio según el tipo de formulario (cuestionario de autoevaluación aplicable).
- Límites de tasa de la API.

### 21. Facturación electrónica SUNAT vía OSE/PSE (proveedor por elegir)

| Campo | Detalle |
| --- | --- |
| Propósito | Emisión fiscal de facturas, boletas y notas de crédito y débito, también a clientes del extranjero; guardar XML, CDR y estado (docs/00, secciones 6, 7 y 21). |
| Interfaz | `EInvoiceConnector` (módulo Billing; tabla `einvoice_submissions`; `invoices.fiscal_status`: `not_applicable`, `pending`, `accepted`, `rejected`, `voided`). |
| Capacidades previstas | Emitir, consultar estado, reenviar rechazados, anular/comunicar baja. |
| Autenticación | Según proveedor elegido (kit). Para usar un OSE, la empresa registra su certificado digital en SUNAT Operaciones en Línea y autoriza al operador; rige desde el día calendario siguiente (docs/00, sección 21). |
| Dónde vive la credencial | `secrets` `kind = api_token` (token del proveedor). El certificado digital, si el proveedor lo pide, en `secrets` `kind = private_key`. |
| Permisos mínimos | Token del sistema, distinto del de usuarios del proveedor. Emitir requiere `billing.invoice.issue`. |
| Webhooks | Si el proveedor los ofrece: `/api/v1/webhooks/einvoice`. Si no, consulta de estado en cola `billing`. |
| Sincronización | Job de emisión en cola `billing` (5 reintentos); consulta de estado de pendientes con frecuencia configurable. |
| Límites y reintentos | Emisión con `Idempotency-Key`; antes de reenviar se consulta el estado. La numeración se asigna en el sistema (bloqueo de `document_series`) y no cambia al reintentar. |
| Errores | Rechazo: `fiscal_status = rejected`, tarea para finanzas; corrección por nota de crédito/débito (una factura emitida no se edita). |
| Alternativa manual | Emisión externa y registro del número (docs/00, sección 6). |
| Qué verificar antes de construir | **NO VERIFICADO:** proveedor elegido (docs/00, sección 14). Evaluarlo con esta tabla (docs/00, sección 21): |

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

Candidatos a evaluar con esa tabla (kit): Nubefact, Efact, Bizlinks, el facturador de Odoo u otros operadores autorizados, y el sistema gratuito de SUNAT si el volumen lo permite. No se compararon precios ni funciones. Además, el contador debe confirmar qué productos califican como exportación (`invoices.tax_treatment = export`) y la configuración de detracciones.

### 22. WhatsApp Business Platform

| Campo | Detalle |
| --- | --- |
| Propósito | Bandeja compartida: los mensajes entrantes crean ticket o prospecto o se vinculan a un cliente; avisos de cobranza con plantillas aprobadas por Meta (docs/00, secciones 21, 22 y 24). |
| Interfaz | `MessagingConnector` (módulo Sales; tablas `whatsapp_numbers`, `whatsapp_conversations`, `whatsapp_messages`). |
| Capacidades previstas | Enviar avisos con plantillas aprobadas; recibir mensajes. |
| Autenticación | Token de la aplicación (según kit). |
| Dónde vive la credencial | `secrets` `kind = api_token`, uno por número/marca; secreto de verificación de webhook también en la bóveda. |
| Permisos mínimos | Token de usuario de sistema limitado a los números de la empresa. |
| Webhooks | `/api/v1/webhooks/whatsapp`: mensajes entrantes y estados de entrega. Validación de firma; evento crudo en `webhook_events`. |
| Sincronización | Plantillas aprobadas: lectura diaria (ajuste). |
| Límites y reintentos | Envíos en cola `notifications` (5 reintentos) con `dedupe_key`. Se respeta `communication_consents`. |
| Errores | Plantilla rechazada o fuera de ventana de conversación: el aviso sale por correo (alternativa del kit). |
| Alternativa manual | Aviso por correo. |
| Qué verificar antes de construir | Método vigente de firma del webhook, tipo de token de larga duración y reglas de plantillas y ventanas de conversación. No consultado al preparar el kit. |

### 23. Meta Lead Ads (Facebook e Instagram)

| Campo | Detalle |
| --- | --- |
| Propósito | Canal de captación: formularios de clientes potenciales por webhook (docs/00, sección 24). |
| Interfaz | `LeadSourceConnector` (módulo Sales; tablas `lead_channels`, `lead_forms`, `leads`). |
| Capacidades previstas | Recibir el aviso por webhook y leer el prospecto; guardar página, formulario y campaña. |
| Autenticación | Token de la aplicación de Meta con acceso a las páginas de las marcas. NO VERIFICADO al preparar el kit. |
| Dónde vive la credencial | `secrets` `kind = api_token` por página o marca. |
| Permisos mínimos | Solo lectura de prospectos de las páginas de las marcas. |
| Webhooks | `/api/v1/webhooks/meta-leads`; firma validada; evento crudo en `webhook_events`; la creación del prospecto es idempotente por id externo. |
| Sincronización | Recuperación periódica de prospectos no recibidos (respaldo del webhook), frecuencia en `settings`. |
| Límites y reintentos | Reglas comunes. |
| Errores | Token vencido: `credentials`, alerta a ventas y administración. |
| Alternativa manual | Registro manual del prospecto eligiendo el canal. |
| Qué verificar antes de construir | Permisos y revisión de la aplicación que exige Meta, formato del webhook de prospectos y vigencia del token. No consultado al preparar el kit. |

### 24. Moodle

| Campo | Detalle |
| --- | --- |
| Propósito | Instancias Moodle de clientes como componente del mapa y como `saas_instances` (docs/00, secciones 6 y 20). |
| Interfaz | `SaasConnector` (módulo Saas). |
| Capacidades previstas | Versión, usuarios activos, complementos (docs/00, sección 6). Alerta de exceso sobre los límites del plan. |
| Autenticación | Token de servicio web de alcance limitado (según kit). |
| Dónde vive la credencial | `secrets` `kind = api_token` por instancia. |
| Permisos mínimos | Servicio web propio con solo las funciones de lectura necesarias y usuario técnico sin privilegios de administración. |
| Webhooks | No previstos. |
| Sincronización | `SyncComponentMetrics` diario (ajuste). |
| Límites y reintentos | Reglas comunes. |
| Errores | Función no habilitada en el servicio web: se retira de `capabilities()`. |
| Alternativa manual | Registro manual. |
| Qué verificar antes de construir | Funciones de servicio web disponibles en la versión de cada instancia para versión, usuarios activos y complementos. No consultado al preparar el kit. |

### 25. Firma electrónica (proveedor por elegir)

| Campo | Detalle |
| --- | --- |
| Propósito | Firma de contratos, adendas y actas (docs/00, sección 24). Hoy: se sube el contrato firmado (escaneado o con firma digital). |
| Interfaz | `SignatureConnector` (módulo Contracts; tablas `contract_signatures`, `contract_versions`). |
| Capacidades previstas | Enviar a firmar, consultar estado, descargar el firmado. Al firmar, `contracts.status = signed_active`. |
| Autenticación / credencial | NO VERIFICADO (proveedor por elegir). Se guardará en `secrets` `kind = api_token`. |
| Permisos mínimos | Solo se envía un contrato `approved` (aprobación del administrador, `contracts.contract.approve`). |
| Webhooks | `/api/v1/webhooks/signature` si el proveedor los ofrece. |
| Sincronización | Consulta de estado de sobres pendientes, frecuencia en `settings`. |
| Alternativa manual | Subir el contrato firmado. |
| Qué verificar antes de construir | **NO VERIFICADO:** servicio elegido (docs/00, sección 14), validez legal en Perú del tipo de firma, API y webhooks. |

### 26. Monitoreo (herramienta por elegir)

| Campo | Detalle |
| --- | --- |
| Propósito | Integrar una herramienta existente; no se construye un monitoreo propio completo (docs/00, sección 22). Los chequeos propios de SSL y DNS (`CheckSslAndDns`) siguen en el sistema. |
| Interfaz | `MonitoringConnector` (módulo Monitoring; tablas `monitors`, `monitor_results`, `incidents`, `alerts`). |
| Capacidades previstas | Listar monitores, crearlos o actualizarlos, recibir caídas y recuperaciones que abren o cierran `incidents`; impacto en los componentes dependientes (docs/00, sección 15). |
| Autenticación / credencial | NO VERIFICADO. `secrets` `kind = api_token`. |
| Webhooks | `/api/v1/webhooks/monitoring`. |
| Sincronización | Lectura de monitores, frecuencia en `settings`. |
| Alternativa manual | Registro manual de incidentes. |
| Qué verificar antes de construir | **NO VERIFICADO:** herramienta elegida (docs/00, sección 14), API, firma de webhooks, si permite portal de estado. |

### 27. Certificados SSL (sin conector por proveedor)

No es un conector de proveedor: un job diario lee el certificado publicado en cada dominio (emisor, expiración, dominios cubiertos) y actualiza `ssl_certificates` (docs/00, secciones 6 y 18). Los certificados no publicados se registran a mano.

### 28. Certificados SSL automáticos del sistema central (ACME)

| Campo | Detalle |
| --- | --- |
| Propósito | Emitir y renovar los certificados de los subdominios del sistema central en alojamientoplus.com (portal, panel y API; `system.central_domains`). Los dominios de las webs de marca apuntan al WordPress Multisite y su certificado lo gestiona ese hosting (docs/00 §26). |
| Interfaz | Sin conector de proveedor: lo hace el servidor web o proxy inverso con ACME (por ejemplo Let's Encrypt); MON vigila el vencimiento con el job de certificados (ficha 27). |
| Autenticación | Desafío ACME HTTP-01 o DNS-01 por dominio. |
| Dónde vive la credencial | Cuenta ACME y claves en el servidor (fuera de la base). |
| Errores | Certificado por vencer sin renovar → alerta. |
| Alternativa manual | Carga manual del certificado en el servidor y registro de su vencimiento. |
| Qué verificar antes de construir | **NO VERIFICADO:** servidor web o proxy elegido y su mecanismo ACME (`docs/11`, T-23); límites de emisión del emisor. |

### 29. API de Claude (Anthropic) — asistente con IA

| Campo | Detalle |
| --- | --- |
| Propósito | Responder en la web WordPress de cada marca (`[hub_asistente]`) y en el portal, con uso de herramientas (recomendar plan, consultar dominio, crear prospecto o ticket, derivar) (docs/00 §25). |
| Interfaz | `AiAssistantConnector` (módulo Assistant; tablas `ai_assistant_profiles`, `ai_conversations`, `ai_messages`, `ai_usage`). |
| Capacidades previstas | Mensajes con instrucciones de sistema, historial y definición de herramientas; respuesta con texto o llamadas a herramientas; conteo de tokens de entrada y salida para los topes. |
| Autenticación | Clave de API en cabecera, según la documentación pública de Anthropic (no reabierta al preparar este kit). |
| Dónde vive la credencial | `secrets` `kind = api_token` enlazado a la cuenta del proveedor `providers.type = ai`. |
| Permisos mínimos | Clave dedicada al sistema, con límite de gasto en la consola del proveedor además del tope de `assistant.monthly_token_limit`. |
| Límites y reintentos | Los topes del kit se aplican antes de llamar (RN-AIA-007). Ante 429 o error transitorio: un reintento con espera; si falla, el widget ofrece contacto humano. Tasas por modelo: **NO VERIFICADO**. |
| Errores | Credencial inválida → `credentials` y alerta; respuesta con herramienta no permitida → se ignora y se registra. |
| Seguridad | Contexto delimitado como datos, sin datos de otros clientes ni secretos (`docs/10`, sección 11). |
| Alternativa manual | Sin asistente: el widget muestra solo contacto humano y WhatsApp. |
| Qué verificar antes de construir | **NO VERIFICADO:** modelo, precios, límites de tasa, retención de datos del proveedor y región (`docs/11`, D-22). |

### 30. Herramienta de respaldos de los servidores cPanel

| Campo | Detalle |
| --- | --- |
| Propósito | Leer los respaldos reales de cada cuenta y restaurar un sitio, una base de datos o un buzón a una fecha (docs/00 §25, "Respaldos y restauración ampliados"). |
| Interfaz | `BackupToolConnector` (módulo Monitoring; tablas `backup_tool_accounts`, `backup_runs`, `restore_requests`). |
| Capacidades previstas | Listar respaldos por cuenta y tipo; restaurar por API con seguimiento del trabajo; solo lectura hasta habilitar la restauración por cuenta (RN-MON-009). |
| Autenticación | **NO VERIFICADO** (depende de la herramienta: por ejemplo JetBackup ofrece API en el servidor). |
| Dónde vive la credencial | `secrets` enlazados a la `provider_accounts` de la herramienta por nodo. |
| Sincronización | `SyncBackupTools` con fila en `sync_runs`; un respaldo se registra una sola vez por id externo (RN-MON-005). |
| Alternativa manual | Registro manual de respaldos y restauración como tarea asistida con el procedimiento (RN-MON-003). |
| Qué verificar antes de construir | **NO VERIFICADO:** qué herramienta usan los nodos, su API y si permite restaurar por tipo (`docs/11`, D-21). |

### 31. Disponibilidad de dominios para la web y el carrito

| Campo | Detalle |
| --- | --- |
| Propósito | Consultar si un dominio está libre y su precio antes de agregarlo al carrito, desde `[hub_buscar_dominio]` y `[hub_whois]` en la web WordPress y desde el asistente (docs/00 §25, §26 y §27). |
| Interfaz | `RegistrarConnector::checkAvailability` del registrador por defecto de la extensión (`domain_extensions.default_registrar_id`); precio desde `domain_tld_prices`. |
| Límites y reintentos | Límite por IP del carrito (`orders.online.domain_check_limit_per_ip_per_hour`), límite por visitante de las webs (`web_connector.whois.limit_per_visitor_per_hour`) con captcha tras `web_connector.whois.captcha_after_lookups`, y caché por dominio (`web_connector.whois.cache_minutes`); cada consulta queda en `whois_lookups`; si el registrador no responde, el dominio se muestra "no verificado" y no se agrega como registro (RN-ORD-003, RN-DOM-015). |
| Alternativa manual | Sin API del registrador: la extensión no se vende en línea; "Solicitar cotización". |
| Qué verificar antes de construir | **NO VERIFICADO:** límites de consulta de Namecheap y NameSilo para disponibilidad en volumen y si devuelven precios premium (fichas 11 a 13, D-08). |

### 32. Captcha (proveedor por elegir)

| Campo | Detalle |
| --- | --- |
| Propósito | Proteger la creación de cuenta, la compra en línea, los formularios del constructor, el Libro de Reclamaciones, las solicitudes de datos personales y el asistente público. El plugin de WordPress pinta el desafío con la clave pública de `GET /public/wp/site`; el sistema verifica el token. |
| Interfaz | `CaptchaVerifier`; el proveedor lo fija `orders.online.captcha_provider`. |
| Errores | Verificación fallida → 422 sin crear el registro (RN-ORD-013); proveedor caído → la compra no avanza y el Libro ofrece el correo de contacto. |
| Qué verificar antes de construir | **NO VERIFICADO:** proveedor, privacidad de datos del visitante y si requiere consentimiento de cookies (`docs/11`, D-24). |

### 33. Plugin Hub Connector para WordPress Multisite

| Campo | Detalle |
| --- | --- |
| Propósito | Mostrar en cada web WordPress de marca, por shortcode o bloque, lo que vive en el sistema: catálogo y precios, dominios, contratar, formularios, contacto, documentos legales, Libro de Reclamaciones, asistente, estado de los servicios, promociones y selector de moneda (docs/00 §26). Especificación completa: `docs/13-plugin-wordpress-hub-connector.md`. |
| Interfaz | Del lado del sistema, la API de lectura `/public/wp/...` (módulo WCN, esquema `wpSiteToken`) y el envío público `POST /public/web-forms/{code}/submissions`; el sistema avisa al plugin con `WordpressPluginNotifier` (webhook firmado). |
| Autenticación | Token de solo lectura del sitio (`wp_site_tokens`, solo hash) en la cabecera `Authorization: Bearer`, enviado desde el servidor de WordPress; los avisos del sistema al plugin van firmados con HMAC-SHA256 y el secreto del sitio. |
| Dónde vive la credencial | En el sistema: hash del token en `wp_site_tokens` y secreto de firma en `secrets` (`owner_type = wp_site`). En WordPress: token y secreto cifrados en las opciones del sitio con una clave derivada de las sales de `wp-config.php` (nunca en el navegador). |
| Permisos mínimos | El token solo lee la marca de su sitio (`scope = read`); el plugin nunca escribe en el sistema salvo reenviar envíos de formularios sin guardarlos. |
| Límites y reintentos | El plugin cachea con transients por `web_connector.cache_ttl_seconds`; ante 429 o error transitorio usa la última copia y reintenta con espera; el sistema reintenta los avisos hasta `web_connector.webhook.max_attempts`. |
| Errores | Token revocado o vencido → 401 y última copia con aviso al administrador de WordPress; plugin desactualizado → 426; aviso con firma inválida → el plugin responde 401 y lo descarta. |
| Alternativa manual | Si el plugin falla, la caché expira y se renueva al vencer; desde el panel se pide una invalidación manual (P-WCN-10). |
| Qué verificar antes de construir | **NO VERIFICADO:** versión de WordPress y de PHP del hosting del Multisite, tema y constructor de páginas que se usen y su compatibilidad con bloques, plugin de caché de página y CDN (`docs/11`, D-32 y D-33). |

### 34. WordPress Multisite de las marcas (fuera del sistema)

| Campo | Detalle |
| --- | --- |
| Propósito | Las webs públicas (páginas y su diseño, menús, FAQ, blog, base de conocimientos, página 404, SEO y palabras clave, aviso de cookies, píxeles y CSS personalizado) se construyen y administran en un WordPress Multisite con un sitio por marca y su dominio (docs/00 §26). |
| Interfaz | Ninguna desde el sistema: el sistema nunca lee ni escribe contenido de WordPress (no usa su API REST). La única integración es el plugin Hub Connector (ficha 33). |
| Autenticación | Usuarios propios de WordPress, fuera del sistema; se recomienda segundo factor para los administradores de la red. |
| Alternativa manual | No aplica. |
| Qué verificar antes de construir | **NO VERIFICADO:** hosting del Multisite, mapeo de dominios por sitio, tema y constructor de páginas, plugin de SEO (Rank Math o Yoast), plugin de cookies, plugin de caché, multilingüe (`docs/11`, D-32 y D-33). |

### 35. SEO, Search Console y velocidad (en WordPress)

| Campo | Detalle |
| --- | --- |
| Propósito | Palabras clave, títulos y descripciones, sitemaps, datos estructurados, Google Search Console y medición de velocidad de las webs (docs/00 §26: viven en WordPress). |
| Interfaz | Ninguna desde el sistema: los administra el plugin de SEO de WordPress (Rank Math o Yoast). El plugin Hub Connector entrega el HTML de sus shortcodes en el servidor para que los buscadores lo lean y no genera metaetiquetas propias ni compite con el plugin de SEO (`docs/13`). |
| Alternativa manual | No aplica. |
| Qué verificar antes de construir | Plugin de SEO elegido y si se desea exponer los planes como datos estructurados de producto desde el plugin de SEO (`docs/11`, D-32). |

### 36. Píxeles, etiquetas de marketing y cookies (en WordPress)

| Campo | Detalle |
| --- | --- |
| Propósito | Google Tag Manager, Google Analytics 4, Google Ads, Meta Pixel, TikTok Pixel y similares, y el aviso de cookies con consentimiento, en las webs de marca (docs/00 §26: viven en WordPress). |
| Interfaz | Sin conector: los instala y administra WordPress con su plugin de cookies. El sistema solo devuelve al cliente, al terminar una compra, a la página de agradecimiento del sitio (`wp_sites.thank_you_url`) con el pedido, el importe y la moneda una sola vez, para que los píxeles registren la conversión (RN-WCN-008, RN-ORD-016). |
| Seguridad | Nunca se cargan scripts de terceros en el portal, el carrito ni el panel (`docs/10`, sección 12). |
| Alternativa manual | Ninguna necesaria. |
| Qué verificar antes de construir | **NO VERIFICADO:** qué integraciones activa cada marca y el plugin de cookies elegido (`docs/11`, D-30 y D-33). |

### 37. WHOIS y RDAP de los registradores para `[hub_whois]`

| Campo | Detalle |
| --- | --- |
| Propósito | Mostrar en la web de cada marca, desde `[hub_whois]`, si un dominio está libre, su precio por extensión, sugerencias de nombres y extensiones alternativas y, si ya está registrado, sus datos públicos (registrador, fechas de creación y vencimiento, estado y servidores de nombres) respetando la privacidad (docs/00 §27). |
| Interfaz | `RegistrarConnector::checkAvailability`, `RegistrarConnector::whois` y `RegistrarConnector::suggest` del registrador por defecto de cada extensión (`domain_extensions.default_registrar_id`), según sus `capabilities()`. Alternativa para el WHOIS de un dominio ajeno: consulta RDAP pública del registro de la extensión (sin credenciales), solo si se confirma que está disponible y permitida. Precio desde `domain_tld_prices`. Endpoint del sistema: `GET /public/wp/whois` (módulo DOM). |
| Autenticación | La del conector de cada registrador (fichas 11 a 13); RDAP público sin credenciales. |
| Dónde vive la credencial | En la bóveda, como el resto de los registradores. |
| Permisos mínimos | Solo lectura (`checkAvailability`, `whois`, `suggest`); nunca operaciones de registro desde esta ficha. |
| Límites y reintentos | Límite por visitante y hora y captcha en el sistema (RN-DOM-016) antes de llamar al registrador; caché por dominio `web_connector.whois.cache_minutes`; sin reintento dentro de la petición del visitante: si el registrador no responde, `status = unknown`. Tasas de cada registrador para consultas en volumen: **NO VERIFICADO**. |
| Privacidad | Del WHOIS o RDAP solo se publican los campos de `web_connector.whois.public_fields`; nombre, correo, teléfono y dirección del titular nunca se muestran ni se guardan, aunque el registro los publique. `whois_lookups` guarda solo el HMAC de la IP del visitante. |
| Errores | Registrador caído o sin capacidad → `unknown` sin alerta por consulta; tasa de errores alta en una hora → alerta `connector_error`. |
| Alternativa manual | Sin capacidad de disponibilidad en ningún registrador de la extensión: la extensión no se ofrece en `[hub_whois]` y la web muestra "Solicitar cotización". |
| Qué verificar antes de construir | **NO VERIFICADO:** si Namecheap, NameSilo y PoloDomains ofrecen por API disponibilidad, WHOIS o RDAP y sugerencias, con qué límites de consulta y si sus condiciones permiten mostrar esos datos en una web pública; disponibilidad de RDAP para .pe, .com.pe, .cl, .mx y .co y sus condiciones de uso; si devuelven precios premium (fichas 11 a 13; `docs/11`, D-35). |

## Resumen de verificación

| Proveedor | Estado | Qué quedó confirmado |
| --- | --- | --- |
| Namecheap | Verificado parcial | API con `ApiUser`/`ApiKey`/`UserName`/`ClientIp`; lista blanca IPv4 obligatoria; sandbox. Requisitos de cuenta y tasa: NO VERIFICADO. |
| NameSilo | Verificado parcial | Clave `key` en la URL, GET, versión 1, XML/JSON, sandbox a pedido. Operaciones, IP y tasa: NO VERIFICADO. |
| Contabo | Verificado | OAuth2 *password grant* con ClientId, ClientSecret, usuario y contraseña de API; `x-request-id` obligatorio; 429; usuarios y roles. Tasa numérica: NO VERIFICADO. |
| Bunny.net | Verificado parcial | Cabecera `AccessKey` con clave de cuenta; zonas, estadísticas, facturación. Alcances y tasa: NO VERIFICADO. |
| Elastic Email | Verificado parcial | API v4 con clave; niveles de acceso por clave; restricción por IP; listas, supresiones, webhooks; 20 conexiones, 600 s. Cabecera exacta y firma de webhooks: NO VERIFICADO. |
| PoloDomains | NO VERIFICADO | Sin documentación pública encontrada. |
| Global66 | NO VERIFICADO | Sin documentación pública de API encontrada. |
| Pasarela de tarjetas local | NO VERIFICADO | Proveedor por elegir (Niubiz, Izipay, Culqi, Mercado Pago u otro); no se consultó documentación de ninguna candidata. |
| API de Claude | Según documentación pública conocida, no reabierta | Forma general de autenticación y recursos; modelos, cuotas y tasas: NO VERIFICADO. |
| Plugin Hub Connector y WordPress Multisite | Especificado en `docs/13`; WordPress no reconsultado | Hosting, versiones, tema, constructor y plugins de SEO, cookies y caché: NO VERIFICADO. |
| WHOIS y RDAP de registradores para `[hub_whois]` | NO VERIFICADO | Capacidades de disponibilidad, WHOIS o RDAP y sugerencias por registrador, límites y condiciones de uso público (`docs/11`, D-35). |
| Herramienta de respaldos de cPanel, captcha, ACME, píxeles de marketing | NO VERIFICADO | Herramienta o proveedor por elegir o por confirmar (`docs/11`, D-21, D-24, D-30, D-33, T-23). |
| Resto | Según kit | No se reconsultaron al preparar el kit; confirmar antes de construir. |

## Fuentes

URLs abiertas o consultadas durante la preparación (7 de octubre de 2026):

- Namecheap — introducción a la API: https://www.namecheap.com/support/api/intro/
- NameSilo — referencia de API: https://www.namesilo.com/api-reference
- Contabo — documentación de la API: https://api.contabo.com/
- Bunny.net — API principal: https://docs.bunny.net/reference/bunnynet-api-overview (redirige a https://bunny.net/docs/api-reference/core.md)
- Elastic Email — API REST v4: https://elasticemail.com/developers/api-documentation/rest-api
- PoloDomains — búsqueda web "PoloDomains API reseller documentation": ningún resultado de PoloDomains (los resultados correspondían a otros proveedores, por ejemplo https://crazydomains.co.nz/resellers/api/).
- Global66 — búsqueda web "Global66 API developers payments documentation": solo páginas comerciales, por ejemplo https://www.global66.com/pe/empresas/envios-instantaneos/ (no abierta en detalle).
- Citadas por el kit (no reabiertas): Alegra sobre OSE https://blog.alegra.com/peru/ose-operador-de-servicios-electronicos/ ; SUNAT exportación de servicios https://emprender.sunat.gob.pe/principales-impuestos/impuesto-general-las-ventas-igv/exportacion-servicios

## Nombres usados fuera del contrato

- Interfaces y tipos PHP: `Connector`, `ProvidesMetrics`, `ServerConnector` (nombrado en el docs/00, sección 6), `ManualConnector`, `CapabilitySet`, enum `Capability` y sus valores (`hosting.accounts.list`, etc.), `ConnectionResult`, DTO nombrados en las firmas (`ResellerUsage`, `CreateAccount`, `ProvisionResult` del kit; `TemporarySessionUrl`, `TransferAccount`, `DomainData`, `DomainContacts`, `SensitiveString`, `CloudResourceData`, `CostLine`, `BudgetStatus`, `DnsRecord`, `ServerData`, `PaymentOrder`, `PaymentOrderResult`, `PaymentCaptureResult`, `RefundResult`, `SettlementLine`, `TransactionData`, `InboundWebhook`, `NormalizedEvent`, `EInvoiceDocument`, `EInvoiceResult`, `MailDomainData`, `MailUserData`, `SeatLicenseData`, `SaasInstanceInfo`, `PluginData`, `OutboundMessage`, `DeliveryResult`, `MailingListData`, `SyncResult`, `LeadData`, `SignatureRequest`, `SignatureEnvelope`, `StoredFile`, `MonitorData`, `MonitorDefinition`, `StoredObject`, `StorageOptions`, `MetricReading`, `Money`, `Period`).
- Clasificación de errores: `transient`, `credentials`, `validation`, `unknown`.
- Rutas de webhooks: `/api/v1/webhooks/paypal`, `/card-gateway`, `/meta-leads`, `/elastic-email`, `/einvoice`, `/signature`, `/monitoring` (siguen el patrón del contrato).
- Jobs `SyncCardGatewaySettlements` y `ExpireCardCheckouts`; esquema de seguridad `cardGatewaySignature`.
- Alcance de docs/00 §25: interfaces `AiAssistantConnector`, `BackupToolConnector`, `CaptchaVerifier` y sus DTO (`AssistantRequest`, `AssistantReply`, `BackupPointData`, `RestoreTarget`, `RestoreJob`); job `SyncBackupTools`.
- Alcance de docs/00 §26: interfaz `WordpressPluginNotifier` y sus DTO (`WpSiteTarget`, `CacheInvalidation`, `InvalidationResult`); job `SendWpCacheInvalidations`; ruta REST del plugin `/wp-json/hub-connector/v1/invalidate`. Se retiraron `WordpressConnector`, `SearchConsoleConnector`, `PageSpeedConnector`, la ruta `/api/v1/webhooks/wordpress` y los jobs `RenewSiteCertificates`, `SyncWordpressSources`, `SyncSearchConsoleStats` y `MeasurePagePerformance`.
- Uso de `providers.provider_account.approve` (acción estándar) para habilitar escritura por cuenta.
- Alcance de docs/00 §27: métodos `RegistrarConnector::checkAvailability`, `whois` y `suggest` y sus DTO (`AvailabilityResult`, `WhoisData`, `DomainSuggestion`); job `PurgeWhoisLookups`; cabecera `X-Hub-Visitor-Ip`; ruta REST del plugin `/wp-json/hub-connector/v1/whois`.
