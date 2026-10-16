# 07 · Inventario de pantallas

> Panel interno (`apps/admin`) y portal del cliente (`apps/portal`, por marca). Fuente: `docs/00-requerimientos.md` secciones 9, 13, 21, 23, 25, 26 y 27; especificaciones de módulo `docs/modulos/M-*.md`.
> Los códigos `P-XXX-NN` son los mismos de cada especificación de módulo, donde está el detalle por pantalla (propósito, campos o columnas, filtros, acciones con su permiso y estados vacío/error). Este inventario se genera desde esas especificaciones; si se agrega una pantalla, se agrega primero en su módulo.

## Reglas de UX globales

Aplican a todas las pantallas del panel y del portal. Son criterio de aceptación de cada historia (docs/00, sección 11, "Definición de terminado").

### Comportamiento y contenido
1. **Sin botones decorativos.** No se entrega ningún botón sin comportamiento. Una función aún no construida, o apagada por interruptor o permiso, no aparece en el menú ni en la pantalla (no se muestra deshabilitada "por ahora"). Excepción: una acción válida bloqueada por una regla de negocio (por ejemplo "Activar" sin contrato vigente) se muestra deshabilitada con el motivo.
2. **Permisos.** Cada acción se envuelve en `<Can permission="...">` y cada ruta en un guard; la lista de permisos llega al iniciar sesión. El backend valida siempre: el frontend solo oculta. Un indicador o pestaña sin permiso no se muestra (no se muestra en cero).
3. **Confirmaciones.** Las acciones sensibles usan `ConfirmDialog`: suspender, cancelar o terminar servicios; validar o rechazar pagos; emitir facturas; autorizar reembolsos; fusionar clientes; activar interruptores del cliente; operaciones de dominio; borrar. Las de mayor riesgo piden escribir el nombre o código del recurso; revelar secretos, ejecutar en servidores y autorizar reembolsos piden MFA reciente (menos de `security.sensitive_action_mfa_max_age_minutes`).
4. **Estados de carga, vacío y error en toda pantalla** con `Skeleton`, `EmptyState` (texto útil y, si hay permiso, la acción de alta) y `ErrorState` (mensaje traducido desde el `code` RFC 9457 y botón reintentar). En tableros con varias tarjetas, el error de una no bloquea las demás.
5. **Concurrencia.** Si la API responde 409 por `version` antigua, la pantalla avisa, recarga el registro y conserva lo que el usuario escribió cuando sea posible.
6. **Formularios** con `EntityForm`: validación Zod en el cliente y errores por campo del servidor, aviso de cambios sin guardar, doble envío protegido (las escrituras sensibles llevan `Idempotency-Key`).
7. **Tablas** con `DataTable`: filtros, orden y paginación en servidor, columnas configurables, filtros guardados, selección múltiple; "Exportar" solo con el permiso `export` del módulo y siempre en cola (enlace firmado).
8. **Importes y fechas** con `MoneyCell` (siempre con moneda) y `DateCell` (zona horaria del usuario; en el portal, la del cliente). Estados con `StatusBadge` usando los valores del contrato y su etiqueta traducida.

### Apariencia, idioma y accesibilidad
9. **Modo claro y oscuro** en panel y portal, con variables CSS; el usuario elige o sigue al sistema.
10. **Portal por marca.** El dominio resuelve la marca; logo, colores (claro y oscuro), remitente, plantillas y catálogo son los de la marca. Un cliente con servicios de varias marcas ve cada servicio con su marca de origen.
11. **Proveedor oculto por defecto.** El portal muestra la etiqueta pública del componente y la marca propia; el nombre del proveedor real solo aparece si `portal.show_provider_name` está activo para ese cliente o servicio. Costos, márgenes, cuentas, accesos y notas internas nunca existen en las respuestas del portal.
12. **Notas internas** se distinguen visualmente (fondo y etiqueta) mientras se redactan y en la conversación; nunca se muestran en el portal.
13. **Idiomas.** Español e inglés desde el inicio; ningún texto visible queda escrito en el componente (i18next). Agregar un idioma no requiere código.
14. **Accesibilidad** WCAG 2.1 AA: contraste, foco visible, navegación completa por teclado en tablas, modales y formularios, etiquetas en todos los campos.
15. **Responsivo.** El portal funciona completo en móvil; el panel prioriza escritorio pero las bandejas diarias (cobranza, tickets, tareas) son usables en móvil.
16. **Búsqueda global** (`GlobalSearch`) en el panel: clientes, dominios, servicios, tickets, facturas y servidores, respetando permisos.
17. **Detalle** con `DetailLayout`: cabecera, pestañas, panel lateral de actividad e historial (auditoría del registro).
18. **Valores de negocio** (días, porcentajes, textos de aviso) que se muestran en pantalla se leen del centro de configuración; la pantalla de ajustes muestra de qué nivel viene el valor vigente.
19. **Webs de marca en WordPress (docs/00 §26).** Las páginas públicas de cada marca se hacen en WordPress Multisite; el sistema no tiene pantallas de edición de páginas, menús, blog, SEO, página 404, cookies, píxeles ni CSS. Lo que el sistema muestra en esas webs (P-WCN-11) lo pinta el plugin Hub Connector con el tema del sitio: el pie de cada sitio lleva los documentos legales vigentes y el enlace visible al Libro de Reclamaciones; si el sistema no responde, se ve la última copia y nunca un error técnico.
20. **Scripts de terceros.** Los scripts de marketing y analítica viven solo en las webs WordPress; nunca se cargan en el portal, el carrito ni el panel.
21. **Apariencia.** El tema de cada marca (P-BRD-04 y P-BRD-05) se aplica al portal y el carrito, al panel y a los correos, según `portal.central_identity`; nunca a la web pública.
22. **Generador de shortcodes.** Toda pantalla que administra algo que se muestra en la web (planes, fichas de servidores, tipos de servicio, formularios, contacto, documentos legales, Libro de Reclamaciones) ofrece "Copiar shortcode", que abre P-WCN-03 con las opciones precargadas.
23. **Editor de textos enriquecido (docs/00 §27).** Todo texto que redacta el equipo (documentos legales, plantillas de contrato y cláusulas, plantillas de correo y avisos, respuestas predefinidas y de tickets, mensajes de formularios, descripciones de productos y servicios personalizados, carta de respuesta del Libro) usa el mismo componente `RichTextEditor`: negrita, cursiva, listas, enlaces, tablas, imágenes propias con texto alternativo, variables insertables del contexto y vista previa; muestra lo que quitó el saneado y, donde aplica, el historial de versiones (P-AUT-12). Es operable por teclado y sus textos están en es/en.
24. **Indicadores.** Toda tarjeta de indicador muestra unidad, periodo, comparación con el periodo anterior, meta y semáforo según la dirección deseada, y enlaza a su detalle (P-DSH-05); sin datos muestra "Sin datos en el periodo" y nunca un 0 % inventado.

## Inventario

Rol principal según los códigos del contrato (`admin`, `sales`, `finance`, `support`, `documentation`, `external_accountant`, `temp_technician`, `customer_admin`, `customer_user`); "público" para páginas sin sesión y "todo el personal" para pantallas comunes del panel. El permiso de cada acción está en la especificación del módulo.


### Panel interno (204 pantallas)

| Código | Pantalla | Módulo | Rol principal | Acciones clave |
|---|---|---|---|---|
| P-IDN-01 | Inicio de sesión del panel | IDN · Identity | todo el personal | Ingresar; Enviar código al correo; Recuperar contraseña; Ingresar con SSO |
| P-IDN-02 | Usuarios internos | IDN · Identity | admin | Crear usuario; Editar; Deshabilitar (baja inmediata); Exportar |
| P-IDN-03 | Detalle de usuario | IDN · Identity | admin | Asignar rol; Cerrar sesión remota; Restablecer MFA; Desbloquear; Revocar dispositivo de confianza |
| P-IDN-04 | Roles y permisos | IDN · Identity | admin | Crear rol; Copiar rol; Guardar matriz; Borrar rol personalizado |
| P-IDN-05 | Mi cuenta: seguridad y sesiones | IDN · Identity | todo el personal | Cambiar contraseña; Activar segundo factor; Desactivar TOTP; Quitar dispositivo de confianza; Regenerar códigos de recuperación |
| P-IDN-06 | Campos personalizados y etiquetas | IDN · Identity | admin | Crear campo; Editar; Borrar; Crear etiqueta |
| P-IDN-07 | Tokens de la API pública | IDN · Identity | admin | Crear token (se muestra una sola vez); Revocar |
| P-IDN-08 | Política de seguridad | IDN · Identity | admin | Guardar; Ver historial |
| P-CFG-01 | Centro de configuración | CFG · Settings | admin | Editar valor general; Editar ajustes de cobranza; Ver historial |
| P-CFG-02 | Detalle de ajuste y sobrescrituras | CFG · Settings | admin | Agregar sobrescritura; Quitar sobrescritura; Vista previa |
| P-CFG-03 | Secuencia de avisos de cobranza | CFG · Settings | finance | Agregar etapa; Editar etapa; Desactivar etapa; Enviar plantilla de prueba; Abrir simulador |
| P-CFG-04 | Simulador de calendario de avisos | CFG · Settings | finance | Simular |
| P-CFG-05 | Horario de atención y feriados | CFG · Settings | admin | Editar horario; Agregar feriado; Editar feriado; Borrar feriado |
| P-CFG-06 | Historial de cambios de ajustes | CFG · Settings | admin | Revertir; Exportar |
| P-BRD-01 | Marcas | BRD · Brands | admin | Crear marca; Editar |
| P-BRD-02 | Detalle de marca | BRD · Brands | admin | Guardar; Vista previa del portal |
| P-BRD-03 | Entidad emisora, cuentas y series | BRD · Brands | admin | Editar datos fiscales; Agregar cuenta; Editar cuenta; Crear serie; Desactivar serie |
| P-BRD-04 | Temas por marca | BRD · Brands | admin | Crear tema; Nuevo borrador; Volver a esta versión; Descartar borrador |
| P-BRD-05 | Editor de tema con vista previa | BRD · Brands | sales | Guardar borrador; Verificar contraste; Enlace de vista previa; Publicar |
| P-CUS-01 | Clientes | CUS · Customers | sales | Crear cliente; Exportar; Fusionar seleccionados |
| P-CUS-02 | Formulario de cliente | CUS · Customers | sales | Guardar; Abrir posible duplicado |
| P-CUS-03 | Ficha 360° del cliente | CUS · Customers | support | Editar cliente; Agregar nota; Nuevo ticket; Nuevo pedido; Estado de cuenta PDF |
| P-CUS-04 | Contactos y usuarios del portal | CUS · Customers | sales | Agregar contacto; Editar; Dar o quitar acceso al portal; Reenviar invitación; Eliminar |
| P-CUS-05 | Fusión de clientes duplicados | CUS · Customers | admin | Confirmar fusión (escribiendo el código del absorbido) |
| P-CUS-06 | Privacidad del titular | CUS · Customers | admin | Exportar datos del titular; Ejecutar eliminación/anonimización |
| P-SAL-01 | Tablero de ventas | SAL · Sales | sales | Arrastrar a otra etapa; Nuevo prospecto; Marcar seguimiento hecho; Cambiar a vista de lista |
| P-SAL-02 | Prospectos | SAL · Sales | sales | Nuevo prospecto; Cambiar etapa; Reasignar; Ver historial de etapas; Cambiar a Kanban |
| P-SAL-03 | Detalle de prospecto | SAL · Sales | sales | Registrar actividad; Crear cotización; Convertir a cliente y pedido; Marcar perdido; Vincular a cliente existente |
| P-SAL-04 | Bandeja compartida de WhatsApp | SAL · Sales | sales | Responder; Crear prospecto; Crear ticket; Vincular a cliente; Asignar |
| P-SAL-05 | Cotizaciones | SAL · Sales | sales | Nueva cotización; Duplicar; Exportar |
| P-SAL-06 | Editor de cotización | SAL · Sales | sales | Guardar nueva versión; Vista previa PDF; Enviar por correo; Registrar aceptación o rechazo; Convertir a contrato |
| P-SAL-07 | Canales y formularios de captación | SAL · Sales | admin | Crear canal; Crear formulario; Copiar código de inserción; Rotar clave; Desactivar |
| P-SAL-08 | Etapas del embudo y reglas de asignación | SAL · Sales | admin | Editar etapas; Crear regla; Editar regla; Borrar regla |
| P-SAL-09 | Listas de mailing | SAL · Sales | sales | Crear lista; Editar criterio; Sincronizar ahora |
| P-SAL-10 | Referidos y comisiones | SAL · Sales | sales | Crear enlace; Editar regla; Liquidar periodo (registra costo en FIN); Exportar |
| P-SAL-11 | Reporte por canal | SAL · Sales | admin | Exportar; Abrir detalle de prospectos |
| P-SAL-12 | Oportunidades sobre clientes actuales | SAL · Sales | sales | Convertir en oportunidad; Descartar |
| P-CAT-01 | Productos | CAT · Catalog | admin | Crear producto; Exportar; Ajuste masivo de precios |
| P-CAT-02 | Detalle de producto | CAT · Catalog | admin | Guardar; Agregar plan; Programar precio; Editar políticas; Desactivar |
| P-CAT-03 | Precios de dominios por extensión | CAT · Catalog | finance | Agregar precio; Editar; Exportar |
| P-CAT-04 | Ajuste masivo de precios | CAT · Catalog | finance | Vista previa; Confirmar y programar avisos |
| P-PRV-01 | Proveedores | PRV · Providers | admin | Crear proveedor; Exportar |
| P-PRV-02 | Ficha de proveedor | PRV · Providers | admin | Editar; Agregar cuenta; Agregar contacto; Cargar factura del proveedor |
| P-PRV-03 | Detalle de cuenta de proveedor | PRV · Providers | admin | Probar conexión; Habilitar escritura por operación (con confirmación); Sincronizar ahora; Vincular credencial; Desactivar |
| P-PRV-04 | Renovaciones de proveedores | PRV · Providers | finance | Marcar renovada (nueva fecha); Crear tarea de pago; Exportar |
| P-SRV-01 | Servicios | SRV · Services | support | Crear servicio; Exportar |
| P-SRV-02 | Detalle de servicio | SRV · Services | support | Editar; Cambiar plan (prorrateo); Suspender; Reactivar; Cancelar |
| P-SRV-03 | Panel de renovaciones | SRV · Services | sales | Agrupar en una factura; Exportar |
| P-SRV-04 | Modalidades de servicio | SRV · Services | admin | Crear modalidad; Editar |
| P-SRV-05 | Interruptores de acciones del cliente | SRV · Services | admin | Cambiar estado general; Activar/desactivar por cliente |
| P-SRV-06 | Bajas pendientes de aprobación | SRV · Services | admin | Aprobar terminación; Rechazar y mantener suspendido; Solicitar respaldo |
| P-MAP-01 | Proyectos de clientes | MAP · ServiceMap | support | Crear proyecto; Exportar |
| P-MAP-02 | Mapa del proyecto (vista de soporte) | MAP · ServiceMap | support | Agregar componente; Editar dependencias; Revelar acceso (abre VLT); Abrir ticket sobre componente; Ver como cliente |
| P-MAP-03 | Editor de componente | MAP · ServiceMap | support | Guardar; Marcar revisado hoy; Eliminar |
| P-MAP-04 | Procedimientos del proyecto | MAP · ServiceMap | support | Crear procedimiento; Editar (nueva versión); Ver versión anterior |
| P-MAP-05 | Ficha de traspaso | MAP · ServiceMap | support | Generar ficha; Descargar; Enviar accesos por enlace de un solo uso |
| P-MAP-06 | Reporte de mapas incompletos | MAP · ServiceMap | support | Crear proyecto; Crear tarea de documentación; Exportar |
| P-INV-01 | Nodos de hosting | INV · Inventory | support | Registrar nodo; Recomendar nodo para cliente nuevo; Sincronizar ahora; Exportar |
| P-INV-02 | Detalle de nodo de hosting | INV · Inventory | support | Editar; Ajustar umbrales del nodo; Crear tareas desde plantilla; Iniciar lote de migración desde este nodo |
| P-INV-03 | Cuentas de hosting | INV · Inventory | support | Enlazar a servicio; Entrar a cPanel; Crear cuenta en el proveedor; Suspender o reactivar; Exportar |
| P-INV-04 | Servidores | INV · Inventory | support | Registrar servidor; Sincronizar proveedor; Exportar |
| P-INV-05 | Ficha de servidor | INV · Inventory | support | Editar; Registrar mantenimiento; Agregar software; Aprobar y ejecutar reinicio; Revelar acceso |
| P-INV-06 | Lotes de migración | INV · Inventory | support | Crear lote; Abrir lote |
| P-INV-07 | Detalle de lote de migración | INV · Inventory | support | Reordenar; Avanzar estado de cuenta; Revertir cuenta; Crear tarea del paso |
| P-INV-08 | Tablero de avance de migración | INV · Inventory | admin | Exportar; Abrir lote |
| P-INV-09 | CMDB: dependencias e impacto | INV · Inventory | support | Agregar dependencia; Quitar dependencia; Exportar impacto; Crear solicitud de cambio |
| P-INV-10 | Recursos | INV · Inventory | support | Registrar recurso manual; Enlazar a servicio; Dar de baja; Exportar |
| P-CLD-01 | Cuentas cloud | CLD · Cloud | support | Registrar cuenta; Sincronizar ahora; Exportar |
| P-CLD-02 | Detalle de cuenta cloud | CLD · Cloud | support | Editar; Adjuntar autorización; Registrar revocación; Crear proyecto; Iniciar entrega |
| P-CLD-03 | Proyectos cloud | CLD · Cloud | support | Crear proyecto; Exportar |
| P-CLD-04 | Detalle de proyecto cloud | CLD · Cloud | support | Editar proyecto; Ocultar ambiente al cliente; Definir presupuesto; Exportar |
| P-CLD-05 | Recursos sin cliente asignado | CLD · Cloud | support | Asignar a cliente y proyecto; Crear tarea de etiquetado; Exportar |
| P-CLD-06 | Presupuestos cloud | CLD · Cloud | finance | Crear presupuesto; Editar |
| P-DOM-01 | Dominios | DOM · Domains | support | Registrar dominio; Importar CSV; Sincronizar; Exportar |
| P-DOM-02 | Detalle de dominio | DOM · Domains | support | Editar; Renovar ahora (tras pago validado); Registrar transferencia; Cambiar nameservers; Agregar a regularización |
| P-DOM-03 | Dominios por vencer | DOM · Domains | support | Renovar; Ver factura; Exportar |
| P-DOM-04 | Operaciones de dominio | DOM · Domains | support | Aprobar; Rechazar con motivo; Reenviar confirmación; Marcar completada (manual); Entregar código por enlace |
| P-DOM-05 | Reglas por extensión | DOM · Domains | admin | Editar regla; Marcar verificada |
| P-DOM-06 | Regularización de titularidad | DOM · Domains | documentation | Agregar dominios; Avanzar estado; Crear tarea; Exportar |
| P-DOM-07 | Huérfanos y conciliación de renovaciones | DOM · Domains | finance | Asignar cliente/servicio; Crear tarea; Exportar |
| P-DOM-08 | Consultas WHOIS de la web | DOM · Domains | support | Ver consultas de un visitante; Abrir ajustes del límite |
| P-MAI-01 | Servicios de correo | MAI · Mail | support | Registrar correo; Sincronizar; Exportar |
| P-MAI-02 | Detalle de servicio de correo | MAI · Mail | support | Editar; Verificar DNS ahora; Crear ticket |
| P-MAI-03 | Licencias asignadas vs facturadas | MAI · Mail | finance | Ajustar suscripción; Crear tarea; Exportar |
| P-MAI-04 | Certificados SSL | MAI · Mail | support | Registrar certificado; Leer certificados publicados ahora; Exportar |
| P-MAI-05 | Detalle de certificado SSL | MAI · Mail | support | Editar; Marcar renovado; Crear tarea de instalación |
| P-SAA-01 | Plataformas SaaS | SAA · Saas | support | Registrar plataforma; Exportar |
| P-SAA-02 | Detalle de plataforma SaaS | SAA · Saas | support | Editar; Registrar instancia; Ver reparto de costo |
| P-SAA-03 | Instancias | SAA · Saas | support | Registrar instancia; Sincronizar; Exportar |
| P-SAA-04 | Ficha de instancia (Moodle u otro) | SAA · Saas | support | Editar; Programar actualización; Proponer ampliación; Revelar acceso |
| P-SAA-05 | Calendario de actualizaciones | SAA · Saas | support | Programar actualización; Anunciar mantenimiento |
| P-CTR-01 | Contratos | CTR · Contracts | documentation | Nuevo contrato; Exportar |
| P-CTR-02 | Editor de contrato | CTR · Contracts | documentation | Guardar versión; Enviar a revisión; Aprobar; Devolver a borrador; Enviar al cliente |
| P-CTR-03 | Plantillas de contrato | CTR · Contracts | documentation | Crear plantilla; Editar; Vista previa con cliente de ejemplo |
| P-CTR-04 | Biblioteca de cláusulas | CTR · Contracts | documentation | Crear cláusula; Editar |
| P-CTR-05 | Entregas de cuenta | CTR · Contracts | support | Programar entrega; Marcar paso completado; Crear tareas de rotación; Subir acta firmada y completar |
| P-CTR-06 | Servicios activos sin contrato | CTR · Contracts | documentation | Crear contrato; Crear tarea; Exportar |
| P-ORD-01 | Pedidos | ORD · Orders | sales | Nuevo pedido; Exportar |
| P-ORD-02 | Nuevo pedido | ORD · Orders | sales | Guardar borrador; Enviar a aprobación |
| P-ORD-03 | Detalle de pedido | ORD · Orders | support | Aprobar; Iniciar aprovisionamiento; Marcar pruebas superadas; Activar; Cancelar |
| P-ORD-04 | Revisión manual | ORD · Orders | support | Reintentar; Pasar a manual (crear tareas); Vincular recurso existente; Marcar fallido |
| P-ORD-05 | Detección de inconsistencias | ORD · Orders | admin | Crear tarea; Abrir entidad; Exportar |
| P-BIL-01 | Bandeja diaria de cobranza | BIL · Billing | finance | Registrar pago; Validar voucher; Registrar compromiso; Reenviar aviso; Ver factura |
| P-BIL-02 | Facturas | BIL · Billing | finance | Nueva factura; Emitir seleccionadas; Exportar |
| P-BIL-03 | Detalle de factura | BIL · Billing | finance | Emitir; Reenviar a SUNAT; Emitir nota de crédito; Emitir nota de débito; Registrar pago |
| P-BIL-04 | Nueva factura o nota | BIL · Billing | finance | Guardar borrador; Emitir |
| P-BIL-05 | Pagos | BIL · Billing | finance | Registrar pago; Exportar |
| P-BIL-06 | Detalle de pago | BIL · Billing | finance | Reasignar aplicaciones; Solicitar reembolso; Autorizar reembolso |
| P-BIL-07 | Registrar pago | BIL · Billing | finance | Guardar como reportado; Guardar y validar |
| P-BIL-08 | Validación de vouchers | BIL · Billing | finance | Validar; Rechazar con motivo; Ver comprobante |
| P-BIL-09 | Conciliación bancaria | BIL · Billing | finance | Importar extracto CSV; Confirmar coincidencia; Crear pago desde línea; Exportar diferencias |
| P-BIL-10 | Compromisos de pago | BIL · Billing | finance | Registrar compromiso; Editar; Marcar incumplido |
| P-BIL-11 | Facturas de proveedor y refacturación | BIL · Billing | finance | Cargar factura del proveedor; Generar factura al cliente; Marcar no refacturable; Exportar reporte sin refacturar |
| P-BIL-12 | Estado de cuenta y antigüedad de deuda | BIL · Billing | finance | Generar estado de cuenta PDF; Enviar al cliente; Exportar |
| P-BIL-13 | Medios de pago | BIL · Billing | finance | Crear medio; Editar; Desactivar |
| P-BIL-14 | Impuestos y tipo de cambio | BIL · Billing | finance | Agregar tasa con vigencia; Corregir tipo de cambio del día; Actualizar ahora |
| P-BIL-15 | Cupones y saldos a favor | BIL · Billing | finance | Crear cupón; Editar; Ajustar saldo a favor |
| P-BIL-16 | Contracargos | BIL · Billing | finance | Registrar contracargo; Registrar descargos; Cerrar como ganado o perdido; Ver pago |
| P-BIL-17 | Liquidaciones de la pasarela | BIL · Billing | finance | Leer liquidaciones por API; Importar reporte CSV; Confirmar coincidencia; Exportar diferencias |
| P-FIN-01 | Costos | FIN · Finance | finance | Registrar costo; Distribuir; Exportar |
| P-FIN-02 | Distribución de costo | FIN · Finance | finance | Vista previa; Confirmar; Anular distribución |
| P-FIN-03 | Rentabilidad | FIN · Finance | admin | Exportar; Ver detalle de costos |
| P-FIN-04 | Facturado, cobrado y reconocido | FIN · Finance | finance | Exportar |
| P-FIN-05 | Proyección de caja | FIN · Finance | admin | Exportar |
| P-FIN-06 | Horas y rentabilidad por técnico | FIN · Finance | admin | Exportar; Ver registros de horas |
| P-HLP-01 | Bandeja de tickets | HLP · Helpdesk | support | Nuevo ticket; Asignar o reasignar; Cambiar estado; Exportar |
| P-HLP-02 | Alta rápida de ticket | HLP · Helpdesk | support | Crear; Crear y convertir en tarea |
| P-HLP-03 | Detalle de ticket | HLP · Helpdesk | support | Responder al cliente; Nota interna (`POST /admin/tickets/{id}/internal-notes`); Asignar o reasignar; Vincular servicio; Insertar respuesta predefinida |
| P-HLP-04 | Políticas de SLA | HLP · Helpdesk | admin | Crear política; Editar tiempos; Editar horario y feriados |
| P-HLP-05 | Base de conocimientos | HLP · Helpdesk | support | Nuevo artículo; Editar; Archivar |
| P-HLP-06 | Editor de artículo | HLP · Helpdesk | support | Guardar borrador; Publicar; Restaurar versión |
| P-HLP-07 | Encuestas de satisfacción | HLP · Helpdesk | admin | Ver ticket; Exportar |
| P-WRK-01 | Tablero de tareas | WRK · Work | support | Nueva tarea; Mover de estado; Aprobar; Exportar |
| P-WRK-02 | Detalle de tarea | WRK · Work | support | Editar; Marcar ítem; Registrar horas; Aprobar; Completar |
| P-WRK-03 | Plantillas y tareas recurrentes | WRK · Work | support | Crear plantilla; Editar; Programar recurrencia |
| P-WRK-04 | Proyectos internos | WRK · Work | support | Crear proyecto; Editar |
| P-WRK-05 | Registro de horas y bolsas | WRK · Work | support | Registrar horas; Editar; Aprobar horas; Exportar |
| P-WRK-06 | Cambios | WRK · Work | support | Solicitar cambio; Aprobar o rechazar; Registrar implementación; Registrar reversión; Anunciar mantenimiento |
| P-WRK-07 | Problemas | WRK · Work | support | Crear problema; Enlazar tickets e incidentes; Registrar causa raíz |
| P-VLT-01 | Secretos | VLT · Vault | support | Registrar secreto; Abrir |
| P-VLT-02 | Detalle de secreto | VLT · Vault | support | Revelar (motivo + MFA); Rotar valor; Conceder acceso; Crear enlace de un solo uso; Eliminar |
| P-VLT-03 | Concesiones | VLT · Vault | admin | Crear concesión; Revocar |
| P-VLT-04 | Bitácora de accesos | VLT · Vault | admin | Generar tareas de rotación para un usuario que se retira; Exportar bitácora (sin valores) |
| P-VLT-05 | Enlaces de un solo uso | VLT · Vault | support | Crear enlace; Revocar |
| P-MON-01 | Monitores | MON · Monitoring | support | Crear monitor; Pausar |
| P-MON-02 | Detalle de monitor | MON · Monitoring | support | Editar; Abrir incidente; Eliminar |
| P-MON-03 | Incidentes | MON · Monitoring | support | Abrir incidente |
| P-MON-04 | Detalle de incidente | MON · Monitoring | support | Cambiar estado; Recalcular afectados; Notificar a clientes afectados; Vincular a problema |
| P-MON-05 | Mantenimientos programados | MON · Monitoring | support | Programar; Editar; Cancelar |
| P-MON-06 | Backups | MON · Monitoring | support | Crear política; Editar; Registrar ejecución manual |
| P-MON-07 | Pruebas de restauración | MON · Monitoring | support | Registrar prueba |
| P-MON-08 | Alertas | MON · Monitoring | support | Reconocer; Crear tarea; Resolver |
| P-AUT-01 | Reglas de automatización | AUT · Automation | admin | Crear regla; Activar/desactivar; Duplicar |
| P-AUT-02 | Detalle de regla y ejecuciones | AUT · Automation | admin | Guardar; Probar con evento de ejemplo; Eliminar |
| P-AUT-03 | Plantillas de notificación | AUT · Automation | admin | Crear plantilla; Editar con vista previa; Enviar prueba a correo interno |
| P-AUT-04 | Registro de avisos enviados | AUT · Automation | finance | Reenviar; Ver contenido enviado |
| P-AUT-05 | Webhooks salientes | AUT · Automation | admin | Crear endpoint; Rotar secreto; Reenviar entrega; Eliminar |
| P-AUT-06 | Sincronizaciones | AUT · Automation | support | Sincronizar ahora; Ver errores |
| P-AUT-07 | Importaciones | AUT · Automation | admin | Descargar plantilla; Subir y validar; Confirmar importación; Descargar reporte de errores |
| P-AUT-08 | Exportaciones | AUT · Automation | todo el personal | Descargar |
| P-AUT-09 | Auditoría | AUT · Automation | admin | Verificar cadena; Exportar |
| P-AUT-10 | Webhooks entrantes | AUT · Automation | admin | Reprocesar; Ver payload |
| P-AUT-11 | Editor de plantillas de texto enriquecido | AUT · Automation | admin | Guardar; Vista previa; Insertar imagen; Enviar prueba a correo interno; Ver historial |
| P-AUT-12 | Historial de versiones del texto | AUT · Automation | documentation | Ver versión; Restaurar |
| P-DSH-01 | Dashboard comercial | DSH · Dashboard | admin | Abrir detalle de indicador; Guardar filtros |
| P-DSH-02 | Dashboard financiero | DSH · Dashboard | admin | Abrir antigüedad de deuda; Abrir rentabilidad; Abrir contracargos |
| P-DSH-03 | Dashboard operativo | DSH · Dashboard | support | Abrir bandeja de tickets; Abrir alertas; Abrir nodos |
| P-DSH-04 | Panel de indicadores | DSH · Dashboard | admin | Ver detalle; Exportar; Recalcular periodo; Administrar metas; Guardar filtros |
| P-DSH-05 | Detalle de indicador | DSH · Dashboard | admin | Filtrar registros; Ordenar; Filtrar desde el desglose; Abrir cliente o documento; Ver fórmula; Editar meta; Exportar registros; Ir al módulo dueño |
| P-DSH-06 | Metas de indicadores | DSH · Dashboard | admin | Crear meta; Editar; Eliminar; Abrir meta por defecto en el centro de configuración |
| P-CAT-05 | Fichas por marca | CAT · Catalog | sales | Crear ficha; Editar; Reordenar; Dar de baja |
| P-CAT-06 | Ficha técnica de hosting o VPS | CAT · Catalog | sales | Guardar ficha de hosting; Guardar ficha VPS |
| P-CAT-07 | Extensiones de dominio | CAT · Catalog | sales | Crear extensión; Editar; Programar cambio de precios con aviso; Dar de baja |
| P-CAT-08 | Tipos de servicio personalizados | CAT · Catalog | admin | Crear tipo; Editar; Activar; Archivar; Copiar shortcode |
| P-CAT-09 | Editor de tipo de servicio | CAT · Catalog | admin | Guardar; Guardar campos; Crear producto con planes y precios; Activar |
| P-CAT-10 | Categorías del catálogo | CAT · Catalog | admin | Crear categoría; Editar; Reordenar; Dar de baja |
| P-ORD-06 | Carritos | ORD · Orders | sales | Abrir detalle; Crear prospecto desde el carrito |
| P-ORD-07 | Compras en línea y revisión manual | ORD · Orders | finance | Aprobar compra; Rechazar compra; Reintentar creación del pedido; Validar voucher |
| P-MON-10 | Solicitudes de restauración | MON · Monitoring | support | Registrar solicitud por el cliente; Abrir detalle |
| P-MON-11 | Detalle de solicitud de restauración | MON · Monitoring | support | Aprobar; Rechazar; Iniciar restauración; Cerrar con evidencia; Marcar fallida |
| P-MON-12 | Herramientas de respaldos por nodo | MON · Monitoring | support | Registrar herramienta; Editar; Leer respaldos ahora |
| P-MON-13 | Plan de recuperación del sistema | MON · Monitoring | admin | Registrar prueba; Abrir ajustes de objetivos |
| P-WCN-01 | Sitios WordPress conectados | WCN · WebConnector | admin | Conectar sitio; Abrir detalle |
| P-WCN-02 | Detalle del sitio y tokens | WCN · WebConnector | admin | Guardar; Crear token (se muestra una vez); Revocar token; Generar o rotar secreto de firma; Probar webhook |
| P-WCN-03 | Generador de shortcodes | WCN · WebConnector | sales | Generar; Copiar shortcode; Copiar bloque |
| P-WCN-04 | Formularios | WCN · WebConnector | sales | Crear formulario; Editar; Activar o desactivar; Dar de baja |
| P-WCN-05 | Editor de formulario | WCN · WebConnector | sales | Guardar; Guardar campos; Activar; Copiar shortcode |
| P-WCN-06 | Envíos de formularios | WCN · WebConnector | sales | Ver detalle; Reintentar derivación; Marcar como spam; Abrir prospecto; Abrir ticket |
| P-WCN-07 | Datos de contacto por marca | WCN · WebConnector | sales | Agregar dato; Editar; Dar de baja; Copiar shortcode |
| P-WCN-08 | Documentos legales | WCN · WebConnector | sales | Crear documento; Nueva versión; Publicar; Ver aceptaciones; Copiar shortcode |
| P-WCN-09 | Aceptaciones de documentos legales | WCN · WebConnector | admin | Exportar |
| P-WCN-10 | Avisos de invalidación | WCN · WebConnector | admin | Renovar caché ahora; Reintentar |
| P-AIA-01 | Perfiles del asistente | AIA · Assistant | admin | Crear perfil; Activar o desactivar |
| P-AIA-02 | Editor del perfil y prueba | AIA · Assistant | admin | Guardar; Probar en seco |
| P-AIA-03 | Conversaciones | AIA · Assistant | sales | Abrir detalle |
| P-AIA-04 | Detalle de conversación | AIA · Assistant | sales | Enlazar a prospecto, cliente o ticket; Cerrar; Crear ticket desde la conversación |
| P-AIA-05 | Consumo del asistente | AIA · Assistant | admin | Abrir ajuste del tope |
| P-LRC-01 | Libro de Reclamaciones | LRC · Complaints | documentation | Registrar hoja; Exportar; Ver hojas de prueba eliminadas |
| P-LRC-02 | Detalle de hoja de reclamación | LRC · Complaints | documentation | Tomar; Responder al consumidor; Reenviar constancia; Cerrar; Abrir ticket |
| P-LRC-03 | Solicitudes de datos personales | LRC · Complaints | documentation | Registrar solicitud |
| P-LRC-04 | Detalle de solicitud de datos personales | LRC · Complaints | documentation | Verificar identidad; Generar exportación de datos personales; Responder; Rechazar con motivo |
| P-LRC-07 | Hojas de prueba eliminadas | LRC · Complaints | documentation | Ver copia de la hoja; Exportar |
| P-LRC-08 | Vista pública del Libro de Reclamaciones | LRC · Complaints | documentation | Cambiar de marca; Copiar shortcode |
| P-LRC-09 | Responder hoja de reclamación | LRC · Complaints | documentation | Elegir plantilla; Vista previa de la carta; Enviar al consumidor; Subir imagen |


### Portal del cliente y páginas públicas (37 pantallas)

| Código | Pantalla | Módulo | Rol principal | Acciones clave |
|---|---|---|---|---|
| P-MON-09 | Portal de estado público | MON · Monitoring | público | Suscribirse a avisos por correo |
| P-PRT-01 | Inicio de sesión del portal | PRT · Portal | customer_user | Ingresar; Recuperar contraseña |
| P-PRT-02 | Resumen | PRT · Portal | customer_admin | Pagar pendiente; Nuevo ticket |
| P-PRT-03 | Mis proyectos y servicios | PRT · Portal | customer_user | Ver detalle; Solicitar ampliación |
| P-PRT-04 | Detalle de servicio | PRT · Portal | customer_user | Entrar a cPanel; Solicitar reinicio de servidor; Abrir ticket sobre este servicio; Solicitar cancelación |
| P-PRT-05 | Mis dominios | PRT · Portal | customer_user | Ver detalle; Renovar (pagar factura) |
| P-PRT-06 | Detalle de dominio y operaciones | PRT · Portal | customer_admin | Cambiar contactos; Cambiar servidores DNS; Solicitar cambio de titular; Solicitar transferencia de salida; Cancelar solicitud |
| P-PRT-07 | Facturas | PRT · Portal | customer_admin | Descargar PDF/XML; Pagar; Pagar seleccionadas con tarjeta (misma moneda); Descargar estado de cuenta |
| P-PRT-08 | Detalle de factura y pago | PRT · Portal | customer_admin | Pagar con tarjeta (tras ver recargo); Pagar con PayPal (tras ver recargo); Enviar voucher; Descargar |
| P-PRT-09 | Pagos y vouchers | PRT · Portal | customer_admin | Ver comprobante enviado |
| P-PRT-10 | Tickets | PRT · Portal | customer_user | Nuevo ticket; Abrir |
| P-PRT-11 | Detalle o nuevo ticket | PRT · Portal | customer_user | Crear; Responder; Reabrir; Responder encuesta |
| P-PRT-12 | Contratos y documentos | PRT · Portal | customer_admin | Descargar; Aceptar términos |
| P-PRT-13 | Contactos y usuarios | PRT · Portal | customer_admin | Agregar contacto; Editar; Dar o quitar acceso; Eliminar |
| P-PRT-14 | Datos de facturación | PRT · Portal | customer_admin | Guardar (queda auditado) |
| P-PRT-15 | Notificaciones y preferencias | PRT · Portal | customer_user | Marcar leído; Cambiar consentimiento |
| P-PRT-16 | Mantenimientos e incidentes | PRT · Portal | customer_user | Ver detalle |
| P-PRT-17 | Seguridad de la cuenta | PRT · Portal | customer_user | Cambiar contraseña; Activar MFA; Desactivar TOTP; Quitar dispositivo de confianza; Cerrar sesión remota |
| P-PRT-18 | Solicitudes de servicio | PRT · Portal | customer_admin | Enviar solicitud (crea ticket u oportunidad) |
| P-PRT-19 | Base de conocimientos | PRT · Portal | customer_user | Buscar; Abrir ticket desde el artículo |
| P-PRT-20 | Confirmación de operación de dominio | PRT · Portal | público | Confirmar; Rechazar |
| P-PRT-21 | Enlace de un solo uso | PRT · Portal | público | Mostrar acceso |
| P-PRT-22 | Pago con tarjeta | PRT · Portal | customer_admin | Confirmar y pagar; Volver a intentar (crea un intento nuevo); Ver comprobante |
| P-ORD-08 | Carrito y configuración del dominio | ORD · Orders | público | Agregar al carrito; Aplicar cupón; Continuar con la cuenta |
| P-ORD-09 | Crear cuenta o iniciar sesión | ORD · Orders | público | Crear cuenta; Iniciar sesión; Reenviar correo de verificación |
| P-ORD-10 | Confirmación y pago de la compra | ORD · Orders | customer_admin | Aceptar términos y confirmar; Pagar con tarjeta; Pagar con PayPal; Enviar voucher; Cancelar compra |
| P-ORD-11 | Mis pedidos | ORD · Orders | customer_admin | Ver detalle; Pagar compra pendiente |
| P-WCN-11 | Web de la marca en WordPress (contenido del sistema por shortcode) | WCN · WebConnector | público | Contratar (lleva al carrito del sistema central, ORD); Solicitar cotización (formulario); Enviar formulario; Mi cuenta, Pagar y Soporte (sistema central) |
| P-WCN-12 | Búsqueda de dominio y WHOIS en la web (`[hub_whois]`) | WCN · WebConnector | público | Buscar; Registrar (al carrito); Transferir (al carrito); Resolver captcha |
| P-WCN-13 | Servidores VPS y dedicados en la web (`[hub_servidores]`) | WCN · WebConnector | público | Configurar; Contratar (al carrito con complementos); Solicitar cotización |
| P-AIA-06 | Asistente en la web de la marca | AIA · Assistant | público | Enviar mensaje; Hablar con una persona; Ir a WhatsApp |
| P-AIA-07 | Asistente en el portal | AIA · Assistant | customer_user | Enviar mensaje; Pasar a soporte (crea ticket); Ver conversaciones anteriores |
| P-LRC-05 | Libro de Reclamaciones (web de la marca) | LRC · Complaints | público | Enviar; Descargar constancia; Consultar el estado de una hoja (código y correo) |
| P-LRC-06 | Solicitud de derechos sobre datos personales (web de la marca) | LRC · Complaints | público | Enviar |
| P-LRC-10 | Hoja de reclamación (constancia pública) | LRC · Complaints | público | Descargar PDF; Imprimir |
| P-PRT-23 | Respaldos y restauraciones | PRT · Portal | customer_admin | Solicitar restauración; Cancelar solicitud; Ver ticket |
| P-PRT-24 | Términos por aceptar | PRT · Portal | customer_admin | Aceptar; Descargar PDF |


**Total: 241 pantallas** (204 del panel interno y 37 del portal y páginas públicas por marca, incluido el contenido del sistema que muestran las webs WordPress por shortcode —con la búsqueda de dominio y WHOIS y los servidores de docs/00 §27—, el carrito, el asistente, el Libro de Reclamaciones y su hoja pública).
