# 04 — Reglas de negocio

Cada regla tiene un identificador estable `RN-<CÓDIGO>-NNN` con el código corto del módulo del contrato (BIL, SRV, MAP, DOM, CTR, SAL, CUS, VLT, HLP, INV, CLD, CFG; por docs/00 §25, CAT, ORD, AIA, MON y LRC; y, por docs/00 §26, WCN, BRD e IDN; y, por docs/00 §27, DSH y AUT). Las reglas RN-WEB del antiguo CMS se retiraron: las webs públicas viven en WordPress. Las historias de Jira y las pruebas citan este identificador.

- **Enunciado:** verificable; si no se puede escribir una prueba que falle cuando se incumple, la regla está mal escrita.
- **Origen:** sección de `docs/00-requerimientos.md` (las secciones 13 a 27 prevalecen sobre las anteriores).
- **Prueba:** U = unitaria (Pest), I = integración con PostgreSQL real, P = matriz de permisos, E = extremo a extremo (Playwright), A = prueba de arquitectura.
- Todo valor numérico citado es el **valor por defecto** del ajuste indicado entre paréntesis; el código lo lee de `settings` con herencia (RN-CFG-001, RN-CFG-002). Las pruebas cargan el seeder `settings.json` y, además, un caso con el ajuste sobrescrito en un nivel más específico.
- Las transiciones de estado citadas están en `03-maquinas-de-estado.md`.

---

## BIL — Billing

### Facturación

| ID | Regla | Origen | Cómo se prueba |
|---|---|---|---|
| RN-BIL-001 | El job `GenerateRenewalInvoices` crea una factura `draft` para cada suscripción `active` cuya `next_invoice_date` ≤ hoy + `billing.invoice_generation_days` (30), o el valor por ciclo de `billing.invoice_generation_days_by_cycle` si existe. Las suscripciones `paused` o `cancelled` se omiten. | §7, §23 | U: suscripción a 30 días genera borrador, a 31 no; con sobrescritura de contrato a 15 días, una suscripción a 20 días no genera. |
| RN-BIL-002 | Nunca existen dos facturas no anuladas para la misma suscripción y periodo: el job usa bloqueo por entidad y verifica dentro de la transacción. | §10 | I: ejecutar el job dos veces en paralelo produce un solo borrador. |
| RN-BIL-003 | Si el cliente prefiere consolidar (`billing.invoice_consolidation = consolidated`), los servicios que vencen en la misma ventana (`billing.consolidation_window_days`) van en una factura; si prefiere `per_service`, una factura por servicio. | §7, §23 | U: cliente con 3 servicios que vencen en la ventana produce 1 o 3 facturas según el ajuste. |
| RN-BIL-004 | En refacturación, el borrador nace al registrar `provider_bills`. El porcentaje de administración del contrato (`billing.rebilling.admin_fee_percent`) se calcula sobre el monto del proveedor **antes de impuestos**; el IGV se aplica después sobre el total (proveedor + administración). | §7, §20, §21 | U: proveedor 1 000,00; 10 %; IGV de `tax_rates` → base 1 100,00 e IGV calculado sobre 1 100,00, nunca sobre 1 000,00. |
| RN-BIL-005 | Si el contrato define mínimo mensual (`billing.rebilling.monthly_minimum`) y el porcentaje calculado es menor, se cobra el mínimo. Sin mínimo definido no se aplica ninguno. | §20, §21 | U: porcentaje 50,00 con mínimo 80,00 cobra 80,00; sin mínimo cobra 50,00. |
| RN-BIL-006 | La factura incluye todo el monto del servicio (también el costo del proveedor cuando se refactura) en una línea por servicio con el importe total; la factura del proveedor va adjunta como sustento y es visible para el cliente en el portal. | §7, §20, §21 | I: factura de refacturación tiene una línea por servicio y el archivo del proveedor enlazado; el endpoint del portal lo devuelve. |
| RN-BIL-007 | Si la moneda de `provider_bills` difiere de la del cliente, se convierte con `exchange_rates` de la fecha que fije `billing.rebilling.exchange_rate_date` (pendiente de definir entre fecha de la factura del proveedor y fecha de la factura al cliente). | §20 | U: proveedor en USD, cliente en PEN: usa la tasa de la fecha configurada; sin tasa para esa fecha la emisión falla con error claro. |
| RN-BIL-008 | El tratamiento `export` (sin IGV) se aplica solo si el producto **y** el cliente están marcados como exportación; en cualquier otro caso `taxed`. El comprobante de exportación lleva la nota fija `billing.export.invoice_note`. | §7, §21, §23 | U: las cuatro combinaciones producto/cliente; solo una da `export`. |
| RN-BIL-009 | La detracción se aplica solo si: `billing.detraction.enabled`, la factura es `taxed` a un cliente domiciliado en Perú, el producto está en `billing.detraction.products` y el total ≥ `billing.detraction.min_amount`. El comprobante muestra la leyenda (`billing.detraction.legend`), el monto y la cuenta del Banco de la Nación (`billing.detraction.bank_account`). Nunca en exportación. | §22 #5, §23 | U: factura nacional sobre el mínimo con producto alcanzado tiene detracción; exportación o debajo del mínimo no. |
| RN-BIL-010 | Mientras un ajuste de detracción marcado `requires_definition` siga en `null`, el sistema no calcula detracción, el centro de configuración muestra el pendiente y la lista de puesta en marcha no se puede cerrar. | §14, §23 | I: con porcentaje `null` la emisión de una factura nacional no incluye detracción y el endpoint de pendientes lo lista. |
| RN-BIL-011 | En facturas a clientes fuera de Perú el monto facturado no se reduce por impuestos, retenciones ni comisiones del país del cliente. | §23 | U: ningún descuento automático por país en el cálculo. |
| RN-BIL-012 | La retención de IGV de un cliente agente de retención se registra como un pago (método de retención) con su comprobante; con eso la factura queda en `paid`. | §22 #5, §23 | I: factura 1 180,00 con pago 1 144,60 + retención 35,40 queda `paid`. |
| RN-BIL-013 | La comisión de un medio de pago con traslado al cliente (`payment_methods.pass_to_customer`) se muestra antes de pagar y se factura como línea aparte "Comisión por medio de pago" (`billing.payment_fee.invoice_presentation = separate_line`), nunca sumada a la línea del servicio. Como una factura emitida no se edita, si ya está emitida la línea va en una nota de débito enlazada (a validar por el contador). | §7, §21 | U: pago PayPal de una factura emitida genera ND con una sola línea de comisión; transferencia no genera nada. |
| RN-BIL-014 | La comisión real cobrada por el medio se guarda en `payments.fee_minor` como gasto, independiente del recargo trasladado al cliente. | §7, §21 | U: webhook con comisión 4,10 guarda `fee_minor = 410`. |
| RN-BIL-015 | Con `billing.late_fee.enabled`, una factura `overdue` que supera `billing.late_fee.grace_days` genera un recargo (`billing.late_fee.type` y `billing.late_fee.value`, con tope `billing.late_fee.max_amount`) emitido por defecto en nota de débito (`billing.late_fee.document = debit_note`) o en la siguiente factura. Puede desactivarse por cliente o contrato. Volver a ejecutar el cálculo no genera un segundo recargo por el mismo cálculo. | §22 #3, §23 | U: con recargo activo y gracia cumplida se crea ND; desactivado a nivel cliente no; dos ejecuciones crean una sola ND. |
| RN-BIL-016 | (`legal_entity_id`, `series`, `number`) es único; el número se asigna dentro de una transacción con bloqueo de la fila de `document_series`. | §4, §7 | I: dos emisiones simultáneas obtienen números consecutivos distintos. |
| RN-BIL-017 | Una factura `issued` no se edita: cualquier `PATCH` de importes o líneas responde 409; la corrección es una nota de crédito o débito enlazada. | §7 | I: PATCH sobre emitida → 409; ND enlazada → OK. |
| RN-BIL-018 | Solo PEN y USD en documentos (`CHECK currency IN ('PEN','USD')`, ajuste `billing.currencies`); ningún importe se guarda sin moneda. Los costos de proveedores admiten cualquier ISO 4217 en `cost_currency`. | §2, §4, §21, contrato | I: insertar factura en EUR falla; costo en EUR se acepta. |
| RN-BIL-019 | El tipo de cambio se actualiza a diario desde SUNAT (`billing.exchange_rate.source`, `billing.exchange_rate.update_time`); los reportes consolidados convierten con la tasa de la fecha del documento. | §2, §4, §23 | U: reporte con facturas PEN y USD convierte con la tasa de cada fecha. |
| RN-BIL-020 | La emisión exige cabecera `Idempotency-Key`; repetir la petición devuelve la misma respuesta y la misma clave con otro cuerpo responde 422. | §9, §10, contrato | I: tres POST iguales emiten un documento. |
| RN-BIL-021 | Todo comprobante emitido, también el de clientes del extranjero, se envía al proveedor de facturación electrónica; se guardan XML, CDR y estado. El estado fiscal es independiente del estado de cobro. Un rechazado se reenvía sin nuevo número. | §7, §21 | I: factura de exportación pasa por `einvoice_submissions`; rechazo → reenvío conserva número. |
| RN-BIL-022 | Si no hay conector de facturación electrónica, finanzas registra el número externo, XML y CDR, y el estado fiscal pasa a `accepted`. | §6 | I: registro manual con archivos deja `accepted`. |
| RN-BIL-023 | La tasa de IGV se lee de `tax_rates` vigente a la fecha del documento; nunca está escrita en el código. | §7, §13 | A: no hay literal de tasa en el módulo; U: cambio de tasa con vigencia futura no afecta facturas anteriores. |
| RN-BIL-024 | Facturado, cobrado e ingreso reconocido se reportan como tres importes separados. | §7 | U: un mes con factura emitida y no cobrada muestra facturado > cobrado. |
| RN-BIL-025 | El estado de cuenta por cliente se genera en PDF y la antigüedad de deuda usa los tramos de `billing.statement.aging_buckets` (0-30, 31-60, 61-90, más de 90). | §22 #4 | U: factura vencida hace 45 días cae en 31-60. |
| RN-BIL-026 | El cálculo sigue el orden del kit: prorrateo, descuentos, cupones y saldo a favor, porcentaje de administración si es refacturación, y al final IGV o exportación. | §7 | U: caso con todos los conceptos produce el total esperado. |
| RN-BIL-027 | Un cambio masivo de precio de un producto se aplica en la siguiente renovación de cada suscripción y solo después de avisar al cliente con `billing.price_change.notice_days` de anticipación. | §22 #7 | U: renovación dentro del plazo de aviso usa el precio anterior. |

### Cobranza

| ID | Regla | Origen | Cómo se prueba |
|---|---|---|---|
| RN-BIL-030 | La secuencia de cobranza de una factura se resuelve con herencia: contrato > cliente > producto > marca > general (`billing.dunning.default_sequence`). El calendario se calcula al emitir y se recalcula si cambia la configuración. | §7, §23 | U: una secuencia de cliente reemplaza la general; el simulador muestra el origen. |
| RN-BIL-031 | La secuencia por defecto envía aviso de renovación con enlace de pago y opción de voucher a 30, 15, 7 y 3 días antes; aviso de vencimiento el día; suspensión con aviso 1 día después. Canales correo y portal; destinatario el contacto con rol facturación; hora 9:00 en la zona del cliente. | §7, §21, §23 | U: factura con vencimiento D produce envíos en D-30, D-15, D-7, D-3, D y suspensión en D+1. |
| RN-BIL-032 | Un mismo aviso no se envía dos veces: `dedupe_key` = evento + destinatario + entidad + periodo, con índice único. | §10 | I: ejecutar `RunDunningSequence` dos veces el mismo día envía un aviso. |
| RN-BIL-033 | Cada etapa define el trato de días no hábiles (`send_anyway` o `next_business_day`, con feriados de `holidays`); por defecto, solo la suspensión pasa al siguiente día hábil. | §23 | U: suspensión que cae sábado se ejecuta lunes; aviso que cae sábado sale sábado. |
| RN-BIL-034 | Cada aviso queda en el historial del cliente (`notification_deliveries`) con fecha, canal, destinatario, plantilla, estado de entrega y apertura cuando el canal la informa. | §23 | I: un aviso enviado crea una fila con esos campos. |
| RN-BIL-035 | Finanzas puede reenviar un aviso o enviar uno manual desde la factura; queda registrado igual que un automático. | §23 | P + I: `finance` puede, `support` recibe 403. |
| RN-BIL-036 | Cada mañana finanzas tiene una bandeja con vencimientos, avisos enviados, compromisos y suspensiones del día. | §7, §21 | E: datos de prueba aparecen en la bandeja del día. |
| RN-BIL-037 | El canal WhatsApp solo se usa con plantillas aprobadas y cuando `notifications.whatsapp.enabled` está activo; si falla, se avisa por correo. | §6, §22 #13, §23 | U: con WhatsApp inactivo la etapa usa solo correo y portal. |
| RN-BIL-038 | Un compromiso de pago `open` posterga la suspensión hasta su fecha; no detiene los avisos. | §7, §21 | U: factura vencida con compromiso a 5 días no se suspende hasta el día siguiente a esa fecha. |
| RN-BIL-039 | Si la fecha comprometida pasa sin saldo cero, el compromiso pasa a `broken` y la cobranza continúa sola: el servicio se suspende en la siguiente ejecución, sin intervención humana. | §7, §21 | I: job al día siguiente marca `broken` y suspende. |
| RN-BIL-040 | Un cliente o producto exento (`services.suspension.exempt`) recibe avisos pero nunca se suspende automáticamente; solo el administrador marca la exención. | §5, §7, §21, §23 | U: exento con factura vencida no se suspende; P: `finance` no puede marcar exención. |

### Pagos

| ID | Regla | Origen | Cómo se prueba |
|---|---|---|---|
| RN-BIL-050 | Un voucher enviado por el cliente o registrado por ventas crea un pago `reported`, que no salda la factura ni reactiva servicios. Solo un usuario con `billing.payment.validate` (finanzas) lo pasa a `validated`. | §5, §7, §11 | I: pago reportado deja la factura con saldo y el servicio suspendido; P: `sales` no puede validar. |
| RN-BIL-051 | El rechazo de un pago exige motivo y avisa al cliente. | §7 | I: rechazo sin motivo → 422. |
| RN-BIL-052 | Un pago PayPal se valida solo con el webhook de captura completada, con firma válida e importe y moneda iguales a lo esperado. El webhook se guarda en `webhook_events` con id externo único: el mismo evento recibido tres veces registra un solo pago. Si el importe no coincide, el pago queda `reported` para finanzas. | §6, §7, §10, §11 | I: tres entregas del mismo webhook → 1 pago; importe distinto → `reported`. |
| RN-BIL-053 | `payments.external_id` es único por método de pago. | §4 | I: segundo insert con el mismo id externo y método falla. |
| RN-BIL-054 | Un reembolso exige `billing.refund.authorize` (administrador), MFA de menos de `security.sensitive_action_mfa_max_age_minutes` (10) y queda en auditoría; la corrección contable es una nota de crédito enlazada. | §5, §7 | P + I: sin MFA reciente → 403; con MFA → reembolso y NC. |
| RN-BIL-055 | Los pagos se aplican a facturas con `payment_allocations`; el saldo se recalcula; con saldo cero la factura pasa a `paid` y emite `InvoicePaid`, que renueva o reactiva servicios. | §7 | U: dos pagos parciales llevan la factura a `paid` y emiten un solo `InvoicePaid`. |
| RN-BIL-056 | El excedente de un pago validado sobre el saldo de las facturas aplicadas queda como saldo a favor en `credit_balances`. | §4, §13 | U: pago 120 sobre factura 100 deja saldo a favor 20. |
| RN-BIL-057 | Los medios sin API (transferencia, Global66 mientras no se confirme su API) funcionan solo con voucher y validación de finanzas. Agregar un medio es configurar `payment_methods`, sin programar. | §6, §21 | I: crear un medio manual desde el panel y registrar un pago con voucher. |
| RN-BIL-058 | El cliente paga con tarjeta de crédito o débito una o varias facturas propias, emitidas, con saldo y de la misma moneda desde el portal. El formulario lo aloja o tokeniza la pasarela: el sistema nunca recibe ni guarda número de tarjeta, vencimiento ni código de seguridad (no existen columnas ni campos de API para ellos). El medio `card_gateway` solo se ofrece si `billing.card_gateway.provider` está definido, el medio está activo y la moneda está en `billing.card_gateway.currencies`. | §21 | I: facturas en PEN y USD en el mismo intento → 422; proveedor sin definir → el medio no aparece en las opciones de pago; A: ningún esquema del OpenAPI ni columna guarda datos de tarjeta; E: pago en el entorno de pruebas de la pasarela. |
| RN-BIL-059 | Un pago con tarjeta se valida automáticamente, sin pasar por finanzas, solo cuando llega el webhook firmado de pago aprobado cuyo importe y moneda coinciden con el intento (`payment_checkouts`); el regreso del navegador no valida nada. El evento se guarda en `webhook_events` con id externo único y la transacción en `payments.external_id` (único por medio): el mismo webhook recibido tres veces registra un solo pago. Firma inválida → 401 sin procesar; importe distinto → pago `reported` y alerta a finanzas. | §6, §10, §21 | I: tres entregas del mismo webhook → 1 pago `validated`; importe distinto → `reported`; firma alterada → 401; regreso del navegador sin webhook deja el intento en `created`. |
| RN-BIL-060 | El reembolso de un pago con tarjeta es total o parcial y se ejecuta por API de la pasarela con `Idempotency-Key`: finanzas lo solicita (`billing.payment.validate`) y el administrador lo autoriza (`billing.refund.authorize`, MFA reciente). La suma de reembolsos en curso o exitosos no supera el importe del pago. Uno parcial deja el pago `validated`; cuando la suma iguala el pago, pasa a `refunded`. Cada reembolso exitoso emite su nota de crédito enlazada. | §7, §21 | I: reembolso de 50 sobre 120 deja `validated` y NC de 50; segundo de 70 → `refunded`; un tercero → 422; P: `finance` no autoriza. |
| RN-BIL-061 | Un contracargo (webhook de la pasarela o registro manual de finanzas) crea `payment_disputes` `open`, pasa el pago a `charged_back`, revierte sus aplicaciones y deja la factura con saldo pendiente (`InvoiceReopened`: `overdue` si ya venció) y abre una alerta `chargeback` para finanzas con la fecha límite de descargos. No emite nota de crédito. El mismo contracargo recibido dos veces se registra una vez. | §21 | I: contracargo sobre factura pagada y vencida la deja `overdue` con saldo; alerta abierta; segundo webhook igual → sin cambios. |
| RN-BIL-062 | Si el contracargo se gana, el pago vuelve a `validated` y se aplica de nuevo a sus facturas con saldo; si ya se pagaron por otro medio, el importe queda como saldo a favor. Si se pierde, el pago queda `charged_back` y la factura sigue en la cobranza normal. | §21 | U: contracargo ganado con la factura ya pagada por transferencia genera saldo a favor; perdido no cambia la factura. |
| RN-BIL-063 | Al validar un pago con tarjeta, `payments.fee_minor` y el gasto `payment_fee` en `costs` se registran con la comisión estimada del medio (`fee_percent` y `fee_fixed_minor`); al conciliar la línea de liquidación, la comisión real la reemplaza. El recargo trasladado al cliente se calcula con la configuración del medio antes de pagar y no cambia con la comisión real. | §7, §21 | U: comisión estimada 4,28 reemplazada por la real 4,10 al conciliar; la línea "Comisión por medio de pago" de la factura no cambia. |
| RN-BIL-064 | Conciliación con la liquidación de la pasarela: cada línea (leída por API o cargada en CSV) se empareja por id externo con su pago; importe distinto → `difference`; línea sin pago → alerta; un pago con tarjeta sin liquidación pasados `billing.card_gateway.settlement_days` aparece como pendiente. Volver a leer el mismo periodo no duplica líneas. El neto abonado se cruza con el extracto bancario. | §21 | I: dos lecturas del mismo periodo → mismas líneas; línea con importe distinto → `difference`; pago sin liquidar tras el plazo aparece en el reporte. |
| RN-BIL-065 | No se guardan tarjetas ni existe cobro automático recurrente: cada pago con tarjeta lo inicia el cliente sobre facturas concretas, y la API no expone ninguna operación para cobrar sin el cliente presente. | §21, §22 | A: ninguna operación del OpenAPI cobra con tarjeta salvo `portalCreateCardCheckout`; ningún job llama a `createOrder()` del conector de tarjetas. |

---

## SRV — Services

### Servicios y suspensión

| ID | Regla | Origen | Cómo se prueba |
|---|---|---|---|
| RN-SRV-001 | Un servicio de producto recurrente no pasa a `active` sin suscripción creada en la misma transacción. Un servicio `active` sin suscripción y un recurso sin `service_resources` aparecen en `DetectOrphans`. | §4, §10 | I: activar sin plan recurrente válido falla; servicio activo sin suscripción aparece en el reporte. |
| RN-SRV-002 | Un servicio de producto "requiere contrato" no pasa a `active` hasta que su contrato esté en `signed_active`. | §21, §24 | I: contrato en `sent` → la activación responde 409. |
| RN-SRV-003 | `SuspendOverdueServices` suspende un servicio cuando tiene una factura `overdue` con `services.suspension.days_after_due` (1) días cumplidos, salvo exención, compromiso abierto vigente o servicio de dominio. | §7, §21, §23 | U: vencida ayer → suspende hoy; con ajuste de contrato a 3 → no suspende hasta el día 3. |
| RN-SRV-004 | Los servicios de dominio nunca se suspenden: se dejan de renovar y se avisa con mayor anticipación (avisos de dominio). Si llega la fecha real sin pago, el servicio pasa a `cancelled`. | §7, §21 | U: servicio de dominio con factura vencida no cambia a `suspended`. |
| RN-SRV-005 | La suspensión y la reactivación usan el conector cuando `capabilities()` lo admite; si no, crean una tarea manual con el procedimiento. Toda transición registra `service_status_history`. | §6, §10 | U: conector sin `suspend` crea tarea; I: historial tiene la fila. |
| RN-SRV-006 | Con `services.reactivation.auto_on_payment` (sí), el servicio suspendido se reactiva cuando las facturas vencidas que motivaron la suspensión quedan `paid`. | §7, §23 | I: validar el pago reactiva y avisa al cliente. |
| RN-SRV-007 | Un pago `reported` con comprobante no reactiva el servicio hasta ser validado. | §11 | I: caso obligatorio de §11. |
| RN-SRV-008 | Tras `services.termination.days_after_suspension` (10) días en `suspended`, el sistema crea una tarea de aprobación para el administrador. La baja (`terminated`) exige un respaldo exitoso posterior a la suspensión y la ejecución de un usuario con `services.service.terminate`; nunca es automática. | §22 #2, §23 | U: día 10 crea tarea; I: terminar sin respaldo → 409; sin permiso → 403. |
| RN-SRV-009 | La suspensión manual y la reactivación manual exigen `services.service.suspend` (administrador) y motivo. | §5 | P: `finance` y `support` reciben 403. |
| RN-SRV-010 | Ningún estado cambia fuera de la clase de transiciones de su entidad; cada transición valida permiso, escribe auditoría y emite su evento. | §4, §10 | U: transición no permitida → excepción; A: ningún `->status =` fuera de la clase. |
| RN-SRV-011 | Un servicio `handed_over` conserva su historial y termina su facturación; si se acuerda seguir como administración, se crea un servicio nuevo con modalidad `managed_customer_account`. | §20 | I: tras la entrega la suscripción queda `cancelled`. |
| RN-SRV-012 | Las modalidades de servicio (`service_modalities`) se agregan desde el panel indicando titular de la cuenta, forma de facturar y qué ve el cliente, sin programar. | §20 | E: crear una modalidad nueva y usarla en un servicio. |
| RN-SRV-013 | Al activar un servicio se envía el correo de bienvenida con la plantilla del producto; los accesos viajan solo por `one_time_links`. | §22 #8, #11 | I: el correo no contiene contraseñas, solo el enlace. |

### Portal del cliente: interruptores y vista

| ID | Regla | Origen | Cómo se prueba |
|---|---|---|---|
| RN-SRV-020 | Una acción del cliente solo se ofrece y se acepta si su interruptor resuelto está activo: valor general (`portal.actions.*.enabled`) sobrescrito por cliente en `customer_action_flags`. Por defecto: entrar a cPanel y ver consumo activos; cambiar DNS y reiniciar servidor apagados. | §21, §23 | I: con DNS apagado el endpoint del portal responde 403 y la UI no muestra el botón. |
| RN-SRV-021 | Activar o desactivar un interruptor (general o por cliente) queda en auditoría con usuario, fecha, valor anterior y nuevo. | §21 | I: cambio crea `audit_events`. |
| RN-SRV-022 | El reinicio de servidor lo solicita el cliente, lo aprueba soporte y lo ejecuta el sistema por API (`inventory.server.execute`). | §21 | E: solicitud → tarea `in_review` → aprobación → ejecución. |
| RN-SRV-023 | El acceso a cPanel abre una sesión temporal generada por WHM; la contraseña nunca se muestra ni se envía al navegador. | §21 | I: la respuesta contiene solo la URL de sesión. |
| RN-SRV-024 | No existe acción de crear buzones u otras acciones de cPanel desde el portal; ninguna función no construida aparece en el menú. | §9, §21 | E: el menú del portal no la muestra. |
| RN-SRV-025 | Las respuestas de la API del portal no incluyen costos, márgenes, notas internas, accesos ni el nombre del proveedor (salvo RN-MAP-002). | §5, §15 | I: prueba de contrato del recurso del portal sin esos campos. |
| RN-SRV-026 | Un usuario de cliente nunca recibe filas de otra organización aunque cambie el identificador en la ruta. | §5, §8, §11 | I: GET de un servicio ajeno → 404. |

---

## MAP — ServiceMap

| ID | Regla | Origen | Cómo se prueba |
|---|---|---|---|
| RN-MAP-001 | La vista del cliente usa `public_label` y solo las métricas marcadas como públicas de componentes con `visible_to_customer`. | §15 | I: componente oculto o métrica privada no aparece en el portal. |
| RN-MAP-002 | El cliente no ve el nombre del proveedor salvo que `portal.show_provider_name` (no) esté activo para ese cliente o que el servicio lo indique (`services.show_provider`). | §15, §21, §23 | I: por defecto el portal muestra la marca propia; con el ajuste del cliente muestra el proveedor. |
| RN-MAP-003 | Un componente sin API se registra a mano, queda marcado "sin sincronización" y muestra datos fijos con la fecha de la última revisión. | §15 | U: componente manual devuelve `synced = false` y `reviewed_at`. |
| RN-MAP-004 | El consumo se lee con la frecuencia de `service_map.metrics_frequency` (diaria); el panel muestra el último valor y su fecha. | §15, §23 | I: job llena `component_metrics`. |
| RN-MAP-005 | Al abrir un ticket o un incidente sobre un componente se muestran los componentes que dependen de él (`component_dependencies` y `resource_dependencies`). | §15 | I: ticket sobre DNS lista sitio y correo dependientes. |
| RN-MAP-006 | La ficha de traspaso genera un PDF con componentes, proveedor, configuración no sensible y pasos de entrega; nunca contiene accesos, que se entregan por enlace de un solo uso. | §15 | U: el PDF no contiene valores de `secrets`. |
| RN-MAP-007 | Un reporte lista clientes con servicios activos sin proyecto ni componentes. | §15 | I: cliente de prueba sin mapa aparece. |
| RN-MAP-008 | Una instancia SaaS aparece en el mapa del cliente como un solo componente; la arquitectura que la sostiene solo se ve en la vista de soporte. | §20 | I: portal devuelve un componente; panel devuelve el árbol. |
| RN-MAP-009 | El mapa funciona con registro manual sin ningún conector; los conectores solo lo completan. | §13 | E: alta manual completa de un proyecto con conectores simulados apagados. |

---

## DOM — Domains

| ID | Regla | Origen | Cómo se prueba |
|---|---|---|---|
| RN-DOM-001 | Un dominio guarda dos fechas: `registry_expires_at` (real, solo la cambian la sincronización o el registrador) y `commercial_due_date` en su servicio. Los avisos al cliente usan la comercial (`domains.customer_notice_days`); los internos, la real (`domains.internal_notice_days`). | §4, §16, §23 | U: fechas distintas generan calendarios distintos; I: el usuario no puede editar la fecha real a mano si hay conector. |
| RN-DOM-002 | `contact_change`, `nameserver_change`, `owner_change` y `transfer_out` pedidos desde el portal no se envían al registrador sin confirmación por correo al titular o contacto autorizado; el enlace vence (`domains.confirmation_link_ttl_hours`). | Decisiones, §8, §16 | I: sin clic la operación sigue `requested`; enlace vencido → `cancelled`. |
| RN-DOM-003 | `owner_change` y `transfer_out` pasan por revisión de soporte (`domains.operation.approve`) antes de enviarse. | §8, §16 | P: `customer_admin` no puede aprobar. |
| RN-DOM-004 | No se acepta `transfer_out` dentro de los `domains.transfer_out.min_days_since_registration_or_transfer` (60) días posteriores al registro o a una transferencia; las reglas de la extensión en `tld_rules` prevalecen. | §16 | U: dominio registrado hace 59 días → 422. |
| RN-DOM-005 | `transfer_out` exige verificación de identidad y que el cliente no tenga facturas vencidas antes del desbloqueo y la entrega del código de autorización, que viaja por enlace de un solo uso. | §8, §16 | I: cliente con factura `overdue` → rechazo. |
| RN-DOM-006 | En dominios genéricos, `owner_change` exige confirmación del titular y avisa que puede bloquear la transferencia hasta `domains.owner_change.transfer_lock_days` (60) días. | §16 | U: el formulario muestra el aviso; la operación guarda la confirmación. |
| RN-DOM-007 | `nameserver_change` muestra el aviso de impacto en sitio y correo y, desde el portal, exige el interruptor `portal.actions.dns_change.enabled` activo para el cliente. | §16, §21 | I: interruptor apagado → 403. |
| RN-DOM-008 | Si el registrador no tiene API para la operación, la misma solicitud crea una tarea para soporte con los pasos. | §16 | U: conector sin capacidad crea tarea. |
| RN-DOM-009 | Las operaciones del cliente sobre .pe, .cl, .mx y .co solo se habilitan cuando la extensión tiene sus reglas documentadas en `tld_rules`. | §14, §16, §21 | I: extensión sin regla → operación no disponible. |
| RN-DOM-010 | Toda operación de dominio exige `Idempotency-Key`. | contrato | I: dos POST iguales crean una operación. |
| RN-DOM-011 | Cada dominio registra su titular (`domains.holder`: `company` o `customer`); el reporte de regularización lista los de la empresa y su avance en `domain_regularizations`. | §16, §21 | I: el reporte filtra por `holder = company`. |
| RN-DOM-012 | La renovación solo se ejecuta con la factura de renovación `paid` (pago validado). | §16 | I: pago `reported` no crea operación `renewal` enviada. |
| RN-DOM-013 | Cada extensión y registrador tiene costo y precio en `domain_tld_prices`; si el margen cae bajo `catalog.domain_prices.min_margin_percent` se genera una alerta. | §22 #6 | U: costo sube y margen cae → alerta. |
| RN-DOM-014 | La sincronización nunca borra: un dominio que desaparece del registrador queda "no encontrado" y genera alerta. | §6 | I: sync sin el dominio no lo elimina. |
| RN-DOM-015 | La disponibilidad y el WHOIS que muestran `[hub_whois]` y `[hub_buscar_dominio]` se consultan en el sistema contra los registradores conectados que declaran esa capacidad (`RegistrarConnector::capabilities()`), con caché `web_connector.whois.cache_minutes` por dominio; si ninguno responde, el resultado es `unknown` y nunca se informa "disponible". Del WHOIS de un dominio registrado solo se muestran los campos de `web_connector.whois.public_fields`; nunca nombre, correo, teléfono ni dirección del titular, aunque el registro los publique. | §27 | U: registrador caído → `unknown`; U: respuesta con datos del titular → no salen en la API; I: dos consultas del mismo dominio dentro de la caché → una sola llamada al registrador. |
| RN-DOM-016 | Cada visitante tiene un límite de `web_connector.whois.limit_per_visitor_per_hour` consultas por hora (429 con `code = rate_limited` y `Retry-After`) y, desde `web_connector.whois.captcha_after_lookups` consultas en la hora, debe resolver el captcha (429 con `code = captcha_required` hasta enviar un token válido); las consultas frenadas no llegan al registrador. El visitante se identifica por el HMAC de su IP, que reenvía el plugin. | §27 | I: consulta frenada con registrador → 23514; U: consulta 11 sin captcha → 429 `captcha_required`; consulta 31 → 429 `rate_limited`. |
| RN-DOM-017 | `whois_lookups` guarda solo el HMAC de la IP, el dominio consultado, el resultado, el registrador y si vino de la caché; la aplicación no la edita y `PurgeWhoisLookups` borra las consultas más antiguas que `web_connector.whois.retention_days` (con el ajuste en `null` no borra nada). Soporte y el administrador las consultan para detectar abuso. | §27 | I: `UPDATE` de una consulta → 42501; U: con retención 30 se borran las de 31 días. |

---

## CTR — Contracts

| ID | Regla | Origen | Cómo se prueba |
|---|---|---|---|
| RN-CTR-001 | Un contrato solo se envía al cliente después de la aprobación del administrador (`contracts.contract.approve`). | §24 | P: `documentation` no puede pasar `in_review → approved`. |
| RN-CTR-002 | Un contrato `signed_active` no se edita: todo cambio es una adenda en `contract_versions` enlazada, con su aprobación y firma; la versión firmada anterior se conserva. | §24 | I: PATCH sobre contrato firmado → 409; adenda crea versión nueva. |
| RN-CTR-003 | Pasa a `signed_active` solo con el archivo firmado (escaneado o con firma digital) en `contract_signatures` o con el webhook del servicio de firma. | §24 | I: sin archivo → 422. |
| RN-CTR-004 | Ver RN-SRV-002: servicio "requiere contrato" no se activa sin contrato vigente. Un reporte lista servicios sin contrato. | §13, §21, §24 | I: reporte de "sin contrato". |
| RN-CTR-005 | Se avisa antes del fin del contrato según `contracts.expiry_notice_days`. | §24 | U: calendario de avisos según el ajuste. |
| RN-CTR-006 | Las cláusulas reutilizables (confidencialidad, SLA, impuestos fuera de Perú, recargo por mora, entrega de cuenta, autorización de acceso cloud) las administra documentación. | §24 | P: solo `documentation` y `admin` editan `contract_clauses`. |
| RN-CTR-007 | Las plantillas resuelven variables (cliente, documento, servicios, montos, moneda, porcentaje de administración, plazos, SLA, fechas); una variable sin valor impide pasar a `in_review`. | §24 | U: variable faltante → 422. |
| RN-CTR-008 | Una entrega de cuenta (`account_handovers`) solo pasa a `completed` con la lista completa (titular, medio de pago, retiro de accesos, rotación) y el acta firmada adjunta. | §20 | I: sin acta → 422. |

---

## SAL — Sales (CRM, canales y cotizaciones)

| ID | Regla | Origen | Cómo se prueba |
|---|---|---|---|
| RN-SAL-001 | Todo prospecto guarda su canal de origen; se registra solo cuando el canal lo permite (formulario, WhatsApp, redes, mailing) con marca, página, campaña y UTM. | §24 | I: formulario con UTM guarda los parámetros. |
| RN-SAL-002 | Un prospecto `lost` exige motivo. | §24 | I: sin motivo → 422. |
| RN-SAL-003 | El prospecto ganado se convierte con un clic en cliente y pedido; el pedido avisa a finanzas, a soporte y, si el servicio es complejo ("requiere contrato"), a documentación. | §21, §24 | E: conversión crea cliente, pedido y avisos. |
| RN-SAL-004 | La asignación usa `assignment_rules` administrables por marca o canal y avisa de inmediato al vendedor asignado. | §24 | U: regla por marca asigna al vendedor esperado. |
| RN-SAL-005 | Un prospecto `open` sin actividad en `sales.lead.followup_alert_days` días genera alerta. | §24 | U: prospecto sin actividad aparece en alertas. |
| RN-SAL-006 | Las etapas del embudo (`pipeline_stages`) se administran desde el panel; ganado y perdido son las etapas finales. | §24 | E: crear etapa nueva. |
| RN-SAL-007 | Cada cambio de una cotización crea una nueva versión (`quote_versions`) y se conserva el historial; la vigencia se calcula con `sales.quote.validity_days`. | §24 | I: editar cotización enviada crea v2 y conserva v1. |
| RN-SAL-008 | Los formularios de captación usan clave por formulario y protección anti-spam. | §24 | I: clave inválida → 401. |
| RN-SAL-009 | Desde una conversación de WhatsApp se crea prospecto, ticket o se vincula a un cliente. | §24 | E: las tres acciones desde la bandeja. |
| RN-SAL-010 | El CRM tiene vista de lista y vista Kanban sobre los mismos prospectos, filtros y permisos; las columnas del Kanban son las `pipeline_stages` activas en su orden, con el valor estimado por moneda. | §26 | E: un filtro por vendedor da los mismos prospectos en lista y Kanban; P: `sales` con alcance propio no ve tarjetas ajenas. |
| RN-SAL-011 | Arrastrar una tarjeta a otra columna cambia la etapa con `POST /admin/leads/{id}/move-stage` (`source = board_drag`) y lo registra en `lead_stage_changes` (solo inserción) con usuario y fecha; soltarla en una etapa ganada o perdida abre la conversión o pide el motivo y, si se cancela, la tarjeta vuelve a su columna; una versión vieja responde 409 y la tarjeta vuelve. | §26 | I: arrastre crea la fila del historial; `UPDATE` del historial → 42501; E: soltar en "Perdido" sin motivo deja la tarjeta en su columna. |

## CUS — Customers (consentimiento)

| ID | Regla | Origen | Cómo se prueba |
|---|---|---|---|
| RN-CUS-001 | Solo se envían comunicaciones comerciales a contactos con consentimiento en `communication_consents`; una baja en Elastic Email o en el portal se respeta en todos los canales. Los avisos de cobranza y servicio no son comerciales. | §24 | I: webhook de baja de Elastic Email excluye al contacto de WhatsApp y correo comercial. |
| RN-CUS-002 | Los clientes se deduplican por documento fiscal, correo y nombre normalizado, con fusión manual. | §13 | U: dos filas con mismo RUC se marcan como duplicadas. |

---

## VLT — Vault

| ID | Regla | Origen | Cómo se prueba |
|---|---|---|---|
| RN-VLT-001 | Revelar un secreto exige `vault.secret.reveal`, una concesión vigente sobre ese secreto y MFA de menos de `security.sensitive_action_mfa_max_age_minutes` (10). | §5, §8 | P + I: falta cualquiera de las tres → 403. |
| RN-VLT-002 | Cada revelación escribe en `secret_access_logs` usuario, secreto, motivo, IP y fecha; nunca el valor. | §8 | I: el log no contiene el valor. |
| RN-VLT-003 | Las concesiones temporales caducan solas; revocar surte efecto inmediato. Al completar una entrega de cuenta o dar de baja a un usuario se revocan sus concesiones y se crean tareas de rotación de lo que vio. | §8, §20 | I: concesión vencida → 403; baja de usuario lista los secretos vistos. |
| RN-VLT-004 | Ningún listado ni exportación devuelve valores de secretos; no existe exportación masiva. | §8, §11 | I: caso obligatorio de §11. |
| RN-VLT-005 | Superar `security.vault.reveal_limit_per_hour` (10) revelaciones por usuario y hora bloquea y alerta a seguridad. | §8, §23 | I: la revelación 11 → 429 y alerta. |
| RN-VLT-006 | Cada secreto tiene fecha de rotación (por defecto `vault.secret.default_rotation_days`); un job diario crea las tareas. | §8 | U: secreto vencido crea tarea. |
| RN-VLT-007 | El logger redacta `password`, `token`, `secret`, `authorization`. | §8 | U: log con esos campos sale redactado. |
| RN-VLT-008 | No se almacenan contraseñas de buzones de correo de clientes. | §8, §18 | A: `secrets.kind` no tiene tipo de buzón; validación rechaza. |
| RN-VLT-009 | Los conectores obtienen sus credenciales de la bóveda al momento de la llamada; nunca de `.env` ni de la configuración. | §6, §19 | A: ningún conector lee `config()` para credenciales. |
| RN-VLT-010 | Un enlace de un solo uso funciona una vez y vence a las `vault.one_time_link.ttl_hours` horas. | §22 #11 | I: segundo acceso → 410. |

---

## HLP — Helpdesk (SLA)

| ID | Regla | Origen | Cómo se prueba |
|---|---|---|---|
| RN-HLP-001 | El SLA de primera respuesta y solución sale de `helpdesk.sla.default_targets` por prioridad (crítica 1 h / 4 h; alta 4 h / 1 día hábil; media 8 h / 3 días hábiles; baja 1 día hábil / 5 días hábiles), sobrescribible por producto o contrato. | §23 | U: ticket crítico creado a las 10:00 de un día hábil vence la respuesta a las 11:00. |
| RN-HLP-002 | Los tiempos corren solo dentro de `business_hours` y descuentan los feriados de Perú de `holidays`. | §23 | U: ticket creado viernes al cierre continúa el lunes; feriado no cuenta. |
| RN-HLP-003 | El reloj se pausa en `waiting_customer` y `waiting_provider` (`helpdesk.sla.pause_statuses`). | §23 | U: 2 horas en espera no consumen SLA. |
| RN-HLP-004 | `CheckSlaBreaches` alerta al `helpdesk.sla.warning_percent` (75 %) del tiempo y al incumplir, a `helpdesk.sla.alert_recipients`. | §10, §23 | U: al 75 % se crea la alerta una sola vez. |
| RN-HLP-005 | Un ticket en `waiting_customer` por `helpdesk.auto_close.waiting_customer_days` (7) días se cierra solo. | §22 #14, §23 | U: día 7 → `closed`. |
| RN-HLP-006 | Todo pedido de cliente se registra como ticket; los mensajes de WhatsApp Business llegan a la bandeja compartida y crean el ticket directamente. | §21 | I: webhook de WhatsApp crea ticket. |
| RN-HLP-007 | Los adjuntos de tickets se conservan `helpdesk.attachments.retention_months` (12) meses. | §23 | U: adjunto de hace 13 meses queda marcado para borrado. |
| RN-HLP-008 | La base de conocimientos del sistema (`kb_articles`) guarda artículos públicos para el portal y el asistente y artículos internos para soporte; el blog y la ayuda de las webs viven en WordPress y no se copian: el portal enlaza a la base de conocimientos de la marca (`web_connector.kb_url`). | §26 | E: la ayuda del portal muestra los artículos públicos y el enlace a la base de conocimientos de la marca. |
| RN-HLP-009 | La bandeja de tickets filtra por estado, prioridad, asignado, departamento, cliente, marca y SLA por vencer o vencido, y muestra el tiempo restante de primera respuesta y de solución; el detalle muestra la conversación en orden y las notas internas marcadas. Una nota interna la escribe solo el personal, nunca se muestra al cliente ni sale por correo y no pausa ni reanuda el SLA. | §26 | I: nota interna con autor cliente → 23514; I: el portal y el correo no reciben notas internas; U: agregar una nota no cambia `first_responded_at`. |
| RN-HLP-010 | Asignar o reasignar un ticket queda en auditoría y avisa al asignado; un ticket solo se vincula con servicios, dominios, servidores o componentes del mismo cliente, y el vínculo se ve en la ficha del servicio. | §26 | I: vincular un servicio de otro cliente → 422; E: la ficha del servicio lista el ticket vinculado. |

---

## INV — Inventory (migración y capacidad)

| ID | Regla | Origen | Cómo se prueba |
|---|---|---|---|
| RN-INV-001 | Una cuenta solo entra a un lote si el nodo destino tiene capacidad libre para ella. | §17 | U: nodo lleno → 422. |
| RN-INV-002 | Ninguna cuenta pasa a `copied` sin un respaldo previo exitoso. | §17 | I: sin `backup_runs` exitoso → 409. |
| RN-INV-003 | El mapa de servicios y `hosting_accounts` se actualizan al destino solo cuando la cuenta llega a `closed`. | §17 | I: en `verified` el mapa sigue apuntando al origen. |
| RN-INV-004 | La baja en el origen solo se ejecuta desde `verified`. | §17 | U: transición desde `dns_changed` a `closed` no permitida. |
| RN-INV-005 | `reverted` restaura el DNS al origen y deja la cuenta lista para un nuevo intento. | §17 | E: reversión y nuevo intento. |
| RN-INV-006 | El tablero de migración muestra cuentas migradas, pendientes y espacio liberado por reseller. | §17 | E: datos de prueba en el tablero. |
| RN-INV-007 | `CheckCapacityThresholds` alerta cuando el uso de un nodo o plan cruza `inventory.capacity_thresholds` (70, 85, 95 %); el aprovisionamiento valida capacidad del destino. | §10, §23 | U: 86 % genera alerta de 85 % una vez. |
| RN-INV-008 | Antes de reintentar una creación en un proveedor se consulta si el recurso ya existe: un reintento nunca crea dos cuentas. | §10, §11 | I: caso obligatorio de §11. |

---

## CLD — Cloud

| ID | Regla | Origen | Cómo se prueba |
|---|---|---|---|
| RN-CLD-001 | Una cuenta cloud de propiedad del cliente (`cloud_accounts.owner = customer`) no se registra sin el documento de autorización adjunto. | §20, §21 | I: sin archivo → 422. |
| RN-CLD-002 | Si la cuenta es del cliente, él puede revocar el acceso de lectura; la siguiente sincronización marca la cuenta como sin acceso y alerta. | §20 | I: credencial revocada → error de credenciales y alerta. |
| RN-CLD-003 | Cada recurso cloud se asigna por las etiquetas de `cloud.tagging.required_keys` (cliente, proyecto, ambiente); sin etiquetas queda "sin cliente asignado". Antes de la primera sincronización de una cuenta existe una tarea de etiquetado. | §20, §21 | I: recurso sin etiquetas aparece en el reporte; alta de cuenta crea la tarea. |
| RN-CLD-004 | El sistema no crea ni borra recursos cloud: los conectores cloud solo leen. | §6, §20 | A: el contrato `CloudConnector` no tiene métodos de escritura. |
| RN-CLD-005 | Cada proyecto cloud con presupuesto alerta al cruzar `cloud.budget_thresholds` (80 y 100 %). | §20, §23 | U: 81 % alerta una vez. |
| RN-CLD-006 | Los ambientes (desarrollo, pruebas, producción) se registran por separado y se pueden ocultar al cliente. | §20 | I: ambiente oculto no aparece en el portal. |
| RN-CLD-007 | Un reporte compara lo facturado por cada proveedor con lo refacturado, para detectar meses sin cobrar. | §20 | I: `provider_bills` sin factura al cliente aparece. |
| RN-CLD-008 | Un incidente en un recurso compartido lista todas las instancias SaaS y clientes afectados. | §20 | I: incidente sobre el proyecto cloud llena `incident_affected` con todas las instancias. |

---

## CFG — Settings (centro de configuración)

| ID | Regla | Origen | Cómo se prueba |
|---|---|---|---|
| RN-CFG-001 | Ningún monto, día, porcentaje, umbral, hora ni texto de aviso de negocio está escrito en el código: se leen de `settings` (o de tablas de configuración como `dunning_stages`, `sla_targets`, `payment_methods`, `tax_rates`, `notification_templates`). | §13, §19, §23, contrato | A: prueba de arquitectura que prohíbe literales numéricos en `Domain/` y `Application/` de los módulos de negocio, salvo constantes técnicas; I: cada key de `settings.json` existe tras el seeder. |
| RN-CFG-002 | Un ajuste se resuelve buscando en orden contrato > cliente > producto > marca > general, solo entre los niveles permitidos de su key; gana el primero que tenga valor. La respuesta indica el nivel de origen. | §23 | U: con valor general y de cliente gana el de cliente y `source = customer`. |
| RN-CFG-003 | No se puede guardar un valor en un nivel no permitido para la key ni con un tipo, enum o rango inválido. | §23 | I: valor de cliente en una key solo global → 422. |
| RN-CFG-004 | Cada cambio escribe `setting_changes` (solo inserción) con usuario, fecha, nivel, valor anterior y nuevo; un cambio se puede revertir, lo que crea otro registro. | §23, contrato | I: revertir restaura el valor y deja dos filas. |
| RN-CFG-005 | Solo `admin` cambia ajustes generales (`settings.setting.update`); `finance` administra los de cobranza y medios de pago (`settings.dunning.update`); `documentation` los de contratos. | §5, §23 | P: matriz de roles contra cada grupo. |
| RN-CFG-006 | Antes de guardar un cambio de cobranza, dominios o SLA, el simulador muestra el calendario de avisos y acciones para una factura o dominio de ejemplo con el valor propuesto. | §23 | E: el simulador refleja la etapa nueva antes de guardar. |
| RN-CFG-007 | Cada plantilla de aviso puede enviarse de prueba a un correo interno. | §23 | I: envío de prueba no crea historial del cliente. |
| RN-CFG-008 | Un ajuste con `requires_definition` en `null` aparece en la lista de pendientes; la función que depende de él no se ejecuta con un valor inventado. | §14, §23 | I: endpoint de pendientes lista las keys. |
| RN-CFG-009 | Los ajustes pertenecen a la organización (`organization_id`); nada de la empresa queda escrito en el código. | §19 | I: dos organizaciones de prueba con valores distintos no se mezclan. |

---

## WCN — WebConnector (webs en WordPress conectadas por shortcodes)

| ID | Regla | Origen | Cómo se prueba |
|---|---|---|---|
| RN-WCN-001 | Las webs públicas de las marcas viven en WordPress Multisite (un sitio por marca): páginas y su diseño, menús, FAQ, blog, base de conocimientos, página 404, SEO, aviso de cookies, píxeles y CSS personalizado se administran allí. El sistema no tiene CMS ni rutas para esos contenidos. | §26 | A: no existen rutas `/admin/cms` ni `/public/site`; E: el sitio WordPress muestra el catálogo por shortcode. |
| RN-WCN-002 | Un sitio WordPress conectado pertenece a una marca y su URL (solo HTTPS) es única en todo el sistema; pasa a `active` solo con la ruta del plugin, el secreto de firma en la bóveda, un token vigente y un aviso de prueba entregado; `disabled` exige motivo y deja de recibir avisos. | §26 | I: URL repetida → 23505; sitio sin HTTPS o activo sin ruta del plugin → 23514; U: activar sin prueba entregada → 422. |
| RN-WCN-003 | El token del plugin es de solo lectura (`scope = read`), se guarda solo su hash, se muestra una vez, vence a `web_connector.token_expiry_days` y se revoca con motivo; uno revocado o vencido responde 401 y no se reactiva. Lo envía el servidor de WordPress, nunca el navegador. | §8, §26 | I: reactivar un token revocado → 23514; U: token revocado → 401; P: `sales` recibe 403 al crear o revocar tokens. |
| RN-WCN-004 | La API de lectura del plugin (`/public/wp/...`) identifica la marca y el sitio solo por el token y nunca devuelve datos de otra marca, costos, márgenes, proveedores, notas internas ni datos personales; un plugin con versión menor que `web_connector.min_plugin_version` recibe 426. | §8, §26 | I: token de la marca A no ve planes de la marca B; U: respuesta de planes sin `cost`; versión vieja → 426. |
| RN-WCN-005 | Al cambiar un precio, plan, ficha por marca, paquete, promoción, extensión, dato de contacto, documento legal, formulario o tipo de servicio, el sistema envía en cola un aviso firmado (HMAC-SHA256 del cuerpo con marca de tiempo, secreto del sitio en la bóveda) a cada sitio de la marca con el alcance y las claves afectadas; reintenta hasta `web_connector.webhook.max_attempts` y, si falla, alerta y el plugin renueva igual al vencer su caché. | §26 | I: aviso repetido al mismo sitio → 23505; aviso fallido sin error → 23514; U: cambiar un precio encola un aviso `plan` por sitio. |
| RN-WCN-006 | El plugin guarda en caché lo que lee por `web_connector.cache_ttl_seconds` y la renueva al instante con un aviso válido; si el sistema no responde, muestra la última copia hasta `web_connector.stale_max_hours` y después un aviso con los datos de contacto de la marca; nunca muestra un error técnico al visitante. | §26 | E (plugin): sistema caído → la página sigue mostrando los planes; aviso con firma inválida o marca de tiempo vieja → 401 y caché intacta. |
| RN-WCN-007 | Un shortcode o bloque no guarda precios: lee el catálogo vigente de la marca en la moneda pedida, y el precio mostrado es el que se cobra en el carrito y se factura. Todo servicio nuevo, incluidos los personalizados, aparece en `[hub_planes]` y `[hub_plan]` sin cambiar el plugin. | §25, §26 | E: precio del shortcode = precio del carrito = precio de la factura; E: tipo personalizado activado aparece sin desplegar el plugin. |
| RN-WCN-008 | Los enlaces "Contratar", "Mi cuenta", "Pagar" y "Soporte" llevan al sistema central con la marca de origen y el sitio; esa marca queda en el prospecto, el cliente nuevo, el carrito, el pedido y la factura. Tras pagar, el cliente vuelve a la página de agradecimiento del sitio (`wp_sites.thank_you_url`) con el pedido, el importe y la moneda una sola vez por compra, para que los píxeles de WordPress registren la conversión. | §25, §26 | E: compra desde ServerCreativo deja la marca en el pedido y la factura; U: recargar la página de agradecimiento no repite la conversión. |
| RN-WCN-009 | El generador de shortcodes solo produce los shortcodes y atributos del catálogo de `docs/13` (con su bloque de Gutenberg equivalente), valida que el plan, el paquete, el formulario o el tipo existan y sean de la marca, y no guarda nada. | §26 | U: plan de otra marca → 422; U: atributo desconocido → 422. |
| RN-WCN-010 | Un formulario del constructor tiene campos con clave única, listas y casillas con opciones y destino completo (prospecto con canal, ticket con tipo o correo con destinatario); activo exige mensaje de confirmación. Si el consentimiento es obligatorio, un envío sin la casilla responde 422 y se guarda el texto aceptado; el captcha se exige según `web_connector.forms.captcha_required`; hay límite por IP (`web_connector.forms.submissions_per_ip_per_hour`) y clave de idempotencia. | §24, §26 | I: formulario sin canal o lista sin opciones → 23514; envío repetido → 23505; U: sin consentimiento → 422. |
| RN-WCN-011 | Cada envío se deriva en cola a prospecto (canal del formulario, responsable o reglas de asignación, atribución UTM), ticket (tipo, departamento, canal `web_form`, SLA) o correo; si falla queda `failed` y se reintenta sin duplicar. WordPress no guarda los datos del envío: los reenvía o los envía el navegador directo al sistema. | §26 | I: envío derivado sin destino → 23514; U: reintentar un envío ya derivado no crea otro prospecto. |
| RN-WCN-012 | Los datos de contacto de cada marca (teléfonos, correos, WhatsApp, dirección y horario) se editan en el panel con un principal por tipo; teléfonos y WhatsApp en formato internacional; solo los públicos salen por la API, y un cambio invalida la caché `contact` de los sitios de la marca. | §26 | I: segundo principal del mismo tipo → 23505; teléfono sin `+` → 23514. |
| RN-WCN-013 | Cada documento legal tiene una sola versión vigente; publicar exige la validación de la asesoría legal (quién y cuándo) y la fecha de vigencia; una versión publicada o reemplazada nunca se edita ni se borra y el historial con fechas es público. Cada marca con venta en línea tiene vigentes términos, privacidad, reembolsos, SLA, uso aceptable y aviso legal con razón social y RUC; la política de cookies vive en WordPress. | §25, §26 | I: publicar sin validación → 23514; segunda vigente → 23505; documento de cookies → 23514; U: `PATCH` a una versión publicada → 409. |
| RN-WCN-014 | La aceptación de términos se registra en `legal_acceptances` (solo inserción) con la versión exacta, el usuario, el cliente, el contexto y la fecha; la compra en línea registra la de la versión vigente de los términos de la marca y de cada tipo de servicio del carrito; al publicarse términos nuevos, el portal pide aceptarlos a los clientes con servicios activos. | §25 | I: aceptación de compra sin compra → 23514; E: compra con términos nuevos registra la versión nueva. |
| RN-WCN-015 | Los envíos de formularios ya derivados se conservan `web_connector.forms.submission_retention_days` días y luego se borran (`PurgeWebFormSubmissions`); los datos siguen en el prospecto o el ticket con su consentimiento. Mientras el ajuste esté en `null` no se borra nada. | §26 | U: envío vencido derivado se borra; uno `failed` no. |
| RN-WCN-016 | Solo el administrador registra o da de baja sitios y crea, ve o revoca tokens (con MFA reciente al crearlos); ventas administra formularios, datos de contacto, documentos legales, el generador y la invalidación manual; soporte solo ve los envíos y el contacto. | §26 | P: `sales` → 403 en `/admin/web-connector/sites/{id}/tokens`; `support` → 403 al editar un formulario. |
| RN-WCN-017 | `[hub_whois]` acepta solo las extensiones vendibles de la marca (atributo `extensiones`), muestra disponibilidad, precios de registro, renovación y transferencia de `domain_tld_prices` en la moneda pedida, sugerencias de nombres y extensiones (hasta `web_connector.whois.suggestions_max`) y el WHOIS público si `mostrar_whois` está activo; el navegador consulta por la ruta de reenvío del plugin, que no guarda nada, y los resultados nunca se guardan en la caché del plugin ni en la de página. Registrar y Transferir llevan al carrito del sistema central con `domain_action` `register` o `transfer`. | §27 | E: buscar un dominio libre y pulsar Registrar deja el dominio en el carrito con la marca de origen; U: extensión no vendible en el atributo → el bloque no se muestra y avisa al editor. |
| RN-WCN-018 | `[hub_servidores]` muestra solo planes vendibles de la marca de las categorías `vps` y `dedicated_server` con ficha técnica (`vps_plan_specs`) y precio vigente en la moneda pedida: CPU, RAM, disco y tipo, transferencia, sistema operativo, ubicación y administración; nunca proveedor, plan de origen ni costo. Los filtros (ubicación, sistema operativo, RAM, administrado) usan solo valores presentes en los planes. | §27 | I: la respuesta de `/public/wp/servers` no incluye `provider_id`, `provider_plan_ref` ni costos; U: plan sin precio en USD no aparece con `moneda="USD"`. |
| RN-WCN-019 | El configurador de `[hub_servidores]` suma el precio del plan en el ciclo y moneda elegidos y el de cada complemento (`product_addons`: respaldos, licencia cPanel, IP adicional…) en el mismo ciclo y moneda, todos entregados por el sistema, sin redondeos ni impuestos propios; un complemento obligatorio no se puede quitar. Contratar lleva al carrito con el plan, el ciclo y los complementos; el carrito recalcula y el total coincide con el mostrado. | §27 | E: total del configurador = total del carrito = total facturado; U: complemento obligatorio siempre incluido. |
| RN-WCN-020 | Todo texto enriquecido que entrega la API del plugin (documentos legales, mensajes de confirmación de formularios, descripciones de productos y servicios personalizados) ya va saneado por el sistema (RN-AUT-001) y sin variables sin resolver; el plugin lo imprime con `wp_kses_post` sin volver a interpretarlo. Guardar uno de esos textos invalida la caché del alcance que corresponde (RN-WCN-005). | §27 | U: una descripción con `<script>` llega sin él; U: guardar el mensaje de un formulario encola un aviso `form`. |

---

## BRD — Brands (apariencia del portal, el panel y los correos)

| ID | Regla | Origen | Cómo se prueba |
|---|---|---|---|
| RN-BRD-001 | Cada marca tiene un solo tema (`brand_themes`) y como máximo una versión `published`; publicar una versión archiva la anterior en la misma transacción. Volver a una versión anterior crea una versión nueva copiada de ella y la publica con el mismo control; el historial no se borra. Solo admin publica o revierte (`brands.theme.approve`). | §25, §26 | I: segundo tema de la marca y segunda versión publicada → 23505; P: `sales` recibe 403 al publicar; I: revertir deja tres versiones y una sola publicada. |
| RN-BRD-002 | Los tokens de diseño son declarativos: colores hexadecimales, tipografías de `brands.theme.allowed_fonts` servidas desde el propio servidor y opciones cerradas de botones, radios, encabezado y pie; no se admite CSS, HTML ni JavaScript libres ni recursos de dominios externos. | §8, §25 | U: tokens con `url(`, `<style>` o una fuente fuera de la lista → 422. |
| RN-BRD-003 | Una versión solo se publica con una verificación de contraste posterior a su último cambio en la que cada par texto/fondo de sus superficies, en modo claro y oscuro, alcanza `brands.theme.min_contrast_ratio`; editar los tokens borra la verificación. | §25 | I: publicar sin verificar o con relación 1.9 frente a 4.5 → 23514; U: editar tras verificar exige verificar de nuevo. |
| RN-BRD-004 | El tema aplica solo al portal y el carrito, al panel interno y a los correos y comprobantes (superficies `portal`, `admin`, `email`); la web pública usa el tema de WordPress. El portal y el carrito usan el tema de la marca de origen solo si `portal.central_identity` es `origin_brand`; el panel usa el del tema de la marca central; correos y comprobantes usan logo, colores y pie de la marca del documento, sin alterar los datos fiscales. | §25, §26 | I: superficie `website` → 23514; E: compra desde ServerCreativo con `origin_brand` muestra su tema en el carrito; I: el comprobante cambia de logo, no de contenido. |
| RN-BRD-005 | La vista previa de un borrador de tema solo se ve con un enlace firmado vigente (`brands.theme.preview_link_minutes`), con `noindex` y sin caché pública. | §25 | I: enlace vencido → 404; E: la respuesta lleva `X-Robots-Tag: noindex`. |

---

## IDN — Identity (seguridad administrable, roles y permisos)

| ID | Regla | Origen | Cómo se prueba |
|---|---|---|---|
| RN-IDN-001 | Una contraseña nueva cumple la longitud mínima `security.password.min_length` (10) y la complejidad `security.password.complexity`, no repite ninguna de las últimas `security.password.history_count` (5) y no figura en listas de contraseñas filtradas; caduca a `security.password.expiry_days` (0 = no caduca) y entonces se pide cambiarla al iniciar sesión. | §8, §26 | U: contraseña de 9 caracteres → 422 con la regla; reutilizar la anterior → 422; I: `password_histories` guarda solo hashes. |
| RN-IDN-002 | El segundo factor puede ser aplicación TOTP (`security.mfa.app_enabled`) o código al correo (`security.mfa.email_enabled`). Es obligatorio según `security.mfa.required_by_role` (por rol, gana sobre el tipo de usuario) o, si el rol no lo define, según `security.mfa.required_for_staff` y `security.mfa.required_for_customers`; el rol `admin` siempre lo exige. Un usuario obligado sin segundo factor solo puede enrolarse. | §8, §26 | U: rol `support` marcado `required` con personal en `false` → exige MFA; P: usuario obligado sin MFA → 403 en cualquier ruta salvo enrolamiento. |
| RN-IDN-003 | Un código al correo se guarda solo como hash, vence en `security.mfa.email_code_ttl_minutes` (10), admite `security.mfa.email_code_max_attempts` (5) intentos y se usa una sola vez; pedir otro invalida el anterior del mismo propósito. | §26 | I: usar dos veces o vencido → 23514; dos vigentes del mismo propósito → 23505; más intentos que los permitidos → 23514. |
| RN-IDN-004 | Tras `security.login_max_attempts` (5) intentos fallidos la cuenta queda bloqueada `security.login_lockout_minutes` (15); la respuesta no revela si la cuenta existe o está bloqueada; el administrador puede desbloquearla con auditoría. | §8, §26 | U: sexto intento → bloqueo; misma respuesta para correo inexistente; I: desbloqueo en `audit_events`. |
| RN-IDN-005 | Una sesión dura `security.session_duration_hours` (8); cambiar la contraseña o desactivar el segundo factor cierra las demás sesiones del usuario. | §8, §26 | U: sesión de 9 horas → 401; cambio de contraseña revoca las otras. |
| RN-IDN-006 | Un dispositivo de confianza evita pedir el segundo factor al iniciar sesión durante `security.trusted_device_days` (30; 0 = no se permiten), nunca en acciones con MFA reciente; el usuario o el administrador lo revocan y el token del dispositivo se guarda solo como hash. | §26 | U: dispositivo vencido o revocado pide el segundo factor; revelar un secreto desde un dispositivo de confianza igual exige MFA reciente. |
| RN-IDN-007 | Desactivar TOTP exige MFA reciente y, si la política obliga al usuario, que tenga el correo habilitado como alternativa (409 si no). | §26 | U: usuario obligado sin correo habilitado → 409. |
| RN-IDN-008 | Los roles del sistema no se borran ni cambian de código o audiencia; el administrador crea roles personalizados o copia uno existente y asigna permisos desde la matriz por módulo y acción; un rol de cliente solo recibe permisos `portal.*` y uno del personal nunca; un rol con usuarios asignados no se borra. | §5, §26 | I: borrar o renombrar un rol del sistema → 42501; permiso del portal en un rol del personal → 23514; P: solo `admin` cambia roles. |
| RN-IDN-009 | Cambiar la política de seguridad, un rol o su matriz exige MFA reciente (la política) y queda en auditoría con el valor anterior (`setting_changes` y `audit_events`); la política no puede dejar sin segundo factor a los administradores ni desactivar a la vez el correo y la aplicación si algún rol lo exige. | §8, §26 | U: desactivar ambos métodos con un rol obligado → 422; I: el cambio de la matriz guarda la lista anterior. |

---

## CAT — Catalog (administración de paquetes de hosting, VPS y dominios)

| ID | Regla | Origen | Cómo se prueba |
|---|---|---|---|
| RN-CAT-001 | Un producto aparece como contratable en la web de una marca solo si `products.sellable_online` y la ficha `product_listings` de esa marca tienen venta en línea, la fecha está dentro de su vigencia y existe precio vigente en la moneda pedida; si no, la web muestra "Solicitar cotización" o no lo muestra. El nombre, el orden y el destacado salen de la ficha de la marca. | §25 | I: ficha sin venta en línea → el catálogo público lo marca "Solicitar cotización"; ficha vencida → no aparece. |
| RN-CAT-002 | Todo cambio de precio (planes en `plan_prices`, extensiones en `domain_tld_prices`) es una fila nueva con fecha de vigencia que cierra la anterior, sin superposición; los clientes con servicios o dominios activos reciben aviso `billing.price_change.notice_days` antes de su siguiente renovación, el precio nuevo aplica desde esa renovación y nunca cambia facturas emitidas. | §22, §25 | I: vigencia invertida → 23514; U: renovación anterior al aviso mantiene el precio viejo; I: un aviso por servicio (dedupe). |
| RN-CAT-003 | Un paquete de hosting vendible exige ficha técnica con paquete de WHM; la cuenta se crea con ese paquete en el nodo preferido si acepta cuentas nuevas y está bajo los umbrales de capacidad; si no, en otro nodo con capacidad cuando `catalog.hosting.allow_node_fallback` lo permite, o el pedido pasa a revisión manual. | §17, §25 | I: paquete sin WHM → 23514; U: nodo preferido lleno con el ajuste en `false` → `manual_review`. |
| RN-CAT-004 | Un plan VPS exige proveedor y plan de origen; su costo por ciclo vive en `plans` y solo lo ve quien tiene `finance.cost.view`. El catálogo público y el portal nunca exponen proveedor, plan de origen, paquete de WHM, nodo ni costos. | §5, §25 | I: VPS sin plan de origen → 23514; prueba de serialización del catálogo público. |
| RN-CAT-005 | Cada extensión tiene registrador por defecto (proveedor `registrar` con cuenta activa) y margen mínimo (propio o `catalog.domain_prices.min_margin_percent`); si el precio de una operación vigente queda bajo el margen con el tipo de cambio del día se crea una alerta `margin` para finanzas, una por extensión y operación. Una extensión en venta en línea exige precio de registro y de renovación en la moneda pedida. | §22, §25 | I: extensión repetida → 23505; U: costo que sube deja el margen bajo el mínimo → una alerta. |
| RN-CAT-006 | Un cambio del catálogo publicado (ficha, precio vigente, venta en línea, tipo de servicio) envía al instante el aviso de invalidación a los sitios WordPress de la marca afectada (RN-WCN-005), sin esperar `web_connector.cache_ttl_seconds`. | §25, §26 | U: guardar una ficha encola un aviso `catalog` por cada sitio de la marca. |
| RN-CAT-007 | El catálogo completo tiene categorías de tipo fijo (hosting compartido, reseller, VPS, servidores dedicados, cloud, dominios, SSL, correo corporativo con cPanel, Google Workspace y Microsoft 365, páginas web, tiendas virtuales, Moodle, licencias, soporte y mantenimiento, desarrollo a medida) que no se borran ni cambian de tipo, una raíz por tipo, y categorías personalizadas (`custom`); cada una tiene un `shortcode_type` único que usa `[hub_planes tipo="..."]`. El SEO de los planes vive en WordPress. | §26 | I: segunda raíz del mismo tipo → 23505; tipo fuera de la lista → 23514; U: borrar una categoría del sistema → 409. |
| RN-CAT-008 | Un tipo de servicio personalizado se crea sin programar (identidad, categoría existente o nueva, marcas, campos, entrega, contrato, componente del mapa, datos del portal, venta) y solo se activa con al menos una marca y un producto con precio en alguna moneda; con venta en línea exige `products.sellable_online`, y si no, muestra "Solicitar cotización". Activado, aparece al instante en el generador y en los shortcodes de catálogo. | §26 | I: activo sin marcas → 23514; U: activar sin producto con precio → 422; E: el shortcode muestra el tipo nuevo. |
| RN-CAT-009 | Los campos propios son de tipo texto, número, lista, fecha, archivo o casilla; una lista tiene opciones; cada valor guardado es coherente con el tipo de su campo (clave foránea compuesta) y un valor de lista es una de sus opciones; un campo con valores no cambia de tipo (se desactiva y se crea otro). Los obligatorios que completa el cliente se piden al contratar o cotizar; los de soporte se completan antes de activar el servicio. | §26 | I: texto en un campo de fecha → 23514; tipo distinto al del campo → 23503; opción inexistente → 23514; cambiar el tipo → 23514. |
| RN-CAT-010 | Al activarse un servicio de un tipo personalizado se crean sus tareas plantilla de entrega (`delivery_tasks`), el componente del mapa (`component_kind`) en el proyecto del cliente y, si `requires_contract`, no se activa sin contrato vigente (RN-CTR). | §26 | U: activar un servicio de tipo "Landing page" crea sus tareas y el componente `wordpress_site`. |
| RN-CAT-011 | El portal muestra de un servicio personalizado solo los campos de `portal_fields`; nunca su costo ni su proveedor (salvo `services.show_provider`). | §21, §26 | I: la respuesta del portal no incluye campos fuera de `portal_fields` ni el costo. |
| RN-CAT-012 | Solo el administrador crea, edita, activa o archiva tipos de servicio; ventas los ve y los usa en cotizaciones; un tipo archivado deja de venderse y sus servicios conservan campos y valores. | §26 | P: `sales` → 403 al crear un tipo; U: tipo archivado no aparece en el generador. |
| RN-CAT-013 | La ficha de un VPS o servidor dedicado (`vps_plan_specs`) guarda CPU (y procesador en dedicados), RAM, disco y tipo de disco (`ssd`, `nvme`, `hdd`), transferencia (vacía = sin límite), sistemas operativos, ubicación y si es administrado; sus complementos son productos enlazados en `product_addons` con planes y precios por ciclo y moneda. Un plan aparece en `[hub_servidores]` solo con ficha y precio vigente. | §27 | I: tipo de disco fuera de la lista → 23514; U: complemento sin precio en el ciclo elegido no se ofrece en ese ciclo. |

---

## ORD — Orders (compra en línea)

| ID | Regla | Origen | Cómo se prueba |
|---|---|---|---|
| RN-ORD-001 | Solo entran al carrito productos con `products.sellable_online`, activos y de la marca del carrito (o de todas las marcas); el resto se ofrece con "Solicitar cotización" y entra al CRM. | §22, §25 | I: agregar un VPS sin venta en línea → 422; E: el botón de la web cambia a "Solicitar cotización". |
| RN-ORD-002 | El precio de cada línea lo fija el servidor desde `plan_prices` o `domain_tld_prices` vigentes de la marca y moneda; nunca se acepta un precio enviado por el navegador, y al confirmar la compra se recalcula y se congela en `snapshot`. | §25 | I: petición con precio manipulado se ignora; cambio de precio entre carrito y confirmación se refleja con aviso. |
| RN-ORD-003 | Un dominio a registrar se agrega solo tras consultar su disponibilidad al registrador; si el registrador no responde, no se da por disponible. La consulta pública tiene límite por IP (`orders.online.domain_check_limit_per_ip_per_hour`). | §25 | I: línea `register` sin consulta → 23514; U: timeout del registrador → "no verificado"; I: superar el límite → 429. |
| RN-ORD-004 | La compra exige cuenta con sesión, captcha y aceptación de términos; no pasa a pago sin el correo del usuario verificado. | §25 | I: compra sin términos → 23502; pasar a `awaiting_payment` sin correo verificado → 23514. |
| RN-ORD-005 | Una compra en línea genera a lo sumo un pedido, aunque el webhook llegue varias veces o el job se reintente; un carrito tiene a lo sumo una compra en curso; confirmar exige `Idempotency-Key`. | §10, §25 | I: segundo pedido de la misma compra → 23505; dos webhooks de pago crean un solo pedido. |
| RN-ORD-006 | El pedido y la factura se crean solo con el pago validado (tarjeta o PayPal por webhook firmado con importe coincidente, voucher validado por finanzas); un voucher `reported` deja la compra en `awaiting_validation` sin crear pedido ni factura. | §7, §25 | I: voucher reportado no crea pedido; al validarlo se crean pedido y factura. |
| RN-ORD-007 | El pedido en línea nace aprobado por el sistema con la marca de origen; la factura se emite con esa marca y el pago se aplica; el aprovisionamiento sigue la máquina de pedidos (cuenta en el nodo con capacidad, registro del dominio, bienvenida) y, sin API, pasa a revisión manual con tarea. | §6, §17, §25 | E: flujo J completo con conectores simulados; sin capacidad del registrador → `manual_review` y tarea. |
| RN-ORD-008 | Un cliente nuevo (dentro de `orders.online.new_customer_window_days` desde su alta) con más de `orders.online.new_customer_max_open_checkouts` compras en curso o pagadas pasa a revisión manual antes de pagar. | §25 | U: tercera compra de un cliente de 5 días con el límite en 2 → `manual_review`. |
| RN-ORD-009 | Una compra que cumple alguna regla de `orders.online.manual_review_rules` (monto por moneda, cantidad de dominios, país distinto del de la IP, correo desechable) queda en `manual_review` con motivo; finanzas o admin la aprueban o rechazan con motivo y no hay cobro antes de la decisión. Las reglas con valor `null` no se aplican. | §25 | U: total sobre el máximo → revisión; I: aprobar sin motivo → 422; P: `sales` no aprueba. |
| RN-ORD-010 | El aviso de carrito abandonado se envía una sola vez por carrito y solo si el contacto aceptó comunicaciones comerciales (`communication_consents`) y el ajuste está activo. | §24, §25 | I: carrito sin consentimiento no genera aviso; con consentimiento, uno solo (dedupe). |
| RN-ORD-011 | Una compra que vence sin pago no se cobra; antes de vencer una compra con pago iniciado se consulta la transacción en la pasarela, y un pago aprobado que llega después del vencimiento reabre la compra y alerta a finanzas. | §10, §25 | U: transacción aprobada encontrada al vencer → `paid`; webhook tardío → alerta. |
| RN-ORD-012 | Un intento de pago con tarjeta paga facturas emitidas o una compra en línea, nunca ambas; el recargo del medio se muestra antes de confirmar y se factura como línea aparte. | §21, §25 | I: intento con facturas y compra → 23514; E: recargo visible y en la factura. |
| RN-ORD-013 | La compra en línea no se activa mientras `orders.online.captcha_provider` esté en `null`; el captcha se verifica en el servidor al crear la cuenta y al confirmar la compra, y una verificación fallida no crea la compra. | §25 | I: captcha inválido → 422 sin fila en `checkout_sessions`; con el proveedor en `null` → "Solicitar cotización". |
| RN-ORD-014 | Un paquete de hosting o un dominio entra al carrito solo con su ficha completa: hosting con `hosting_package_specs`, dominio con su extensión en `domain_extensions` con venta en línea; la línea guarda el precio vigente que el servidor calculó. | §25 | I: hosting sin ficha técnica → 422; extensión sin venta en línea → 422. |
| RN-ORD-015 | Confirmar una compra exige aceptar la versión vigente de los términos de la marca y de cada tipo de servicio del carrito, registrada en `legal_acceptances`; `orders.online.enabled` no puede activarse mientras la marca no tenga vigentes términos y privacidad ni el Libro de Reclamaciones habilitado (`complaints.response_days` definido); la política de cookies se publica en WordPress. | §25, §26 | I: compra sin aceptación de la versión vigente → 422; activar la compra en línea con el Libro sin plazo → 422. |
| RN-ORD-016 | Al completar la compra, el sistema devuelve al cliente a la página de agradecimiento del sitio WordPress de origen (`wp_sites.thank_you_url`) con el código del pedido, el importe y la moneda, una sola vez por compra; los píxeles de WordPress registran allí la conversión y el sistema no carga píxeles ni scripts de terceros en el carrito ni en el portal. | §25, §26 | E: la compra lleva a la página de agradecimiento con importe y moneda; recargarla no repite la conversión; I: el carrito no incluye scripts de terceros. |

---

## AIA — Assistant (asistente con IA)

| ID | Regla | Origen | Cómo se prueba |
|---|---|---|---|
| RN-AIA-001 | El asistente se presenta siempre como asistente automático en el primer mensaje y ofrece hablar con una persona; la respuesta de la API lo marca con `is_automated = true`. | §25 | E: primer mensaje en web y portal contiene el aviso; I: perfil con saludo sin aviso → 422. |
| RN-AIA-002 | Fuentes permitidas: artículos `public` y `published` de la marca en la base de conocimientos del sistema, su catálogo con precio vigente y sus datos de contacto y documentos legales vigentes (`brand_info`); en el portal, además, los servicios del cliente de la sesión con la clase de recurso del portal. En la web nunca lee servicios de clientes. | §25, §26 | I: perfil web con `customer_services` → 23514; perfil con una fuente fuera de la lista → 23514; U: artículo interno no se indexa. |
| RN-AIA-003 | El asistente nunca ve ni devuelve datos de otros clientes, facturas o pagos, contratos, accesos de la bóveda, costos, proveedores ni notas internas; las herramientas reciben el `customer_id` de la sesión y nunca del modelo. | §5, §8, §25 | I: pedir datos de otro cliente desde el portal no devuelve nada; prueba de serialización de fuentes. |
| RN-AIA-004 | Solo se ejecutan herramientas de la lista permitida (`recommend_plan`, `check_domain`, `create_lead`, `create_ticket`, `handoff`) habilitadas en el perfil; cada parámetro se valida en el servidor y ninguna herramienta actúa sobre servicios. | §25 | I: herramienta fuera de la lista → 23514; U: parámetros de otra marca → rechazo. |
| RN-AIA-005 | El contenido del usuario, de los artículos y de las páginas se envía como datos delimitados, nunca como instrucciones; los intentos de inyección detectados se registran (`injection_flagged`) y no cambian el comportamiento. | §8, §25 | U: batería de inyección (mensaje, artículo y página) sin fuga de instrucciones ni llamadas indebidas. |
| RN-AIA-006 | Un prospecto creado por el asistente lleva canal `assistant`, marca, página y conversación enlazada y se asigna con las reglas de la marca; el consentimiento comercial solo se registra si el visitante lo marca. | §24, §25 | I: herramienta `create_lead` crea prospecto con canal y enlace; sin casilla no hay consentimiento. |
| RN-AIA-007 | Antes de llamar a la API se aplican los topes: mensajes por IP y hora en la web, `assistant.max_messages_per_conversation`, `assistant.max_output_tokens_per_reply` y `assistant.monthly_token_limit` de la marca; al superarlos la conversación pasa a `limit_reached` o el widget ofrece solo contacto humano. | §25 | U: mensaje 31 con tope 30 → `limit_reached`; tope mensual alcanzado → 429 y aviso al administrador. |
| RN-AIA-008 | Modelo e instrucciones se leen por marca (`assistant.model`, `assistant.instructions`); mientras alguno esté en `null` el asistente no se activa. | §23, §25 | I: activar perfil sin modelo → 422. |
| RN-AIA-009 | Cada mensaje y llamada a herramienta queda en `ai_messages` (solo inserción) y la conversación se enlaza al prospecto, cliente o ticket que generó; el consumo se suma en `ai_usage` por marca y mes. | §25 | I: `UPDATE` en `ai_messages` → 42501; consumo mensual sin duplicados. |
| RN-AIA-010 | Las conversaciones se anonimizan al cumplir `assistant.conversation_retention_days`; mientras el ajuste esté en `null` no se purgan. | §8, §25 | U: conversación vencida queda sin contenido personal; con el ajuste en `null` no se toca. |
| RN-AIA-011 | En la web, el asistente se inserta con `[hub_asistente]`: el widget habla directo con el sistema central (no pasa por WordPress), la conversación registra el sitio (`ai_conversations.wp_site_id`) y el contenido de las páginas de WordPress no es fuente del asistente. | §26 | E: conversación desde el sitio de ServerCreativo queda con su sitio; U: el widget no envía la conversación al servidor de WordPress. |

---

## MON — Monitoring (respaldos y restauración ampliados)

| ID | Regla | Origen | Cómo se prueba |
|---|---|---|---|
| RN-MON-001 | Una solicitud de restauración exige servicio propio del cliente, tipo permitido (`monitoring.restore.customer_target_kinds`), fecha a restaurar, confirmación de sobrescritura y ticket; hay a lo sumo una abierta por objeto. | §25 | I: sin confirmación → 23514; segunda abierta del mismo buzón → 23505. |
| RN-MON-002 | Ninguna restauración se ejecuta sin aprobación de soporte; quien la registró en nombre del cliente no la aprueba (salvo admin con motivo). | §5, §25 | I: aprobada sin aprobador → 23514; P: el mismo usuario que la registró → 403. |
| RN-MON-003 | Al iniciar, si la herramienta del nodo tiene API habilitada y la capacidad de restaurar ese tipo, se restaura por API (`execution_mode = api`); si no, se crea una tarea asistida con el procedimiento (`assisted`) y no se llama a ningún conector. | §6, §25 | U: nodo sin API crea tarea; con API llama a `BackupToolConnector::restore` con `Idempotency-Key`. |
| RN-MON-004 | Una restauración se cierra como `completed` solo con evidencia adjunta, que se publica en el ticket del cliente; un fallo exige el resultado y deja el ticket abierto. | §25 | I: completada sin evidencia → 23514. |
| RN-MON-005 | La lectura de la herramienta de respaldos registra cada respaldo una sola vez (`backup_runs` único por herramienta e id externo) y alimenta las alertas de respaldo fallido o atrasado. | §25 | I: segunda lectura no duplica; respaldo atrasado alerta una vez. |
| RN-MON-006 | El informe de respaldos del portal muestra por servicio responsabilidad, frecuencia, retención, último respaldo exitoso, puntos de restauración y restauraciones, sin nodo, herramienta, ubicación, id externo ni proveedor; se oculta si `monitoring.backup_report.visible` está apagado para el cliente. | §5, §25 | I: prueba de serialización del informe; con el ajuste apagado → 404. |
| RN-MON-007 | Una prueba del plan de recuperación copia los objetivos vigentes (`system.backup.rpo_minutes`, `system.backup.rto_minutes`) y solo se registra como `passed` con evidencia y con pérdida y tiempo medidos dentro de ellos; mientras los objetivos estén en `null` no se puede aprobar ninguna. | §12, §25 | I: aprobada fuera del RTO → 23514; sin objetivos definidos → 422. |
| RN-MON-008 | Si pasan `system.dr_test.frequency_days` sin una prueba `passed`, `CheckDrTestDue` crea una tarea para soporte y una alerta, una sola vez por periodo. | §12, §25 | U: última prueba hace 91 días con frecuencia 90 → una tarea. |
| RN-MON-009 | La lectura y la restauración por API solo se usan en nodos con `backup_tool_accounts.api_enabled` y una cuenta de proveedor con la credencial en la bóveda; la API se usa en solo lectura hasta habilitar la restauración por cuenta, y cada restauración por API se registra en la bitácora de uso del secreto. | §6, §8, §25 | I: herramienta con API sin cuenta → 23514; U: restauración con la escritura deshabilitada → tarea asistida. |
| RN-MON-010 | El plan de recuperación es un procedimiento escrito y versionado; cada prueba registra la versión usada (`dr_tests.procedure_version`), el respaldo de S3 restaurado y una lista de verificación, y una prueba `failed` o `partial` crea una tarea para corregir el procedimiento. | §12, §25 | U: prueba `partial` crea una tarea; I: prueba sin versión del procedimiento → 23502. |
| RN-MON-011 | Toda restauración completada aparece el mismo día en el informe de respaldos del cliente (fecha, objeto, punto restaurado) y en su ticket; el informe nunca muestra restauraciones ni respaldos de otros servicios o clientes y se puede descargar en PDF. | §25 | I: restauración completada visible en el informe del cliente y ausente en el de otro cliente. |

---

## LRC — Complaints (Libro de Reclamaciones y datos personales)

| ID | Regla | Origen | Cómo se prueba |
|---|---|---|---|
| RN-LRC-001 | Cada sitio WordPress de marca muestra el enlace al Libro de Reclamaciones en todas las páginas (pie del tema con `[hub_libro_reclamaciones]`); la hoja exige datos del consumidor, servicio contratado, tipo (reclamo o queja), detalle y pedido, y representante si el consumidor es menor de edad. Mientras `complaints.response_days` esté en `null` el formulario no registra hojas. | §25 | E: pie con el enlace en todas las páginas, incluidas las de error; I: menor sin representante → 23514. |
| RN-LRC-002 | El número es correlativo por marca, sin huecos ni repeticiones, tomado con `hub_next_code()` sobre la entidad `complaint:<código de marca>` dentro de la misma transacción que crea la hoja. | §25 | I: número repetido en la marca → 23505; prueba concurrente: 2 × 50 hojas sin huecos. |
| RN-LRC-003 | Al registrar la hoja se envía al correo del consumidor una constancia en PDF con la razón social, el RUC, el número, la fecha y el plazo; si el envío falla, la hoja queda registrada, se reintenta y se alerta. | §25 | U: correo fallido deja la hoja y un reintento en cola; la constancia contiene los datos exigidos. |
| RN-LRC-004 | Las hojas reales no se borran (trigger `complaints_guard`) y las respuestas enviadas no se editan; corregir una respuesta es enviar otra. Solo una hoja marcada como prueba se elimina (RN-LRC-012). | §25, §26 | I: `DELETE` de una hoja real y `UPDATE` de una respuesta → 42501. |
| RN-LRC-005 | El plazo `complaints.response_days` se copia a la hoja al registrarla y se cuenta en días hábiles con los feriados de CFG; `CheckComplaintDeadlines` avisa a documentación y al administrador en cada umbral de `complaints.alert_days_before` y cada día después del vencimiento; responder fuera de plazo se permite y queda marcado. | §25 | U: hoja del viernes con plazo de 15 días hábiles vence según el calendario; un aviso por umbral. |
| RN-LRC-006 | La consulta pública de una hoja exige su código y el correo del consumidor; si no coinciden responde 404 sin revelar si el código existe; el formulario público tiene captcha y límite `complaints.public_limit_per_ip_per_day` por IP. | §25 | I: correo equivocado → 404; sexta hoja de la misma IP en el día → 429. |
| RN-LRC-007 | El Libro se exporta por marca y rango con todas las hojas, respuestas y fechas; la exportación queda en auditoría. Los datos del consumidor se anonimizan solo al cumplir `complaints.retention_years`; mientras esté en `null` no se anonimiza nada. | §25 | U: exportación incluye hojas respondidas fuera de plazo; con el ajuste en `null` no se anonimiza. |
| RN-LRC-008 | Una solicitud de datos personales no se responde ni se rechaza sin verificar la identidad del titular (método y evidencia); su plazo por tipo sale de `complaints.privacy_response_days` y, si el tipo no tiene plazo definido, se alerta a diario. | §25 | I: respondida sin identidad → 23514. |
| RN-LRC-009 | El acceso entrega la exportación de datos personales del cliente; la rectificación corrige con auditoría; la cancelación anonimiza lo que la ley no obliga a conservar (comprobantes, hojas del Libro y auditoría se conservan); la oposición revoca los consentimientos comerciales. | §25 | E: cancelación deja comprobantes intactos y el cliente anonimizado; oposición revoca `communication_consents`. |
| RN-LRC-010 | Solo `documentation` y `admin` responden hojas y solicitudes; `support` solo las ve; `sales` y `finance` no acceden. | §25 | P: `sales` → 403 en `/admin/complaints`; `support` → 403 al responder. |
| RN-LRC-011 | Solo el administrador, con MFA reciente, marca una hoja como prueba, con motivo; una hoja ya respondida al consumidor no se marca y una de prueba no vuelve a ser real. | §26 | I: marcar una hoja respondida o sin motivo → 23514; P: `documentation` → 403 en `mark-test`. |
| RN-LRC-012 | Solo se eliminan hojas marcadas como prueba (una real → 409 en la API y 42501 en la base), junto con sus respuestas; cada eliminación deja en `complaint_deletions` (solo inserción) el número, el código, el motivo, quién la marcó, quién la eliminó y una copia, y queda en auditoría: el hueco del correlativo queda justificado. | §26 | I: eliminar una hoja de prueba crea su constancia; eliminar una real → 42501; editar la constancia → 42501. |
| RN-LRC-013 | La vista pública del Libro (P-LRC-08) y el formulario de `[hub_libro_reclamaciones]` salen de la misma definición (`GET /public/wp/complaint-form`): datos del proveedor tomados de la entidad emisora de la marca (razón social, RUC y dirección), campos del reglamento, declaración, plazo vigente y estado de habilitación; la vista del panel no registra hojas ni toma correlativo. | §27 | U: la vista pública y la respuesta de `/public/wp/complaint-form` de la misma marca son iguales; I: abrir la vista pública no consume `code_sequences`. |
| RN-LRC-014 | La hoja de reclamación numerada se envía al consumidor como constancia con un enlace propio (`GET /public/complaints/sheets/{token}`) y en PDF; el token es aleatorio y solo se guarda su hash (`complaints.sheet_token_hash`, único); reenviar la constancia no lo cambia; un token desconocido responde 404 sin revelar nada. | §27 | I: dos hojas con el mismo hash → 23505; U: token inválido → 404 genérico. |
| RN-LRC-015 | La carta de respuesta se redacta con el editor enriquecido a partir de una plantilla de la marca (`notification_templates.category = complaint_response`, solo correo HTML), se sanea (RN-AUT-001) y se registra con el HTML enviado, su texto plano, la plantilla, quién respondió (`responded_by`) y la fecha de envío (`sent_at`); no se edita ni se borra (RN-LRC-004). | §27 | I: plantilla de carta por otro canal → 23514; U: carta con `javascript:` se sanea antes de la vista previa. |
| RN-LRC-016 | No se envía una carta sin vista previa: el envío exige el `preview_sha256` de la última vista previa del mismo usuario y se manda exactamente ese HTML; si el texto cambió responde 409. La base verifica que el hash corresponda al HTML guardado y que la vista previa sea anterior al envío. | §27 | I: hash distinto del HTML → 23514; envío antes de la vista previa → 23514; U: texto cambiado después de la vista previa → 409. |

---

## DSH — Dashboard (panel de indicadores)

| ID | Regla | Origen | Cómo se prueba |
|---|---|---|---|
| RN-DSH-001 | Cada indicador del panel está en el catálogo `database/seeds/kpis.json` (docs/14) con código, definición, fórmula exacta sobre tablas y columnas del esquema, unidad, dirección deseada, frecuencia, dimensiones, meta y pantalla de detalle; el valor que muestra el panel coincide con el total del listado del módulo dueño con los mismos filtros. | §27 | A: `tools/verificar_kpis.py`; I: por cada indicador, valor = total del listado de detalle con datos de demostración. |
| RN-DSH-002 | Cada rol ve solo los grupos para los que tiene permiso (`dashboard.kpi_finance.view` y los demás de grupo); un grupo o indicador sin permiso no aparece en el panel, el catálogo, el detalle ni la exportación (no se muestra en cero). | §27, §5 | P: `sales` → 403 en `/admin/kpi-values/finance`; U: la exportación de `finance` no incluye Comercial. |
| RN-DSH-003 | `ComputeKpiSnapshots` calcula cada indicador con su frecuencia (`dashboard.calculation.*`) y guarda un valor por periodo y combinación de dimensiones, con numerador y denominador en las razones; un recálculo reemplaza el valor sin duplicarlo; un periodo se reagrega sumando numeradores y denominadores; con denominador 0 el valor es nulo ("Sin datos en el periodo"). | §27 | I: valor repetido con dimensiones nulas → 23505; U: razón del trimestre = suma de numeradores / suma de denominadores de sus meses. |
| RN-DSH-004 | La meta de un indicador es la de `kpi_targets` para su marca y periodo; si no hay, la de su `dashboard.targets.*`; si también es `null`, el indicador se muestra "sin meta" y sin semáforo. El semáforo cumple si el valor es ≥ meta (dirección `up`) o ≤ meta (`down`). Las metas en dinero llevan moneda y las de porcentaje van de 0 a 100. | §27 | I: meta de porcentaje 120 → 23514; U: sin meta en tabla ni ajuste → `status = no_target`. |
| RN-DSH-005 | Los indicadores en dinero se filtran por moneda o se consolidan en `dashboard.consolidation_currency` con el tipo de cambio de la fecha de cada documento (aviso si falta); facturado, cobrado y reconocido se muestran siempre por separado. | §7, §27 | U: consolidación con tipo de cambio de la fecha del documento; sin tipo de cambio → `incomplete_exchange_rates`. |
| RN-DSH-006 | La comparación usa el periodo anterior de igual duración; los indicadores de Reclamos excluyen hojas de prueba (`complaints.is_test`) y ningún indicador mezcla datos de otra organización. | §27 | U: hoja de prueba no cuenta en KPI-REC-01; I: aislamiento por `organization_id`. |

---

## AUT — Automation (editor de textos enriquecido)

| ID | Regla | Origen | Cómo se prueba |
|---|---|---|---|
| RN-AUT-001 | Todo texto enriquecido se sanea en el backend al guardarlo y en cada vista previa con `editor.html.allowed_tags`, `editor.html.allowed_attributes` y `editor.html.allowed_link_schemes`: se eliminan scripts, iframes, objetos, estilos en línea, atributos de evento y enlaces `javascript:`, `data:` o `vbscript:`; el editor informa qué se quitó. La base rechaza además lo evidente en plantillas HTML, versiones y cartas del Libro. | §27 | U: batería de cargas XSS no sobrevive al saneado; I: plantilla con `<script>` → 23514. |
| RN-AUT-002 | El editor solo inserta imágenes subidas a `files` (antivirus, tipo imagen, hasta `editor.images.max_mb`) y con texto alternativo; una imagen de otro dominio se elimina al sanear. | §27 | U: imagen externa eliminada; imagen sin texto alternativo → 422. |
| RN-AUT-003 | Las variables insertables dependen del contexto (contrato, aviso, respuesta de ticket, carta del Libro…); una variable desconocida → 422; la vista previa resuelve variables solo con datos que el usuario puede ver. Las plantillas de WhatsApp son de texto plano y las cartas del Libro, correo HTML. | §27 | U: variable inexistente → 422; I: plantilla de WhatsApp en HTML → 23514; P: vista previa con un registro ajeno → 404. |
| RN-AUT-004 | Guardar un texto enriquecido de una tabla sin versiones propias (plantillas de correo y avisos, plantillas y cláusulas de contrato, artículos, mensajes de formularios, descripciones de productos y servicios personalizados) crea una fila en `rich_text_versions` (solo inserción) con autor, hash y huella del saneado; restaurar crea una versión nueva y exige poder editar el registro dueño. Los documentos legales, los contratos y las cotizaciones usan sus propias versiones. | §27 | I: `UPDATE` del historial → 42501; versión repetida → 23505; U: restaurar crea la versión N+1. |

---

## Resumen de reglas por módulo

| Módulo | Reglas |
|---|---|
| BIL (facturación 27, cobranza 11, pagos 16) | 54 |
| SRV (servicios 13, portal 7) | 20 |
| MAP | 9 |
| DOM | 17 |
| CTR | 8 |
| SAL | 11 |
| CUS | 2 |
| VLT | 10 |
| HLP | 10 |
| INV | 8 |
| CLD | 8 |
| CFG | 9 |
| WCN | 20 |
| BRD | 5 |
| IDN | 9 |
| CAT | 13 |
| ORD | 16 |
| AIA | 11 |
| MON | 11 |
| LRC | 16 |
| DSH | 6 |
| AUT | 4 |
| **Total** | **277** |

## Nombres usados fuera del contrato

- Columna `services.show_provider` (sobrescritura por servicio del ajuste `portal.show_provider_name`, docs/00 §21 "por cliente y por servicio"); el contrato no define el nivel `service` en `settings.scope_type`.
- Permiso `billing.invoice.void` (ver documento 03).
- Columna `payment_methods.pass_to_customer` (docs/00 §4 la describe; el contrato no fija columnas).
- Tablas `payment_checkouts`, `payment_refunds`, `payment_disputes` y `payment_settlement_lines`, estado `charged_back` de `payments.status` y tipo de alerta `chargeback` (pago con tarjeta, docs/00 §21).
- Reglas RN-CAT, RN-ORD, RN-AIA, RN-MON y RN-LRC del alcance de docs/00 §25, sobre las tablas agregadas al contrato (`legal_documents`, `legal_document_versions`, `legal_acceptances`, `complaints`, `complaint_responses`, `privacy_requests`, `brand_themes`, `brand_theme_versions`, `domain_extensions`, `product_listings`, `hosting_package_specs`, `vps_plan_specs`, `carts`, `cart_items`, `checkout_sessions`, `ai_*`, `backup_tool_accounts`, `restore_requests`, `dr_tests`) y la interfaz `BackupToolConnector` (`docs/08`).
- Reglas RN-WCN, RN-BRD, RN-IDN, RN-CAT-006 a RN-CAT-012, RN-SAL-010, RN-SAL-011, RN-HLP-008 a RN-HLP-010 y RN-LRC-011 y RN-LRC-012 del alcance de docs/00 §26, sobre las tablas `wp_sites`, `wp_site_tokens`, `wp_cache_invalidations`, `web_forms`, `web_form_fields`, `web_form_submissions`, `brand_contact_points`, `service_types`, `service_type_fields`, `service_field_values`, `email_login_codes`, `trusted_devices`, `password_histories`, `lead_stage_changes` y `complaint_deletions`. Reglas RN-DSH, RN-AUT, RN-DOM-015 a RN-DOM-017, RN-WCN-017 a RN-WCN-020, RN-CAT-013 y RN-LRC-013 a RN-LRC-016 del alcance de docs/00 §27, sobre las tablas `kpi_definitions`, `kpi_targets`, `kpi_snapshots`, `rich_text_versions` y `whois_lookups` y las columnas nuevas de `notification_templates`, `complaints`, `complaint_responses` y `vps_plan_specs`. Las reglas RN-WEB-001 a RN-WEB-030 del antiguo CMS se retiraron; las que siguen vigentes pasaron a RN-WCN (sitios, precios, enlaces al sistema central, formularios, documentos legales y aceptación) y RN-BRD (temas).
