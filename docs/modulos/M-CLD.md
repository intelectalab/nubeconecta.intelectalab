# M-CLD · Cloud (cuentas cloud, proyectos, recursos y presupuestos)

> Módulo de código `app/Modules/Cloud` · clave de permiso `cloud` · código `CLD`.
> Fuente: `docs/00-requerimientos.md` secciones 6, 10, 20 y 21 (autorización y etiquetado); contrato común de nombres.

## 1. Propósito y bloque

Trata AWS, Azure y Google Cloud con un mismo modelo (cuenta del proveedor, proyecto cloud, recursos y costos) para registrar las arquitecturas de cada cliente, su modalidad y titular, y vigilar presupuestos. Arranca en solo lectura: las acciones se hacen en el proveedor y el sistema las refleja al sincronizar.

- **Bloque:** C. Inventario y mapa (conectores AWS, Azure y Google Cloud en bloque H).
- **Depende de:** PRV, INV (`resources` como base), SRV (modalidades), CUS, VLT, CFG.
- **Dependen de él:** SAA (plataformas sobre proyectos cloud), MAP, FIN (costos y reparto), BIL (refacturación), MON.

## 2. Alcance

**Incluye**
- Cuentas cloud con proveedor, titular (empresa o cliente), modalidad (dedicada en cuenta de la empresa, administrada en cuenta del cliente, SaaS compartido, cuenta nueva con entrega al final del periodo), periodo, autorización del cliente con documento adjunto obligatorio cuando la cuenta es del cliente.
- Tarea de etiquetado por cuenta al registrarla, antes de la primera sincronización.
- Proyectos cloud por ambiente (desarrollo, pruebas, producción) y región, con opción de ocultar ambientes al cliente.
- Árbol de recursos (VPC, instancias, bases de datos, almacenamiento, balanceadores, DNS, red) con tipo normalizado y tipo original del proveedor, costo mensual y recursos compartidos entre clientes.
- Diagrama de arquitectura generado desde los recursos y sus dependencias.
- Asignación por etiquetas de cliente, proyecto y ambiente; recursos sin etiquetas como "sin cliente asignado".
- Presupuestos por proyecto con alertas al 80 % y 100 %.
- Conectores de solo lectura: AWS (rol IAM asumido; incluye Route 53 en lectura), Azure (entidad de servicio con rol Lector, ARM y Cost Management) y Google Cloud (cuenta de servicio con rol Visor, Cloud Asset Inventory y exportación de facturación).

**No incluye**
- Crear o borrar recursos cloud (decisión: solo lectura por defecto).
- Plataformas SaaS e instancias por cliente (SAA), aunque corren sobre proyectos cloud.
- Reparto de costos (FIN) y refacturación con porcentaje (BIL).
- Flujo de entrega de cuenta (CTR, `account_handovers`).

## 3. Entidades

| Tabla | Campos clave | Notas |
|---|---|---|
| `cloud_accounts` | provider_account_id, platform (`aws`/`azure`/`gcp`/`digitalocean`/`other`), external_account_id, owner, modality, customer_id, period_start, period_end, authorization_file_id, access_revoked_at, access_reference | `owner`: `company`/`customer`; `modality`: 4 valores del contrato |
| `cloud_projects` | cloud_account_id, customer_id, name, external_id (cuenta, grupo de recursos o proyecto), environment (`production`/`staging`/`testing`/`development`), region, visible_to_customer, is_shared | |
| `cloud_resources` | resource_id, cloud_project_id, parent_id, kind (normalizado: `server`/`database`/`storage`/`dns`/`network`/`load_balancer`/`other`), resource_type, region, tags (jsonb), monthly_cost_minor, cost_currency, is_shared, assignment_status | Árbol por `parent_id` |
| `cloud_budgets` | cloud_project_id, period_month (mes), amount_minor, cost_currency, last_alerted_pct | |

## 4. Casos de uso y flujos

1. **Registrar cuenta cloud de la empresa:** proveedor, cuenta de proveedor, modalidad, cliente si es dedicada; se crea la tarea de etiquetado.
2. **Registrar cuenta del cliente:** no se guarda sin el documento de autorización expresa adjunto; el documento queda también en la ficha del cliente; el rol de lectura lo puede revocar el cliente en cualquier momento (se registra `authorization_revoked_at`).
3. **Sincronizar:** `SyncCloudResources` diario asume el rol de solo lectura, descubre recursos por región, normaliza el tipo, conserva el tipo original, lee costos y asigna cliente/proyecto/ambiente por etiquetas; recursos sin etiquetas → "sin cliente asignado"; la corrida avisa si hay recursos sin etiquetas.
4. **Asignación manual:** soporte asigna un recurso sin etiquetas a cliente y proyecto, y crea tarea para etiquetarlo en el proveedor.
5. **Presupuesto:** finanzas define presupuesto mensual por proyecto; al cruzar 80 % y 100 % se alerta.
6. **Diagrama:** se genera desde el árbol y las dependencias de recursos; marca los recursos compartidos entre clientes.
7. **Cuenta nueva con entrega:** registrar periodo de inicio y fin; antes del fin se dispara el flujo de entrega en CTR.

## 5. Reglas de negocio clave

El sistema no crea ni borra recursos cloud. Cada recurso cloud lleva etiquetas de cliente, proyecto y ambiente; sin ellas aparece como "sin cliente asignado". No se registra una cuenta cloud del cliente sin el documento de autorización adjunto. La revocación del acceso por parte del cliente detiene la sincronización de esa cuenta y genera aviso. Los ambientes de desarrollo y pruebas se pueden ocultar al cliente. Los tipos de recurso se normalizan para mostrar cualquier nube igual, sin perder el tipo original. Los costos se guardan con su moneda original; los reportes convierten con el tipo de cambio de la fecha. Cada alerta de presupuesto se envía una vez por umbral y periodo.

## 6. Estados

- `cloud_accounts.owner`: `company`, `customer`.
- `cloud_accounts.modality`: `dedicated_company_account`, `managed_customer_account`, `shared_saas`, `managed_new_account_handover`.
- `account_handovers.status` (en CTR) para las cuentas con entrega.
- `cloud_resources.assignment_status`: ver anexo.

## 7. Permisos

| Código | Rol por defecto |
|---|---|
| `cloud.cloud_account.view` | admin, support, finance |
| `cloud.cloud_account.create` / `update` / `delete` | admin, support |
| `cloud.cloud_project.view` / `create` / `update` | admin, support |
| `cloud.cloud_resource.view` / `update` / `export` | admin, support; finance (costos) |
| `cloud.cloud_budget.view` / `create` / `update` | admin, finance |

## 8. Pantallas

### P-CLD-01 · Cuentas cloud
- **Propósito:** listar las cuentas de AWS, Azure, Google Cloud y otras con su modalidad y titular.
- **Rol principal:** support
- **Columnas:** nube, cuenta externa, proveedor y cuenta, titular, modalidad, cliente, periodo (inicio/fin), autorización, etiquetado (tarea), última sincronización, costo del mes.
- **Filtros:** nube, titular, modalidad, cliente, sin autorización vigente, periodo por terminar.
- **Acciones:** Registrar cuenta → `cloud.cloud_account.create`; Sincronizar ahora → `automation.sync_run.create`; Exportar → `cloud.cloud_resource.export`.
- **Vacío / error:** vacío con botón registrar; error de sincronización visible con clasificación (credenciales, transitorio).

### P-CLD-02 · Detalle de cuenta cloud
- **Propósito:** ver modalidad, titular, autorización, etiquetado, proyectos y sincronizaciones de una cuenta.
- **Rol principal:** support
- **Campos:** datos de la cuenta, documento de autorización, revocación, rol de lectura (referencia VLT), tarea de etiquetado, proyectos, recursos sin etiquetas, historial de `sync_runs`, flujo de entrega (si aplica).
- **Filtros:** por pestaña.
- **Acciones:** Editar → `cloud.cloud_account.update`; Adjuntar autorización → `cloud.cloud_account.update`; Registrar revocación → `cloud.cloud_account.update`; Crear proyecto → `cloud.cloud_project.create`; Iniciar entrega → `contracts.account_handover.create`.
- **Vacío / error:** guardar cuenta del cliente sin documento → 422; aviso visible si la autorización fue revocada.

### P-CLD-03 · Proyectos cloud
- **Propósito:** listar arquitecturas por cliente, ambiente y región.
- **Rol principal:** support
- **Columnas:** proyecto, cuenta, cliente, ambiente, región, recursos, costo del mes, presupuesto y % consumido, compartido, visible al cliente.
- **Filtros:** cliente, nube, ambiente, sobre 80 % del presupuesto, compartidos.
- **Acciones:** Crear proyecto → `cloud.cloud_project.create`; Exportar → `cloud.cloud_resource.export`.
- **Vacío / error:** vacío con botón crear; error de carga con reintento.

### P-CLD-04 · Detalle de proyecto cloud
- **Propósito:** ver el árbol de recursos, el diagrama, los costos y el presupuesto.
- **Rol principal:** support
- **Campos:** árbol de recursos (tipo normalizado y original, región, etiquetas, costo, compartido), diagrama de arquitectura, costos por mes, presupuesto, instancias SaaS que corren encima, incidentes.
- **Filtros:** tipo de recurso, región, compartidos.
- **Acciones:** Editar proyecto → `cloud.cloud_project.update`; Ocultar ambiente al cliente → `cloud.cloud_project.update`; Definir presupuesto → `cloud.cloud_budget.create`; Exportar → `cloud.cloud_resource.export`.
- **Vacío / error:** proyecto sin recursos: "Sincronice la cuenta o registre recursos"; diagrama vacío si no hay dependencias.

### P-CLD-05 · Recursos sin cliente asignado
- **Propósito:** resolver recursos descubiertos sin etiquetas o sin asignación.
- **Rol principal:** support
- **Columnas:** recurso, tipo normalizado y original, nube y cuenta, región, etiquetas presentes, costo del mes, detectado el.
- **Filtros:** nube, cuenta, región, tipo.
- **Acciones:** Asignar a cliente y proyecto → `cloud.cloud_resource.update`; Crear tarea de etiquetado → `work.task.create`; Exportar → `cloud.cloud_resource.export`.
- **Vacío / error:** "Todos los recursos están asignados"; error de carga con reintento.

### P-CLD-06 · Presupuestos cloud
- **Propósito:** controlar presupuestos mensuales por proyecto y sus alertas.
- **Rol principal:** finance
- **Columnas:** proyecto, cliente, periodo, presupuesto, gasto a la fecha, %, último umbral alertado.
- **Filtros:** periodo, cliente, sobre umbral.
- **Acciones:** Crear presupuesto → `cloud.cloud_budget.create`; Editar → `cloud.cloud_budget.update`.
- **Vacío / error:** "Sin presupuestos definidos"; 422 si el monto no es positivo.

## 9. Eventos y jobs

- **Emite:** `CloudBudgetThresholdReached`, `CloudResourceUnassignedDetected`, `CloudAuthorizationRevoked`, `CloudAccountPeriodEnding`, `ResourceNotFound`.
- **Escucha:** `AccountHandoverCompleted` (CTR) para cambiar titular y modalidad.
- **Jobs:** `SyncCloudResources` (diario); `CheckCloudBudgets` (diario); `NotifyCloudPeriodEnding` (diario).

## 10. Integraciones y conectores

- `CloudConnector` AWS (SDK oficial, rol IAM de solo lectura; Cost Explorer y presupuestos; Route 53 en lectura).
- `CloudConnector` Azure (Azure Resource Manager, Cost Management).
- `CloudConnector` Google Cloud (Cloud Asset Inventory, exportación de facturación).
- DigitalOcean como cloud (compartido con INV).
- Sin API: registro manual del proyecto y sus recursos.

## 11. Ajustes administrables

- `cloud.budget_thresholds` ([80, 100])
- `system.daily_jobs_time`

## 12. Historias del backlog

- Proyectos y recursos cloud
- Diagrama de arquitectura
- Conector AWS de solo lectura
- Presupuestos cloud y alertas de sobrecosto
- Conector Azure de solo lectura
- Conector Google Cloud de solo lectura
- Modelo cloud unificado
- Asignación por etiquetas
- Modalidad y titular de la cuenta cloud
- Documento de autorización para cuentas cloud del cliente
- Etiquetado previo a la sincronización cloud

## 13. Criterios de terminado y pruebas obligatorias

- Pruebas de contrato con respuestas grabadas de AWS, Azure y Google Cloud; los tres producen el mismo modelo normalizado.
- Registrar cuenta con `owner = customer` sin documento → 422.
- Al registrar una cuenta se crea la tarea de etiquetado; la primera sincronización avisa si hay recursos sin etiquetas.
- Recurso sin etiquetas → "sin cliente asignado"; recurso desaparecido → `not_found` y alerta, nunca borrado.
- Ningún conector cloud expone operaciones de escritura (prueba sobre `capabilities()`).
- Presupuesto: cruzar 80 % y luego 100 % genera dos alertas; repetir la sincronización no duplica.
- Proyecto de desarrollo oculto no aparece en la API del portal.

## 14. Preguntas abiertas

- Ninguna pendiente en docs/00, sección 14 para este módulo. Derivada: si DigitalOcean se modela como cuenta cloud (CLD) o como proveedor de servidores (INV) cuando un cliente usa ambos tipos de recursos; esta especificación lo deja en INV para droplets y en CLD solo si se registra como proyecto.

## Anexo: nombres fuera del contrato

- `cloud_resources.assignment_status`: `assigned`, `unassigned`.
- Columnas `cloud_accounts.authorization_file_id`, `authorization_revoked_at`, `tagging_task_id`, `period_start`, `period_end`; `cloud_projects.visible_to_customer`, `is_shared`.
