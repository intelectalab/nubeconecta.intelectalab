# M-BIL · Billing (facturas, emisión electrónica, pagos, cobranza, recargos, detracciones y refacturación)

> Módulo de código `app/Modules/Billing` · clave de permiso `billing` · código `BIL`.
> Fuente: `docs/00-requerimientos.md` secciones 4, 7, 10, 11, 20 (refacturación), 21 (medios de pago, facturación electrónica, exportación), 22 (#3, #4, #5, #13) y 23; contrato común de nombres.

## 1. Propósito y bloque

Un solo motor genera todos los documentos (facturas, boletas, notas de crédito y débito) a partir de suscripciones, cargos únicos y facturas de proveedor a refacturar; la emisión fiscal ante SUNAT es un paso posterior y separado. Registra y valida pagos con separación de funciones, ejecuta la cobranza automática configurable y lleva saldos, compromisos, recargos, detracciones y estados de cuenta.

- **Bloque:** E. Facturación y cobro (conectores de PayPal, Global66, pasarela de tarjetas y facturación electrónica en bloque H).
- **Depende de:** B (CUS, CAT, SRV, PRV), D (CTR para porcentaje de administración, ORD), BRD (entidad emisora, series, cuentas), CFG, AUT, IDN.
- **Dependen de él:** SRV (reactivación y suspensión), DOM (renovación tras pago), FIN, DSH, PRT.

## 2. Alcance

**Incluye**
- Generación diaria de borradores de renovación con la anticipación configurada; consolidación por cliente (una por servicio o agrupada por ventana); facturas manuales con líneas libres o de catálogo y cargos únicos y recurrentes combinados.
- Cálculo: prorrateo, descuentos, cupones con vigencia y límite de uso, saldo a favor automático si el cliente lo permite, porcentaje de administración en refacturación, IGV con tasa vigente en `tax_rates` o exportación de servicios si producto y cliente califican.
- Emisión: serie y número del único RUC dentro de una transacción con bloqueo; PDF por marca, entidad e idioma; una factura emitida no se edita.
- Notas de crédito y débito enlazadas que ajustan saldo; reembolsos totales o parciales con solicitud y autorización separadas, ejecutados por API cuando el medio lo permite.
- Emisión electrónica en cola al proveedor autorizado (PSE/OSE), también para clientes del extranjero; XML, CDR y estado fiscal; rechazo con alerta, corrección y reenvío.
- Medios de pago configurables (transferencia, tarjeta de crédito o débito mediante pasarela local, PayPal, Global66 y otros) con comisión porcentual y fija y si se traslada al cliente; recargo mostrado antes de pagar y agregado como línea aparte "Comisión por medio de pago"; comisión real registrada como gasto.
- Pagos: voucher de transferencia (`reported` hasta que finanzas valide), tarjeta de crédito o débito con formulario alojado por la pasarela local (una o varias facturas; validado solo con webhook firmado de pago aprobado e importe coincidente; 3-D Secure; PEN y USD; sin datos de tarjeta en el sistema), PayPal (orden por el saldo, validado solo con webhook de captura e importe coincidente), registro manual; pagos parciales y anticipos repartidos entre facturas; excedente a saldo a favor; retención de IGV registrada como pago parcial; conciliación bancaria por CSV.
- Contracargos de pagos con tarjeta: alerta para finanzas, factura con saldo pendiente, descargos y resultado.
- Conciliación con el reporte de liquidación de la pasarela (API o CSV): comisión real, neto abonado y cruce con el extracto bancario.
- Cobranza automática con secuencia de etapas configurable (se edita en CFG), deduplicada; compromisos de pago que postergan la suspensión; clientes exentos; avisos por correo, portal y WhatsApp.
- Bandeja diaria de cobranza para finanzas.
- Recargo por mora (porcentaje o monto, días de gracia, límite, en nota de débito por defecto o en la siguiente factura; desactivable por cliente o contrato).
- Detracciones solo en facturas nacionales (porcentaje, mínimo, productos, cuenta del Banco de la Nación administrables; leyenda y monto en el comprobante); nota fija en comprobantes de exportación.
- Estado de cuenta en PDF por cliente y antigüedad de deuda por tramos 0-30, 31-60, 61-90 y más de 90.
- Refacturación: carga de factura del proveedor por API o archivo, factura al cliente con importe del proveedor + porcentaje de administración (mínimo opcional) + impuestos, tipo de cambio de la fecha de la factura, factura del proveedor adjunta y visible al cliente; reporte de facturas de proveedor sin refacturar.
- Solo PEN y USD; tipo de cambio SUNAT diario.
- Tres importes separados: facturado, cobrado e ingreso reconocido (el reconocido lo calcula FIN).

**No incluye**
- Guardar tarjetas o cobrar con tarjeta de forma automática o recurrente: cada pago con tarjeta lo inicia el cliente sobre facturas concretas (docs/00 §22).
- Recibir, transmitir o guardar datos de tarjeta: los maneja solo la pasarela (alcance PCI DSS mínimo, `docs/10`).
- Edición de la secuencia de cobranza (pantalla en CFG, datos en BIL).
- Rentabilidad y distribución de costos (FIN).

## 3. Entidades

| Tabla | Campos clave | Notas |
|---|---|---|
| `invoices` | legal_entity_id, brand_id, customer_id, type, series, number, status, fiscal_status, tax_treatment, currency, issue_date, due_date, subtotal_minor, discount_minor, tax_minor, detraction_minor, total_minor, balance_minor, references_invoice_id, pdf_file_id, locale, billing_window_key | Único (legal_entity_id, series, number) |
| `invoice_items` | invoice_id, service_id, subscription_id, product_id, description, period_start, period_end, quantity, unit_price_minor, discount_minor, tax_rate_id, tax_minor, total_minor, kind (`service`/`one_time`/`rebilling`/`payment_surcharge`/`late_fee`/`adjustment`) | |
| `einvoice_submissions` | invoice_id, provider, attempt, status, xml_file_id, cdr_file_id, pdf_file_id, response_code, response_message, sent_at | Un envío por fila |
| `payment_methods` | code, name, kind (`bank_transfer`/`paypal`/`global66`/`card_gateway`/`other`), connector, fee_percent, fee_fixed_minor, fee_currency, pass_to_customer, is_active, instructions (i18n) | |
| `payments` | customer_id, payment_method_id, amount_minor, currency, fee_minor, status, external_id, proof_file_id, reported_by, validated_by, validated_at, rejection_reason, received_at | Único (payment_method_id, external_id) |
| `payment_allocations` | payment_id, invoice_id, amount_minor | Recalcula `balance_minor` |
| `payment_promises` | invoice_id, customer_id, promised_date, amount_minor, status, created_by | |
| `credit_balances` | customer_id, currency, amount_minor, source_type, source_id, invoice_id | Saldos a favor |
| `coupons` | code, discount_type (`percent`/`fixed`), discount_percent, discount_minor, currency, valid_from, valid_until, max_uses, uses_count, product_id | |
| `tax_rates` | code (`IGV`), rate_percent, effective_from, effective_to, country | Vigencia |
| `exchange_rates` | rate_date, base_currency (`USD`), quote_currency (`PEN`), rate, source | Diario SUNAT |
| `provider_bills` | provider_account_id, cloud_account_id, service_id, period_start, period_end, amount_minor, cost_currency, file_id, source (`api`/`upload`), status, rebilled_invoice_id | Base de la refacturación |
| `dunning_sequences` | name, scope_type, scope_id | Nivel general/marca/producto/cliente/contrato |
| `dunning_stages` | dunning_sequence_id, offset_days (negativo antes, 0 el día, positivo después), action (`send_notice`/`create_finance_task`/`suspend_service`), channels, notification_template_code, recipient_contact_role, internal_copy, send_time, non_business_day, is_active | |
| `dunning_events` | invoice_id, dunning_stage_id, scheduled_for, executed_at, status | Único por (invoice_id, dunning_stage_id) |
| `bank_statement_lines` | import_id, bank_account_id, transaction_date, amount_minor, currency, reference, matched_payment_id, status (`unmatched`/`matched`/`difference`) | Conciliación bancaria (tabla agregada) |
| `payment_checkouts` | customer_id, payment_method_id, invoice_ids, amount_minor, surcharge_minor, currency, status (`created`/`approved`/`declined`/`expired`/`cancelled`), external_session_id, external_transaction_id, payment_id, decline_reason, expires_at | Intento de pago con tarjeta (tabla agregada); sin datos de tarjeta |
| `payment_refunds` | payment_id, amount_minor, currency, status (`requested`/`processing`/`succeeded`/`failed`), reason, external_id, credit_note_id, requested_by, authorized_by, authorized_at | Reembolso total o parcial (tabla agregada) |
| `payment_disputes` | payment_id, customer_id, external_id, reason_code, amount_minor, currency, status (`open`/`evidence_submitted`/`won`/`lost`), reported_via (`webhook`/`finance`), respond_by, evidence_file_id, alert_id | Contracargo (tabla agregada) |
| `payment_settlement_lines` | payment_method_id, import_id, sync_run_id, settlement_date, transaction_type (`charge`/`refund`/`chargeback`/`adjustment`), external_id, gross_minor, fee_minor, net_minor, currency, matched_payment_id, bank_statement_line_id, status (`unmatched`/`matched`/`difference`) | Liquidación de la pasarela (tabla agregada) |

## 4. Casos de uso y flujos

1. **Generar renovaciones:** `GenerateRenewalInvoices` diario busca suscripciones con `next_invoice_date` dentro de `billing.invoice_generation_days`; bloqueo por suscripción (`ShouldBeUnique`) y verificación dentro de la transacción; consolida según preferencia del cliente; crea borradores.
2. **Calcular y emitir:** aplicar prorrateo, cupones, saldo a favor, porcentaje de administración (refacturación), IGV o exportación, detracción si aplica; `POST /admin/invoices/{id}/issue` con `Idempotency-Key` asigna número con bloqueo de `document_series` y genera PDF de la marca.
3. **Emisión electrónica:** job en cola `billing` envía al PSE/OSE; guarda XML, CDR y `fiscal_status`; rechazo → alerta, corrección por nota o reenvío.
4. **Pago por voucher:** el cliente (portal) o ventas sube comprobante → pago `reported` (archivo protegido) → aparece en la cola de validación → finanzas valida contra el banco (`validated`) o rechaza con motivo; validar aplica a facturas, recalcula saldos y emite `PaymentValidated`.
5. **Pago con tarjeta:** el cliente elige una o varias facturas de la misma moneda → se muestra el recargo → `portalCreateCardCheckout` crea el intento (`payment_checkouts`) y la sesión en la pasarela → el cliente escribe la tarjeta en el formulario alojado o tokenizado (3-D Secure) → webhook firmado `/api/v1/webhooks/card-gateway` (evento único en `webhook_events`) → si el importe coincide, pago `validated` sin finanzas, aplicado a las facturas, con comisión estimada hasta la liquidación (RN-BIL-058, RN-BIL-059, RN-BIL-063). Rechazo o vencimiento: las facturas siguen pendientes y el cliente puede reintentar con otro intento.
5b. **Pago con PayPal:** el portal crea la orden por el saldo de la factura más el recargo mostrado → el cliente aprueba → webhook de captura completada (firma validada, evento único en `webhook_events`) → si el importe coincide, pago `validated` con `fee_minor` real; línea "Comisión por medio de pago" agregada según configuración.
6. **Pago parcial o a varias facturas:** reparto manual o automático (más antigua primero); excedente a `credit_balances`.
7. **Retención de IGV:** finanzas registra el comprobante de retención como pago parcial y la factura queda saldada.
8. **Cobranza:** `RunDunningSequence` diario programa y ejecuta etapas (avisos 30/15/7/3 días antes, el día, suspensión 1 día después) con `dedupe_key`; respeta exentos y compromisos; la hora en la zona del cliente; día no hábil según regla.
9. **Compromiso de pago:** finanzas registra fecha; la secuencia se pausa hasta esa fecha; si vence sin pago → `broken`, la cobranza continúa y se propone la suspensión.
10. **Reactivación:** factura saldada → `InvoicePaid` → SRV reactiva (si el ajuste lo indica).
11. **Recargo por mora:** pasados los días de gracia, genera nota de débito (o línea en la siguiente factura) con tope; nunca si el cliente o contrato lo desactiva.
12. **Reembolso (total o parcial):** finanzas solicita (`billing.payment.validate`, `POST /admin/payments/{id}/refunds`), el administrador autoriza con MFA reciente (`billing.refund.authorize`) → con pasarela de tarjetas o PayPal, reembolso por API con `Idempotency-Key`; sin API, registro manual con referencia → nota de crédito por cada reembolso; con la suma igual al pago, `refunded` (RN-BIL-060).
13. **Refacturación:** cargar factura del proveedor (API o archivo, importe, moneda, periodo) → generar factura al cliente con porcentaje del contrato (mínimo opcional) sobre el monto antes de impuestos, convertir con tipo de cambio de la fecha, IGV sobre el total, adjuntar sustento visible al cliente.
14. **Conciliación bancaria:** importar extracto CSV → propuesta de coincidencias por importe, fecha y referencia → confirmar o marcar diferencias.
14b. **Conciliación de la liquidación de la pasarela:** `SyncCardGatewaySettlements` (API) o importación CSV → líneas por transacción con bruto, comisión real y neto → coincidencia por id externo con el pago → la comisión real reemplaza la estimada → el neto se cruza con el abono del extracto bancario; pagos sin liquidar después de `billing.card_gateway.settlement_days` quedan como pendientes (RN-BIL-064).
14c. **Contracargo:** webhook de la pasarela (o registro manual) → `payment_disputes` `open`, pago `charged_back`, aplicaciones revertidas y factura con saldo, alerta `chargeback` para finanzas → descargos presentados en la pasarela y registrados → ganado (pago reaplicado) o perdido (la factura sigue en cobranza) (RN-BIL-061, RN-BIL-062).
15. **Estado de cuenta y antigüedad:** PDF por cliente; reporte por tramos.

## 5. Reglas de negocio clave

La factura incluye todo el monto del servicio (también el costo del proveedor cuando se refactura) en una línea por servicio; el detalle del proveedor va como anexo. Una factura emitida no se edita: se corrige con nota de crédito o débito enlazada. La numeración se asigna dentro de una transacción con bloqueo de la serie; nunca se repite ni salta. Solo finanzas (`billing.payment.validate`) pasa un pago a `validated`; un pago reportado nunca reactiva ni renueva. `payments.external_id` es único por medio: un mismo cobro de PayPal no se registra dos veces. El webhook de PayPal valida firma e importe. El pago con tarjeta se valida solo con el webhook firmado de pago aprobado e importe coincidente, sin intervención de finanzas; el sistema nunca recibe ni guarda datos de tarjeta, no guarda tarjetas ni cobra de forma recurrente. Un contracargo deja la factura con saldo pendiente y abre una alerta para finanzas. Los importes nunca se guardan sin moneda; solo PEN y USD en documentos. El IGV se omite solo si producto y cliente califican como exportación (criterio del contador); en exportación se imprime la nota fija y no se aplica detracción. La detracción solo en facturas nacionales según configuración. El recargo por medio de pago se muestra antes de pagar y va como línea aparte. El porcentaje de administración se calcula sobre el monto del proveedor antes de impuestos y el IGV se aplica después sobre el total. No se envía dos veces el mismo aviso (clave evento + destinatario + entidad + periodo). No se suspenden dominios. Solicitar y autorizar reembolso son permisos distintos y autorizar exige MFA reciente. Facturado, cobrado y reconocido se reportan por separado. Ningún plazo, porcentaje ni texto de aviso está en el código.

## 6. Estados

- `invoices.type`: `invoice`, `receipt`, `credit_note`, `debit_note`.
- `invoices.status`: `draft`, `issued`, `partially_paid`, `paid`, `overdue`, `void`.
- `invoices.fiscal_status`: `not_applicable`, `pending`, `accepted`, `rejected`, `voided`.
- `invoices.tax_treatment`: `taxed`, `export`.
- `payments.status`: `reported`, `validated`, `rejected`, `refunded`, `charged_back`. (El docs/00, sección 7 menciona "en validación"; el contrato no lo incluye: la cola de validación muestra los `reported`.)
- `payment_promises.status`: `open`, `kept`, `broken`.
- `payment_checkouts.status`: `created`, `approved`, `declined`, `expired`, `cancelled`.
- `payment_refunds.status`: `requested`, `processing`, `succeeded`, `failed`.
- `payment_disputes.status`: `open`, `evidence_submitted`, `won`, `lost`.
- `payment_settlement_lines.status`: `unmatched`, `matched`, `difference`.
- `einvoice_submissions.status`, `provider_bills.status`, `dunning_events.status`: ver anexo.

## 7. Permisos

| Código | Rol por defecto |
|---|---|
| `billing.invoice.view` | admin, finance, sales, external_accountant; cliente sobre las suyas |
| `billing.invoice.create` / `update` (borradores) | admin, finance |
| `billing.invoice.issue` | admin, finance |
| `billing.invoice.delete` (borrador) | admin, finance |
| `billing.invoice.export` | admin, finance, external_accountant |
| `billing.payment.view` | admin, finance, sales, external_accountant; cliente sobre los suyos |
| `billing.payment.create` (registrar o reportar) | admin, finance, sales; cliente (voucher y pago en línea) |
| `billing.payment.validate` | finance, admin |
| `billing.payment.export` | admin, finance, external_accountant |
| `billing.payment.validate` | admin, finance |
| `billing.refund.authorize` | admin |
| `billing.payment_dispute.view` / `create` / `update` | admin, finance (ver: external_accountant) |
| `billing.payment_promise.create` / `update` | admin, finance |
| `billing.payment_method.view` / `create` / `update` | admin, finance |
| `billing.coupon.view` / `create` / `update` | admin, finance |
| `billing.tax_rate.view` / `update` | admin |
| `billing.exchange_rate.view` / `create` | admin, finance |
| `billing.provider_bill.view` / `create` / `update` | admin, finance |
| `billing.einvoice_submission.view` | admin, finance (reenviar a SUNAT usa `billing.invoice.issue`) |
| `billing.credit_balance.view` / `update` | admin, finance |
| `settings.dunning.update` | admin, finance (secuencia, recargo, detracción) |

## 8. Pantallas

### P-BIL-01 · Bandeja diaria de cobranza
- **Propósito:** que finanzas vea cada mañana qué vence, qué se avisó, quién no pagó y qué se suspende hoy.
- **Rol principal:** finance
- **Columnas:** secciones: vencimientos de los próximos `billing.collections_inbox_days` días, facturas vencidas, avisos enviados hoy (estado de entrega), compromisos que vencen hoy, suspensiones del día, vouchers por validar.
- **Filtros:** marca, moneda, responsable, cliente.
- **Acciones:** Registrar pago → `billing.payment.create`; Validar voucher → `billing.payment.validate`; Registrar compromiso → `billing.payment_promise.create`; Reenviar aviso → `billing.invoice.update`; Ver factura → `billing.invoice.view`.
- **Vacío / error:** cada sección con "Nada pendiente"; error de carga por sección sin bloquear las demás.

### P-BIL-02 · Facturas
- **Propósito:** listar documentos emitidos y borradores.
- **Rol principal:** finance
- **Columnas:** tipo, serie-número, cliente, marca, emisión, vencimiento, moneda, total, saldo, estado, estado fiscal, tratamiento (gravado/exportación).
- **Filtros:** tipo, estado, estado fiscal, marca, moneda, cliente, rango de fechas, vencidas, rechazadas por SUNAT.
- **Acciones:** Nueva factura → `billing.invoice.create`; Emitir seleccionadas → `billing.invoice.issue`; Exportar → `billing.invoice.export`.
- **Vacío / error:** vacío con botón crear; error de carga con reintento.

### P-BIL-03 · Detalle de factura
- **Propósito:** ver líneas, emisión fiscal, pagos, avisos y documentos relacionados.
- **Rol principal:** finance
- **Campos:** cabecera (serie-número, cliente, marca, fechas, estado, estado fiscal), líneas, totales (subtotal, descuento, IGV, detracción, total, saldo), pagos aplicados, notas relacionadas, envíos a SUNAT con XML/CDR, avisos de cobranza (fecha, canal, destinatario, plantilla, estado), compromisos, factura de proveedor adjunta.
- **Filtros:** no aplica.
- **Acciones:** Emitir → `billing.invoice.issue`; Reenviar a SUNAT → `billing.invoice.issue`; Emitir nota de crédito → `billing.invoice.create`; Emitir nota de débito → `billing.invoice.create`; Registrar pago → `billing.payment.create`; Registrar compromiso → `billing.payment_promise.create`; Enviar aviso manual → `billing.invoice.update`; Descargar PDF/XML/CDR → `billing.invoice.view`.
- **Vacío / error:** factura emitida en solo lectura; rechazo fiscal visible con mensaje del proveedor; emitir dos veces → misma respuesta (idempotencia).

### P-BIL-04 · Nueva factura o nota
- **Propósito:** crear factura manual, boleta o nota con líneas libres o de catálogo.
- **Rol principal:** finance
- **Campos:** tipo, cliente, marca, moneda, tratamiento, documento relacionado (para notas), líneas (catálogo o libre, periodo, cantidad, precio, descuento), cupón, aplicar saldo a favor, vista previa de totales con IGV y detracción.
- **Filtros:** no aplica.
- **Acciones:** Guardar borrador → `billing.invoice.create`; Emitir → `billing.invoice.issue`.
- **Vacío / error:** 422 por línea; nota de crédito por más del saldo del documento → 422; cupón vencido o agotado → 422.

### P-BIL-05 · Pagos
- **Propósito:** listar todos los pagos y su estado.
- **Rol principal:** finance
- **Columnas:** fecha, cliente, medio, importe y moneda, comisión (estimada o real), estado, referencia externa, reportado por, validado por, facturas aplicadas.
- **Filtros:** estado (incluido contracargo), medio, moneda, rango de fechas, cliente, sin conciliar, sin liquidar.
- **Acciones:** Registrar pago → `billing.payment.create`; Exportar → `billing.payment.export`.
- **Vacío / error:** vacío con botón registrar; error de carga con reintento.

### P-BIL-06 · Detalle de pago
- **Propósito:** ver aplicaciones, comprobante, conciliación y reembolsos de un pago.
- **Rol principal:** finance
- **Campos:** datos del pago, comprobante (enlace firmado) o intento con tarjeta (sin datos de tarjeta), aplicaciones a facturas, saldo a favor generado, conciliación bancaria y de liquidación, reembolsos (importe, estado, nota de crédito), contracargo.
- **Filtros:** no aplica.
- **Acciones:** Reasignar aplicaciones → `billing.payment.create`; Solicitar reembolso → `billing.payment.validate`; Autorizar reembolso → `billing.refund.authorize`.
- **Vacío / error:** autorizar sin MFA reciente → diálogo TOTP; autorizar el propio pedido de reembolso con el mismo usuario no administrador → 403.

### P-BIL-07 · Registrar pago
- **Propósito:** registrar un depósito, PayPal manual u otro medio con su comprobante.
- **Rol principal:** finance
- **Campos:** cliente, medio, fecha, importe, moneda, referencia, comprobante, comprobante de retención (si aplica), aplicación a facturas abiertas con sugerencia.
- **Filtros:** no aplica.
- **Acciones:** Guardar como reportado → `billing.payment.create`; Guardar y validar → `billing.payment.validate`.
- **Vacío / error:** referencia externa duplicada para el mismo medio → 409; archivo inválido → 422.

### P-BIL-08 · Validación de vouchers
- **Propósito:** cola de pagos reportados que finanzas valida contra el banco.
- **Rol principal:** finance
- **Columnas:** fecha de reporte, cliente, importe y moneda, medio, reportado por (cliente o ventas), comprobante, facturas propuestas, antigüedad.
- **Filtros:** medio, moneda, reportado por.
- **Acciones:** Validar → `billing.payment.validate`; Rechazar con motivo → `billing.payment.validate`; Ver comprobante → `billing.payment.view`.
- **Vacío / error:** "No hay vouchers por validar"; 409 si otro usuario ya lo validó.

### P-BIL-09 · Conciliación bancaria
- **Propósito:** cruzar el extracto del banco con los pagos registrados.
- **Rol principal:** finance
- **Columnas:** línea del extracto (fecha, importe, referencia), coincidencia propuesta, puntaje, estado (conciliada, diferencia, sin pago).
- **Filtros:** cuenta bancaria, periodo, estado.
- **Acciones:** Importar extracto CSV → `billing.payment.create`; Confirmar coincidencia → `billing.payment.validate`; Crear pago desde línea → `billing.payment.create`; Exportar diferencias → `billing.payment.export`.
- **Vacío / error:** CSV con formato inválido → reporte de errores descargable; "Todo conciliado".

### P-BIL-10 · Compromisos de pago
- **Propósito:** seguir las fechas en que los clientes prometen pagar.
- **Rol principal:** finance
- **Columnas:** cliente, factura, monto, fecha comprometida, estado, registrado por, suspensión postergada hasta.
- **Filtros:** estado, vence hoy, vencidos.
- **Acciones:** Registrar compromiso → `billing.payment_promise.create`; Editar → `billing.payment_promise.update`; Marcar incumplido → `billing.payment_promise.update`.
- **Vacío / error:** "Sin compromisos abiertos"; 422 si la fecha es anterior a hoy.

### P-BIL-11 · Facturas de proveedor y refacturación
- **Propósito:** cargar facturas de proveedor y refacturarlas con porcentaje de administración.
- **Rol principal:** finance
- **Columnas:** proveedor y cuenta, cliente/servicio, periodo, importe y moneda, origen (API/archivo), estado (pendiente/refacturada/no refacturable), factura al cliente.
- **Filtros:** proveedor, periodo, estado, sin refacturar.
- **Acciones:** Cargar factura del proveedor → `billing.provider_bill.create`; Generar factura al cliente → `billing.invoice.create`; Marcar no refacturable → `billing.provider_bill.update`; Exportar reporte sin refacturar → `billing.invoice.export`.
- **Vacío / error:** "Sin facturas de proveedor en el periodo"; generar sin contrato con porcentaje definido → 422.

### P-BIL-12 · Estado de cuenta y antigüedad de deuda
- **Propósito:** priorizar la cobranza y entregar estado de cuenta al cliente.
- **Rol principal:** finance
- **Columnas:** cliente, moneda, deuda 0-30, 31-60, 61-90, más de 90, total, saldo a favor, último pago, compromiso abierto.
- **Filtros:** marca, moneda, responsable, tramo.
- **Acciones:** Generar estado de cuenta PDF → `billing.invoice.view`; Enviar al cliente → `billing.invoice.update`; Exportar → `billing.invoice.export`.
- **Vacío / error:** "Sin deuda pendiente"; error de generación de PDF con reintento.

### P-BIL-13 · Medios de pago
- **Propósito:** configurar medios con su comisión y traslado al cliente.
- **Rol principal:** finance
- **Columnas:** medio, tipo, conector, comisión % y fija, traslada al cliente, instrucciones, activo.
- **Filtros:** activo.
- **Acciones:** Crear medio → `billing.payment_method.create`; Editar → `billing.payment_method.update`; Desactivar → `billing.payment_method.update`.
- **Vacío / error:** nunca vacío (seeder: transferencia, PayPal, Global66 y tarjeta mediante pasarela local, esta inactiva mientras `billing.card_gateway.provider` no esté definido); 422 si comisión negativa.

### P-BIL-14 · Impuestos y tipo de cambio
- **Propósito:** mantener tasas de IGV con vigencia y ver el tipo de cambio diario.
- **Rol principal:** finance
- **Columnas:** tasas (código, tasa, vigencia); tipo de cambio (fecha, compra, venta, fuente).
- **Filtros:** rango de fechas.
- **Acciones:** Agregar tasa con vigencia → `billing.tax_rate.update`; Corregir tipo de cambio del día → `billing.exchange_rate.create`; Actualizar ahora → `billing.exchange_rate.create`.
- **Vacío / error:** día sin tipo de cambio resaltado (los reportes usan el último disponible e indican la fecha); vigencias superpuestas → 422.

### P-BIL-15 · Cupones y saldos a favor
- **Propósito:** administrar cupones y ver saldos a favor por cliente.
- **Rol principal:** finance
- **Columnas:** cupones (código, tipo, valor, vigencia, usos/límite, productos); saldos (cliente, moneda, monto, origen, aplicado en).
- **Filtros:** vigentes, cliente, moneda.
- **Acciones:** Crear cupón → `billing.coupon.create`; Editar → `billing.coupon.update`; Ajustar saldo a favor → `billing.credit_balance.update`.
- **Vacío / error:** "Sin cupones vigentes"; ajuste de saldo exige motivo y queda en auditoría.

### P-BIL-16 · Contracargos
- **Propósito:** atender a tiempo los contracargos de pagos con tarjeta.
- **Rol principal:** finance
- **Columnas:** fecha, cliente, pago y facturas afectadas, importe y moneda, motivo, fecha límite de descargos, estado, alerta.
- **Filtros:** estado, vence pronto, cliente, moneda.
- **Acciones:** Registrar contracargo → `billing.payment_dispute.create`; Registrar descargos → `billing.payment_dispute.update`; Cerrar como ganado o perdido → `billing.payment_dispute.update`; Ver pago → `billing.payment.view`.
- **Vacío / error:** "Sin contracargos abiertos"; registrar uno ya informado por webhook → 409; descargos sin archivo → 422.

### P-BIL-17 · Liquidaciones de la pasarela
- **Propósito:** conciliar lo cobrado con tarjeta con lo que la pasarela liquida y abona en el banco.
- **Rol principal:** finance
- **Columnas:** fecha de liquidación, tipo (cobro, reembolso, contracargo, ajuste), id externo, bruto, comisión real, neto, pago relacionado, abono en banco, estado (conciliada, diferencia, sin pago).
- **Filtros:** periodo, tipo, estado, moneda, pagos sin liquidar después del plazo.
- **Acciones:** Leer liquidaciones por API → `billing.payment.create`; Importar reporte CSV → `billing.payment.create`; Confirmar coincidencia → `billing.payment.validate`; Exportar diferencias → `billing.payment.export`.
- **Vacío / error:** "Todo conciliado"; CSV con formato inválido → reporte de errores descargable; conector sin capacidad de liquidación → solo importación CSV.

## 9. Eventos y jobs

- **Emite:** `InvoiceDrafted`, `InvoiceIssued`, `InvoiceOverdue`, `InvoicePaid`, `InvoiceVoided`, `EInvoiceAccepted`, `EInvoiceRejected`, `InvoiceReopened`, `PaymentReported`, `PaymentValidated`, `PaymentRejected`, `PaymentRefunded`, `PaymentChargedBack`, `PaymentReinstated`, `PaymentCheckoutCreated`, `PaymentCheckoutApproved`, `PaymentCheckoutDeclined`, `PaymentCheckoutExpired`, `PaymentCheckoutCancelled`, `PaymentRefundRequested`, `PaymentRefundAuthorized`, `PaymentRefundSucceeded`, `PaymentRefundFailed`, `PaymentDisputeOpened`, `PaymentDisputeEvidenceSubmitted`, `PaymentDisputeWon`, `PaymentDisputeLost`, `PaymentPromiseRecorded`, `PaymentPromiseBroken`, `DunningNoticeDue`, `DunningSuspendDue`, `LateFeeApplied`, `ProviderBillLoaded`, `ExchangeRateUpdated`.
- **Escucha:** `ServiceActivated` (SRV) → primera factura según ciclo; `OrderApproved` (ORD) → factura inicial; `SubscriptionChanged` (SRV) → prorrateo; webhooks de PayPal, de la pasarela de tarjetas (aprobado, rechazado, reembolso, contracargo) y del proveedor de facturación electrónica.
- **Jobs:** `GenerateRenewalInvoices` (diario); `RunDunningSequence` (diario); `IssueEInvoices` (cola `billing`); `MarkOverdueInvoices` (diario); `ApplyLateFees` (diario); `CheckPaymentPromises` (diario); `UpdateExchangeRates` (diario); `SyncProviderBills` (diario, donde haya API); `ExpireCardCheckouts` (cada pocos minutos: intentos vencidos, consultando antes la transacción en la pasarela); `SyncCardGatewaySettlements` (diario: liquidaciones por API, con fila en `sync_runs`).

## 10. Integraciones y conectores

- `PaymentConnector` PayPal (orden, captura, reembolso, conciliación; webhooks firmados en `/api/v1/webhooks/paypal`).
- `PaymentConnector` Global66 (si ofrece API; si no, manual con voucher).
- `PaymentConnector` de la pasarela de tarjetas local (proveedor por elegir: Niubiz, Izipay, Culqi, Mercado Pago u otro; ver `docs/08`, ficha 20): sesión de formulario alojado o tokenizado, webhooks firmados en `/api/v1/webhooks/card-gateway` (aprobado, rechazado, reembolso, contracargo), reembolso total o parcial, transacciones y liquidaciones. Alternativa manual: transferencia con voucher.
- `EInvoiceConnector` del PSE/OSE elegido (facturas, boletas, notas en PEN y USD; XML, CDR, PDF; consulta, reenvío, baja).
- Tipo de cambio SUNAT.
- WhatsApp Business (avisos con plantillas aprobadas), correo y portal vía AUT.

## 11. Ajustes administrables

- `billing.invoice_generation_days`, `billing.invoice_consolidation`, `billing.auto_apply_credit_balance`
- `billing.late_fee.enabled`, `billing.late_fee.type`, `billing.late_fee.value`, `billing.late_fee.grace_days`, `billing.late_fee.max_amount`, `billing.late_fee.document`
- `billing.detraction.enabled`, `billing.detraction.percentage`, `billing.detraction.min_amount`, `billing.detraction.products`, `billing.detraction.bank_account`
- `billing.export.invoice_note`
- `billing.exchange_rate.source`, `billing.exchange_rate.update_time`
- `billing.collections_inbox_days` (15)
- `billing.payment_methods.defaults`, `billing.payment_fee.show_before_payment`, `billing.payment_fee.invoice_presentation`
- `billing.card_gateway.provider`, `billing.card_gateway.fee_percent`, `billing.card_gateway.fee_fixed`, `billing.card_gateway.pass_to_customer`, `billing.card_gateway.currencies`, `billing.card_gateway.accepted_brands`, `billing.card_gateway.settlement_days`, `billing.card_gateway.checkout_expiry_minutes`
- `services.suspension.days_after_due`, `services.suspension.exempt`, `services.reactivation.auto_on_payment`
- Secuencia de cobranza (`dunning_sequences`/`dunning_stages`, editada en CFG con `settings.dunning.update`)

## 12. Historias del backlog

- Generación de facturas recurrentes
- Factura manual y cargos únicos
- Numeración por entidad y serie
- Impuestos por jurisdicción
- Descuentos, cupones y saldo a favor
- Notas de crédito y débito
- PDF por marca e idioma
- Facturación consolidada o separada
- Registro de pago por transferencia
- Validación de pagos con separación de funciones
- Pagos parciales y anticipos
- Conciliación bancaria
- Secuencia de cobranza configurable
- Reactivación tras pago y clientes exentos
- Reembolsos
- Pago con PayPal desde el portal
- Webhooks de PayPal idempotentes
- Reembolsos por PayPal
- Emisión electrónica SUNAT
- Arquitectura de pasarelas extensible
- Carga de la factura del proveedor
- Refacturación con porcentaje de administración
- Reporte de facturas de proveedor sin refacturar
- Bandeja diaria de cobranza para finanzas
- Compromisos de pago
- Medios de pago configurables con comisión
- Pago en línea desde el panel
- Voucher de transferencia desde el panel
- Evaluar Global66 como medio de cobro
- Elegir proveedor de facturación electrónica
- Producto y cliente gravado o exportación de servicios
- Solo PEN y USD con tipo de cambio diario
- Secuencia de avisos 30, 15, 7 y 3 días
- Suspensión al terminar el plazo
- Línea de comisión por medio de pago
- Porcentaje de administración antes de impuestos
- Recargo por mora administrable
- Estado de cuenta y antigüedad de deuda
- Detracciones y retenciones de IGV
- Avisos de cobranza por WhatsApp
- Value object de dinero y monedas
- Pago con tarjeta mediante pasarela local
- Webhooks de la pasarela de tarjetas
- Reembolsos y contracargos con tarjeta
- Conciliación de liquidaciones de la pasarela
- Elegir pasarela de pago con tarjeta

## 13. Criterios de terminado y pruebas obligatorias

- Dos peticiones simultáneas emitiendo factura no repiten número (PostgreSQL real, dos conexiones).
- El mismo webhook de PayPal recibido tres veces registra un solo pago.
- Un pago reportado con comprobante no reactiva el servicio hasta ser validado.
- Dos ejecuciones de `GenerateRenewalInvoices` el mismo día no duplican facturas.
- La secuencia no envía dos veces el mismo aviso; un compromiso vigente posterga la suspensión; un exento no se suspende; un dominio no se suspende.
- Cálculo (unitarias): prorrateo, cupón, saldo a favor, porcentaje de administración 10 % con mínimo, IGV sobre el total, exportación sin IGV con nota fija, detracción solo nacional, recargo con tope; ningún céntimo perdido en repartos.
- Refacturación en USD de un proveedor en EUR usa el tipo de cambio de la fecha de la factura.
- Factura emitida no se puede editar (409); nota de crédito ajusta saldo.
- Autorizar reembolso sin MFA reciente → 403; quien solicita no autoriza (salvo administrador).
- Rechazo fiscal genera alerta y permite reenviar sin emitir un número nuevo.
- Webhook de PayPal con importe distinto no valida el pago y abre alerta.
- Contador externo puede ver y exportar pero recibe 403 al emitir o validar.
- El mismo webhook de la pasarela de tarjetas recibido tres veces registra un solo pago `validated`; con importe distinto el pago queda `reported` y abre alerta; con firma inválida responde 401.
- Un intento con tarjeta sin webhook no valida nada aunque el cliente vuelva a la página de éxito; al vencer, se consulta la transacción antes de marcarlo `expired`.
- Ninguna petición, respuesta, log ni tabla contiene número, vencimiento ni código de seguridad de tarjeta (prueba de arquitectura sobre el OpenAPI y el esquema).
- Reembolso parcial deja el pago `validated` con NC por el importe; la suma de reembolsos no supera el pago (422).
- Contracargo sobre factura pagada la deja con saldo (`overdue` si venció) y abre alerta `chargeback`; ganado, el pago se reaplica.
- Leer dos veces la misma liquidación no duplica líneas; la comisión real reemplaza la estimada al conciliar.

## 14. Preguntas abiertas

- Proveedor de facturación electrónica, elegido con la tabla de requisitos del docs/00, sección 21 (docs/00, sección 14; antes del conector).
- Qué productos califican como exportación y configuración inicial de detracciones, según el contador (docs/00, sección 14; antes de la puesta en marcha).
- Si Global66 ofrece API de cobros (docs/00, sección 14; antes de su conector).
- Qué pasarela de pago con tarjeta se usa, evaluada con la tabla de requisitos de docs/00, sección 21, y sus condiciones (comisión, traslado, plazo de abono) (`docs/11`, D-18; antes del conector).
- Valores iniciales del recargo por mora (docs/00, sección 14; se cargan en el panel).

## Anexo: nombres fuera del contrato

- Tabla nueva `bank_statement_lines` (import_id, bank_account_id, transaction_date, amount_minor, currency, reference, matched_payment_id, status `unmatched`/`matched`/`difference`) para la conciliación bancaria.
- Tablas nuevas `payment_checkouts`, `payment_refunds`, `payment_disputes` y `payment_settlement_lines` para el pago con tarjeta; estado `charged_back` en `payments.status`; tipo `chargeback` en `alerts.type`; proveedor `card_gateway` en `webhook_events.provider`.
- Permisos `billing.payment_dispute.view`, `billing.payment_dispute.create` y `billing.payment_dispute.update` (acciones estándar sobre `payment_disputes`).
- `einvoice_submissions.status`: `queued`, `sent`, `accepted`, `rejected`, `error`.
- `provider_bills.status`: `pending`, `rebilled`, `not_rebillable`.
- `dunning_events.status`: `scheduled`, `done`, `skipped_promise`, `skipped_exempt`, `skipped_paid`, `failed`.
- Solicitar un reembolso usa `billing.payment.validate` (finanzas) y autorizarlo `billing.refund.authorize` (administrador); así se mantienen como permisos distintos sin crear un código nuevo.
