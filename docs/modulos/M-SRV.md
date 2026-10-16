# M-SRV · Services (servicios contratados, suscripciones, modalidades e interruptores del cliente)

> Módulo de código `app/Modules/Services` · clave de permiso `services` · código `SRV`.
> Fuente: `docs/00-requerimientos.md` secciones 1 (principios), 4, 7 (cobranza), 20 (modalidades), 21 (suspensión, interruptores), 22 (#2, #8) y 23; contrato común de nombres.

## 1. Propósito y bloque

Es el centro del sistema: cada `service` es lo que se le cobra a un cliente, pertenece a una marca, se factura por una suscripción y apunta a uno o varios recursos técnicos. Controla el ciclo de vida del servicio (alta, suspensión, reactivación, terminación, entrega) con historial, las modalidades de servicio y los interruptores de acciones que el cliente puede usar en su panel.

- **Bloque:** B. Núcleo comercial.
- **Depende de:** CUS, CAT, BRD, CFG, IDN.
- **Dependen de él:** MAP, INV, DOM, MAI, SAA, CLD, ORD, BIL, FIN, HLP, MON, PRT.

## 2. Alcance

**Incluye**
- Alta de servicio: cliente, marca, plan, modalidad, estado, fecha de activación, vencimiento comercial, renovación automática; enlace a uno o varios recursos (`service_resources`).
- Suscripciones con ciclo, precio, moneda y próxima fecha de facturación; cambio de plan con prorrateo (el cálculo lo hace BIL).
- Panel de renovaciones con filtros por fecha, cliente, marca, categoría y proveedor, y agrupación de renovaciones de un cliente en una sola factura.
- Máquina de estados del servicio con historial: suspender, reactivar, cancelar, terminar (baja definitiva), entregar.
- Suspensión automática por mora y terminación tras N días de suspendido con respaldo previo y aprobación del administrador.
- Exención de suspensión por cliente y por producto (ajuste) y respeto de compromisos de pago.
- Modalidades de servicio configurables (titular de la cuenta, forma de facturar, qué ve el cliente).
- Interruptores de acciones del cliente a nivel general (ajuste) y por cliente (`customer_action_flags`).
- Proveedor visible al cliente: ajuste por cliente y columna por servicio, apagado por defecto.
- Correo de bienvenida al activar con plantilla por producto y accesos por enlace de un solo uso.
- Baja definitiva segura: valida obligaciones pendientes, exige respaldo y autorización, registra la eliminación en auditoría.
- Campos propios de los servicios de un tipo personalizado (docs/00 §26, `service_field_values`): los que pide el cliente al contratar llegan del carrito o la cotización; los que completa soporte se llenan en el detalle del servicio antes de activarlo; cada valor se guarda en la columna de su tipo (texto, número, lista, fecha, archivo o casilla) y es coherente con la definición del campo (CAT, RN-CAT-009). Al activarse, se crean las tareas de entrega (WRK) y el componente del mapa (MAP) del tipo (RN-CAT-010); el portal muestra solo los campos visibles del tipo.

**No incluye**
- Generación de facturas y cobranza (BIL); SRV expone suscripciones y reacciona a `InvoicePaid` y a las acciones de la secuencia.
- Ejecución técnica de suspender o crear cuentas en el proveedor (la hace el conector del módulo técnico vía ORD o INV).
- Dominios: no se suspenden; se deja de renovar (regla de DOM/BIL).

## 3. Entidades

| Tabla | Campos clave | Notas |
|---|---|---|
| `service_modalities` | code, name (i18n), account_owner (`company`/`customer`/`company_then_customer`), billing_mode (`plan`/`provider_cost_plus_fee`/`fee_only`/`usage_plan`), customer_visibility (jsonb), is_active | Catálogo editable; 4 filas iniciales del docs/00, sección 20 |
| `services` | code, customer_id, brand_id, product_id, plan_id, service_modality_id, contract_id, status, activated_at, commercial_due_date, auto_renew, suspended_at, terminated_at, handed_over_at, show_provider (null = hereda), label, custom, deleted_at | |
| `service_resources` | service_id, resource_id, role | N:M con `resources` (INV) |
| `service_field_values` | service_id, service_type_field_id, field_type (`text`/`number`/`select`/`date`/`file`/`checkbox`), value_text, value_number, value_date, value_boolean, value_file_id | Una por servicio y campo; coherente con el tipo del campo |
| `subscriptions` | service_id, cycle, price_minor, currency, next_invoice_date, status | 1:N líneas de factura |
| `service_status_history` | service_id, from_status, to_status, reason, created_by, trigger_source (`manual`/`dunning`/`payment`/`order`/`handover`/`system`), occurred_at | |
| `customer_action_flags` | customer_id, action (`cpanel_login`/`usage_view`/`dns_change`/`server_reboot`), enabled, updated_by | Sobrescribe el ajuste general |

## 4. Casos de uso y flujos

1. **Alta manual de servicio** (migración o caso puntual): elegir cliente, producto, plan, modalidad, fechas y recursos; crear suscripción.
2. **Alta desde pedido:** ORD llama a la interfaz `Services::activate()` al pasar a `active`; se envía el correo de bienvenida.
3. **Renovaciones:** ventas y finanzas filtran lo que vence; pueden agrupar renovaciones de un cliente para que BIL genere una sola factura.
4. **Suspensión por mora:** el job `SuspendOverdueServices` (o la etapa "suspender" de la secuencia de BIL) evalúa servicios con factura vencida `services.suspension.days_after_due`; excluye dominios, clientes/productos exentos y servicios con compromiso de pago abierto vigente; transiciona a `suspended` y pide al conector suspender (o crea tarea manual).
5. **Reactivación:** al recibir `PaymentValidated`/`InvoicePaid` que salda lo vencido y si `services.reactivation.auto_on_payment`, transiciona a `active` y pide al conector reactivar.
6. **Terminación tras suspensión:** a los `services.termination.days_after_suspension` de suspendido el job propone la baja; exige respaldo previo registrado (MON) y aprobación del administrador; luego `terminated`.
7. **Entrega de cuenta:** al completarse un `account_handover` (CTR) el servicio pasa a `handed_over`, conserva historial y termina la facturación (o continúa como administración si se pacta, con nuevo servicio).
8. **Interruptores:** el administrador activa "cambiar DNS" o "reiniciar servidor" a nivel general o por cliente; queda en auditoría.
9. **Baja definitiva segura:** valida facturas abiertas y contratos vigentes, exige respaldo y autorización, ejecuta la eliminación de datos técnicos según retención y la registra en auditoría.

## 5. Reglas de negocio clave

Un servicio activo sin suscripción es un servicio sin facturar y aparece en la detección de inconsistencias; un recurso sin servicio es infraestructura sin cliente. Las transiciones viven en una clase por entidad y cada una valida permiso, registra historial y auditoría, y emite evento. Suspender y cancelar piden confirmación y permiso. No se suspenden dominios. Un compromiso de pago registrado posterga la suspensión hasta su fecha; si vence sin pago, se suspende. Los clientes y productos exentos nunca se suspenden automáticamente. Un pago reportado no reactiva: solo el validado. Un servicio de un producto "requiere contrato" no pasa a `active` sin contrato `signed_active`. La terminación exige respaldo previo y aprobación del administrador. El vencimiento comercial (`commercial_due_date`) es lo pactado con el cliente y es distinto de la expiración real en el proveedor. El proveedor se oculta al cliente salvo que el ajuste del cliente o la columna del servicio lo habiliten.

## 6. Estados

- `services.status`: `pending`, `active`, `suspended`, `terminated`, `cancelled`, `handed_over`.
  - `pending → active` (pedido activado o alta manual), `active → suspended`, `suspended → active`, `active|suspended → cancelled`, `suspended → terminated` (con aprobación), `active → handed_over`.
- `subscriptions.status`: `active`, `paused`, `cancelled`.

## 7. Permisos

| Código | Rol por defecto |
|---|---|
| `services.service.view` | todo el personal (en el portal, `customer_admin`/`customer_user` usan `portal.service.view` sobre los suyos) |
| `services.service.create` / `update` / `export` | admin, sales, support |
| `services.service.suspend` (suspender y reactivar) | admin, finance |
| `services.service.terminate` | admin |
| `services.service.delete` (cancelar) | admin |
| `services.subscription.view` / `update` | admin, finance |
| `services.service_modality.view` / `create` / `update` | admin |
| `services.customer_action_flag.view` / `update` | admin |
| `services.service_field_value.view` / `update` | admin, support |

## 8. Pantallas

### P-SRV-01 · Servicios
- **Propósito:** listar todos los servicios contratados.
- **Rol principal:** support
- **Columnas:** número, cliente, producto/plan, marca, modalidad, estado, vencimiento comercial, próxima facturación, precio y moneda, renovación automática, sin suscripción (marca).
- **Filtros:** estado, marca, categoría, proveedor, modalidad, cliente, sin suscripción, sin contrato, etiqueta.
- **Acciones:** Crear servicio → `services.service.create`; Exportar → `services.service.export`.
- **Vacío / error:** vacío con botón crear; error de carga con reintento.

### P-SRV-02 · Detalle de servicio
- **Propósito:** ver y operar un servicio: suscripción, recursos, contrato, historial y acciones de ciclo de vida.
- **Rol principal:** support
- **Campos:** cabecera (cliente, producto, estado, fechas), suscripción (ciclo, precio, próxima factura), recursos enlazados, componente del mapa, campos propios (servicios de un tipo personalizado), contrato, facturas, tickets, historial de estados, proveedor visible.
- **Filtros:** no aplica.
- **Acciones:** Editar → `services.service.update`; Cambiar plan (prorrateo) → `services.subscription.update`; Suspender → `services.service.suspend`; Reactivar → `services.service.suspend`; Cancelar → `services.service.delete`; Terminar → `services.service.terminate`; Reenviar bienvenida → `services.service.update`; Enlazar recurso → `services.service.update`; Completar campos propios → `services.service_field_value.update`.
- **Vacío / error:** botones de transición solo para transiciones válidas del estado actual; `ConfirmDialog` que pide escribir el número del servicio para suspender, cancelar y terminar; 409 si el estado cambió.

### P-SRV-03 · Panel de renovaciones
- **Propósito:** ver todo lo que vence en los próximos días y agrupar renovaciones.
- **Rol principal:** sales
- **Columnas:** cliente, servicio, categoría, proveedor, vencimiento comercial, precio, factura generada, estado de pago.
- **Filtros:** rango de fechas, cliente, marca, categoría, proveedor.
- **Acciones:** Agrupar en una factura → `services.subscription.update`; Exportar → `services.service.export`.
- **Vacío / error:** "Nada vence en el rango"; error 409 si alguno ya tiene factura emitida.

### P-SRV-04 · Modalidades de servicio
- **Propósito:** mantener el catálogo de modalidades.
- **Rol principal:** admin
- **Columnas:** modalidad, titular de la cuenta, forma de facturar, qué ve el cliente, servicios que la usan, activa.
- **Filtros:** activa.
- **Acciones:** Crear modalidad → `services.service_modality.create`; Editar → `services.service_modality.update`.
- **Vacío / error:** nunca vacío (seeder); 409 al desactivar una modalidad con servicios activos (se permite, pero se advierte).

### P-SRV-05 · Interruptores de acciones del cliente
- **Propósito:** activar o desactivar acciones del panel del cliente a nivel general y por cliente.
- **Rol principal:** admin
- **Columnas:** acción, estado general, clientes con sobrescritura (activado/desactivado), último cambio.
- **Filtros:** acción, cliente.
- **Acciones:** Cambiar estado general → `settings.setting.update`; Activar/desactivar por cliente → `services.customer_action_flag.update`.
- **Vacío / error:** confirmación al activar "cambiar DNS" o "reiniciar servidor" con texto del impacto; error de carga con reintento.

### P-SRV-06 · Bajas pendientes de aprobación
- **Propósito:** aprobar o rechazar las terminaciones propuestas tras la suspensión.
- **Rol principal:** admin
- **Columnas:** servicio, cliente, suspendido desde, días suspendido, deuda, último respaldo registrado, recursos afectados.
- **Filtros:** marca, producto.
- **Acciones:** Aprobar terminación → `services.service.terminate`; Rechazar y mantener suspendido → `services.service.terminate`; Solicitar respaldo → `work.task.create`.
- **Vacío / error:** "No hay bajas pendientes"; aprobar sin respaldo registrado → 422 "Respaldo previo obligatorio".

## 9. Eventos y jobs

- **Emite:** `ServiceCreated`, `ServiceActivated`, `ServiceSuspended`, `ServiceReactivated`, `ServiceCancelled`, `ServiceTerminationProposed`, `ServiceTerminated`, `ServiceHandedOver`, `SubscriptionChanged`, `CustomerActionFlagChanged`.
- **Escucha:** `InvoicePaid` y `PaymentValidated` (BIL) → reactivar; `DunningSuspendDue` (BIL) → suspender; `PaymentPromiseBroken` (BIL) → suspender; `OrderActivated` (ORD) → activar; `AccountHandoverCompleted` (CTR) → entregado; `ContractSigned` (CTR) → habilitar activación.
- **Jobs:** `SuspendOverdueServices` (diario); `ProposeTerminations` (diario).

## 10. Integraciones y conectores

- Usa por interfaz los conectores de hosting/servidor (`suspend`, `unsuspend`) a través de INV; sin capacidad, crea tarea manual en WRK.
- Correo de bienvenida por AUT con enlace de un solo uso de VLT.

## 11. Ajustes administrables

- `services.suspension.days_after_due` (1)
- `services.termination.days_after_suspension` (10)
- `services.terminate_requires_approval` (true)
- `services.reactivation.auto_on_payment` (true)
- `services.suspension.exempt` (nivel cliente o producto)
- `portal.show_provider_name` (nivel cliente)
- `portal.actions.dns_change.enabled`, `portal.actions.server_reboot.enabled`, `portal.actions.cpanel_login.enabled`, `portal.actions.usage_view.enabled`

## 12. Historias del backlog

- Alta de servicio contratado
- Suscripciones y próxima facturación
- Panel de renovaciones
- Estados del servicio con historial
- Modalidades de servicio configurables
- Interruptores de acciones del cliente
- Proveedor oculto por defecto
- Suspensión al terminar el plazo
- Terminación tras suspensión
- Reactivación tras pago y clientes exentos
- Correo de bienvenida al activar
- Baja definitiva y eliminación segura
- Campos propios del servicio con tipos validados
- Entrega con tareas plantilla y contrato obligatorio

## 13. Criterios de terminado y pruebas obligatorias

- Transición inválida (por ejemplo `terminated → active`) → 409 con `code` estable.
- Un servicio con factura vencida ayer se suspende hoy; con compromiso de pago vigente no se suspende; con cliente exento no se suspende; un dominio nunca se suspende.
- Un pago reportado con comprobante no reactiva el servicio hasta ser validado (prueba obligatoria del kit).
- Terminación sin respaldo previo → 422; sin aprobación del administrador no ocurre.
- Un servicio "requiere contrato" sin contrato `signed_active` no puede pasar a `active`.
- Cada transición deja fila en `service_status_history` y en `audit_events`.
- Activar un interruptor queda en auditoría.
- Un servicio de tipo personalizado no se activa con campos obligatorios vacíos (422); un valor de otro tipo o fuera de las opciones → rechazado; al activarse crea sus tareas de entrega y su componente del mapa.

## 14. Preguntas abiertas

- Si una entrega de cuenta continúa como "administración en cuenta del cliente", ¿se crea un servicio nuevo o se cambia la modalidad del existente? El kit dice que "continúa" sin fijar el modelo (derivada; esta especificación propone un servicio nuevo para conservar el historial del entregado).

## Anexo: nombres fuera del contrato

- Columnas `services.show_provider` y `services.label` (etiqueta visible al cliente).
- Valores de `customer_action_flags.action`: `cpanel_login`, `usage_view`, `dns_change`, `server_reboot`.
- Tabla `service_field_values`, permiso `services.service_field_value.*` y endpoints `GET` y `PUT /admin/services/{id}/field-values` (docs/00 §26).
