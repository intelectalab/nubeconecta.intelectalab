# M-MON · Monitoring (monitores, incidentes, mantenimientos, backups y alertas)

> Módulo de código `app/Modules/Monitoring` · clave de permiso `monitoring` · código `MON`.
> Fuente: `docs/00-requerimientos.md` secciones 4, 10 (cola `monitoring`), 15 (impacto), 17 (respaldos de nodos propios), 20 (incidentes en recursos compartidos), 22 (monitoreo propio descartado) y 25 (respaldos y restauración ampliados); contrato común de nombres.

## 1. Propósito y bloque

Registra chequeos de disponibilidad, DNS y SSL sobre objetivos autorizados (integrando una herramienta de monitoreo existente), incidentes con los servicios y clientes afectados derivados de las dependencias, mantenimientos programados visibles al cliente, políticas y ejecuciones de backup con pruebas de restauración, solicitudes de restauración del cliente con aprobación, ticket y evidencia, la integración con la herramienta de respaldos de los nodos cPanel, el informe de respaldos para el cliente, las pruebas del plan de recuperación del propio sistema y la bandeja de alertas técnicas de todo el sistema.

- **Bloque:** F. Soporte.
- **Depende de:** INV, MAP (impacto), SAA, CLD, SRV, HLP, AUT (avisos), BRD (portal de estado por marca), CFG.
- **Dependen de él:** SRV (respaldo previo a terminación), PRT (mantenimientos, incidentes, informe de respaldos y solicitudes de restauración), DSH (backups fallidos, incidentes, prueba de recuperación vencida).

## 2. Alcance

**Incluye**
- Monitores de disponibilidad (HTTP), DNS y SSL solo sobre objetivos autorizados y registrados; historial de disponibilidad.
- Integración con una herramienta de monitoreo existente (sin construir un monitoreo propio completo); chequeos simples propios en la cola `monitoring` cuando no haya herramienta.
- Incidentes con estado, severidad, componentes y recursos afectados; derivación automática de servicios, instancias SaaS y clientes afectados desde las dependencias; notificación a los clientes afectados.
- Incidentes de seguridad con acceso restringido.
- Mantenimientos programados visibles en el portal y en el portal de estado.
- Portal de estado público por marca, sin datos internos.
- Políticas de backup por recurso (frecuencia, retención, ubicación, cifrado, RPO, RTO), ejecuciones con resultado y alertas por backup fallido o atrasado.
- Pruebas de restauración con fecha, resultado, responsable y evidencia.
- Bandeja de alertas técnicas (capacidad, presupuesto, SSL, DNS, sincronización, licencias, límites SaaS, revelaciones) con reconocimiento y resolución.
- Solicitudes de restauración (docs/00 §25): el cliente pide desde el portal restaurar un sitio, una base de datos o un buzón a una fecha (o soporte la registra por él); soporte aprueba, se ejecuta por API de la herramienta o como tarea asistida y se cierra con evidencia en el ticket.
- Integración con la herramienta de respaldos de los servidores cPanel (por ejemplo JetBackup, por confirmar): lectura de respaldos reales como `backup_runs` y restauración por API si la herramienta lo permite; si no, tarea asistida.
- Informe de respaldos para el cliente: último respaldo exitoso, puntos de restauración y restauraciones realizadas por servicio, visible en el portal.
- Pruebas del plan de recuperación del propio sistema: registro de cada simulacro de levantar el sistema en otro servidor desde AWS S3, con pérdida de datos y tiempo de recuperación medidos contra los objetivos administrables, y aviso cuando la prueba periódica vence.

**No incluye**
- Ejecución del respaldo del propio sistema en AWS S3 y el procedimiento escrito de recuperación (cimientos, plataforma; `docs/10`, sección 5); MON registra las pruebas de ese plan (`dr_tests`), no los respaldos del sistema.
- Chequeo de registros de correo (lo ejecuta MAI; MON muestra sus alertas).
- Gestión de problemas (WRK).

## 3. Entidades

| Tabla | Campos clave | Notas |
|---|---|---|
| `monitors` | type (`http`/`keyword`/`ping`/`port`/`dns`/`ssl`/`heartbeat`/`mail_reputation`/`external`), target, resource_id, project_component_id, interval_seconds, external_reference, authorized_by, is_active, status, last_checked_at | Solo objetivos registrados |
| `monitor_results` | monitor_id, status (`up`/`down`/`degraded`), response_ms, detail, checked_at | Historial |
| `incidents` | number, title, status, severity, started_at, resolved_at, public_summary, notes_internal, problem_id | |
| `incident_affected` | incident_id, affected_type (`resource`/`project_component`/`service`/`saas_instance`/`customer`), affected_id, auto_detected (bool), notified_at | Derivado de dependencias |
| `maintenance_windows` | title, description, starts_at, ends_at, status, resource_id, change_request_id, notify_customers | |
| `backup_policies` | resource_id, frequency, retention_days, destination, encrypted, rpo_minutes, rto_minutes, responsible_user_id, is_active | Por recurso |
| `backup_runs` | backup_policy_id, started_at, finished_at, status, size_bytes, location, error, backup_tool_account_id, external_id | Manual o leído de la herramienta del nodo |
| `restore_tests` | backup_policy_id, backup_run_id, tested_at, result (`passed`/`failed`), tested_by, notes | |
| `alerts` | type, severity, source_type, source_id, title, detail, status, dedupe_key, acknowledged_by, resolved_at, task_id | Única por dedupe_key abierta |
| `backup_tool_accounts` | hosting_node_id, tool (`jetbackup`/`cpanel_backup`/`other`), provider_account_id, api_enabled, capabilities, status (`active`/`inactive`), last_synced_at, notes | Una por nodo y herramienta |
| `restore_requests` | code, customer_id, service_id, hosting_account_id, target_kind (`website`/`database`/`mailbox`/`full_account`), target_name, restore_point_at, backup_run_id, requested_via (`portal`/`support`), requested_by, overwrite_confirmed, status, ticket_id, approved_by, approved_at, rejection_reason, execution_mode (`api`/`assisted`), backup_tool_account_id, external_job_id, task_id, started_at, completed_at, evidence_file_id, result_notes | Una abierta por objeto restaurado |
| `dr_tests` | tested_at, performed_by, procedure_version, target_environment, backup_object_key, backup_taken_at, restore_started_at, restore_completed_at, data_loss_minutes, recovery_minutes, rpo_target_minutes, rto_target_minutes, result (`passed`/`failed`/`partial`), checklist, evidence_file_id, task_id | Pruebas del plan de recuperación |

## 4. Casos de uso y flujos

1. **Registrar monitor** sobre un objetivo autorizado (dominio o recurso del inventario); se sincroniza con la herramienta externa o se ejecuta con el chequeo propio.
2. **Caída detectada:** resultado `down` → alerta → soporte abre incidente (o se abre automático si la regla de AUT lo indica).
3. **Incidente:** se eligen recursos o componentes afectados → se derivan servicios, instancias SaaS y clientes desde las dependencias (MAP, INV, SAA) → se notifica a los clientes afectados con texto público → `monitoring` → `resolved`.
4. **Mantenimiento:** programar ventana (opcionalmente desde un cambio aprobado) → aviso a clientes afectados → visible en portal y portal de estado.
5. **Portal de estado:** página pública por marca con componentes públicos, incidentes abiertos e historial, y mantenimientos.
6. **Backups:** definir política por recurso; registrar ejecuciones (por API de la herramienta o manual); `CheckBackups` alerta si falla o se atrasa respecto a la frecuencia.
7. **Restauración:** registrar prueba con evidencia; el tablero muestra la última prueba por política.
8. **Alertas:** cualquier módulo crea alertas mediante la interfaz de MON con `dedupe_key`; soporte las reconoce, crea tarea o resuelve.
9. **Herramienta de respaldos del nodo:** soporte registra la herramienta de cada nodo cPanel y, si tiene API, la credencial en la bóveda; `SyncBackupTools` lee los respaldos y puntos de restauración de cada cuenta y los registra en `backup_runs` (sin duplicar por id externo); sin API, los respaldos se registran a mano.
10. **Solicitud de restauración** (flujo K de `docs/03`): el cliente elige servicio, tipo (sitio, base de datos, buzón) y fecha entre los puntos disponibles, confirma que se sobrescribe lo actual → `requested` con ticket. Soporte aprueba (`approved`) o rechaza con motivo; al iniciar (`in_progress`) se restaura por API (`execution_mode = api`) o se crea una tarea asistida con el procedimiento (`assisted`); al terminar se adjunta la evidencia al ticket (`completed`) o se registra el fallo (`failed`).
11. **Informe para el cliente:** el portal muestra por servicio la responsabilidad del respaldo, frecuencia y retención, el último respaldo exitoso, los puntos de restauración y las restauraciones realizadas, sin nodo, herramienta, ubicación ni proveedor.
12. **Plan de recuperación del sistema:** el procedimiento escrito vive en el repositorio (versionado); soporte registra cada prueba con el respaldo de S3 usado, el servidor aislado y los tiempos; el sistema copia los objetivos vigentes (`system.backup.rpo_minutes`, `system.backup.rto_minutes`) y no deja aprobar una prueba que no los cumple. `CheckDrTestDue` crea una tarea cuando pasan `system.dr_test.frequency_days` sin prueba aprobada.

## 5. Reglas de negocio clave

Solo se monitorean objetivos autorizados y registrados en el inventario. Los afectados de un incidente se derivan de las dependencias y se pueden ajustar a mano. Los clientes afectados se notifican una vez por incidente y por cambio de estado relevante. El portal de estado y el portal del cliente muestran solo el resumen público, nunca notas internas, recursos ni proveedores. Los incidentes de seguridad tienen acceso restringido y no aparecen en el portal de estado. Una alerta con la misma `dedupe_key` abierta no se duplica. Un backup fallido o atrasado alerta. La terminación de un servicio exige un backup exitoso registrado (lo consulta SRV). Una restauración nunca se ejecuta sin aprobación de soporte, confirmación de sobrescritura del cliente y ticket; quien la registró por el cliente no la aprueba; se cierra con evidencia (RN-MON-001 a RN-MON-011). Toda restauración completada aparece el mismo día en el informe de respaldos del cliente y en su ticket (RN-MON-011). La lectura de la herramienta de respaldos no duplica respaldos. Una prueba de recuperación solo se aprueba dentro de los objetivos y con evidencia.

## 6. Estados

- `incidents.status`: `open`, `monitoring`, `resolved`.
- `alerts.status`, `maintenance_windows.status`, `backup_runs.status`: ver anexo.
- `restore_requests.status`: `requested`, `approved`, `rejected`, `in_progress`, `completed`, `failed`, `cancelled` (máquina 24 de `docs/03`).
- `dr_tests.result`: `passed`, `failed`, `partial` (no es máquina: cada prueba es un registro).

## 7. Permisos

| Código | Rol por defecto |
|---|---|
| `monitoring.monitor.view` / `create` / `update` / `delete` | admin, support |
| `monitoring.incident.view` | admin, support, sales (lectura); los incidentes con `is_security` solo los ve admin (política por registro); el cliente ve el resumen público con `portal.maintenance.view` |
| `monitoring.incident.create` / `update` | admin, support |
| `monitoring.maintenance_window.view` / `create` / `update` | admin, support |
| `monitoring.backup_policy.view` / `create` / `update` | admin, support |
| `monitoring.backup_run.create` | admin, support |
| `monitoring.restore_test.create` | admin, support |
| `monitoring.alert.view` / `update` | admin, support, finance (alertas financieras) |
| `monitoring.restore_request.view` / `create` / `update` | admin, support |
| `monitoring.restore_request.approve` | admin, support (no quien la registró por el cliente) |
| `monitoring.backup_tool_account.view` / `create` / `update` | admin, support |
| `monitoring.dr_test.view` / `create` | admin, support |
| `portal.backup_report.view`, `portal.restore_request.view` | customer_admin, customer_user |
| `portal.restore_request.create` / `update` | customer_admin; customer_user si su administrador se lo otorga |

## 8. Pantallas

### P-MON-01 · Monitores
- **Propósito:** ver el estado de todos los chequeos.
- **Rol principal:** support
- **Columnas:** objetivo, tipo, recurso o componente, cliente, estado actual, disponibilidad 30 días, último chequeo, origen (herramienta externa o propio).
- **Filtros:** tipo, estado, cliente, caídos.
- **Acciones:** Crear monitor → `monitoring.monitor.create`; Pausar → `monitoring.monitor.update`.
- **Vacío / error:** vacío con botón crear; 422 si el objetivo no está registrado en el inventario.

### P-MON-02 · Detalle de monitor
- **Propósito:** ver historial de disponibilidad y tiempos de respuesta.
- **Rol principal:** support
- **Campos:** configuración, gráfico de disponibilidad y respuesta, últimos resultados, incidentes relacionados.
- **Filtros:** rango de fechas.
- **Acciones:** Editar → `monitoring.monitor.update`; Abrir incidente → `monitoring.incident.create`; Eliminar → `monitoring.monitor.delete`.
- **Vacío / error:** "Aún sin resultados"; error de la herramienta externa visible.

### P-MON-03 · Incidentes
- **Propósito:** listar incidentes abiertos y su historial.
- **Rol principal:** support
- **Columnas:** número, título, estado, severidad, seguridad, inicio, duración, clientes afectados, notificados.
- **Filtros:** estado, severidad, marca, rango de fechas.
- **Acciones:** Abrir incidente → `monitoring.incident.create`.
- **Vacío / error:** "Sin incidentes abiertos"; incidentes de seguridad ocultos sin permiso.

### P-MON-04 · Detalle de incidente
- **Propósito:** gestionar un incidente, sus afectados y la comunicación.
- **Rol principal:** support
- **Campos:** estado, severidad, línea de tiempo, recursos y componentes afectados, servicios, instancias y clientes derivados, resumen público, notas internas, tickets enlazados, problema.
- **Filtros:** tipo de afectado.
- **Acciones:** Cambiar estado → `monitoring.incident.update`; Recalcular afectados → `monitoring.incident.update`; Notificar a clientes afectados → `monitoring.incident.update`; Vincular a problema → `work.problem.update`.
- **Vacío / error:** notificar sin resumen público → 422; aviso de cuántos clientes recibirán la notificación antes de confirmar.

### P-MON-05 · Mantenimientos programados
- **Propósito:** programar y comunicar mantenimientos.
- **Rol principal:** support
- **Columnas:** título, inicio, fin, estado, recursos, clientes afectados, aviso enviado, cambio relacionado.
- **Filtros:** estado, rango de fechas.
- **Acciones:** Programar → `monitoring.maintenance_window.create`; Editar → `monitoring.maintenance_window.update`; Cancelar → `monitoring.maintenance_window.update`.
- **Vacío / error:** "Sin mantenimientos programados"; 422 si termina antes de empezar.

### P-MON-06 · Backups
- **Propósito:** controlar políticas y ejecuciones de backup por recurso.
- **Rol principal:** support
- **Columnas:** recurso, cliente, frecuencia, retención, ubicación, cifrado, RPO, RTO, última ejecución y resultado, atrasado, última prueba de restauración.
- **Filtros:** fallidos, atrasados, sin prueba reciente, cliente.
- **Acciones:** Crear política → `monitoring.backup_policy.create`; Editar → `monitoring.backup_policy.update`; Registrar ejecución manual → `monitoring.backup_run.create`.
- **Vacío / error:** "Sin políticas registradas"; recursos de nodos propios sin política resaltados.

### P-MON-07 · Pruebas de restauración
- **Propósito:** registrar pruebas con evidencia.
- **Rol principal:** support
- **Columnas:** fecha, política/recurso, ejecución usada, resultado, responsable, evidencia.
- **Filtros:** resultado, periodo.
- **Acciones:** Registrar prueba → `monitoring.restore_test.create`.
- **Vacío / error:** "Sin pruebas registradas"; 422 sin evidencia adjunta.

### P-MON-08 · Alertas
- **Propósito:** bandeja única de alertas técnicas y operativas.
- **Rol principal:** support
- **Columnas:** fecha, módulo de origen, tipo, severidad, entidad, mensaje, estado, tarea.
- **Filtros:** estado, severidad, módulo, tipo.
- **Acciones:** Reconocer → `monitoring.alert.update`; Crear tarea → `work.task.create`; Resolver → `monitoring.alert.update`.
- **Vacío / error:** "Sin alertas abiertas"; error de carga con reintento.

### P-MON-09 · Portal de estado público
- **Propósito:** que clientes y público consulten el estado de los servicios de una marca.
- **Rol principal:** público
- **Campos:** estado general, componentes públicos por categoría, incidentes abiertos con resumen público, mantenimientos próximos, historial de 90 días.
- **Filtros:** no aplica.
- **Acciones:** Suscribirse a avisos por correo → público.
- **Vacío / error:** "Todos los sistemas operativos"; si la API no responde, página estática con último estado conocido.

### P-MON-10 · Solicitudes de restauración
- **Propósito:** atender las restauraciones pedidas por clientes o registradas por soporte.
- **Rol principal:** support
- **Columnas:** código, cliente, servicio, tipo y objeto, fecha a restaurar, estado, modo (API o asistida), ticket, días en el estado.
- **Filtros:** estado, cliente, tipo, modo.
- **Acciones:** Registrar solicitud por el cliente → `monitoring.restore_request.create`; Abrir detalle → `monitoring.restore_request.view`.
- **Vacío / error:** "Sin solicitudes pendientes"; error de carga con reintento.

### P-MON-11 · Detalle de solicitud de restauración
- **Propósito:** aprobar, ejecutar y cerrar una restauración con evidencia.
- **Rol principal:** support
- **Campos:** cliente, servicio, cuenta de hosting, objeto, fecha pedida, punto de restauración elegido, confirmación de sobrescritura, ticket, línea de estados con actor, modo de ejecución, tarea asistida, evidencia, resultado.
- **Filtros:** no aplica.
- **Acciones:** Aprobar → `monitoring.restore_request.approve`; Rechazar → `monitoring.restore_request.approve`; Iniciar restauración → `monitoring.restore_request.update`; Cerrar con evidencia → `monitoring.restore_request.update`; Marcar fallida → `monitoring.restore_request.update`.
- **Vacío / error:** "Aprobar" deshabilitado con motivo si la persona registró la solicitud; cerrar sin evidencia → 422; punto de restauración inexistente → 422.

### P-MON-12 · Herramientas de respaldos por nodo
- **Propósito:** saber qué nodo tiene qué herramienta y si se lee por API.
- **Rol principal:** support
- **Columnas:** nodo, herramienta, API habilitada, capacidades, última lectura y resultado, respaldos leídos, cuentas sin respaldo reciente.
- **Filtros:** herramienta, con o sin API, con error de lectura.
- **Acciones:** Registrar herramienta → `monitoring.backup_tool_account.create`; Editar → `monitoring.backup_tool_account.update`; Leer respaldos ahora → `monitoring.backup_tool_account.update`.
- **Vacío / error:** "Sin herramientas registradas"; error de credencial visible con alerta.

### P-MON-13 · Plan de recuperación del sistema
- **Propósito:** demostrar que el sistema se puede levantar desde S3 dentro de los objetivos.
- **Rol principal:** admin
- **Columnas:** fecha, responsable, versión del procedimiento, respaldo usado, pérdida medida frente al RPO, tiempo medido frente al RTO, resultado, evidencia; próxima prueba.
- **Filtros:** resultado, periodo.
- **Acciones:** Registrar prueba → `monitoring.dr_test.create`; Abrir ajustes de objetivos → `settings.setting.update`.
- **Vacío / error:** "Aún no hay pruebas registradas" con la fecha en que vence la primera; objetivos sin definir resaltados como pendientes; "aprobada" fuera de objetivos → 422.

## 9. Eventos y jobs

- **Emite:** `MonitorDown`, `MonitorRecovered`, `IncidentOpened`, `IncidentUpdated`, `IncidentResolved`, `MaintenanceScheduled`, `BackupFailed`, `BackupOverdue`, `RestoreTestFailed`, `AlertRaised`.
- **Escucha:** alertas de todos los módulos (interfaz `Alerts::raise`); `ChangeRequestApproved` (WRK) para proponer mantenimiento.
- **Jobs:** `RunMonitors` (cola `monitoring`, según intervalo); `SyncExternalMonitoring` (según herramienta); `CheckBackups` (diario); `CheckSslAndDns` (aporta resultados SSL/DNS, compartido con MAI); `SyncBackupTools` (cola `sync`, según la frecuencia de cada política); `CheckDrTestDue` (diario).
- **Restauraciones y recuperación — emite:** `RestoreRequested`, `RestoreRequestApproved`, `RestoreRequestRejected`, `RestoreRequestStarted`, `RestoreRequestCompleted`, `RestoreRequestFailed`, `RestoreRequestCancelled`, `DrTestRecorded`, `DrTestFailed`. **Escucha:** `TaskCompleted` (WRK) de la tarea asistida de restauración.

## 10. Integraciones y conectores

- Herramienta de monitoreo existente (por definir) mediante conector de lectura y webhook de alertas.
- Correo y portal (AUT) para notificaciones de incidentes y mantenimientos.
- Herramienta de respaldos de los servidores cPanel mediante `BackupToolConnector` (`docs/08`, ficha 30): **NO VERIFICADO** qué herramienta usan los nodos ni su API (D-21). Sin API: registro manual de respaldos y restauración como tarea asistida.
- AWS S3 (ficha 7) para el respaldo que se usa en las pruebas del plan de recuperación.

## 11. Ajustes administrables

- El intervalo de cada monitor y la frecuencia de cada política de backup son datos de sus tablas. Lee `system.daily_jobs_time`.
- Respaldos ampliados: `monitoring.restore.customer_target_kinds`, `monitoring.backup_report.visible`, `system.backup.rpo_minutes`, `system.backup.rto_minutes`, `system.dr_test.frequency_days`.

## 12. Historias del backlog

- Chequeos de disponibilidad, DNS y SSL
- Registros de correo SPF, DKIM, DMARC y MX
- Incidentes con clientes afectados
- Mantenimientos programados
- Portal de estado público
- Políticas y ejecuciones de backup
- Pruebas de restauración
- Impacto de incidentes en recursos compartidos
- Problemas recurrentes e incidentes de seguridad
- Solicitud de restauración desde el portal
- Aprobación y ejecución de restauraciones con evidencia
- Integración con la herramienta de respaldos de cPanel
- Informe de respaldos para el cliente
- Plan de recuperación del sistema con prueba periódica

## 13. Criterios de terminado y pruebas obligatorias

- Crear monitor sobre un objetivo no registrado → 422.
- Incidente sobre el servidor del sitio de turismo deriva todos los componentes, servicios y clientes dependientes y notifica una vez a cada cliente.
- Incidente en recurso compartido de una plataforma SaaS lista todas sus instancias y clientes.
- Portal de estado y portal del cliente no contienen notas internas ni nombres de recursos o proveedores (prueba de respuesta).
- Backup sin ejecución dentro de su frecuencia genera alerta de atraso, una sola vez.
- Alertas con la misma `dedupe_key` no se duplican.
- Una restauración pedida desde el portal crea solicitud y ticket; no se ejecuta sin aprobación; quien la registró por el cliente no la aprueba; no se cierra sin evidencia; una segunda solicitud abierta del mismo objeto → 409.
- Sin API de la herramienta, iniciar la restauración crea una tarea asistida y no llama a ningún conector.
- Leer dos veces la herramienta no duplica `backup_runs`.
- El informe de respaldos del portal no contiene nodo, herramienta, ubicación ni proveedor (prueba de serialización).
- Una prueba de recuperación con tiempo mayor al RTO no se puede registrar como aprobada; sin prueba aprobada en `system.dr_test.frequency_days` se crea una tarea.

## 14. Preguntas abiertas

- Herramienta de monitoreo a integrar (docs/00, sección 14; antes del conector de monitoreo).
- Dominio o ruta del portal de estado por marca (derivada).
- Herramienta de respaldos de los servidores cPanel y su API (`docs/11`, D-21).
- Objetivos de recuperación del sistema (D-25).

## Anexo: nombres fuera del contrato

- `alerts.status`: `open`, `acknowledged`, `resolved`.
- `maintenance_windows.status`: `scheduled`, `in_progress`, `completed`, `cancelled`.
- `backup_runs.status`: `running`, `succeeded`, `failed`, `partial`.
- `incidents.severity`: reusa los valores de `tickets.priority`.
