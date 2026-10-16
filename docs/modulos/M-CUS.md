# M-CUS · Customers (clientes, contactos, consentimientos y ficha 360°)

> Módulo de código `app/Modules/Customers` · clave de permiso `customers` · código `CUS`.
> Fuente: `docs/00-requerimientos.md` secciones 4, 5, 8 (privacidad), 13 (migración), 21, 22 (#9) y 24 (consentimiento); contrato común de nombres.

## 1. Propósito y bloque

Mantiene la cartera única de clientes (personas y empresas de cualquier país), sus contactos con rol y acceso al portal, y sus consentimientos de comunicación. Ofrece la ficha 360° que reúne en una pantalla todo lo del cliente, leyendo de los demás módulos por sus interfaces públicas.

- **Bloque:** B. Núcleo comercial.
- **Depende de:** IDN, CFG, BRD.
- **Dependen de él:** SAL, SRV, MAP, DOM, BIL, HLP, CTR, ORD, PRT y casi todos los demás.

## 2. Alcance

**Incluye**
- Alta y edición de clientes con validación del documento según tipo y país (RUC, DNI, NIF, RFC, otro), moneda, idioma, zona horaria, marca de origen, responsable de cuenta y preferencias de facturación (consolidada o separada, gravado o exportación).
- Detección de duplicados antes de guardar (documento fiscal, correo, nombre normalizado) y fusión manual que conserva historial.
- Contactos con rol (técnico, administrativo, facturación, autorizado), acceso opcional al portal con rol `customer_admin` o `customer_user`.
- Consentimiento de comunicaciones comerciales por contacto; una baja se respeta en todos los canales.
- Notas internas del cliente.
- Ficha 360° con pestañas: servicios, dominios, infraestructura, facturas, pagos, tickets, tareas, contratos, documentos, avisos enviados e historial; rentabilidad solo con permiso.
- Solicitudes de privacidad del titular: exportación de sus datos y eliminación con retención legal aplicada.
- Campos personalizados y etiquetas en clientes (definiciones en IDN).

**No incluye**
- El asistente genérico de importación (AUT); CUS aporta las plantillas CSV de clientes y contactos, la validación por fila y la deduplicación.
- Prospectos (SAL). Un prospecto ganado se convierte en cliente llamando a la interfaz de CUS.
- Exención de suspensión: es un ajuste (`services.suspension.exempt`, nivel cliente) que marca el administrador desde la ficha.

## 3. Entidades

| Tabla | Campos clave | Notas |
|---|---|---|
| `customers` | code (`CLI-000123`), type (`company`/`individual`), legal_name, trade_name, tax_id_type, tax_id, country, currency, locale, timezone, status, origin_brand_id, account_manager_id, invoice_consolidation (`per_service`/`consolidated`), tax_treatment (`taxed`/`export`), is_withholding_agent, merged_into_id, custom, deleted_at | Único por (organization_id, tax_id_type, tax_id) entre no borrados |
| `contacts` | customer_id, name, email, phone, roles (array: `technical`/`administrative`/`billing`/`authorized`), user_id, locale, is_primary, deleted_at | Acceso al portal por contacto |
| `communication_consents` | contact_id, channel (`all`/`email`/`whatsapp`/`sms`/`phone`), purpose (`marketing`), granted, source, recorded_at, evidence | Solo se agrega; la última fila manda |
| `customer_notes` | customer_id, body, is_pinned, created_by | Nunca viajan al portal |

## 4. Casos de uso y flujos

1. **Alta de cliente:** ventas completa el formulario; al salir del campo documento se consulta duplicados y se muestran coincidencias; al guardar se asigna `code` correlativo y se emite `CustomerCreated`.
2. **Agregar contacto con acceso al portal:** se marca "dar acceso", se elige rol de portal; IDN crea el usuario y envía invitación.
3. **Fusionar duplicados:** se eligen dos clientes, se decide campo por campo cuál conservar; servicios, facturas, tickets, contactos y documentos pasan al cliente sobreviviente; el absorbido queda con `merged_into_id` y baja lógica.
4. **Consultar la ficha 360°:** cada pestaña consulta la interfaz pública del módulo dueño (SRV, DOM, INV, BIL, HLP, WRK, CTR, AUT, FIN).
5. **Registrar baja de comunicaciones:** desde el portal, por enlace de baja o por webhook de Elastic Email; se agrega una fila de consentimiento `granted = false` y SAL/AUT la respetan en todos los canales.
6. **Solicitud de privacidad:** se exporta el paquete de datos del titular (cola de AUT) o se ejecuta la eliminación: anonimiza contactos y datos personales que no tengan retención legal vigente; los comprobantes fiscales se conservan.
7. **Importación desde Excel:** plantillas de clientes y contactos con vista previa, validación fila por fila, reporte de errores descargable y propuesta de duplicados para fusión manual.

## 5. Reglas de negocio clave

Un cliente es único en todo el sistema y puede tener servicios de varias marcas. El documento se valida según tipo y país; el RUC peruano valida dígito verificador. Un cambio de datos fiscales (razón social, documento, dirección fiscal, tratamiento tributario) queda en auditoría con valor anterior y nuevo, venga del panel o del portal. Las notas internas, la rentabilidad y el responsable interno nunca viajan en la API del portal. La fusión conserva todo el historial y no se puede deshacer automáticamente, por eso pide confirmación escribiendo el código del cliente absorbido. La eliminación por privacidad respeta la retención legal: lo que deba conservarse se anonimiza en lugar de borrarse. Los avisos se dirigen al rol de contacto que corresponde al tipo de aviso (facturación, técnico, administrativo).

## 6. Estados

- `customers.status`: ver anexo (valores agregados). El contrato no fija estados de cliente.

## 7. Permisos

| Código | Rol por defecto |
|---|---|
| `customers.customer.view` | admin, sales, finance, support, documentation (lectura) |
| `customers.customer.create` / `update` | admin, sales |
| `customers.customer.delete` | admin |
| `customers.customer.export` | admin, sales |
| `customers.contact.view` / `create` / `update` / `delete` | admin, sales (en el portal, `customer_admin` usa `portal.contact.*`) |
| `customers.communication_consent.view` / `update` | admin, sales; el propio contacto en el portal |
| `customers.customer_note.view` / `create` | admin, sales, finance, support |

## 8. Pantallas

### P-CUS-01 · Clientes
- **Propósito:** buscar y filtrar la cartera.
- **Rol principal:** sales
- **Columnas:** código, nombre comercial, razón social, documento, país, marca de origen, responsable, servicios activos, deuda vencida, estado, etiquetas.
- **Filtros:** marca, país, responsable, estado, con deuda vencida, etiqueta, campos personalizados filtrables; filtros guardados.
- **Acciones:** Crear cliente → `customers.customer.create`; Exportar → `customers.customer.export`; Fusionar seleccionados → `customers.customer.update`.
- **Vacío / error:** vacío con botones "Crear cliente" e "Importar" (este último con `automation.import.create`); error de carga con reintento.

### P-CUS-02 · Formulario de cliente
- **Propósito:** dar de alta o editar un cliente con detección de duplicados.
- **Rol principal:** sales
- **Campos:** tipo, documento (tipo y número), país, razón social, nombre comercial, moneda, idioma, zona horaria, marca de origen, responsable, modo de facturación, gravado o exportación, agente de retención, campos personalizados, etiquetas.
- **Filtros:** no aplica.
- **Acciones:** Guardar → `customers.customer.create` o `customers.customer.update`; Abrir posible duplicado → `customers.customer.view`.
- **Vacío / error:** panel de posibles duplicados con coincidencia por documento, correo y nombre; 422 por campo; aviso de cambios sin guardar.

### P-CUS-03 · Ficha 360° del cliente
- **Propósito:** ver todo lo del cliente en una pantalla y saltar al detalle.
- **Rol principal:** support
- **Campos:** cabecera (código, nombre, marca, responsable, saldo, estado, exento de suspensión); pestañas: resumen, servicios, proyectos y mapa, dominios, infraestructura, facturas, pagos, tickets, tareas, contratos, documentos, contactos, avisos enviados, notas, rentabilidad, historial.
- **Filtros:** por pestaña (estado, fechas).
- **Acciones:** Editar cliente → `customers.customer.update`; Agregar nota → `customers.customer_note.create`; Nuevo ticket → `helpdesk.ticket.create`; Nuevo pedido → `orders.order.create`; Estado de cuenta PDF → `billing.invoice.view`; Marcar exento de suspensión → `settings.setting.update`; Generar ficha de traspaso → `service_map.handover_document.create`.
- **Vacío / error:** cada pestaña con su estado vacío ("Sin dominios registrados" + acción de alta si hay permiso); pestaña rentabilidad oculta sin `finance.cost.view`; 404 si el cliente fue fusionado (redirige al sobreviviente).

### P-CUS-04 · Contactos y usuarios del portal
- **Propósito:** administrar contactos, sus roles y su acceso al portal.
- **Rol principal:** sales
- **Columnas:** nombre, correo, teléfono, roles de contacto, acceso al portal (rol), MFA activo, consentimiento comercial, último acceso.
- **Filtros:** rol de contacto, con acceso al portal.
- **Acciones:** Agregar contacto → `customers.contact.create`; Editar → `customers.contact.update`; Dar o quitar acceso al portal → `customers.contact.update`; Reenviar invitación → `customers.contact.update`; Eliminar → `customers.contact.delete`.
- **Vacío / error:** aviso si no hay contacto de facturación (los avisos de cobranza no tendrían destinatario); 422 si el correo ya es usuario de otra organización.

### P-CUS-05 · Fusión de clientes duplicados
- **Propósito:** unir dos registros del mismo cliente conservando el historial.
- **Rol principal:** admin
- **Campos:** comparación lado a lado campo por campo con selector, conteo de servicios, facturas, tickets y contactos que se moverán.
- **Filtros:** no aplica.
- **Acciones:** Confirmar fusión (escribiendo el código del absorbido) → `customers.customer.update`.
- **Vacío / error:** 409 si uno de los dos ya fue fusionado; 422 si tienen monedas de facturación distintas con facturas abiertas (se pide resolver primero).

### P-CUS-06 · Privacidad del titular
- **Propósito:** atender solicitudes de acceso y eliminación de datos personales.
- **Rol principal:** admin
- **Campos:** titular (contacto o cliente persona), tipo de solicitud, datos alcanzados, retención legal aplicable por tipo de dato, resultado.
- **Filtros:** estado de la solicitud (vía ticket enlazado).
- **Acciones:** Exportar datos del titular → `customers.customer.export`; Ejecutar eliminación/anonimización → `customers.customer.delete`.
- **Vacío / error:** advertencia de qué datos se conservarán por obligación legal; 409 si el cliente tiene deuda o servicios activos.

## 9. Eventos y jobs

- **Emite:** `CustomerCreated`, `CustomerUpdated`, `CustomerFiscalDataChanged`, `CustomersMerged`, `ContactPortalAccessGranted`, `ContactRemoved`, `CommunicationConsentChanged`, `PersonalDataErased`.
- **Escucha:** `LeadWon` (SAL) para crear el cliente desde el prospecto; `MailingUnsubscribed` (SAL, desde Elastic Email) para registrar la baja.
- **Jobs:** ninguno propio; la exportación de datos del titular corre en la cola `default` vía AUT.

## 10. Integraciones y conectores

- Ninguno directo. Recibe bajas de Elastic Email a través de SAL/AUT.

## 11. Ajustes administrables

- `services.suspension.exempt` (nivel cliente; lo edita el administrador desde la ficha).
- `billing.invoice_consolidation` (nivel cliente).
- `billing.auto_apply_credit_balance` (nivel cliente).
- `portal.show_provider_name` (nivel cliente).
- `system.retention.*` (retención de clientes inactivos y datos personales).

## 12. Historias del backlog

- Alta y edición de clientes
- Contactos y usuarios de la organización
- Ficha 360 del cliente
- Importación y deduplicación de clientes
- Etiquetas y campos personalizados
- Consentimiento de comunicaciones
- Privacidad y solicitudes de datos personales
- Destinatarios por tipo de aviso

## 13. Criterios de terminado y pruebas obligatorias

- Alta con RUC inválido → 422; con documento ya registrado → muestra duplicado y no crea un segundo cliente sin confirmación.
- Fusión: servicios, facturas, tickets y contactos del absorbido quedan en el sobreviviente; el historial de auditoría de ambos sigue consultable.
- La API del portal para el cliente no devuelve `customer_notes`, `account_manager_id` ni datos de rentabilidad (prueba de contrato de respuesta).
- Un cambio fiscal desde el portal queda en `audit_events` con valor anterior y nuevo.
- Una baja registrada en un canal hace que SAL y AUT no envíen comunicaciones comerciales por ningún canal a ese contacto (los avisos transaccionales sí se envían).
- Importación de 400 clientes de prueba con 5 filas inválidas: se importan las válidas y el reporte descargable lista las 5 con su error.
- Eliminación por privacidad conserva las facturas emitidas y anonimiza el contacto.

## 14. Preguntas abiertas

- Plazos de retención de datos personales por país (docs/00, sección 14), necesarios para la eliminación por privacidad y la retención de clientes inactivos.

## Anexo: nombres fuera del contrato

- `customers.status`: `active`, `inactive`.
- Columnas agregadas a `customers`: `billing_mode`, `tax_treatment` (reusa los valores de `invoices.tax_treatment`), `is_withholding_agent`, `merged_into_id`.
