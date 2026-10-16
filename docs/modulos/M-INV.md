# M-INV · Inventory (recursos, nodos de hosting, servidores, migración y CMDB)

> Módulo de código `app/Modules/Inventory` · clave de permiso `inventory` · código `INV`.
> Fuente: `docs/00-requerimientos.md` secciones 4, 6, 10, 17 y 21 (acceso a cPanel, reinicio de servidor); contrato común de nombres.

## 1. Propósito y bloque

Inventaría todo activo técnico como `resource` (tabla base) y especializa nodos de hosting (reseller de BanaHosting o VPS propio con WHM), cuentas de hosting, servidores y su software. Gestiona la capacidad, la migración por lotes desde BanaHosting a nodos propios y el grafo de dependencias entre recursos (CMDB).

- **Bloque:** C. Inventario y mapa (los conectores WHM, Contabo y DigitalOcean son bloque H).
- **Depende de:** PRV, SRV, VLT, CFG, IDN.
- **Dependen de él:** MAP, CLD, SAA, ORD (aprovisionamiento), FIN (costos por recurso), MON, PRT (acceso a cPanel, reinicio).

## 2. Alcance

**Incluye**
- Tabla base `resources` con tipo, cuenta de proveedor, identificador externo, estado, especificaciones, costo y renovación; detección de recursos sin servicio (infraestructura sin cliente).
- Nodos de hosting unificados (reseller o VPS propio): capacidad de disco y cuentas, uso, porcentaje, clientes alojados; alertas de saturación por umbrales; recomendación del nodo con capacidad para un cliente nuevo.
- Cuentas de hosting enlazadas a servicios; las que no tienen servicio aparecen como "no registradas".
- Servidores VPS o dedicados (Contabo, DigitalOcean y otros): sistema operativo, IPs, CPU, RAM, disco, región, tenencia (dedicado o compartido), costo y renovación, servicios y clientes alojados.
- Inventario de software y licencias por servidor; historial de mantenimientos.
- Migración por lotes de BanaHosting a VPS propios con estado por cuenta, validación de capacidad, tablero de avance y actualización del mapa al cerrar.
- Registro de migraciones entre nodos (origen, destino, fecha, responsable, resultado).
- Tareas operativas de nodos propios (respaldo, actualización, licencias de cPanel por número de cuentas) mediante plantillas de WRK.
- CMDB: dependencias entre recursos y consulta de impacto aguas abajo (recursos, servicios, clientes).
- Conectores WHM/cPanel (sincronización; crear, suspender, reactivar; sesión temporal de cPanel), Contabo y DigitalOcean (inventario, snapshots, estado, facturación) y Plesk.
- Reinicio de servidor por API con aprobación de soporte (solicitado desde el portal).

**No incluye**
- Recursos cloud de AWS, Azure y Google Cloud (CLD; usan `resources` como base).
- Gestión de cambios y problemas (WRK, tablas `change_requests` y `problems`).
- Monitoreo y backups (MON).
- Crear buzones u otras acciones de cPanel desde el panel (no se construye: el cliente entra a su cPanel).

## 3. Entidades

| Tabla | Campos clave | Notas |
|---|---|---|
| `resources` | type (`hosting_node`/`hosting_account`/`server`/`cloud_resource`/`domain`/`mail_service`/`ssl_certificate`/`cdn_zone`/`bulk_email_account`/`dns_zone`/`saas_instance`/`database`/`storage`/`license`/`other`), provider_account_id, external_id, name, status, specs (jsonb), cost_minor, cost_currency, renewal_date, sync_mode, last_synced_at, deleted_at | Base de todo activo técnico |
| `hosting_nodes` | resource_id, kind (`reseller`/`own_vps`), server_id (si es propio), hostname, ip, disk_quota_mb, disk_used_mb, accounts_limit, accounts_used, capacity_thresholds (override opcional), cpanel_license_tier, accepts_new_accounts | Reseller y VPS propio iguales |
| `hosting_accounts` | resource_id, hosting_node_id, username, primary_domain, disk_used_mb, disk_quota_mb, service_id (nulo = no registrada) | |
| `servers` | resource_id, os, public_ip, private_ip, cpu, ram_mb, disk_gb, region, tenancy (`dedicated`/`shared`) | |
| `server_software` | server_id, name, installed_version, license_expires_at, end_of_life | Clave de licencia en VLT |
| `maintenances` | resource_id, performed_at, kind, notes, performed_by, task_id | Historial |
| `migration_batches` | name, source_node_id, target_node_id, status, planned_at, owner_id | |
| `migration_items` | migration_batch_id, hosting_account_id, position, size_mb, risk (`low`/`medium`/`high`), status, backup_reference, status_changed_at, notes | Estado por cuenta |
| `resource_dependencies` | from_resource_id, to_resource_id, kind | Grafo de la CMDB |

## 4. Casos de uso y flujos

1. **Sincronizar nodo (WHM):** `SyncResellerAccounts` cada 6 horas: lista cuentas, dominios y uso de disco; crea o actualiza `hosting_accounts`; lo desaparecido se marca `not_found` y genera alerta; nada se borra; escribe `sync_runs`.
2. **Detectar cuentas no registradas:** cuentas sin `service_id` aparecen en la pantalla de cuentas y en `DetectOrphans`.
3. **Umbrales:** `CheckCapacityThresholds` cada hora compara el uso con 70/85/95 % (o el override del nodo); cada umbral alcanzado crea alerta (MON) y puede crear tarea.
4. **Recomendar nodo:** ordena nodos por capacidad disponible y cantidad de cuentas, excluye los que superan el umbral crítico o no aceptan cuentas nuevas.
5. **Crear cuenta de hosting (ORD):** consulta `capabilities()`; si `createAccount` existe, verifica antes si la cuenta ya existe y la crea con clave de idempotencia; si no, tarea manual con lista de verificación.
6. **Suspender/reactivar cuenta:** desde SRV o el panel con permiso y confirmación; por API si la cuenta lo permite.
7. **Acceso directo a cPanel:** en el portal, con el interruptor activo, el cliente pulsa el botón (`portal.cpanel_session.create`) y el sistema pide a WHM una sesión temporal (`create_user_session`) y redirige; en el panel, soporte usa el mismo mecanismo con `inventory.hosting_account.login`. No se muestra la contraseña; queda registrado.
8. **Reinicio de servidor:** el cliente lo solicita (ticket tipo reinicio enlazado al servidor); soporte aprueba con `inventory.server.execute` y MFA reciente; el sistema ejecuta por API y notifica el resultado.
9. **Migración por lotes:** elegir nodo destino (valida capacidad) → armar lote ordenado por tamaño y riesgo → por cuenta: respaldo, copia, prueba de sitio y correo, cambio de DNS, verificación y baja en origen → al cerrar, actualiza el mapa del cliente; revertir es posible hasta `closed`.
10. **Tablero de migración:** cuentas migradas, pendientes y espacio liberado por reseller y por nodo destino.
11. **Servidores:** importación desde Contabo/DigitalOcean (solo lectura por defecto) o alta manual; software, licencias y mantenimientos.
12. **CMDB:** registrar dependencias entre recursos y consultar impacto aguas abajo hasta servicios y clientes.

## 5. Reglas de negocio clave

Un recurso sin fila en `service_resources` es infraestructura sin cliente y alimenta la detección de inconsistencias. La sincronización nunca borra: marca `not_found` y alerta. Un reintento de creación de cuenta de hosting no crea dos cuentas: antes de reintentar se consulta al proveedor si ya existe. Las acciones de escritura del conector están apagadas por defecto y se habilitan por cuenta. Ejecutar en un servidor (reinicio u otra acción) exige `inventory.server.execute`, MFA reciente y queda en auditoría. Un lote no puede iniciar si el nodo destino no tiene capacidad para el total del lote más el umbral crítico. Las transiciones de `migration_items` siguen el orden del flujo; `reverted` es posible desde cualquier estado anterior a `closed`. El mapa del cliente se actualiza solo al cerrar la cuenta migrada. En un VPS propio, respaldos, actualizaciones y reputación de IP son responsabilidad propia y se registran como tareas recurrentes y monitores. El costo de un nodo propio se reparte entre sus clientes en FIN.

## 6. Estados

- `migration_items.status`: `pending`, `copied`, `testing`, `dns_changed`, `verified`, `closed`, `reverted`.
- `resources.status` y `migration_batches.status`: ver anexo (valores agregados).

## 7. Permisos

| Código | Rol por defecto |
|---|---|
| `inventory.resource.view` / `export` | admin, support; finance (lectura de costos) |
| `inventory.resource.create` / `update` / `delete` | admin, support |
| `inventory.hosting_node.view` / `create` / `update` | admin, support |
| `inventory.hosting_account.view` / `update` | admin, support |
| `inventory.hosting_account.create` (crear en el proveedor) | admin, support |
| `inventory.hosting_account.login` (entrar al cPanel de la cuenta desde el panel, sesión temporal de WHM) | admin, support |
| `inventory.server.view` / `create` / `update` | admin, support; temp_technician (lo asignado) |
| `inventory.server.execute` | admin, support |
| `inventory.maintenance.create` | admin, support, temp_technician |
| `inventory.migration_batch.view` / `create` / `update` | admin, support |
| `inventory.resource_dependency.create` / `delete` | admin, support |

Suspender una cuenta de hosting usa `services.service.suspend` (acción sobre el servicio).

Acceso a cPanel: soporte entra desde el panel con `inventory.hosting_account.login` (`POST /admin/hosting-accounts/{id}/cpanel-session`, sin interruptor); el cliente entra desde el portal con `portal.cpanel_session.create` (`POST /portal/services/{id}/cpanel-session`, sujeto al interruptor `cpanel_login`). Ambos piden a WHM una sesión temporal, no muestran contraseña y quedan en auditoría. Ver `docs/05-permisos-y-roles.md`.

## 8. Pantallas

### P-INV-01 · Nodos de hosting
- **Propósito:** ver capacidad y uso de cada reseller y VPS propio.
- **Rol principal:** support
- **Columnas:** nodo, tipo (reseller/propio), proveedor y cuenta, disco usado/contratado y %, cuentas usadas/límite, clientes, umbral alcanzado, acepta cuentas nuevas, costo, última sincronización.
- **Filtros:** tipo, proveedor, sobre umbral, acepta cuentas nuevas.
- **Acciones:** Registrar nodo → `inventory.hosting_node.create`; Recomendar nodo para cliente nuevo → `inventory.hosting_node.view`; Sincronizar ahora → `automation.sync_run.create`; Exportar → `inventory.resource.export`.
- **Vacío / error:** vacío con botón registrar; error de sincronización visible por nodo con enlace al `sync_run`.

### P-INV-02 · Detalle de nodo de hosting
- **Propósito:** ver cuentas, clientes, consumo y tareas operativas de un nodo.
- **Rol principal:** support
- **Campos:** datos del nodo, capacidad con gráfico de uso, umbrales (override), licencia de cPanel por número de cuentas, cuentas alojadas, clientes, tareas recurrentes, mantenimientos, migraciones donde participa.
- **Filtros:** cuentas registradas/no registradas.
- **Acciones:** Editar → `inventory.hosting_node.update`; Ajustar umbrales del nodo → `inventory.hosting_node.update`; Crear tareas desde plantilla → `work.task.create`; Iniciar lote de migración desde este nodo → `inventory.migration_batch.create`.
- **Vacío / error:** nodo sin cuentas; advertencia cuando el número de cuentas pasa al siguiente tramo de licencia de cPanel.

### P-INV-03 · Cuentas de hosting
- **Propósito:** saber en qué nodo está cada cliente y detectar cuentas no registradas.
- **Rol principal:** support
- **Columnas:** usuario, dominio principal, nodo, cliente, servicio, disco usado/cuota, suspendida, estado (`not_found` resaltado), última sincronización.
- **Filtros:** nodo, no registradas, suspendidas, no encontradas, cliente.
- **Acciones:** Enlazar a servicio → `inventory.hosting_account.update`; Entrar a cPanel → `inventory.hosting_account.login`; Crear cuenta en el proveedor → `inventory.hosting_account.create`; Suspender o reactivar → `services.service.suspend`; Exportar → `inventory.resource.export`.
- **Vacío / error:** "Sin cuentas no registradas"; suspender pide confirmación escribiendo el usuario; sin capacidad en el conector, la acción crea tarea manual y lo indica.

### P-INV-04 · Servidores
- **Propósito:** centralizar servidores VPS y dedicados de todos los proveedores.
- **Rol principal:** support
- **Columnas:** nombre, proveedor y cuenta, tenencia, cliente (si es dedicado), SO, IP pública, CPU/RAM/disco, región, costo, renovación, estado, sincronización.
- **Filtros:** proveedor, tenencia, cliente, región, estado, renovación en N días.
- **Acciones:** Registrar servidor → `inventory.server.create`; Sincronizar proveedor → `automation.sync_run.create`; Exportar → `inventory.resource.export`.
- **Vacío / error:** vacío con botón registrar e importar; error de carga con reintento.

### P-INV-05 · Ficha de servidor
- **Propósito:** ver datos técnicos, software, mantenimientos, servicios alojados y ejecutar acciones permitidas.
- **Rol principal:** support
- **Campos:** datos técnicos, servicios y clientes alojados, software y licencias, mantenimientos, snapshots (si el conector los da), dependencias (CMDB), accesos disponibles (VLT), monitores, backups, solicitudes de reinicio pendientes.
- **Filtros:** por pestaña.
- **Acciones:** Editar → `inventory.server.update`; Registrar mantenimiento → `inventory.maintenance.create`; Agregar software → `inventory.server.update`; Aprobar y ejecutar reinicio → `inventory.server.execute`; Revelar acceso → `vault.secret.reveal`.
- **Vacío / error:** ejecutar pide MFA reciente y escribir el nombre del servidor; sin capacidad de reinicio en el conector, la acción no aparece y se indica "Reinicio manual".

### P-INV-06 · Lotes de migración
- **Propósito:** planificar y seguir la migración de BanaHosting a nodos propios.
- **Rol principal:** support
- **Columnas:** lote, origen, destino, cuentas, avance por estado, espacio total, responsable, estado.
- **Filtros:** estado, origen, destino.
- **Acciones:** Crear lote → `inventory.migration_batch.create`; Abrir lote → `inventory.migration_batch.view`.
- **Vacío / error:** vacío con botón crear; 422 si el destino no tiene capacidad para el lote.

### P-INV-07 · Detalle de lote de migración
- **Propósito:** avanzar cada cuenta por los pasos de la migración.
- **Rol principal:** support
- **Columnas:** orden, cuenta, cliente, tamaño, riesgo, estado, respaldo, copiada, prueba, DNS cambiado, verificada, cerrada, notas.
- **Filtros:** estado, riesgo.
- **Acciones:** Reordenar → `inventory.migration_batch.update`; Avanzar estado de cuenta → `inventory.migration_batch.update`; Revertir cuenta → `inventory.migration_batch.update`; Crear tarea del paso → `work.task.create`.
- **Vacío / error:** botón de avance solo para el siguiente estado válido; revertir pide confirmación; error 409 si otra persona avanzó la misma cuenta.

### P-INV-08 · Tablero de avance de migración
- **Propósito:** decidir cuándo dar de baja un reseller.
- **Rol principal:** admin
- **Columnas:** por reseller origen y nodo destino: cuentas migradas, pendientes, revertidas, espacio liberado, costo mensual del reseller.
- **Filtros:** reseller, nodo destino, periodo.
- **Acciones:** Exportar → `inventory.resource.export`; Abrir lote → `inventory.migration_batch.view`.
- **Vacío / error:** "Sin migraciones registradas"; error de carga con reintento.

### P-INV-09 · CMDB: dependencias e impacto
- **Propósito:** relacionar recursos y consultar el impacto aguas abajo de un cambio o caída.
- **Rol principal:** support
- **Campos:** recurso origen, grafo de dependencias, lista de impacto (recursos, servicios, clientes) con profundidad.
- **Filtros:** tipo de recurso, profundidad, solo compartidos entre clientes.
- **Acciones:** Agregar dependencia → `inventory.resource_dependency.create`; Quitar dependencia → `inventory.resource_dependency.delete`; Exportar impacto → `inventory.resource.export`; Crear solicitud de cambio → `work.change_request.create`.
- **Vacío / error:** "Este recurso no tiene dependencias registradas"; 422 si se crea un ciclo.

### P-INV-10 · Recursos
- **Propósito:** inventario general de activos técnicos, incluidos los sin cliente y los no encontrados.
- **Rol principal:** support
- **Columnas:** nombre, tipo, proveedor y cuenta, identificador externo, servicio(s), cliente, estado, costo, renovación, último visto.
- **Filtros:** tipo, proveedor, sin servicio, `not_found`, renovación en N días.
- **Acciones:** Registrar recurso manual → `inventory.resource.create`; Enlazar a servicio → `services.service.update`; Dar de baja → `inventory.resource.delete`; Exportar → `inventory.resource.export`.
- **Vacío / error:** "Sin recursos sin cliente"; baja pide confirmación y valida que no tenga servicios activos (409).

## 9. Eventos y jobs

- **Emite:** `CapacityThresholdReached`, `HostingAccountUnregisteredDetected`, `ResourceNotFound`, `HostingAccountCreated`, `HostingAccountSuspended`, `ServerRestartExecuted`, `MigrationItemClosed`, `MigrationItemReverted`.
- **Escucha:** `ServiceSuspended` / `ServiceReactivated` (SRV) → suspender/reactivar en el proveedor; `OrderProvisioningRequested` (ORD) → crear cuenta; `TicketApproved` de tipo reinicio (HLP) → ejecutar.
- **Jobs:** `SyncResellerAccounts` (cada 6 horas); `SyncServers` (diario); `CheckCapacityThresholds` (cada hora); `DetectOrphans` (diario; aporta cuentas no registradas y recursos sin cliente).

## 10. Integraciones y conectores

- `HostingConnector` WHM/cPanel para cuentas reseller de BanaHosting (alcance según privilegios del reseller) y WHM en VPS propios (acceso root, todas las operaciones).
- Plesk (API REST/XML).
- `ServerConnector` Contabo (OAuth2, inventario, snapshots, estado) y DigitalOcean (token, inventario, snapshots, facturación).
- Sin API: tarea manual con lista de verificación o alta manual de la ficha.

## 11. Ajustes administrables

- `inventory.capacity_thresholds` ([70, 85, 95]; override por nodo en `hosting_nodes.capacity_thresholds`)
- `portal.actions.cpanel_login.enabled`, `portal.actions.server_reboot.enabled`
- `security.sensitive_action_mfa_max_age_minutes`

## 12. Historias del backlog

- Cuentas reseller con capacidad
- Cuentas de hosting asociadas a clientes
- Alertas de saturación por umbrales
- Recomendación de reseller con capacidad
- Registro de migraciones entre reseller
- Ficha de servidor VPS o dedicado
- Mantenimientos e inventario de software
- Grafo de dependencias
- Nodo de hosting unificado
- Migración por lotes de BanaHosting a VPS propios
- Tablero de avance de migración
- Tareas operativas de nodos propios
- Conector WHM/cPanel: sincronización
- Conector WHM/cPanel: crear, suspender y reactivar
- Conector Contabo
- Conector DigitalOcean
- Gestión de cambios con aprobación
- Baja definitiva y eliminación segura

## 13. Criterios de terminado y pruebas obligatorias

- Pruebas de contrato con respuestas grabadas de WHM, Contabo y DigitalOcean; ninguna prueba llama a producción.
- Sincronización: una cuenta que desaparece en WHM queda `not_found` y genera alerta; no se borra.
- Un reintento de creación de cuenta de hosting no crea dos cuentas (prueba obligatoria del kit).
- Umbrales: un nodo que pasa de 69 % a 86 % genera alertas de 70 y 85 una sola vez cada una.
- Recomendación excluye nodos sobre el umbral crítico.
- Lote con destino sin capacidad → 422; cerrar una cuenta actualiza el componente del mapa; revertir una cuenta cerrada → 409.
- Ejecutar reinicio sin MFA reciente → 403 `mfa_required`; con MFA, queda en auditoría y se notifica el resultado al cliente.
- Acceso a cPanel desde el portal no expone contraseña y queda registrado; con el interruptor apagado → 403.

## 14. Preguntas abiertas

- Privilegios de WHM que entrega BanaHosting a las cuentas reseller (docs/00, sección 14): define qué operaciones del conector quedan automáticas y cuáles manuales; necesario antes del conector WHM.
- La historia "Alertas de saturación por umbrales" pide umbrales por cuenta, pero los niveles de ajustes del kit no incluyen recurso; esta especificación usa un override en `hosting_nodes` (derivada, confirmar).

## Anexo: nombres fuera del contrato

- `resources.status`: `active`, `suspended`, `stopped`, `terminated`, `not_found`.
- `migration_batches.status`: `planned`, `in_progress`, `completed`, `cancelled`.
- Columna `hosting_nodes.capacity_thresholds` (override por nodo).
