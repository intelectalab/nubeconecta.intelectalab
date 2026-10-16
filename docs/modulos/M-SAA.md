# M-SAA · Saas (plataformas SaaS e instancias, Moodle y otros)

> Módulo de código `app/Modules/Saas` · clave de permiso `saas` · código `SAA`.
> Fuente: `docs/00-requerimientos.md` secciones 4, 6 (conector Moodle) y 20 ("SaaS sobre arquitectura compartida"); contrato común de nombres.

## 1. Propósito y bloque

Registra las plataformas SaaS que opera la empresa (Moodle y otras) sobre proyectos cloud o servidores, y la instancia de cada cliente con plan, usuarios, almacenamiento, dominio, versión y complementos. Vigila versiones sin soporte, límites del plan y el impacto de incidentes en recursos compartidos.

- **Bloque:** C. Inventario y mapa (conector Moodle en bloque H).
- **Depende de:** INV, CLD, SRV, CUS, VLT, CFG.
- **Dependen de él:** MAP (componente único), FIN (reparto del costo), MON (impacto), SAL (excedentes), BIL.

## 2. Alcance

**Incluye**
- Plataformas SaaS: producto (Moodle u otro), proyecto cloud o servidor donde corre, versión base, responsable, costo de la arquitectura.
- Ficha de instancia (por ejemplo una plataforma Moodle): institución, URL, modalidad, versión, servidor, base de datos, usuarios (límite y activos), almacenamiento (límite y usado), complementos, tema, SSL, backup y SLA; enlace a servicio y a cuenta de hosting o servidor.
- Seguimiento de versiones con alerta de versión sin soporte y calendario de actualizaciones.
- Conector Moodle por servicios web, solo lectura (versión, usuarios activos, complementos), con token de alcance limitado en la bóveda.
- Planes y límites: alerta al acercarse y al superar usuarios o almacenamiento contratados, para facturar excedente o proponer ampliación.
- Lista automática de instancias y clientes afectados por un incidente en un recurso compartido.
- Datos de uso que FIN necesita para repartir el costo de la arquitectura (usuarios activos, almacenamiento).

**No incluye**
- Ejecutar actualizaciones de Moodle (se hacen como tareas de WRK con plantilla).
- El cálculo del reparto (FIN) y la facturación del excedente (BIL).
- Mostrar la infraestructura al cliente: nunca la ve.

## 3. Entidades

| Tabla | Campos clave | Notas |
|---|---|---|
| `saas_platforms` | name, product_kind (`moodle`/`wordpress`/`custom`/`other`), cloud_project_id, server_id, base_version, owner_user_id, cost_allocation_method (`active_users`/`storage`/`fixed_percent`) | Atiende a varios clientes |
| `saas_instances` | saas_platform_id, service_id, customer_id, institution, url, domain_id, app_version, users_limit, users_active, storage_limit_mb, storage_used_mb, plugins (jsonb), hosting_account_id, server_id, renewal_date, status, last_synced_at | Un componente en el mapa del cliente |

## 4. Casos de uso y flujos

1. **Registrar plataforma** y su arquitectura (proyecto cloud o servidor).
2. **Registrar instancia** de un cliente con plan y límites; MAP crea el componente único.
3. **Sincronizar Moodle:** job diario usa el token de solo lectura (desde VLT) y lee versión, usuarios activos y complementos.
4. **Versiones:** comparar `version` con `supported_versions`; si está fuera de soporte, alerta y propuesta de tarea en el calendario de actualizaciones.
5. **Límites:** al acercarse (umbral de capacidad) o superar usuarios/almacenamiento, alerta a soporte y ventas (sugerencia de ampliación en SAL o excedente en BIL).
6. **Impacto:** ante un incidente en un recurso compartido (MON), SAA responde con las instancias y clientes afectados.

## 5. Reglas de negocio clave

La instancia aparece en el mapa del cliente como un solo componente; la arquitectura que la sostiene solo se ve en la vista de soporte. El conector Moodle es de solo lectura y su token vive en la bóveda con alcance limitado. Una alerta de límite se emite una vez por umbral y periodo. El reparto del costo de la arquitectura entre instancias debe sumar exactamente el costo (lo garantiza FIN con los datos de uso de SAA). Las fichas sin conector se mantienen a mano con fecha de última revisión.

## 6. Estados

- `saas_instances.status`: ver anexo (valores agregados).

## 7. Permisos

| Código | Rol por defecto |
|---|---|
| `saas.saas_platform.view` | admin, support |
| `saas.saas_platform.create` / `update` | admin, support |
| `saas.saas_instance.view` | admin, support, sales; cliente sobre las suyas (vista pública) |
| `saas.saas_instance.create` / `update` / `delete` / `export` | admin, support |

## 8. Pantallas

### P-SAA-01 · Plataformas SaaS
- **Propósito:** listar plataformas compartidas con su arquitectura y costo.
- **Rol principal:** support
- **Columnas:** plataforma, producto, proyecto cloud o servidor, versión base, instancias, usuarios activos totales, almacenamiento total, costo mensual, método de reparto.
- **Filtros:** producto.
- **Acciones:** Registrar plataforma → `saas.saas_platform.create`; Exportar → `saas.saas_instance.export`.
- **Vacío / error:** vacío con botón registrar; error de carga con reintento.

### P-SAA-02 · Detalle de plataforma SaaS
- **Propósito:** ver instancias, arquitectura, costo y reparto de una plataforma.
- **Rol principal:** support
- **Campos:** datos de la plataforma, arquitectura (enlace a CLD/INV), instancias con uso, versiones soportadas, reparto del costo del mes (desde FIN), incidentes.
- **Filtros:** instancias sobre límite, desactualizadas.
- **Acciones:** Editar → `saas.saas_platform.update`; Registrar instancia → `saas.saas_instance.create`; Ver reparto de costo → `finance.cost_allocation.view`.
- **Vacío / error:** plataforma sin instancias; aviso si el método de reparto no tiene datos de uso.

### P-SAA-03 · Instancias
- **Propósito:** controlar planes, uso y renovaciones de las instancias de clientes.
- **Rol principal:** support
- **Columnas:** institución, cliente, plataforma, URL, versión, usuarios activos/límite, almacenamiento usado/límite, renovación, estado, última sincronización.
- **Filtros:** plataforma, sobre límite, cerca del límite, versión sin soporte, renovación en N días.
- **Acciones:** Registrar instancia → `saas.saas_instance.create`; Sincronizar → `automation.sync_run.create`; Exportar → `saas.saas_instance.export`.
- **Vacío / error:** "Sin instancias"; barra de uso en rojo al superar el límite.

### P-SAA-04 · Ficha de instancia (Moodle u otro)
- **Propósito:** ver todo el contexto técnico de una instancia para atenderla.
- **Rol principal:** support
- **Campos:** institución, URL, modalidad, versión, servidor, base de datos, usuarios, almacenamiento, complementos con versión, tema, SSL, política de backup y última ejecución, SLA, servicio, tickets.
- **Filtros:** no aplica.
- **Acciones:** Editar → `saas.saas_instance.update`; Programar actualización → `work.task.create`; Proponer ampliación → `sales.lead.create`; Revelar acceso → `vault.secret.reveal`.
- **Vacío / error:** sin conector: "Ficha manual, última revisión el …"; error de token del conector visible.

### P-SAA-05 · Calendario de actualizaciones
- **Propósito:** planificar actualizaciones de plataformas desactualizadas.
- **Rol principal:** support
- **Columnas:** fecha, instancia, versión actual, versión objetivo, tarea, responsable, mantenimiento programado.
- **Filtros:** mes, plataforma, sin soporte.
- **Acciones:** Programar actualización → `work.task.create`; Anunciar mantenimiento → `monitoring.maintenance_window.create`.
- **Vacío / error:** "No hay actualizaciones programadas"; error de carga con reintento.

## 9. Eventos y jobs

- **Emite:** `SaasInstanceCreated`, `SaasInstanceLimitApproaching`, `SaasInstanceLimitExceeded`, `SaasVersionUnsupported`.
- **Escucha:** `IncidentOpened` (MON) → calcular instancias afectadas.
- **Jobs:** `SyncSaasInstances` (diario); `CheckSaasLimitsAndVersions` (diario).

## 10. Integraciones y conectores

- `SaasConnector` Moodle (servicios web oficiales, token de alcance limitado, solo lectura).
- Sin API: registro manual.

## 11. Ajustes administrables

- `inventory.capacity_thresholds` (aplicado a límites de plan)
- `saas.limit_alert_percent`

## 12. Historias del backlog

- Ficha de plataforma Moodle
- Seguimiento de versiones y actualizaciones
- Conector Moodle por servicios web
- Planes y límites de SaaS propios
- Plataformas SaaS e instancias por cliente
- Límites de plan y excedentes
- Impacto de incidentes en recursos compartidos

## 13. Criterios de terminado y pruebas obligatorias

- Prueba de contrato con respuestas grabadas de los servicios web de Moodle; el conector no declara capacidades de escritura.
- Instancia con 510 usuarios activos y límite 500 genera alerta una vez por periodo.
- La API del portal de una instancia no expone servidor, base de datos, proyecto cloud ni costo.
- Incidente en el proyecto cloud de la plataforma lista todas sus instancias y clientes.

## 14. Preguntas abiertas

- Ninguna de docs/00, sección 14. Derivada: umbral de "acercarse al límite" de un plan SaaS; esta especificación reusa los umbrales de capacidad (70/85/95 %) salvo que se defina uno propio (`saas.limit_alert_percent`).

## Anexo: nombres fuera del contrato

- `saas_instances.status`: `active`, `suspended`, `terminated`.
