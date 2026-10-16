# M-MAP · ServiceMap (mapa de servicios del cliente y ficha de traspaso)

> Módulo de código `app/Modules/ServiceMap` · clave de permiso `service_map` · código `MAP`.
> Fuente: `docs/00-requerimientos.md` secciones 13 (criterio 1), 15, 20 (SaaS como componente), 21 (proveedor oculto) y 22 (#10); contrato común de nombres.

## 1. Propósito y bloque

Es la función central del sistema: cada cliente tiene proyectos y cada proyecto una lista de componentes que dice qué es, en qué proveedor y cuenta está, de qué depende y cuánto consume. Ofrece dos vistas de una sola fuente (soporte y cliente), los procedimientos de atención por proyecto y la ficha de traspaso.

- **Bloque:** C. Inventario y mapa.
- **Depende de:** SRV, INV (recursos), PRV, CUS, VLT (accesos disponibles, sin valores), CFG.
- **Dependen de él:** PRT (vista del cliente), HLP y MON (impacto aguas abajo), SAL (sugerencias), INV (migración actualiza el mapa al cerrar).

## 2. Alcance

**Incluye**
- Proyectos del cliente con responsable técnico y estado.
- Componentes por tipo (servidor, hosting, dominio, DNS, CDN, correo, envíos masivos, certificado SSL, base de datos, almacenamiento, sitio WordPress, sistema a medida, plataforma Moodle, licencia, otro) enlazados a recurso, cuenta de proveedor y servicio facturado; etiqueta pública y visibilidad al cliente.
- Componentes sin API registrados a mano y marcados "sin sincronización", con fecha de última revisión.
- Dependencias entre componentes y consulta de impacto aguas abajo para tickets e incidentes.
- Métricas de consumo por componente (job diario desde cada conector), con bandera de métrica pública.
- Vista de soporte (proveedor, cuenta, datos técnicos, accesos disponibles, costo, notas internas, diagrama) y vista del cliente (etiqueta pública, métricas públicas, estado, vencimiento).
- Procedimientos por proyecto con versiones e historial.
- Ficha de traspaso en PDF con componentes, proveedor y configuración no sensible, y pasos de entrega; nunca accesos.
- Reporte de mapas incompletos (clientes con servicios activos sin proyecto o sin componentes).

**No incluye**
- El inventario técnico en sí (INV, CLD, DOM, MAI, SAA): MAP los referencia.
- Grafo de dependencias entre recursos de infraestructura (CMDB de INV); MAP modela dependencias entre componentes del proyecto del cliente.
- Entrega de accesos (por canal seguro: enlace de un solo uso de VLT).

## 3. Entidades

| Tabla | Campos clave | Notas |
|---|---|---|
| `client_projects` | customer_id, name, description, status, technical_owner_id, deleted_at | Ejemplo: "Web de turismo" |
| `project_components` | client_project_id, kind, public_label, resource_id, provider_account_id, service_id, visible_to_customer, sync_mode (`api`/`manual`), last_reviewed_at, technical_data (jsonb, no sensible), notes_internal, environment | Un componente por pieza |
| `component_dependencies` | from_component_id, to_component_id, kind (`hosted_on`/`depends_on`/`resolves_via`/`delivers_via`/`sends_via`/`secured_by`/`other`) | Sin ciclos |
| `component_metrics` | project_component_id, metric (`disk_used`/`disk_total`/`ram`/`traffic`/`mailboxes`/`emails_sent`/`users_active`/...), value, unit, is_public, measured_at, source | |
| `project_procedures` | client_project_id, title, body (texto enriquecido), version, kind (`maintenance`/`emergency`/`deployment`/`handover`/`other`) | Historial por versión |
| `handover_documents` | customer_id, client_project_id, file_id, created_by, created_at, locale | PDF generado |

## 4. Casos de uso y flujos

1. **Registrar proyecto y componentes a mano** (el mapa funciona primero sin conectores): crear proyecto, agregar componentes eligiendo tipo, proveedor/cuenta, recurso y servicio, etiqueta pública y visibilidad.
2. **Dependencias:** conectar componentes ("el sitio depende del DNS", "el correo depende del dominio"); el diagrama del proyecto se genera desde ellas.
3. **Consumo:** el job `SyncComponentMetrics` lee cada componente con conector y guarda métricas; el panel muestra el último valor y su fecha.
4. **Impacto:** HLP y MON llaman `ServiceMap::downstream($componentId)` y muestran los componentes, servicios y clientes que dependen.
5. **Vista del cliente:** el portal pide `/api/v1/portal/projects` y recibe solo `public_label`, métricas públicas, estado y vencimiento; proveedor solo si el ajuste lo habilita.
6. **Procedimientos:** soporte documenta cómo atender el proyecto; cada edición crea versión.
7. **Ficha de traspaso:** botón en la ficha del cliente → PDF en cola con todos los componentes, proveedor y configuración no sensible, pasos de entrega; queda en auditoría.
8. **Mapa tras migración:** al cerrar una cuenta migrada (INV) se actualiza el componente de hosting al nuevo nodo.
9. **Completitud:** reporte de clientes con servicios activos sin proyecto o sin componentes.

## 5. Reglas de negocio clave

Dos vistas, una sola fuente: la vista del cliente usa `public_label` y solo métricas marcadas públicas; costos, cuentas, accesos y notas internas no existen en los recursos de la API del portal. Por defecto el cliente ve solo la marca propia, no el proveedor real. Un componente sin API muestra datos fijos y la fecha de última revisión. Una instancia SaaS aparece como un solo componente; la arquitectura que la sostiene solo se ve en la vista de soporte. Ambientes de desarrollo y pruebas pueden ocultarse al cliente. Las dependencias no admiten ciclos. La ficha de traspaso nunca incluye accesos ni secretos, y su generación queda en auditoría.

## 6. Estados

- `client_projects.status`: ver anexo (valores agregados).
- Indirectos: muestra `services.status` del servicio enlazado.

## 7. Permisos

| Código | Rol por defecto |
|---|---|
| `service_map.client_project.view` | admin, support, sales (lectura), documentation (lectura); cliente sobre los suyos (vista pública) |
| `service_map.client_project.create` / `update` / `delete` | admin, support |
| `service_map.project_component.create` / `update` / `delete` | admin, support |
| `service_map.project_procedure.view` / `create` / `update` | admin, support; temp_technician (lo asignado) |
| `service_map.handover_document.create` / `view` | admin, support |
| `service_map.client_project.export` | admin, support |

## 8. Pantallas

### P-MAP-01 · Proyectos de clientes
- **Propósito:** listar proyectos con su completitud.
- **Rol principal:** support
- **Columnas:** cliente, proyecto, responsable técnico, componentes, componentes sin sincronización, última revisión, estado.
- **Filtros:** cliente, responsable, estado, con componentes sin revisar en N días.
- **Acciones:** Crear proyecto → `service_map.client_project.create`; Exportar → `service_map.client_project.export`.
- **Vacío / error:** vacío con botón crear y enlace al reporte de mapas incompletos; error de carga con reintento.

### P-MAP-02 · Mapa del proyecto (vista de soporte)
- **Propósito:** ver el proyecto completo con datos técnicos, diagrama, consumo e impacto.
- **Rol principal:** support
- **Campos:** lista de componentes (tipo, etiqueta pública, proveedor y cuenta, recurso, servicio, sincronización, último valor de consumo, costo con permiso, accesos disponibles en VLT, notas internas); diagrama de dependencias; pestañas procedimientos, historial y "vista como cliente".
- **Filtros:** tipo de componente, ambiente.
- **Acciones:** Agregar componente → `service_map.project_component.create`; Editar dependencias → `service_map.project_component.update`; Revelar acceso (abre VLT) → `vault.secret.reveal`; Abrir ticket sobre componente → `helpdesk.ticket.create`; Ver como cliente → `service_map.client_project.view`.
- **Vacío / error:** proyecto sin componentes: guía para agregar el primero; diagrama con aviso si hay componentes sin dependencias; 422 si una dependencia crea ciclo.

### P-MAP-03 · Editor de componente
- **Propósito:** registrar o editar una pieza del proyecto.
- **Rol principal:** support
- **Campos:** tipo, etiqueta pública, proveedor y cuenta, recurso (búsqueda en INV/CLD/DOM/MAI/SAA), servicio facturado, visible al cliente, modo de sincronización, datos técnicos no sensibles, ambiente, notas internas, métricas públicas.
- **Filtros:** no aplica.
- **Acciones:** Guardar → `service_map.project_component.update`; Marcar revisado hoy → `service_map.project_component.update`; Eliminar → `service_map.project_component.delete`.
- **Vacío / error:** 422 si se intenta pegar una contraseña en datos técnicos (detector de patrones sensibles); advertencia si el componente no tiene servicio facturado.

### P-MAP-04 · Procedimientos del proyecto
- **Propósito:** documentar cómo atender cada proyecto en emergencias y mantenimientos.
- **Rol principal:** support
- **Columnas:** título, tipo, versión, autor, última edición; editor con historial de versiones y comparación.
- **Filtros:** tipo.
- **Acciones:** Crear procedimiento → `service_map.project_procedure.create`; Editar (nueva versión) → `service_map.project_procedure.update`; Ver versión anterior → `service_map.project_procedure.view`.
- **Vacío / error:** "Sin procedimientos" con plantilla sugerida; 409 si otra persona guardó antes.

### P-MAP-05 · Ficha de traspaso
- **Propósito:** generar y consultar las fichas de traspaso del cliente.
- **Rol principal:** support
- **Columnas:** fecha, proyectos incluidos, idioma, generado por, descarga.
- **Filtros:** cliente.
- **Acciones:** Generar ficha → `service_map.handover_document.create`; Descargar → `service_map.handover_document.view`; Enviar accesos por enlace de un solo uso → `vault.one_time_link.create`.
- **Vacío / error:** "Aún no se generó ninguna ficha"; error de generación con reintento (la cola informa el fallo).

### P-MAP-06 · Reporte de mapas incompletos
- **Propósito:** ver qué clientes con servicios activos no tienen proyecto o componentes.
- **Rol principal:** support
- **Columnas:** cliente, servicios activos, proyectos, componentes, servicios sin componente.
- **Filtros:** marca, responsable.
- **Acciones:** Crear proyecto → `service_map.client_project.create`; Crear tarea de documentación → `work.task.create`; Exportar → `service_map.client_project.export`.
- **Vacío / error:** "Todos los clientes activos tienen su mapa"; error de carga con reintento.

## 9. Eventos y jobs

- **Emite:** `ServiceMapChanged`, `ComponentMetricsUpdated`, `HandoverDocumentGenerated`.
- **Escucha:** `MigrationItemClosed` (INV) → actualiza componente de hosting; `ResourceNotFound` (AUT/INV) → marca componente; `SaasInstanceCreated` (SAA) → componente único.
- **Jobs:** `SyncComponentMetrics` (frecuencia `service_map.metrics_frequency`, diaria).

## 10. Integraciones y conectores

- Lee métricas a través de los conectores de INV (WHM, Contabo, DigitalOcean), CLD (AWS, Azure, Google Cloud), MAI (Google Workspace, Microsoft 365), Bunny.net, Elastic Email y Moodle; sin conector, el componente es manual.

## 11. Ajustes administrables

- `service_map.metrics_frequency` (diaria)
- `portal.show_provider_name` (false; nivel cliente)

## 12. Historias del backlog

- Proyectos del cliente
- Componentes con proveedor y cuenta
- Dependencias entre componentes
- Vista de soporte del mapa
- Vista del cliente del mapa
- Mostrar u ocultar el proveedor real
- Consumo por componente
- Ficha de traspaso
- Reporte de mapas incompletos
- Procedimientos por proyecto del cliente

## 13. Criterios de terminado y pruebas obligatorias

- El mapa se puede registrar completo sin ningún conector configurado.
- La respuesta del portal para un componente no contiene `notes_internal`, `provider_account_id`, costo ni nombre del proveedor (con el ajuste por defecto); con el ajuste activado para ese cliente, sí el nombre del proveedor.
- Un cliente no puede leer el proyecto de otro cliente cambiando el identificador (404).
- Consulta de impacto: en el ejemplo del sitio de turismo, caer el DNS lista sitio WordPress, sistema a medida y correo.
- La ficha de traspaso no contiene ningún valor de `secrets` (prueba que busca valores sembrados en el PDF generado) y queda en auditoría.
- Métrica leída hoy se muestra con su fecha; componente manual muestra "sin sincronización" y última revisión.

## 14. Preguntas abiertas

- Ninguna propia; el ajuste del proveedor visible se define por cliente y por servicio (docs/00, sección 21) y prevalece sobre el "por organización" de la sección 15.

## Anexo: nombres fuera del contrato

- `client_projects.status`: `active`, `inactive`, `archived`.
- Columnas `project_components.sync_mode`, `last_reviewed_at`, `technical_data`, `environment`; `component_metrics.is_public`.
