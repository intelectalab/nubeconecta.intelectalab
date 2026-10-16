# M-WRK · Work (tareas, proyectos internos, horas, cambios y problemas)

> Módulo de código `app/Modules/Work` · clave de permiso `work` · código `WRK`.
> Fuente: `docs/00-requerimientos.md` secciones 4, 6 (tarea manual asistida), 10 (máquinas de estado sobre `change_requests`), 13 (solicitudes internas, bolsas de horas, cambios y problemas) y 22 (#12); contrato común de nombres.

## 1. Propósito y bloque

Organiza el trabajo técnico: tareas con subtareas, listas de verificación, dependencias y evidencias que nacen de tickets, alertas, renovaciones, pedidos o conectores sin capacidad; tareas recurrentes desde plantillas; registro de horas con bolsas de soporte; gestión de cambios con aprobación y problemas recurrentes.

- **Bloque:** F. Soporte.
- **Depende de:** HLP, IDN, CFG; recibe solicitudes de casi todos los módulos por evento o interfaz.
- **Dependen de él:** ORD (aprovisionamiento manual), DOM, INV, VLT (tareas de rotación), MON, FIN (horas), HLP (resolver tras tareas).

## 2. Alcance

**Incluye**
- Tareas con responsable, fecha límite, prioridad, dependencias, comentarios, evidencias, subtareas y listas de verificación; origen (`source_type`, `source_id`).
- Tarea manual asistida: cuando un conector no tiene la capacidad, se crea tarea con el procedimiento y lista de verificación.
- Vistas Kanban, tabla y calendario; arrastrar cambia el estado respetando permisos.
- Tareas recurrentes y plantillas (migración, actualización de Moodle, instalación de SSL, respaldo, actualización de nodos, licencias de cPanel, rotación de credenciales).
- Aprobaciones: una tarea marcada como sensible no avanza sin aprobación; queda registrado quién aprobó.
- Proyectos internos que agrupan tareas.
- Registro de horas por tarea, facturables o no, con descuento de la bolsa de soporte del cliente.
- Gestión de cambios: riesgo, plan, reversión, ventana; no se ejecuta sin aprobación.
- Problemas: agrupan tickets e incidentes recurrentes para atacar la causa raíz; incidentes de seguridad con acceso restringido.

**No incluye**
- Tickets (HLP) e incidentes (MON).
- Facturación de horas (BIL emite; WRK aporta horas facturables).

## 3. Entidades

| Tabla | Campos clave | Notas |
|---|---|---|
| `work_projects` | name, customer_id, owner_id, status, starts_on, due_on | Proyectos internos |
| `tasks` | number, work_project_id, parent_id, title, description, status, priority (reusa valores de `tickets.priority`), assignee_id, due_at, source_type, source_id, customer_id, requires_approval, approved_by, approved_at, is_template, recurrence (jsonb), template_id, is_sensitive, completed_at | |
| `task_checklist_items` | task_id, label, sort_order, done_at, done_by | |
| `task_dependencies` | task_id, depends_on_task_id | Sin ciclos |
| `time_entries` | task_id, ticket_id, user_id, customer_id, started_at, minutes, is_billable, invoice_item_id, contract_id, notes | |
| `change_requests` | number, title, risk (`low`/`medium`/`high`), plan, rollback_plan, scheduled_for, scheduled_until, status, requested_by, approved_by, approved_at, target_type, target_id, implemented_at | |
| `problems` | number, title, status, root_cause, workaround, owner_id | Seguridad: acceso restringido |

## 4. Casos de uso y flujos

1. **Crear tarea** manual o desde ticket, alerta, renovación, pedido, migración o conector sin capacidad (con plantilla de procedimiento).
2. **Trabajar la tarea:** cambiar estado, marcar ítems, adjuntar evidencias, comentar; dependencias bloquean el inicio.
3. **Aprobación:** tareas con `requires_approval` quedan en `blocked` hasta que el administrador aprueba; luego `in_progress`.
4. **Recurrentes:** `GenerateRecurringTasks` diario crea instancias desde plantillas con recurrencia (por nodo, por servidor, por instancia).
5. **Horas:** el técnico registra minutos; si el cliente tiene bolsa, se descuenta; las facturables no cubiertas por bolsa quedan disponibles para facturar.
6. **Cambio:** solicitar con riesgo, plan, reversión y ventana → aprobar → implementar en la ventana → resultado (o reversión).
7. **Problema:** agrupar tickets e incidentes; registrar causa raíz y solución; los de seguridad solo los ven admin y soporte con permiso.

## 5. Reglas de negocio clave

Una tarea con aprobación pendiente no avanza. Un cambio no se ejecuta sin aprobación y fuera de su ventana requiere nueva aprobación. Arrastrar en el Kanban respeta la máquina de estados y los permisos. Cerrar todas las tareas de un ticket habilita su resolución. Las horas registradas no se borran tras ser facturadas. Una bolsa agotada no impide registrar horas: las excedentes quedan facturables. Los problemas e incidentes de seguridad tienen acceso restringido. El técnico temporal solo ve lo asignado.

## 6. Estados

- `tasks.status`: `todo`, `in_progress`, `blocked`, `in_review`, `done`, `cancelled`.
- `change_requests.status`, `problems.status`, `work_projects.status`: ver anexo (valores agregados).

## 7. Permisos

| Código | Rol por defecto |
|---|---|
| `work.task.view` | admin, support, documentation (lectura); temp_technician (asignadas) |
| `work.task.create` / `update` | admin, support, sales, finance, documentation |
| `work.task.approve` | admin |
| `work.task.delete` / `export` | admin, support |
| `work.work_project.view` / `create` / `update` | admin, support |
| `work.time_entry.view` / `create` / `update` | admin, support, temp_technician (propias) |
| `work.change_request.view` / `create` / `update` | admin, support |
| `work.change_request.approve` | admin |
| `work.problem.view` / `create` / `update` | admin, support |

## 8. Pantallas

### P-WRK-01 · Tablero de tareas
- **Propósito:** ver y mover el trabajo en Kanban, tabla o calendario.
- **Rol principal:** support
- **Columnas:** tarjetas por estado (título, cliente, origen, responsable, prioridad, vence, checklist x/y, aprobación); tabla equivalente; calendario por fecha límite.
- **Filtros:** responsable, cliente, origen, prioridad, vencidas, requieren aprobación, proyecto.
- **Acciones:** Nueva tarea → `work.task.create`; Mover de estado → `work.task.update`; Aprobar → `work.task.approve`; Exportar → `work.task.export`.
- **Vacío / error:** columna vacía; soltar en un estado no permitido revierte con mensaje; 403 si no tiene permiso.

### P-WRK-02 · Detalle de tarea
- **Propósito:** ejecutar la tarea con su lista de verificación, evidencias y horas.
- **Rol principal:** support
- **Campos:** título, descripción/procedimiento, origen enlazado, responsable, prioridad, fecha, dependencias, subtareas, checklist con evidencias, comentarios, horas registradas, aprobación.
- **Filtros:** no aplica.
- **Acciones:** Editar → `work.task.update`; Marcar ítem → `work.task.update`; Registrar horas → `work.time_entry.create`; Aprobar → `work.task.approve`; Completar → `work.task.update`; Cancelar → `work.task.update`.
- **Vacío / error:** "Completar" deshabilitado si hay ítems obligatorios pendientes o dependencias abiertas; 409 por edición concurrente.

### P-WRK-03 · Plantillas y tareas recurrentes
- **Propósito:** programar mantenimientos periódicos y procedimientos estándar.
- **Rol principal:** support
- **Columnas:** plantilla, tipo (migración, actualización de Moodle, SSL, respaldo, licencias, rotación), checklist, recurrencia, aplica a (nodo, servidor, instancia), próximas ejecuciones.
- **Filtros:** tipo, con recurrencia.
- **Acciones:** Crear plantilla → `work.task.create`; Editar → `work.task.update`; Programar recurrencia → `work.task.update`.
- **Vacío / error:** vacío con plantillas sugeridas; 422 por recurrencia inválida.

### P-WRK-04 · Proyectos internos
- **Propósito:** agrupar tareas de una iniciativa (por ejemplo, migración de un reseller).
- **Rol principal:** support
- **Columnas:** proyecto, cliente, responsable, tareas abiertas/cerradas, fechas, estado.
- **Filtros:** estado, responsable, cliente.
- **Acciones:** Crear proyecto → `work.work_project.create`; Editar → `work.work_project.update`.
- **Vacío / error:** vacío con botón crear; error de carga con reintento.

### P-WRK-05 · Registro de horas y bolsas
- **Propósito:** registrar horas y ver el consumo de bolsas de soporte.
- **Rol principal:** support
- **Columnas:** fecha, técnico, cliente, tarea o ticket, minutos, facturable, bolsa descontada, facturada; resumen de bolsas (contratadas, consumidas, saldo).
- **Filtros:** periodo, técnico, cliente, facturable, sin facturar.
- **Acciones:** Registrar horas → `work.time_entry.create`; Editar → `work.time_entry.update`; Aprobar horas → `work.time_entry.update`; Exportar → `work.task.export`.
- **Vacío / error:** "Sin horas en el periodo"; editar una hora ya facturada → 409.

### P-WRK-06 · Cambios
- **Propósito:** solicitar, aprobar y registrar cambios de riesgo.
- **Rol principal:** support
- **Columnas:** número, título, riesgo, ventana, recursos afectados, impacto (clientes), estado, solicitado por, aprobado por.
- **Filtros:** estado, riesgo, ventana.
- **Acciones:** Solicitar cambio → `work.change_request.create`; Aprobar o rechazar → `work.change_request.approve`; Registrar implementación → `work.change_request.update`; Registrar reversión → `work.change_request.update`; Anunciar mantenimiento → `monitoring.maintenance_window.create`.
- **Vacío / error:** implementar sin aprobación → 409; ventana en el pasado → 422.

### P-WRK-07 · Problemas
- **Propósito:** agrupar incidentes y tickets recurrentes y registrar la causa raíz.
- **Rol principal:** support
- **Columnas:** número, título, estado, seguridad, tickets e incidentes enlazados, responsable, causa raíz.
- **Filtros:** estado, seguridad.
- **Acciones:** Crear problema → `work.problem.create`; Enlazar tickets e incidentes → `work.problem.update`; Registrar causa raíz → `work.problem.update`.
- **Vacío / error:** los problemas de seguridad no aparecen sin permiso; "Sin problemas abiertos".

## 9. Eventos y jobs

- **Emite:** `TaskCreated`, `TaskCompleted`, `TaskApprovalRequested`, `TaskApproved`, `TimeEntryApproved`, `ChangeRequestApproved`, `ChangeImplemented`, `ProblemResolved`.
- **Escucha:** `ManualActionRequired` (cualquier módulo cuando falta capacidad), `CapacityThresholdReached` (INV), `SslExpiring` (MAI), `SecretRotationDue` (VLT), `OrderApproved` (ORD), `InconsistencyDetected` (ORD).
- **Jobs:** `GenerateRecurringTasks` (diario); `NotifyOverdueTasks` (diario).

## 10. Integraciones y conectores

- Ninguna directa.

## 11. Ajustes administrables

- `system.daily_jobs_time`

## 12. Historias del backlog

- Tareas con subtareas y listas de verificación
- Vistas Kanban, tabla y calendario
- Registro de horas y bolsas de soporte
- Tareas recurrentes y plantillas
- Aprobaciones
- Gestión de cambios con aprobación
- Problemas recurrentes e incidentes de seguridad
- Convertir ticket en tarea

## 13. Criterios de terminado y pruebas obligatorias

- Tarea con aprobación pendiente no puede pasar a `in_progress` (409); queda registrado quién aprobó.
- Cambio sin aprobar no se puede marcar implementado.
- Arrastrar a un estado no permitido no cambia nada y muestra el motivo.
- Horas en un cliente con bolsa de 10 h: registrar 12 h descuenta 10 y deja 2 facturables.
- Técnico temporal no ve tareas no asignadas (prueba de política).
- Problema de seguridad invisible sin permiso.

## 14. Preguntas abiertas

- Cómo se contratan y facturan las bolsas de horas (producto del catálogo con horas incluidas o campo del contrato): el kit las nombra sin fijar el modelo (derivada; esta especificación las modela como servicio del catálogo con horas en `plans.limits`).

## Anexo: nombres fuera del contrato

- `change_requests.status`: `draft`, `submitted`, `approved`, `rejected`, `scheduled`, `implemented`, `failed`, `closed`.
- `problems.status`: `open`, `investigating`, `known_error`, `resolved`, `closed`.
- `work_projects.status`: `planned`, `active`, `on_hold`, `completed`, `cancelled`.
