# M-PRV · Providers (proveedores, cuentas de proveedor y contactos)

> Módulo de código `app/Modules/Providers` · clave de permiso `providers` · código `PRV`.
> Fuente: `docs/00-requerimientos.md` secciones 4, 6, 20 ("Cualquier proveedor") y 23; contrato común de nombres.

## 1. Propósito y bloque

Registra a cualquier proveedor (los actuales y los que traiga el cliente) con sus cuentas independientes, contactos, moneda, costo y renovación. Cada cuenta declara su conector (o modo manual) y guarda sus credenciales en la bóveda.

- **Bloque:** B. Núcleo comercial.
- **Depende de:** VLT (credenciales), IDN, CFG.
- **Dependen de él:** INV, CLD, DOM, MAI, SAA, MAP, BIL (facturas de proveedor), FIN, AUT (sincronizaciones).

## 2. Alcance

**Incluye**
- Ficha de proveedor: datos comerciales, tipo, portal, moneda, SLA, notas internas, origen (propio de la empresa o aportado por el cliente), historial de incidencias y facturas recibidas.
- Múltiples cuentas por proveedor (Reseller 01, 02, 03 y futuras) con etiqueta, conector, capacidades, costo, renovación, estado y referencia a su credencial en la bóveda.
- Prueba de conexión y lectura de capacidades del conector por cuenta.
- Contactos del proveedor.
- Alertas de renovación de cuentas de proveedor y listado de costos próximos a vencer.
- Alta de proveedores nuevos sin programar; un proveedor sin conector funciona completo en modo manual.

**No incluye**
- La implementación de cada conector (bloque H; vive en la carpeta `Infrastructure` del módulo que alimenta).
- Facturas de proveedor para refacturar (`provider_bills`, BIL).
- Registro de costos por periodo (FIN).

## 3. Entidades

| Tabla | Campos clave | Notas |
|---|---|---|
| `providers` | name, type (`hosting`/`server`/`cloud`/`registrar`/`email`/`ssl`/`cdn`/`bulk_email`/`payment`/`einvoice`/`saas`/`dns`/`ai`/`other`), portal_url, cost_currency, sla_notes, origin (`company`/`customer`), customer_id (si es aportado), notes_internal, deleted_at | Datos, no código |
| `provider_accounts` | provider_id, label, connector (código o `manual`), capabilities (jsonb, último resultado), renewal_date, cost_minor, cost_currency, billing_cycle, status, owner (`company`/`customer`), last_tested_at, last_test_result | Una por cuenta real |
| `provider_contacts` | provider_id, name, email, phone, role (`sales`/`support`/`billing`/`technical`) | |

## 4. Casos de uso y flujos

1. **Alta de proveedor nuevo** (por ejemplo IBM Cloud) desde el panel con tipo, moneda, origen y contactos.
2. **Alta de cuenta:** etiqueta, conector o manual, costo y renovación; se crea o vincula el secreto en VLT.
3. **Probar conexión:** el caso de uso pide la credencial a VLT en el momento, llama `testConnection()` y `capabilities()`, y guarda el resultado; nunca guarda la credencial fuera de la bóveda.
4. **Renovaciones:** job diario detecta cuentas con `renewal_date` dentro de `providers.account_renewal_notice_days` y avisa a finanzas.
5. **Consulta de capacidades:** otros módulos llaman `ProviderAccounts::capabilities($id)` antes de ejecutar una operación; si no existe, crean tarea manual en WRK.

## 5. Reglas de negocio clave

Los proveedores son datos: agregar uno no requiere código. Las credenciales salen de la bóveda al momento de la llamada y nunca se guardan en `.env` ni en configuración. Una cuenta con servicios o recursos asociados no se borra; se marca `inactive` o `cancelled`. El nombre del proveedor es interno: no viaja en la API del portal salvo que el ajuste `portal.show_provider_name` lo permita. Las acciones de escritura de un conector se habilitan por cuenta con permiso explícito; por defecto solo lectura.

## 6. Estados

- `provider_accounts.status`: ver anexo (valores agregados).

## 7. Permisos

| Código | Rol por defecto |
|---|---|
| `providers.provider.view` | admin, support, finance |
| `providers.provider.create` / `update` / `delete` / `export` | admin |
| `providers.provider_account.view` | admin, support, finance |
| `providers.provider_account.create` / `update` / `delete` | admin |
| `providers.provider_contact.create` / `update` / `delete` | admin, support |

## 8. Pantallas

### P-PRV-01 · Proveedores
- **Propósito:** listar proveedores propios y aportados por clientes.
- **Rol principal:** admin
- **Columnas:** proveedor, tipo, origen, moneda, cuentas, conector disponible, próxima renovación, costo mensual estimado.
- **Filtros:** tipo, origen, con conector/manual, renovación en N días.
- **Acciones:** Crear proveedor → `providers.provider.create`; Exportar → `providers.provider.export`.
- **Vacío / error:** vacío con botón crear; error de carga con reintento.

### P-PRV-02 · Ficha de proveedor
- **Propósito:** ver todo sobre un proveedor: cuentas, contactos, facturas recibidas e incidencias.
- **Rol principal:** admin
- **Campos:** datos comerciales, portal, moneda, SLA, origen, notas internas; pestañas cuentas, contactos, facturas recibidas (BIL), incidentes (MON), recursos.
- **Filtros:** por pestaña.
- **Acciones:** Editar → `providers.provider.update`; Agregar cuenta → `providers.provider_account.create`; Agregar contacto → `providers.provider_contact.create`; Cargar factura del proveedor → `billing.provider_bill.create`.
- **Vacío / error:** pestañas vacías con su acción; 409 al borrar con cuentas activas.

### P-PRV-03 · Detalle de cuenta de proveedor
- **Propósito:** administrar una cuenta, su conector, sus capacidades y su credencial.
- **Rol principal:** admin
- **Campos:** etiqueta, conector, capacidades (lectura/escritura por operación), credencial (referencia a VLT, nunca valor), costo, ciclo, renovación, titular, estado, última prueba, últimas sincronizaciones.
- **Filtros:** no aplica.
- **Acciones:** Probar conexión → `providers.provider_account.update`; Habilitar escritura por operación (con confirmación) → `providers.provider_account.update`; Sincronizar ahora → `automation.sync_run.create`; Vincular credencial → `vault.secret.update`; Desactivar → `providers.provider_account.update`.
- **Vacío / error:** sin conector muestra "Modo manual: las operaciones crean tareas asistidas"; error de prueba clasificado (credenciales, transitorio, validación, desconocido).

### P-PRV-04 · Renovaciones de proveedores
- **Propósito:** saber qué cuentas y costos de proveedor vencen pronto.
- **Rol principal:** finance
- **Columnas:** proveedor, cuenta, fecha de renovación, días restantes, costo y moneda, servicios que dependen, aviso enviado.
- **Filtros:** rango de fechas, proveedor, tipo.
- **Acciones:** Marcar renovada (nueva fecha) → `providers.provider_account.update`; Crear tarea de pago → `work.task.create`; Exportar → `providers.provider.export`.
- **Vacío / error:** "Nada por renovar en el rango"; error de carga con reintento.

## 9. Eventos y jobs

- **Emite:** `ProviderAccountRenewalDue`, `ProviderAccountTested`, `ProviderAccountWriteEnabled`.
- **Escucha:** `SyncCompleted` (AUT) para actualizar la fecha de última sincronización.
- **Jobs:** `CheckProviderRenewals` (diario).

## 10. Integraciones y conectores

- Contrato `Connector` (docs/00, sección 6): `capabilities()` y `testConnection()` para todos los tipos; las implementaciones concretas pertenecen al bloque H.

## 11. Ajustes administrables

- `providers.account_renewal_notice_days` ([30, 7])

## 12. Historias del backlog

- Ficha de proveedor
- Múltiples cuentas por proveedor
- Alertas de renovación de proveedores
- Alta de cualquier proveedor desde el panel
- Marco de conectores con capacidades

## 13. Criterios de terminado y pruebas obligatorias

- Crear un proveedor nuevo y una cuenta manual no requiere cambios de código y permite registrar componentes, costos y facturas de proveedor.
- La prueba de conexión obtiene la credencial de VLT en el momento; el valor no aparece en logs ni en la respuesta.
- Una cuenta cuya renovación cae en 30 y 7 días genera un aviso en cada umbral, una sola vez.
- La API del portal no devuelve el nombre del proveedor con el ajuste por defecto.

## 14. Preguntas abiertas

- Ninguna propia; las de cada conector están en el módulo que alimenta.

## Anexo: nombres fuera del contrato

- `provider_accounts.status`: `active`, `suspended`, `closed`.
- Columnas `providers.origin` y `provider_accounts.owner` (`company`/`customer`).
