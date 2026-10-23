# 11a. Propuesta de valores estándar para las decisiones D-01 a D-36

> **Aviso.** Esta es una propuesta de trabajo para que la confirmen el contador y la asesoría legal. No es asesoría legal ni tributaria. Fecha de referencia: 21 de octubre de 2026.
>
> **Alcance de la verificación.** Las búsquedas se hicieron con buscador web. Varias páginas oficiales (SUNAT «emprender», lista de detracciones, PDF del Congreso) devolvieron error 403 o 404 al abrirlas, así que casi ninguna cifra se leyó en el texto oficial íntegro. Lo que viene de una fuente oficial solo a través de un resumen del buscador, o de un medio secundario, se marca «por verificar». La confianza «alta» se reserva a normas cuyo contenido principal coincidió en fuentes oficiales o en varias fuentes coincidentes; aun así, el contador o el abogado deben leer el texto vigente antes de cargar el valor.

## Tabla resumen

| D | Propuesta | Base | Clave de ajuste | Confianza |
|---|---|---|---|---|
| D-01 | Contratar un OSE o PSE ya homologado por SUNAT; elegir por costo, API y soporte | Norma SUNAT (RS 117-2017 y 133-2019) y práctica | `billing.einvoice.provider` | Media |
| D-02 | Hosting y dominios a clientes no domiciliados se tratan como exportación de servicios solo si se cumplen los requisitos concurrentes y la empresa está inscrita en el Registro de Exportadores de Servicios | Art. 33 TUO Ley del IGV (ver nota sobre el Apéndice V) | `tax_treatment` por producto | Media |
| D-03 | 12 % y mínimo S/ 700 para el numeral 10 del Anexo 3 si el contador confirma que hosting y dominios entran ahí; leyenda y cuenta por verificar | RS 183-2004/SUNAT, RS 071-2018/SUNAT | `billing.detraction.percentage`, `.min_amount`, `.products`, `.bank_account`, `.legend` | Media |
| D-04 | Recargo por mora como interés moratorio anual, 3 días de gracia, nunca por encima del máximo del BCRP; no cargar penalidades fijas sin pacto expreso | Código Civil, Circular BCRP 0008-2021, Código del Consumidor | `billing.late_fee.type`, `.value`, `.grace_days`, `.max_amount` | Media |
| D-05 | Primera respuesta: urgente 1 h, alta 4 h, normal 8 h hábiles, baja 24 h hábiles | Práctica del sector | tabla `sla_policies` | Baja |
| D-06 | No asumir API; consultar con Global66 por escrito y operar con conciliación manual mientras tanto | Sin fuente | conector `PaymentConnector` | Baja |
| D-07 | Pedir a BanaHosting privilegios mínimos: crear, suspender, terminar, cambiar paquete y contraseña, listar cuentas | Principio de mínimo privilegio | conector WHM | Baja |
| D-08 | Confirmar por escrito con cada registrador si hay API; sin API, flujo manual | Sin fuente | `RegistrarConnector` | Baja |
| D-09 | Usar las reglas publicadas por cada registro; mientras no se documenten, solo operación asistida por soporte | Práctica; reglas por verificar en cada registro | `tld_rules` | Baja |
| D-10 | Bucket privado S3, región cercana (por ejemplo `sa-east-1`), cifrado, versionado y retención de 30 días en caliente | Práctica | `system.backup.retention_days`, `.cold_storage_after_days` | Baja |
| D-11 | Firma electrónica simple con proveedor local o internacional; firma digital con certificado solo para contratos que lo exijan | Ley 27269 y su reglamento (por verificar) | `SignatureConnector` | Media |
| D-12 | Elegir una herramienta con webhooks y check HTTP; empezar por la más sencilla | Práctica | `MonitoringConnector` | Baja |
| D-13 | Postular a los programas de socio de Google y Microsoft; sin cuota mínima hasta tener volumen | Práctica | conectores de revendedor | Baja |
| D-14 | Conservar datos personales mientras dure la relación y los plazos tributarios y contables; después, cancelar o bloquear | Ley 29733; DS 016-2024-JUS; Código Tributario art. 87 (por verificar) | `complaints.privacy_response_days` | Media |
| D-15 | Tipo de cambio venta SBS de la fecha de emisión del comprobante | SUNAT (anexos de RVIE y RCE) y SBS | `billing.rebilling.exchange_rate_date`, `billing.exchange_rate.*` | Media |
| D-16 | Una factura por cliente y ciclo, con consolidación activada | Práctica | `billing.invoice_consolidation` | Baja |
| D-17 | Mantener `hub` como nombre interno y decidir el comercial después de buscar disponibilidad en Indecopi | Indecopi (búsqueda de marca) | n/a | Baja |
| D-18 | Elegir entre Niubiz, Izipay y Culqi con la tabla del `docs/00`; priorizar comisión, plazo de abono y API | Práctica | `billing.card_gateway.*` | Baja |
| D-19 | `panel.`, `clientes.` y `api.` bajo alojamientoplus.com con certificado comodín | Práctica | `system.central_domains` | Baja |
| D-20 | Identidad AlojamientoPlus con marca de origen en el encabezado (el valor ya cargado) | Decisión de producto | `portal.central_identity` | Baja |
| D-21 | JetBackup si la licencia ya existe en los servidores; confirmar su API | Práctica | `BackupToolConnector` | Baja |
| D-22 | Usar el modelo intermedio de Claude, instrucciones por marca y tope mensual de tokens con aviso al 80 % | Decisión de costos | `assistant.model`, `.instructions`, `.monthly_token_limit` | Baja |
| D-23 | Migrar solo las páginas con tráfico, mantener las URL y poner 301 para las que cambien | Práctica SEO | n/a | Baja |
| D-24 | Cloudflare Turnstile o hCaptcha por privacidad y costo; reCAPTCHA es la alternativa | Práctica | `orders.online.captcha_provider` | Baja |
| D-25 | RPO 60 min y RTO 240 min | Práctica | `system.backup.rpo_minutes`, `.rto_minutes` | Baja |
| D-26 | Revisar a mano el primer pedido de cada cliente nuevo, los pedidos de monto alto y los de país de riesgo | Práctica antifraude | `orders.online.manual_review_rules` | Baja |
| D-27 | Términos, privacidad, reembolsos, SLA, uso aceptable y aviso legal, y publicar el aviso de privacidad | Código del Consumidor; Ley 29733 | `legal_documents` | Media |
| D-28 | Respuesta en 15 días hábiles sin prórroga; conservación 2 años (por verificar); derechos ARCO según el DS 016-2024-JUS | Ley 31435; DS 101-2022-PCM; DS 016-2024-JUS | `complaints.response_days`, `.retention_years`, `.privacy_response_days` | Alta (respuesta); Media (resto) |
| D-29 | WordPress Multisite en un hosting propio con PHP actual, certificados por dominio y copias diarias | Práctica | `wp_sites` | Baja |
| D-30 | Activar solo GTM y GA4 por marca al inicio; el resto, cuando haya presupuesto de campañas | Práctica | n/a | Baja |
| D-31 | Una cuenta de Google de la empresa, dueña de Search Console, con acceso para el equipo | Práctica | n/a | Baja |
| D-32 | Editor de bloques con tema de bloques, para compatibilidad con el plugin | Práctica | n/a | Baja |
| D-33 | Rank Math, un aviso de cookies que respete el consentimiento y caché de página con purga por API | Práctica | n/a | Baja |
| D-34 | Metas del sector SaaS y hosting (ver sección) | Práctica | `dashboard.targets.*` | Baja |
| D-35 | Usar RDAP o WHOIS donde exista; 10 consultas por visitante por hora y captcha desde la tercera | Práctica | `web_connector.whois.*` | Baja |
| D-36 | Conservar las consultas WHOIS 30 días y declararlo en la política de privacidad | Ley 29733 (principio de finalidad y proporcionalidad) | `web_connector.whois.retention_days` | Media |

Recuento de confianza: alta 1 (D-28, solo el plazo de respuesta), media 9 (D-01, D-02, D-03, D-04, D-11, D-14, D-15, D-27, D-36), baja 26.

---

## Decisiones con norma

### D-01. OSE o PSE

- **Propuesta.** Contratar un proveedor ya homologado por SUNAT. Comparar al menos tres por precio por comprobante, documentación de la API, tiempo de respuesta del soporte y manejo de notas de crédito, guías y comprobantes en moneda extranjera. Un OSE valida los comprobantes antes de que lleguen a SUNAT y devuelve el CDR; un PSE (proveedor de servicios electrónicos) ofrece solo el sistema de emisión. No se encontró en la búsqueda una descripción oficial del PSE: por verificar.
- **Requisitos para ser OSE, según el resumen de SUNAT** (esto lo cumple el proveedor, no AlojamientoPlus): persona jurídica con RUC activo y habido, régimen general, ya emisor electrónico, certificado digital de uso exclusivo, carta fianza, controles de seguridad, pruebas con SUNAT y CDR inmediato. El patrimonio mínimo aparece como S/ 1 650 000 en una fuente de gob.pe y como 300 UIT en documentos antiguos: **no confirmado**.
- **Fuentes.** [SUNAT, Operador de Servicio Electrónico](https://cpe.sunat.gob.pe/aliados/ose); [gob.pe, OSE](https://www.gob.pe/26777-operador-de-servicios-electronicos-ose); [RS 117-2017/SUNAT](https://www.sunat.gob.pe/legislacion/superin/2017/117-2017.pdf); [RS 133-2019/SUNAT](https://www.sunat.gob.pe/legislacion/superin/2019/133-2019.pdf).
- **No verificado.** Lista actual de OSE y PSE autorizados, y su tarifa.

### D-02. Exportación de servicios

- **Propuesta.** Marcar `tax_treatment = exportación` solo en los productos de hosting, dominios y correo cuando el cliente es no domiciliado y el servicio se usa en el exterior, y siempre con comprobante electrónico y registro del país del cliente. Mantener gravado con IGV a cualquier cliente domiciliado en Perú, aunque tenga su sitio fuera.
- **Nota importante sobre el Apéndice V.** El encargo menciona el Apéndice V. Una de las fuentes (IUS360) indica que la Ley 30641 lo derogó desde el 1 de septiembre de 2017 y que hoy la base es el artículo 33 de la Ley del IGV, con inscripción previa en el Registro de Exportadores de Servicios. La página de SUNAT todavía muestra referencias al Apéndice V. El contador debe confirmar el texto vigente.
- **Requisitos concurrentes** (según SUNAT e informes citados): servicio oneroso, prestador domiciliado, usuario no domiciliado, uso o aprovechamiento en el extranjero, prestación íntegra en el Perú, comprobante electrónico anotado en el Registro de Ventas, e inscripción en el Registro de Exportadores de Servicios (hay excepciones de inscripción en otros supuestos del art. 33). SUNAT aplica el criterio del «primer acto de disposición» para ubicar el uso.
- **Riesgo.** Un cliente extranjero que usa el servicio para vender a Perú puede no calificar (criterio de SUNAT en los informes 011-2020 y 102-2021 para otros servicios). Por verificar si aplica a hosting.
- **Fuentes.** [SUNAT, TUO Ley del IGV, capítulo IX (art. 33)](https://www.sunat.gob.pe/legislacion/tributaria/igv/ley/capitul9.htm); [SUNAT, Registro de Exportadores de Servicios](https://www.sunat.gob.pe/padronesnotificaciones/registroExportadoresServicios.html); [Informe 011-2020-SUNAT](https://www.sunat.gob.pe/legislacion/oficios/2020/informe-oficios/i011-2020-7T0000.pdf); [Informe 102-2021-SUNAT](https://www.sunat.gob.pe/legislacion/oficios/2021/informe-oficios/i102-2021-7T0000.pdf); [MINCETUR, Exportación de servicios](https://www.gob.pe/70516-exportacion-de-servicios).
- **No verificado.** Texto vigente del art. 33 y del Reglamento; si la empresa ya está inscrita en el Registro.

### D-03. Detracciones (SPOT)

- **Propuesta.** `billing.detraction.percentage = 12` y `billing.detraction.min_amount = 700` (soles) para los servicios que el contador clasifique en el numeral 10 del Anexo 3 (demás servicios gravados con IGV) o en «otros servicios empresariales» (numeral 5). Dominios y hosting no figuran por nombre en lo que se leyó: **por verificar** que el contador confirme el numeral. No aplicar detracción a operaciones de exportación, que no llevan IGV.
- **Porcentaje.** SUNAT fijó 12 % para los numerales 1, 3, 5 y 10 del Anexo 3 desde el 1 de abril de 2018 (RS 071-2018/SUNAT). Algunas fichas antiguas muestran 10 %. Los resultados no incluyeron una modificación de 2026, pero tampoco se pudo leer el Anexo vigente.
- **Monto mínimo.** S/ 700 para servicios del Anexo 3, según el resumen de SUNAT (por verificar contra la norma).
- **Cuenta.** Cuenta corriente de detracciones del proveedor en el Banco de la Nación (el depósito lo hace el cliente). El número de cuenta lo da el Banco; no se inventa aquí.
- **Leyenda.** SUNAT exige indicar en la factura que la operación está sujeta al SPOT; la redacción literal **no se pudo confirmar**. Dejar `billing.detraction.legend` como «por verificar» hasta leer la RS 183-2004/SUNAT y la RS de comprobantes vigente.
- **Plazos de depósito.** Según el obligado: por ejemplo, el usuario deposita hasta la fecha de pago o al quinto día hábil del mes siguiente a la anotación en el Registro de Compras, lo que ocurra primero.
- **Fuentes.** [SUNAT, Apéndices del Sistema de Detracciones](https://orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones); [SUNAT, Cartilla de detracciones](https://orientacion.sunat.gob.pe/sites/default/files/inline-files/Cartilla_detracciones.pdf); [SUNAT, Sistema de detracciones del IGV](https://emprender.sunat.gob.pe/principales-impuestos/impuesto-general-las-ventas-igv/sistema-detracciones-igv); [El Peruano, RS que varía porcentajes](https://busquedas.elperuano.pe/dispositivo/NL/1621502-1).

### D-04. Recargo por mora

- **Propuesta.** `billing.late_fee.type = porcentaje anual` sobre el saldo vencido; `grace_days = 3`; `max_amount` con tope por factura; valor inicial por verificar, y en todo caso por debajo de la tasa moratoria máxima. Los términos y la factura deben decir el recargo de forma expresa antes de la compra.
- **Límite legal.** Los intereses compensatorios y moratorios convencionales no pueden superar la tasa máxima que fija el BCRP (Código Civil, arts. 1242 a 1244; Circular BCRP 0008-2021). Para el período del 1 de mayo al 31 de octubre de 2026, la tasa máxima **compensatoria** publicada es 114,13 % anual en soles y 99,84 % en dólares; se actualiza el 1 de noviembre de 2026. La tasa **moratoria** máxima se describe en un documento de una financiera como 15 % de la compensatoria (unos 17,1 %); es un cálculo propio, **no confirmado en el BCRP**. Por verificar.
- **Consumidores.** Las cláusulas de penalidad en contratos de adhesión están sujetas al Código de Protección y Defensa del Consumidor (método abusivo y cláusulas abusivas); la asesoría legal debe revisar el texto. No se verificó un artículo concreto.
- **Fuentes.** [BCRP, Nota informativa 2026-04-07](https://www.bcrp.gob.pe/docs/Transparencia/Notas-Informativas/2026/nota-informativa-2026-04-07.pdf); [BCRP, Circular 0008-2021](https://www.bcrp.gob.pe/docs/Transparencia/Normas-Legales/Circulares/2021/circular-0008-2021-bcrp.pdf).
- **No verificado.** Tasa moratoria máxima vigente, texto del art. 1243, Ley 31143 (usura).

### D-14. Retención de datos personales

- **Propuesta.** Conservar los datos del cliente durante la relación comercial y, después de la baja, solo lo necesario para obligaciones tributarias y contables y para defensa ante reclamos; luego cancelar o anonimizar. Cifra inicial sugerida: 5 años tras la baja para comprobantes y datos de facturación (plazo de prescripción tributaria; **por verificar** con el contador), y 12 meses para datos de marketing sin consentimiento vigente. Por país: aplicar la misma regla a todos y que la asesoría legal revise si algún país de clientes exige otra (por ejemplo, la regulación de datos de Chile o México).
- **Norma.** Ley 29733 y su nuevo Reglamento, DS 016-2024-JUS, publicado el 30 de noviembre de 2024; una fuente indica vigencia desde el 30 de marzo de 2025 (por verificar). Los plazos del Reglamento para los derechos: información 8 días, acceso 20 días, rectificación, cancelación y oposición 10 días, todos calendario según el art. 69, **leídos solo en un resumen del buscador**.
- **Fuentes.** [Ley 29733 (El Peruano)](https://diariooficial.elperuano.pe/Normas/obtenerDocumento?idNorma=23); [DS 016-2024-JUS (SMV, copia)](https://www.smv.gob.pe/Uploads/DS016_2024_JUS.pdf); [DS 016-2024-JUS (Congreso)](https://www.congreso.gob.pe/Docs/DGP/DIDP/files/ds_016-2024-jus.pdf).
- **No verificado.** Texto del art. 69; fecha exacta de vigencia; plazo de conservación fiscal; obligación de inscribir los bancos de datos ante la Autoridad (ANPD): por verificar si el nuevo Reglamento la mantiene.

### D-15. Tipo de cambio

- **Propuesta.** `billing.rebilling.exchange_rate_date = fecha de emisión del comprobante`, con el tipo de cambio **venta** promedio ponderado publicado por la SBS. Las notas de crédito y de débito usan el tipo de cambio del documento que modifican. Para la detracción de una venta en moneda extranjera, el contador debe confirmar la fecha (el Informe 118-2016 indica la fecha de nacimiento de la obligación del IGV o la del depósito, lo que ocurra primero; es de 2016).
- **Fuentes.** [SUNAT, Informe 118-2016](https://www.sunat.gob.pe/legislacion/oficios/2016/informe-oficios/i118-2016.pdf); [SUNAT, RS 000302-2024](https://www.sunat.gob.pe/legislacion/superin/2024/000302-2024.pdf); [SUNAT, Oficio 024-2000](https://www.sunat.gob.pe/legislacion/oficios/2000/oficios/o0242000.htm).
- **No verificado.** Los artículos concretos de la Ley del Impuesto a la Renta y del Reglamento del IGV sobre conversión; si SUNAT usa compra o venta en cada caso fuera de los anexos citados.

### D-27. Documentos legales mínimos

- **Propuesta.** Por cada marca: términos generales y por tipo de servicio, política de privacidad (con finalidades, plazos de retención y ejercicio de derechos), política de reembolsos y cancelaciones, SLA, política de uso aceptable y aviso legal con razón social, RUC y domicilio. Además, el Libro de Reclamaciones visible (D-28) y la política de cookies en WordPress.
- **Base.** El Código de Protección y Defensa del Consumidor (Ley 29571) exige información clara y veraz y el Libro de Reclamaciones; la Ley 29733 exige informar al titular sobre el tratamiento de sus datos. No se leyeron los artículos concretos: por verificar. El comercio electrónico no tiene aquí una norma específica verificada.
- **Fuentes.** [Ley 29733 (El Peruano)](https://diariooficial.elperuano.pe/Normas/obtenerDocumento?idNorma=23). El Código del Consumidor no se pudo abrir en una fuente oficial: por verificar.

### D-28. Libro de Reclamaciones y derechos ARCO

- **Propuesta.** `complaints.response_days = 15` (días hábiles, sin prórroga); `complaints.alert_days` a 3 días hábiles antes del vencimiento; `complaints.retention_years = 2` (por verificar); `complaints.privacy_response_days`: información 8, acceso 20, rectificación, cancelación y oposición 10 (días calendario; por verificar). Como el sistema tiene un único campo, usar 10 como valor general conservador y mantener los plazos por derecho en las plantillas.
- **Plazo de respuesta.** La Ley 31435 (publicada el 22 de marzo de 2022) modificó el art. 24.1 del Código: reclamos y quejas se responden en un máximo de 15 días hábiles, sin prórroga. Antes eran 30 días calendario ampliables. Los plazos rigen desde el 21 de mayo de 2022. Esto coincide entre El Peruano, Garrigues y la copia de la norma en SBN. El DS 101-2022-PCM adecuó el Reglamento del Libro.
- **Conservación.** Una revista académica (PUCP) indica 2 años desde el registro; **no se encontró el texto del DS 011-2011-PCM consolidado**. Por verificar.
- **Sanción.** No responder a tiempo es infracción tipo B (según un resumen de BDO; por verificar).
- **Reporte.** Los proveedores con ingresos de 3 000 UIT o más deben reportar a Indecopi; es probable que AlojamientoPlus no llegue a ese tope. Por verificar.
- **Fuentes.** [El Peruano, nuevo perfil del Libro de Reclamaciones](https://www.elperuano.pe/noticia/197470-suplemento-juridica-nuevo-perfil-del-libro-de-reclamaciones); [Garrigues](https://www.garrigues.com/es_ES/noticia/peru-reduce-plazo-respuesta-reclamos-quejas-consumidores); [SBN, norma legal](https://sbn.gob.pe/Repositorio/Normas_Legales/NORMA_LEGAL_3103_e0c1.pdf); [gob.pe, Indecopi](https://www.gob.pe/institucion/indecopi/noticias/641594-modifican-); [DS 016-2024-JUS](https://www.smv.gob.pe/Uploads/DS016_2024_JUS.pdf).

### D-11. Firma electrónica

- **Propuesta.** Firma electrónica simple (aceptación con registro de IP, fecha y correo) para términos y órdenes; firma digital con certificado solo si un cliente corporativo lo pide. Base: Ley 27269 (firmas y certificados digitales), **no verificada** en esta búsqueda.

---

## Decisiones por práctica del mercado

### D-05. SLA de soporte

Propuesta de primera respuesta: urgente 1 h, alta 4 h, normal 8 h hábiles, baja 24 h hábiles; resolución objetivo 4 h, 1 día, 3 días y 5 días. Disponibilidad comprometida de hosting compartido: 99,9 % mensual con crédito de servicio como única compensación. No hay norma; es práctica del sector. Revisar contra la propuesta ya cargada en `sla_policies`.

### D-34. Metas de los indicadores

Valores iniciales, todos sin norma y a calibrar con 3 meses de datos reales: `mrr_growth_percent` 2 mensual; `churn_rate_percent` máximo 3 mensual; `lead_conversion_percent` 15; `days_sales_outstanding` 15; `gross_margin_percent` 50; `overdue_debt_percent` máximo 10; `promise_kept_percent` 80; `renewal_rate_percent` 85; `backup_success_percent` 99; `availability_percent` 99,9; `node_usage_max_percent` 80; `first_response_minutes` 60; `sla_compliance_percent` 95; `csat_percent` 90; `complaints_on_time_percent` 100 (la ley no admite prórroga); `cart_abandonment_percent` máximo 70.

### D-06 a D-10, D-12, D-13, D-16 a D-26, D-29 a D-33, D-35, D-36

Cada propuesta y su motivo están en la tabla resumen. Notas adicionales:

- **D-06, D-08, D-21.** Las APIs no están verificadas; pedir documentación escrita antes de construir. Mientras tanto, flujo manual.
- **D-10, D-25.** Un RPO de 60 minutos exige copias incrementales o replicación; si el costo es alto, subir a 24 h y documentarlo como riesgo aceptado.
- **D-18.** Pedir cotización a Niubiz, Izipay y Culqi; cobrar siempre en soles y dólares según lo que acepte la pasarela; no almacenar datos de tarjeta (formulario alojado por la pasarela para limitar el alcance de PCI DSS).
- **D-22.** El tope de tokens evita costos imprevistos; el valor depende del volumen de chats que se espere.
- **D-36.** 30 días de retención es una propuesta de proporcionalidad (Ley 29733, art. 7 sobre proporcionalidad, por verificar); la política de privacidad debe declararlo.

---

## Lo que NO se pudo verificar en una fuente oficial

1. Anexo 3 vigente en 2026, leyenda literal de la factura y plazos exactos de la detracción (solo resúmenes de SUNAT y medios secundarios).
2. Si hosting y dominios están en algún numeral específico del Anexo 3 o caen en «demás servicios».
3. Texto vigente del art. 33 de la Ley del IGV y si el Apéndice V sigue aplicándose (una fuente dice que se derogó en 2017).
4. Tasa moratoria máxima del BCRP y texto de los arts. 1242 a 1244 del Código Civil.
5. Plazos ARCO del art. 69 del DS 016-2024-JUS y su fecha de vigencia (30 de marzo de 2025 según una fuente).
6. Plazo de conservación del Libro de Reclamaciones (2 años según una revista).
7. Artículos concretos del Código del Consumidor sobre cláusulas abusivas y sobre información en ventas en línea.
8. Patrimonio mínimo de un OSE (S/ 1 650 000 contra 300 UIT) y la lista actual de OSE y PSE.
9. Toda cifra de las decisiones con confianza «baja», que son propuestas de práctica sin norma.
