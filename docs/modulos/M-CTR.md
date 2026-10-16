# M-CTR · Contracts (plantillas, cláusulas, contratos, versiones, firmas y entregas de cuenta)

> Módulo de código `app/Modules/Contracts` · clave de permiso `contracts` · código `CTR`.
> Fuente: `docs/00-requerimientos.md` secciones 4, 20 (refacturación y entrega de cuenta), 21 (contratos), 24 (contratos editables) y 27 (editor de textos enriquecido); contrato común de nombres.

## 1. Propósito y bloque

Redacta contratos dentro del sistema desde plantillas por tipo de servicio y marca con variables y cláusulas reutilizables, los lleva por revisión, aprobación del administrador, envío y firma, y los bloquea una vez firmados (los cambios van por adenda). También gestiona las entregas de cuenta al final de un periodo con su acta firmada.

- **Bloque:** D. Ventas.
- **Depende de:** SAL (cotizaciones), CUS, CAT, BRD, CFG, IDN.
- **Dependen de él:** SRV y ORD (no se activa sin contrato vigente), BIL (porcentaje de administración y mínimo por contrato), CLD (autorización cloud), PRT (contratos y documentos del cliente).

## 2. Alcance

**Incluye**
- Plantillas por tipo de servicio y marca en el editor de texto enriquecido común (AUT, docs/00 §27: negrita, cursiva, listas, enlaces, tablas, imágenes propias, variables insertables y vista previa), con variables: cliente, RUC o documento, servicios, montos, moneda, porcentaje de administración, plazos, SLA, fechas. El HTML se guarda saneado; las plantillas y las cláusulas guardan su historial en `rich_text_versions` y los contratos en `contract_versions`.
- Biblioteca de cláusulas reutilizables: confidencialidad, SLA, impuestos fuera de Perú, recargo por mora, entrega de cuenta, autorización de acceso cloud.
- Borrador con edición libre, historial de cambios y comentarios internos.
- Aprobación del administrador antes de enviar; envío al cliente.
- Firma: subir el contrato firmado (escaneado o con firma digital) o integrar un servicio de firma electrónica a elegir; pasa a vigente.
- Bloqueo del firmado; adendas como nuevas versiones enlazadas.
- Condiciones comerciales por contrato: porcentaje de administración y mínimo mensual opcional, sobrescrituras de ajustes (nivel contrato).
- Avisos de vencimiento administrables; alerta de contrato por finalizar; reporte de servicios activos sin contrato.
- Registro de aceptación de términos (usuario, fecha, IP y versión del documento).
- Entregas de cuenta al finalizar el periodo con lista de verificación y acta firmada.

**No incluye**
- Generación de facturas (BIL).
- Ejecución técnica de cambio de titular o retiro de accesos en el proveedor (tareas de WRK y VLT).

## 3. Entidades

| Tabla | Campos clave | Notas |
|---|---|---|
| `contract_templates` | brand_id, product_category_id, name, locale, body (texto enriquecido con variables), clause_ids, is_active | |
| `contract_clauses` | code, title, body, locale, category, is_active | Biblioteca de documentación |
| `contracts` | number, customer_id, brand_id, contract_template_id, quote_id, status, starts_on, ends_on, signed_at, management_fee_percent, management_fee_min_minor, currency, current_version, kind (`contract`/`terms`) | Adendas como versiones |
| `contract_versions` | contract_id, version_number, body, variables_snapshot (jsonb), file_id, created_by, locked_at, change_summary | Inmutable al firmar |
| `contract_comments` | contract_id, contract_version_id, body, created_by, resolved_at | Internos |
| `contract_signatures` | contract_version_id, method (`scanned_upload`/`digital_certificate`/`esign_provider`), signer_name, signer_email, user_id, ip, signed_at, file_id, provider_reference | También aceptación de términos |
| `account_handovers` | service_id, cloud_account_id, contract_id, status, scheduled_for, checklist (jsonb: cambio de titular, cambio de medio de pago, retiro de accesos, rotación de credenciales, acta), act_file_id, completed_at, continue_as_managed | |

## 4. Casos de uso y flujos

1. **Crear desde cotización:** la cotización aceptada se convierte en contrato con plantilla, variables y líneas sin volver a digitar.
2. **Editar borrador:** documentación edita, agrega cláusulas, comenta internamente; cada guardado crea versión.
3. **Enviar a revisión** (`in_review`) → **aprobar** (admin, `contracts.contract.approve`) → **enviar** al cliente (`sent`).
4. **Firmar:** subir el archivo firmado o recibir el webhook del servicio de firma → `signed_active`; la versión queda bloqueada; se emite `ContractSigned` y los servicios "requiere contrato" pueden activarse.
5. **Adenda:** sobre un contrato vigente se crea un contrato `kind = addendum` enlazado, con su propio ciclo de aprobación y firma.
6. **Vencimiento:** avisos según `contracts.expiry_notice_days`; al pasar `ends_at` sin renovación → `expired`.
7. **Aceptación de términos:** el cliente acepta en el portal; se registra usuario, fecha, IP y versión.
8. **Entrega de cuenta:** antes del fin del periodo se avisa y se abre el flujo: lista de verificación (cambio de titular y medio de pago, retiro de accesos de la empresa, rotación de credenciales, acta firmada) → `completed` → el servicio pasa a `handed_over`.

## 5. Reglas de negocio clave

Un contrato firmado no se edita; los cambios se hacen con adenda enlazada como nueva versión. El administrador aprueba antes de enviar. Un servicio marcado "requiere contrato" no se activa hasta que su contrato esté `signed_active`. El porcentaje de administración se define por contrato, se calcula sobre el monto del proveedor antes de impuestos y admite mínimo mensual. Los comentarios internos nunca se muestran al cliente. El acta de entrega firmada es obligatoria para completar una entrega de cuenta. La aceptación de términos guarda la versión exacta aceptada.

## 6. Estados

- `contracts.status`: `draft`, `in_review`, `approved`, `sent`, `signed_active`, `expired`, `terminated`.
  - `draft → in_review → approved → sent → signed_active → expired|terminated`; `in_review → draft` (devuelto).
- `account_handovers.status`: `scheduled`, `in_progress`, `completed`.

## 7. Permisos

| Código | Rol por defecto |
|---|---|
| `contracts.contract.view` | admin, documentation, sales, finance; cliente sobre los suyos (versión firmada o enviada) |
| `contracts.contract.create` / `update` / `export` | admin, documentation, sales (crear desde cotización) |
| `contracts.contract.approve` | admin |
| `contracts.contract.delete` (solo borradores) | admin, documentation |
| `contracts.contract_template.view` / `create` / `update` | admin, documentation |
| `contracts.contract_clause.view` / `create` / `update` | admin, documentation |
| `contracts.contract_signature.create` | admin, documentation; cliente (aceptación de términos) |
| `contracts.account_handover.view` / `create` / `update` | admin, documentation, support |

## 8. Pantallas

### P-CTR-01 · Contratos
- **Propósito:** listar contratos, adendas y su vigencia.
- **Rol principal:** documentation
- **Columnas:** número, cliente, marca, tipo (contrato/adenda/términos), estado, inicio, fin, días para vencer, servicios, porcentaje de administración.
- **Filtros:** estado, marca, por vencer en N días, cliente, tipo.
- **Acciones:** Nuevo contrato → `contracts.contract.create`; Exportar → `contracts.contract.export`.
- **Vacío / error:** vacío con botón crear; error de carga con reintento.

### P-CTR-02 · Editor de contrato
- **Propósito:** redactar, comentar, aprobar, enviar y registrar la firma.
- **Rol principal:** documentation
- **Campos:** cliente, plantilla, variables resueltas, cuerpo enriquecido, cláusulas insertadas, condiciones (porcentaje, mínimo, moneda, fechas), servicios cubiertos, comentarios internos, historial de versiones con comparación, firmas.
- **Filtros:** versión.
- **Acciones:** Guardar versión → `contracts.contract.update`; Enviar a revisión → `contracts.contract.update`; Aprobar → `contracts.contract.approve`; Devolver a borrador → `contracts.contract.approve`; Enviar al cliente → `contracts.contract.update`; Registrar firma (subir archivo) → `contracts.contract_signature.create`; Crear adenda → `contracts.contract.create`; Terminar → `contracts.contract.update`.
- **Vacío / error:** contrato firmado en solo lectura con botón "Crear adenda"; variable sin valor resaltada e impide enviar; 409 si otra persona guardó una versión más nueva.

### P-CTR-03 · Plantillas de contrato
- **Propósito:** mantener plantillas por tipo de servicio, marca e idioma.
- **Rol principal:** documentation
- **Columnas:** plantilla, marca, tipo de servicio, idioma, cláusulas, contratos que la usan, activa.
- **Filtros:** marca, tipo de servicio, idioma.
- **Acciones:** Crear plantilla → `contracts.contract_template.create`; Editar con el editor enriquecido → `contracts.contract_template.update`; Vista previa con cliente de ejemplo → `contracts.contract_template.view`; Ver historial → `automation.rich_text_version.view`; Restaurar versión → `automation.rich_text_version.create`.
- **Vacío / error:** vacío con botón crear; 422 si usa una variable no documentada.

### P-CTR-04 · Biblioteca de cláusulas
- **Propósito:** administrar cláusulas reutilizables.
- **Rol principal:** documentation
- **Columnas:** código, título, categoría, idioma, plantillas que la usan, activa.
- **Filtros:** categoría, idioma.
- **Acciones:** Crear cláusula → `contracts.contract_clause.create`; Editar con el editor enriquecido → `contracts.contract_clause.update`; Ver historial → `automation.rich_text_version.view`.
- **Vacío / error:** vacío con las seis cláusulas sugeridas del kit; editar una cláusula no altera contratos ya firmados (aviso).

### P-CTR-05 · Entregas de cuenta
- **Propósito:** traspasar cuentas al cliente al final del periodo de forma ordenada.
- **Rol principal:** support
- **Columnas:** cliente, servicio o cuenta cloud, fecha programada, estado, avance de la lista de verificación, acta.
- **Filtros:** estado, fecha.
- **Acciones:** Programar entrega → `contracts.account_handover.create`; Marcar paso completado → `contracts.account_handover.update`; Crear tareas de rotación → `work.task.create`; Subir acta firmada y completar → `contracts.account_handover.update`.
- **Vacío / error:** completar sin acta o con pasos pendientes → 422; "No hay entregas programadas".

### P-CTR-06 · Servicios activos sin contrato
- **Propósito:** detectar servicios que operan sin contrato vigente.
- **Rol principal:** documentation
- **Columnas:** cliente, servicio, producto, requiere contrato, estado del servicio, contrato (si existe) y su estado.
- **Filtros:** requiere contrato, marca.
- **Acciones:** Crear contrato → `contracts.contract.create`; Crear tarea → `work.task.create`; Exportar → `contracts.contract.export`.
- **Vacío / error:** "Todos los servicios activos tienen contrato"; error de carga con reintento.

## 9. Eventos y jobs

- **Emite:** `ContractSubmittedForReview`, `ContractApproved`, `ContractSent`, `ContractSigned`, `ContractExpiring`, `ContractExpired`, `TermsAccepted`, `AccountHandoverScheduled`, `AccountHandoverCompleted`.
- **Escucha:** `QuoteAccepted` (SAL) para crear borrador; `CloudAccountPeriodEnding` (CLD) para programar entrega; webhook del servicio de firma.
- **Jobs:** `NotifyContractExpiry` (diario); `ExpireContracts` (diario).

## 10. Integraciones y conectores

- Servicio de firma electrónica (a elegir), webhook en `/api/v1/webhooks/<proveedor>`.
- Generación de PDF por plantilla de la marca.

## 11. Ajustes administrables

- `contracts.expiry_notice_days`
- `contracts.account_handover.notice_days`
- Nivel `contract` de todos los ajustes que lo admiten (cobranza, suspensión, recargo por mora, SLA).

## 12. Historias del backlog

- Contratos, adendas y renovaciones
- Registro de aceptación de términos
- Plantillas de contrato con variables
- Biblioteca de cláusulas
- Borrador editable con historial
- Aprobación y envío
- Firma y bloqueo
- Avisos de vencimiento de contratos
- Entrega de cuenta al finalizar el periodo
- Conversión de cotización a contrato y pedido

Épica "Editor de textos enriquecido" (lado de CTR):
- Editor enriquecido en contratos, documentos legales y ayuda

## 13. Criterios de terminado y pruebas obligatorias

- Editar un contrato `signed_active` → 409; crear adenda genera contrato enlazado con versión nueva.
- Enviar sin aprobación → 409; aprobar sin `contracts.contract.approve` → 403.
- Servicio "requiere contrato" no se activa con contrato en `sent`; sí con `signed_active`.
- La API del portal no devuelve `contract_comments`.
- Aceptación de términos guarda usuario, fecha, IP y versión.
- Entrega de cuenta sin acta → 422; al completarla el servicio queda `handed_over` con historial intacto.
- Una plantilla o cláusula con `<script>`, atributos de evento o enlaces `javascript:` se guarda saneada; cada guardado crea una versión en `rich_text_versions`; el PDF del contrato usa el HTML saneado.

## 14. Preguntas abiertas

- Servicio de firma electrónica a integrar (docs/00, sección 14).

## Anexo: nombres fuera del contrato

- Columnas `contracts.kind`, `contracts.management_fee_percent`, `contracts.management_fee_min_minor`; `contract_signatures.method`.
