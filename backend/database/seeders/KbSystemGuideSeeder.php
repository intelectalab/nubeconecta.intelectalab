<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Shared\Organization\CurrentOrganization;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Guía interna del panel de administración: un artículo por módulo/sección.
 * Idempotente: omite categoría y artículos que ya existan por slug.
 * Secciones basadas en frontend/apps/admin/src/app/routeMeta.ts.
 */
final class KbSystemGuideSeeder extends Seeder
{
    public function run(): void
    {
        $organizationId = app(CurrentOrganization::class)->id();
        $now = now();

        $categories = [
            'guia-del-sistema' => ['name' => 'Guía del sistema', 'visibility' => 'internal', 'sort_order' => 11],
        ];
        $categoryIds = [];

        foreach ($categories as $slug => $category) {
            $existingCategory = DB::table('kb_categories')
                ->where('organization_id', $organizationId)
                ->where('slug', $slug)
                ->first(['id']);

            if ($existingCategory !== null) {
                $categoryIds[$slug] = $existingCategory->id;
                continue;
            }

            $categoryId = (string) Str::uuid();
            DB::table('kb_categories')->insert([
                'id' => $categoryId,
                'organization_id' => $organizationId,
                'parent_id' => null,
                'name' => $category['name'],
                'slug' => $slug,
                'visibility' => $category['visibility'],
                'sort_order' => $category['sort_order'],
                'version' => 1,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            $categoryIds[$slug] = $categoryId;
        }

        $articles = [
            // fuente: frontend/apps/admin/src/app/routeMeta.ts (grupos y secciones del menú)
            [
                'category' => 'guia-del-sistema',
                'slug' => 'que-modulos-tiene-el-sistema',
                'title' => '¿Qué módulos tiene el sistema?',
                'visibility' => 'internal',
                'body' => '<p>El panel se organiza en siete grupos de la barra lateral. Cada sección tiene su propio artículo en esta guía. Las marcadas como <em>en preparación</em> muestran datos de muestra y todavía no operan con datos reales.</p>'
                    . '<h3>Operación</h3><ul><li><strong>Inicio</strong> y <strong>Panel de indicadores</strong>: resumen del día e indicadores (en preparación).</li><li><strong>Clientes</strong>: cartera única y ficha del cliente.</li><li><strong>Dominios</strong>: dominios de clientes y vencimientos (en preparación).</li><li><strong>Pedidos</strong>: ventas registradas y aprobación.</li><li><strong>Servicios</strong>: servicios contratados y su ciclo de vida.</li><li><strong>Tareas</strong>: trabajo interno.</li></ul>'
                    . '<h3>Comercial</h3><ul><li><strong>CRM</strong>: embudo de prospectos.</li><li><strong>Solicitudes web</strong>: mensajes de los formularios de las webs.</li><li><strong>Cotizaciones</strong> y <strong>Contratos</strong>: propuestas y contratos con sus versiones.</li><li><strong>Catálogo de productos</strong>: productos, planes, precios y dominios.</li></ul>'
                    . '<h3>Finanzas</h3><ul><li><strong>Bandeja de cobranza</strong>: vouchers, pagos, antigüedad de deuda y avisos.</li><li><strong>Facturas y pagos</strong>: comprobantes electrónicos.</li><li><strong>Finanzas</strong>: costos y rentabilidad.</li></ul>'
                    . '<h3>Soporte</h3><ul><li><strong>Tickets</strong>, <strong>Libro de Reclamaciones</strong> y <strong>Centro de ayuda</strong> (base de conocimientos).</li></ul>'
                    . '<h3>Infraestructura</h3><ul><li><strong>Inventario</strong>, <strong>Monitoreo</strong> y <strong>Proveedores</strong>.</li><li><strong>Cloud</strong>, <strong>Correo y SSL</strong> y <strong>Bóveda</strong> (en preparación).</li></ul>'
                    . '<h3>Web</h3><ul><li><strong>WordPress y shortcodes</strong>: sitios conectados y generador de shortcodes.</li></ul>'
                    . '<h3>Configuración</h3><ul><li><strong>Cobranza y SLA</strong>, <strong>Apariencia</strong>, <strong>Acceso del portal</strong>, <strong>Plantillas de correo</strong>, <strong>Seguridad</strong> y <strong>Usuarios y roles</strong>.</li></ul>'
                    . '<p>Lo que ves en el menú depende de tus permisos: si no aparece una sección, tu rol no tiene acceso a ella.</p>',
            ],
            // fuente: InicioView.tsx y KpiView.tsx importan datos de ../../data (prototipo), sin llamadas a la API
            [
                'category' => 'guia-del-sistema',
                'slug' => 'inicio-y-panel-de-indicadores',
                'title' => 'Inicio y Panel de indicadores',
                'visibility' => 'internal',
                'body' => '<p><strong>Inicio</strong> es el resumen del día: los asuntos que requieren atención y accesos rápidos a otras secciones. El <strong>Panel de indicadores</strong> reúne indicadores del negocio comparados contra el periodo anterior, con filtro por marca y detalle por indicador.</p><p><strong>Estado: en preparación.</strong> Ambas pantallas funcionan hoy con datos de muestra del prototipo, por lo que las cifras no reflejan todavía la operación real. Para datos reales usa las secciones de cada área (Clientes, Facturas y pagos, Tickets, etc.).</p><p>Las ven todos los roles del personal; el filtro de marca del encabezado acota lo que se muestra.</p>',
            ],
            // fuente: clientes/CustomerList.tsx, clientes/CustomerFicha.tsx, backend/README.md (Módulo Customers)
            [
                'category' => 'guia-del-sistema',
                'slug' => 'clientes',
                'title' => 'Clientes',
                'visibility' => 'internal',
                'body' => '<p>Es la cartera única de clientes para todas las marcas. Sirve para buscar clientes, ver su estado y deuda, y abrir su <strong>ficha</strong> con todo lo relacionado. La usan Ventas, Soporte y Finanzas.</p><p>Acciones principales:</p><ul><li>Buscar y filtrar por marca, país, responsable, estado y deuda.</li><li>Crear o editar un cliente; el sistema valida el documento (RUC, DNI, etc.) y avisa de posibles duplicados.</li><li>En la ficha: <strong>Resumen</strong>, <strong>Contactos</strong> (incluido el acceso al portal), <strong>Notas</strong> internas e <strong>Historial</strong>, además de los servicios y facturas del cliente.</li><li>Fusionar duplicados, exportar e importar desde CSV, según tus permisos.</li></ul><p>Algunas pestañas de la ficha (como Mapa de servicios, Dominios, Tickets y Contratos) todavía muestran datos de muestra: están en preparación.</p>',
            ],
            // fuente: DominiosView.tsx (usa domains de ../../data, prototipo); backend Catalog tiene domain-extensions/domain-tld-prices (catálogo, no dominios de clientes)
            [
                'category' => 'guia-del-sistema',
                'slug' => 'dominios',
                'title' => 'Dominios',
                'visibility' => 'internal',
                'body' => '<p>Esta sección está pensada para controlar los dominios de los clientes: registrador, titular y dos fechas, la fecha real de vencimiento del registrador y la fecha comercial comunicada al cliente (15 días antes).</p><p><strong>Estado: en preparación.</strong> La lista actual usa datos de muestra. Lo que sí funciona con datos reales es el catálogo de extensiones y precios de dominios, que se gestiona en <strong>Catálogo de productos</strong> (pestaña Dominios).</p>',
            ],
            // fuente: pedidos/OrderList.tsx, servicios/ServiceList.tsx, backend/app/Modules/Services/README.md, backend/README.md
            [
                'category' => 'guia-del-sistema',
                'slug' => 'pedidos-y-servicios',
                'title' => 'Pedidos y Servicios',
                'visibility' => 'internal',
                'body' => '<p><strong>Pedidos</strong> registra las ventas del equipo comercial: un pedido de un cliente existente con el precio congelado e IGV. Sigue el flujo borrador, aprobado o cancelado. <strong>Servicios</strong> lista lo que los clientes tienen contratado.</p><p>Cómo se relacionan:</p><ol><li>Creas el pedido para un cliente desde Pedidos.</li><li>Al <strong>aprobarlo</strong>, el sistema crea un servicio pendiente por cada línea y genera el comprobante (borrador) en Facturas y pagos.</li><li>Desde Servicios se activa el servicio (hoy el aprovisionamiento es manual: el personal confirma el recurso), y se puede suspender, reactivar o cancelar; suspender y cancelar piden un motivo.</li></ol><p>Cada acción queda en el historial del servicio. Lo usan Ventas y Operaciones; las transiciones dependen de tus permisos.</p>',
            ],
            // fuente: TareasView.tsx (workApi), backend/app/Modules/Work
            [
                'category' => 'guia-del-sistema',
                'slug' => 'tareas',
                'title' => 'Tareas',
                'visibility' => 'internal',
                'body' => '<p>Tareas es el trabajo interno del equipo: pendientes operativos con número propio y estados por los que van pasando. Sirve para coordinar quién hace qué y dar seguimiento.</p><p>Puedes crear y editar tareas, cambiar su estado y eliminarlas si tu rol lo permite. Si dos personas editan a la vez, el sistema recarga la tarea y te avisa del conflicto. La usa todo el personal operativo.</p>',
            ],
            // fuente: crm/CrmLive.tsx, SolicitudesView.tsx, backend/README.md (WebConnector)
            [
                'category' => 'guia-del-sistema',
                'slug' => 'crm-y-solicitudes-web',
                'title' => 'CRM y Solicitudes web',
                'visibility' => 'internal',
                'body' => '<p><strong>Solicitudes web</strong> recibe los mensajes de los formularios de contacto y cotización de las webs WordPress. Muestra contadores (nuevas, derivadas, con error, spam) y permite cambiar el estado de cada solicitud. Si corresponde, la conviertes en prospecto.</p><p><strong>CRM</strong> es el embudo comercial: los prospectos van desde la solicitud web hasta el cliente.</p><ul><li>Vista de tablero por etapas o en lista, con filtros por canal, responsable y estado.</li><li>Mover un prospecto entre etapas; al marcarlo como <strong>ganado</strong> se convierte en cliente, y al perderlo se pide el motivo.</li><li>Cada prospecto guarda datos, origen, actividades e historial.</li></ul><p>Lo usa el equipo de Ventas.</p>',
            ],
            // fuente: CotizacionesView.tsx (quotesApi), ContratosView.tsx (contractsApi), backend/app/Modules/Sales, Contracts
            [
                'category' => 'guia-del-sistema',
                'slug' => 'cotizaciones-y-contratos',
                'title' => 'Cotizaciones y Contratos',
                'visibility' => 'internal',
                'body' => '<p><strong>Cotizaciones</strong> reúne las propuestas comerciales enviadas a clientes y sus versiones vigentes. <strong>Contratos</strong> reúne los contratos y sus versiones.</p><ul><li>Ambas secciones son listas con detalle; en Contratos puedes filtrar por estado.</li><li>Los contratos en borrador o en revisión se pueden editar; los demás se consultan.</li><li>Si alguien más modificó el registro, el sistema lo recarga y te avisa.</li></ul><p>Las usan Ventas y Administración. El alcance de lo que puedes editar depende de tu rol.</p>',
            ],
            // fuente: catalogo/CatalogList.tsx, catalogo/Domains.tsx, catalogo/ServiceTypes.tsx, backend/README.md (Catalog)
            [
                'category' => 'guia-del-sistema',
                'slug' => 'catalogo-de-productos',
                'title' => 'Catálogo de productos',
                'visibility' => 'internal',
                'body' => '<p>El catálogo es todo lo que se vende. Lo que defines aquí alimenta las webs WordPress (shortcodes), las cotizaciones y los pedidos. Tiene tres pestañas:</p><ul><li><strong>Productos</strong>: categorías, productos, planes y precios en soles y dólares, con vigencias.</li><li><strong>Tipos de servicio</strong>.</li><li><strong>Dominios</strong>: extensiones y precios por extensión.</li></ul><p>Al cambiar un plan o su precio, las webs conectadas reciben un aviso para actualizarse. Cuida los precios: afectan a lo que ven los clientes. Lo gestiona Producto o Administración.</p>',
            ],
            // fuente: cobranza/CollectionsView.tsx, backend/README.md (Billing: pagos y cobranza)
            [
                'category' => 'guia-del-sistema',
                'slug' => 'bandeja-de-cobranza',
                'title' => 'Bandeja de cobranza',
                'visibility' => 'internal',
                'body' => '<p>Es el puesto de trabajo de Finanzas para cobrar. Sus pestañas:</p><ul><li><strong>Vouchers por validar</strong>: constancias que subieron los clientes; se validan o rechazan contrastando con el banco.</li><li><strong>Pagos</strong>: pagos registrados; puedes registrar un pago manual y aplicarlo a uno o varios comprobantes.</li><li><strong>Antigüedad de deuda</strong>: deuda pendiente por tramos de atraso.</li><li><strong>Avisos</strong>: recordatorios de cobranza enviados (solo con permiso).</li></ul><p>El sistema envía avisos diarios automáticos según la secuencia de cobranza. Un voucher no confirma el pago hasta que Finanzas lo valida. Ver el procedimiento en Validar un voucher de pago.</p>',
            ],
            // fuente: facturas/InvoiceList.tsx, backend/README.md (Billing: EInvoiceConnector simulado)
            [
                'category' => 'guia-del-sistema',
                'slug' => 'facturas-y-pagos',
                'title' => 'Facturas y pagos',
                'visibility' => 'internal',
                'body' => '<p>Lista los comprobantes electrónicos (facturas y boletas) de las marcas. Se generan en borrador al aprobar un pedido y en cada renovación.</p><ul><li>Filtra por tipo, estado, estado SUNAT y moneda.</li><li>Emite el comprobante: la numeración sale de las series de la marca, con IGV y saldo pendiente.</li><li>Consulta la representación impresa y descárgala.</li><li>Anula un comprobante solo si no tiene pagos aplicados.</li></ul><p>La conexión de emisión electrónica opera en modo simulado mientras no se active la integración real; confirma el estado con Administración antes de tratarlo como emisión válida ante SUNAT. Lo usa Finanzas.</p>',
            ],
            // fuente: ReportesView.tsx (financeApi: costos, rentabilidad), backend/app/Modules/Finance
            [
                'category' => 'guia-del-sistema',
                'slug' => 'finanzas-costos-y-rentabilidad',
                'title' => 'Finanzas: costos y rentabilidad',
                'visibility' => 'internal',
                'body' => '<p>La sección <strong>Finanzas</strong> registra los costos por periodo, cómo se reparten entre los servicios y la rentabilidad resultante.</p><ul><li><strong>Costos</strong>: alta, edición y baja de costos por periodo, con el monto asignado y el disponible por repartir.</li><li><strong>Rentabilidad</strong>: resultado calculado a partir de los ingresos y los costos asignados.</li></ul><p>Es información sensible: solo la ve el personal con permiso de costos (Finanzas y Administración).</p>',
            ],
            // fuente: TicketsView.tsx, soporte/TicketDetail.tsx, soporte/api.ts
            [
                'category' => 'guia-del-sistema',
                'slug' => 'tickets',
                'title' => 'Tickets',
                'visibility' => 'internal',
                'body' => '<p>Tickets es la bandeja de soporte. Cada ticket tiene asunto, tipo (incidente, solicitud, consulta, facturación, reclamo, seguridad), canal de origen, prioridad y estado (nuevo, abierto, en progreso, esperando cliente o proveedor, escalado, resuelto, cerrado, reabierto).</p><ul><li>Filtra la bandeja por estado y prioridad.</li><li>Crea un ticket nuevo indicando asunto, tipo y canal.</li><li>En el detalle: lee el hilo, responde al cliente, añade <strong>notas internas</strong> (no las ve el cliente) y gestiona los <strong>adjuntos</strong>.</li></ul><p>Lo usa el equipo de Soporte.</p>',
            ],
            // fuente: ReclamosView.tsx, soporte/ReclSheet.tsx, procedimiento existente atender-reclamo en KbHelpSeeder
            [
                'category' => 'guia-del-sistema',
                'slug' => 'libro-de-reclamaciones',
                'title' => 'Libro de Reclamaciones',
                'visibility' => 'internal',
                'body' => '<p>Reúne las hojas de reclamación recibidas y sus respuestas oficiales. Sirve para cumplir el plazo legal de atención.</p><ul><li>Abre una hoja para leer el detalle y ponerla <strong>en atención</strong>.</li><li>Registra la respuesta oficial; al enviarla queda constancia en la hoja.</li><li>Puedes crear una hoja manualmente cuando el reclamo llega por otro medio.</li></ul><p>Lo atiende Soporte con apoyo de Administración. Ver también el procedimiento Atender un reclamo del Libro de Reclamaciones.</p>',
            ],
            // fuente: AyudaView.tsx (api KB), backend KbHelpSeeder
            [
                'category' => 'guia-del-sistema',
                'slug' => 'centro-de-ayuda-administracion',
                'title' => 'Centro de ayuda (administración)',
                'visibility' => 'internal',
                'body' => '<p>Aquí administras la base de conocimientos: <strong>categorías</strong> y <strong>artículos</strong>. Cada uno tiene visibilidad: <em>pública</em> (la ven los clientes en el portal) o <em>interna</em> (solo el personal, como esta guía) y un estado (borrador o publicado).</p><ul><li>Crea, edita y elimina categorías y artículos.</li><li>Redacta el contenido y publícalo cuando esté listo.</li></ul><p>Revisa la visibilidad antes de publicar: un artículo público lo puede leer cualquier cliente. Lo mantiene Soporte.</p>',
            ],
            // fuente: InfraView.tsx (inventoryApi: Recursos/Servidores/Nodos/Cuentas), ProveedoresView.tsx (providersApi)
            [
                'category' => 'guia-del-sistema',
                'slug' => 'inventario-y-proveedores',
                'title' => 'Inventario y Proveedores',
                'visibility' => 'internal',
                'body' => '<p><strong>Inventario</strong> registra los activos técnicos en cuatro pestañas: <strong>Recursos</strong>, <strong>Servidores</strong>, <strong>Nodos de hosting</strong> y <strong>Cuentas</strong>. Cada una permite crear, editar y eliminar registros.</p><p><strong>Proveedores</strong> mantiene los proveedores externos (registradores, hosting, etc.) y sus cuentas.</p><p>Mantén estos datos al día: el resto de la operación (servicios, monitoreo) se apoya en ellos. Los usa el equipo técnico; no guardes contraseñas aquí, para eso existe la Bóveda.</p>',
            ],
            // fuente: MonitoreoView.tsx (monitoringApi: monitores e incidentes)
            [
                'category' => 'guia-del-sistema',
                'slug' => 'monitoreo',
                'title' => 'Monitoreo',
                'visibility' => 'internal',
                'body' => '<p>Monitoreo tiene dos pestañas:</p><ul><li><strong>Monitores</strong>: comprobaciones configuradas (web, palabra clave, ping, puerto, DNS, SSL, latido, reputación de correo, externo), con su estado, intervalo y si están activos.</li><li><strong>Incidentes</strong>: registro de caídas o problemas, con severidad, tipo y estado (abierto, en seguimiento, resuelto).</li></ul><p>Puedes crear, editar y eliminar monitores e incidentes, y mover un incidente por sus estados. Lo usa el equipo técnico y de guardia.</p>',
            ],
            // fuente: CloudView.tsx, CorreoView.tsx (datos de ../../data; sin API)
            [
                'category' => 'guia-del-sistema',
                'slug' => 'cloud-y-correo-ssl',
                'title' => 'Cloud y Correo y SSL',
                'visibility' => 'internal',
                'body' => '<p><strong>Cloud</strong> está pensado para seguir proyectos y cuentas cloud administradas por cliente, con costo del mes y presupuesto. <strong>Correo y SSL</strong> está pensado para comparar licencias de Google Workspace y Microsoft 365 asignadas frente a facturadas, y para vigilar certificados por vencer.</p><p><strong>Estado: en preparación.</strong> Ambas pantallas usan datos de muestra y no están conectadas todavía a datos reales.</p>',
            ],
            // fuente: BovedaView.tsx (nota: "Prototipo: no se guardan ni se muestran contraseñas reales")
            [
                'category' => 'guia-del-sistema',
                'slug' => 'boveda',
                'title' => 'Bóveda',
                'visibility' => 'internal',
                'body' => '<p>La Bóveda está pensada para custodiar credenciales de servicios de clientes, cifradas, de modo que revelar una exija indicar un motivo y quede auditado.</p><p><strong>Estado: en preparación.</strong> Hoy es un prototipo: no guarda ni muestra credenciales reales. Mientras tanto, no pegues contraseñas en tickets, notas ni tareas; usa el gestor de credenciales aprobado por la empresa.</p>',
            ],
            // fuente: WpView.tsx, web-config/WpSitios.tsx, WpGenerador.tsx, WpFormularios.tsx, WpContactoLegales.tsx (notas "Pendiente de backend"), backend/README.md (WebConnector)
            [
                'category' => 'guia-del-sistema',
                'slug' => 'wordpress-y-shortcodes',
                'title' => 'WordPress y shortcodes',
                'visibility' => 'internal',
                'body' => '<p>Las webs públicas viven en WordPress; esta sección conecta esos sitios con el sistema. Tiene cinco pestañas:</p><ul><li><strong>Sitios conectados</strong> (operativa): alta de sitios, activación y desactivación, rotación de su secreto, prueba de aviso y gestión de tokens. Un sitio solo se activa tras una prueba de aviso correcta.</li><li><strong>Generador de shortcodes</strong>, <strong>Formularios</strong>, <strong>Contacto por marca</strong> y <strong>Documentos legales</strong>: en preparación; la pantalla indica que faltan sus endpoints de administración y usa datos de muestra.</li></ul><p>Los secretos y tokens se muestran una sola vez al generarlos: cópialos a un lugar seguro en ese momento. Lo gestiona el equipo técnico.</p>',
            ],
            // fuente: AjustesView.tsx (settingsApi: horario, feriados, cobranza), backend/README.md (Settings)
            [
                'category' => 'guia-del-sistema',
                'slug' => 'cobranza-y-sla',
                'title' => 'Cobranza y SLA (ajustes)',
                'visibility' => 'internal',
                'body' => '<p>Define el calendario y los ajustes que gobiernan los vencimientos: el <strong>horario de atención</strong>, los <strong>feriados</strong> y los ajustes de cobranza. Con ellos el sistema calcula días hábiles y plazos.</p><p>Puedes añadir o quitar feriados, editar el horario y cambiar los valores de cobranza. Estos cambios afectan a los plazos de toda la organización, así que los gestiona solo Administración y quedan registrados.</p>',
            ],
            // fuente: AparienciaView.tsx (brand themes), backend/README.md (Brands: temas, vista previa, publicación y reversión)
            [
                'category' => 'guia-del-sistema',
                'slug' => 'apariencia',
                'title' => 'Apariencia',
                'visibility' => 'internal',
                'body' => '<p>Gestiona el tema visual de cada marca como versiones publicables, por superficie: <strong>Portal del cliente</strong>, <strong>Panel interno</strong> y <strong>Correos</strong>.</p><ol><li>Edita colores y logo en un borrador; el sistema verifica el contraste.</li><li>Revisa con el enlace de vista previa.</li><li>Publica el tema. Si algo sale mal, puedes <strong>revertir</strong> a una versión anterior.</li></ol><p>La publicación cambia lo que ven los clientes; revisa la vista previa antes. Lo gestiona Administración o Marketing.</p>',
            ],
            // fuente: AccesoPortalView.tsx (settings), memoria de proyecto login-branding-configurable
            [
                'category' => 'guia-del-sistema',
                'slug' => 'acceso-del-portal',
                'title' => 'Acceso del portal',
                'visibility' => 'internal',
                'body' => '<p>Configura la pantalla de acceso que ven los clientes: el branding global del login (textos e imágenes) y los ajustes de activación de cuenta y restablecimiento de contraseña.</p><p>Es un único login para todas las marcas. Guarda los cambios con el botón de la sección y prueba el acceso después. Lo gestiona Administración.</p>',
            ],
            // fuente: PlantillasView.tsx (notification templates, correo de prueba), backend Notifications
            [
                'category' => 'guia-del-sistema',
                'slug' => 'plantillas-de-correo',
                'title' => 'Plantillas de correo',
                'visibility' => 'internal',
                'body' => '<p>Contiene las plantillas de los correos automáticos: avisos al cliente y respuestas de soporte. Cada plantilla tiene un código, categoría, canal y audiencia.</p><ul><li>Busca y filtra por categoría, canal y estado.</li><li>Crea, edita o elimina plantillas.</li><li>Usa <strong>Enviar correo de prueba</strong> antes de dejar una plantilla en uso.</li></ul><p>Un cambio afecta a todos los correos futuros de ese tipo. Lo gestionan Soporte y Administración.</p>',
            ],
            // fuente: SeguridadView.tsx (claves security.*), backend/README.md (Identity)
            [
                'category' => 'guia-del-sistema',
                'slug' => 'seguridad',
                'title' => 'Seguridad',
                'visibility' => 'internal',
                'body' => '<p>Concentra las políticas de seguridad de la organización, agrupadas en:</p><ul><li><strong>Contraseñas</strong>: longitud, complejidad, caducidad e historial.</li><li><strong>MFA (doble factor)</strong>: a quién se exige.</li><li><strong>Acceso y sesión</strong>: intentos de inicio de sesión, bloqueo, duración de la sesión y dispositivos de confianza.</li><li><strong>Bóveda</strong>: límite de revelaciones por hora.</li></ul><p>Son ajustes globales y críticos: endurecerlos es seguro, relajarlos reduce la protección de todas las cuentas. Cambia solo con aprobación de Administración; los cambios quedan registrados.</p>',
            ],
            // fuente: RolesView.tsx (identityApi: usuarios y roles), backend/README.md (Identity, rol admin protegido, superadmin)
            [
                'category' => 'guia-del-sistema',
                'slug' => 'usuarios-y-roles',
                'title' => 'Usuarios y roles',
                'visibility' => 'internal',
                'body' => '<p>Administra quién entra al panel y qué puede hacer. Tiene dos pestañas:</p><ul><li><strong>Usuarios</strong>: invitar personal, editar sus datos y roles, y eliminar usuarios. La contraseña inicial debe cambiarse al ingresar.</li><li><strong>Roles y permisos</strong>: ver y ajustar los permisos de cada rol. Los roles del sistema están protegidos.</li></ul><p>Buenas prácticas: da a cada persona solo el rol que necesita, usa cuentas nominales (no compartidas), revisa los accesos cuando alguien cambie de funciones y retira el acceso a quien se va. El sistema impide dejar la organización sin un administrador activo.</p>',
            ],
        ];

        foreach ($articles as $article) {
            $alreadyExists = DB::table('kb_articles')
                ->where('organization_id', $organizationId)
                ->where('locale', 'es')
                ->where('slug', $article['slug'])
                ->exists();

            if ($alreadyExists) {
                continue;
            }

            DB::table('kb_articles')->insert([
                'id' => (string) Str::uuid(),
                'organization_id' => $organizationId,
                'kb_category_id' => $categoryIds[$article['category']],
                'brand_id' => null,
                'locale' => 'es',
                'title' => $article['title'],
                'slug' => $article['slug'],
                'body' => $article['body'],
                'visibility' => $article['visibility'],
                'status' => 'published',
                'published_at' => $now,
                'version' => 1,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }
}
