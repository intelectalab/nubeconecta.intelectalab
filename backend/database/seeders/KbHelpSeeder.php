<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Shared\Organization\CurrentOrganization;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class KbHelpSeeder extends Seeder
{
    public function run(): void
    {
        $organizationId = app(CurrentOrganization::class)->id();
        $now = now();

        $categories = [
            'primeros-pasos' => ['name' => 'Primeros pasos', 'visibility' => 'public', 'sort_order' => 1],
            'hosting-correo' => ['name' => 'Hosting y correo', 'visibility' => 'public', 'sort_order' => 2],
            'dominios' => ['name' => 'Dominios', 'visibility' => 'public', 'sort_order' => 3],
            'facturacion-pagos' => ['name' => 'Facturación y pagos', 'visibility' => 'public', 'sort_order' => 4],
            'cuenta-seguridad' => ['name' => 'Cuenta y seguridad', 'visibility' => 'public', 'sort_order' => 5],
            'procedimientos-internos' => ['name' => 'Procedimientos internos', 'visibility' => 'internal', 'sort_order' => 10],
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
            [
                'category' => 'primeros-pasos',
                'slug' => 'acceder-al-portal',
                'title' => 'Cómo acceder a tu portal de cliente',
                'visibility' => 'public',
                'body' => '<p>Inicia sesión en el portal de cliente con los datos de acceso de tu cuenta. Si no recuerdas la contraseña, usa la opción para recuperarla y sigue las instrucciones que recibas para definir una nueva.</p><p>En el portal encontrarás tus servicios y podrás gestionar tu cuenta. Estas son las secciones disponibles:</p><ul><li><strong>Resumen</strong> muestra una vista general de tu cuenta.</li><li><strong>Mis servicios</strong> reúne tus servicios de hosting, VPS y correo; <strong>Dominios</strong> permite consultar los dominios.</li><li><strong>Facturas y pagos</strong> contiene tus facturas, pagos y comprobantes; <strong>Centro de soporte</strong> da acceso a los tickets y al Libro de Reclamaciones.</li><li><strong>Contratos</strong>, <strong>Usuarios del equipo</strong>, <strong>Seguridad y 2FA</strong>, <strong>Datos fiscales (RUC)</strong> y <strong>Respaldos</strong> reúnen la información y opciones indicadas por cada sección.</li></ul>',
            ],
            [
                'category' => 'hosting-correo',
                'slug' => 'acceder-a-cpanel',
                'title' => 'Cómo acceder a cPanel',
                'visibility' => 'public',
                'body' => '<p>cPanel es el panel de control de tu servicio de hosting. Desde allí puedes administrar archivos y cuentas de correo de tu sitio.</p><p>Cuando tu servicio se activa, recibes un correo de bienvenida con un enlace de un solo uso. Abre ese enlace para acceder con las credenciales incluidas en el mensaje y consulta los datos de acceso que allí se indican.</p><p>Guarda tus credenciales en un lugar seguro. Si el enlace de bienvenida ya se utilizó o no puedes entrar, contacta al equipo desde el Centro de soporte del portal para recibir ayuda.</p>',
            ],
            [
                'category' => 'hosting-correo',
                'slug' => 'crear-cuenta-de-correo',
                'title' => 'Cómo crear una cuenta de correo',
                'visibility' => 'public',
                'body' => '<p>Puedes crear buzones para tu dominio desde cPanel. Antes de empezar, asegúrate de tener acceso al panel de control de tu servicio.</p><ol><li>Inicia sesión en cPanel.</li><li>Abre <strong>Cuentas de correo electrónico</strong>.</li><li>Elige la opción para crear una cuenta, escribe el nombre que aparecerá antes de tu dominio y define una contraseña segura.</li><li>Confirma la creación y comparte la dirección y la contraseña solo con la persona autorizada.</li></ol><p>Si no ves la opción o no puedes completar el proceso, solicita ayuda desde el Centro de soporte del portal.</p>',
            ],
            [
                'category' => 'hosting-correo',
                'slug' => 'subir-tu-sitio-web',
                'title' => 'Cómo subir tu sitio web',
                'visibility' => 'public',
                'body' => '<p>Los archivos públicos de tu sitio deben quedar en la carpeta <strong>public_html</strong> de tu hosting. Puedes transferirlos con el Administrador de archivos de cPanel o mediante FTP.</p><ol><li>Accede a cPanel y abre el Administrador de archivos, o conecta tu cliente FTP con los datos de acceso de tu servicio.</li><li>Abre la carpeta <strong>public_html</strong>.</li><li>Sube allí los archivos del sitio y conserva la estructura de carpetas necesaria.</li><li>Visita tu dominio para comprobar que el sitio se muestra correctamente.</li></ol><p>Si el dominio todavía no apunta al hosting, primero configura sus nameservers o DNS. Para ayuda con los datos de conexión, abre un ticket en el Centro de soporte.</p>',
            ],
            [
                'category' => 'dominios',
                'slug' => 'apuntar-tu-dominio',
                'title' => 'Cómo apuntar tu dominio al hosting',
                'visibility' => 'public',
                'body' => '<p>Para que tu dominio dirija a tu hosting, actualiza sus nameservers o registros DNS con los valores indicados para tu servicio. La administración del dominio se realiza desde el portal en la sección <strong>Dominios</strong>; si el dominio está gestionado en otro proveedor, realiza el cambio allí.</p><ol><li>Consulta los nameservers o datos DNS que corresponden a tu hosting.</li><li>Entra al panel donde administras el dominio y reemplaza los nameservers actuales o actualiza los registros DNS solicitados.</li><li>Guarda los cambios y espera a que se propaguen.</li></ol><p>La propagación puede tardar hasta 24–48 horas. Durante ese periodo, el dominio podría no mostrar el mismo destino desde todas las redes.</p>',
            ],
            [
                'category' => 'dominios',
                'slug' => 'renovar-tu-dominio',
                'title' => 'Cómo renovar tu dominio',
                'visibility' => 'public',
                'body' => '<p>Revisa la fecha de vencimiento de tu dominio en la sección <strong>Dominios</strong> del portal y solicita la renovación antes de esa fecha.</p><ol><li>Abre el portal y entra en <strong>Dominios</strong>.</li><li>Selecciona el dominio que deseas renovar y sigue las opciones disponibles para completar la renovación y el pago.</li><li>Comprueba en el portal que la renovación figure registrada.</li></ol><p>Si no renuevas a tiempo, el dominio puede vencer y dejar de estar disponible para tus servicios. Esto puede interrumpir el acceso al sitio y al correo asociado. Si no encuentras la opción de renovación, contacta al Centro de soporte.</p>',
            ],
            [
                'category' => 'dominios',
                'slug' => 'activar-ssl',
                'title' => 'Cómo activar el certificado SSL',
                'visibility' => 'public',
                'body' => '<p>El hosting usa AutoSSL de cPanel para gestionar el certificado SSL. Antes de solicitarlo, verifica que el dominio ya apunte al hosting y que el sitio esté disponible desde ese dominio.</p><ol><li>Inicia sesión en cPanel.</li><li>Busca la opción de SSL o AutoSSL y revisa el estado de los dominios incluidos en tu servicio.</li><li>Si la opción está disponible, ejecuta AutoSSL y espera a que termine la comprobación.</li><li>Cuando el certificado esté activo, visita el sitio usando <strong>https</strong> y confirma que el navegador lo carga de forma segura.</li></ol><p>Si AutoSSL no puede emitir el certificado, comprueba primero la configuración DNS y luego abre un ticket en el Centro de soporte.</p>',
            ],
            [
                'category' => 'facturacion-pagos',
                'slug' => 'pagar-tu-factura',
                'title' => 'Cómo pagar tu factura',
                'visibility' => 'public',
                'body' => '<p>Paga tus facturas desde la sección <strong>Facturas y pagos</strong> del portal. Allí puedes revisar los documentos pendientes y elegir una de estas formas de pago:</p><ul><li><strong>Tarjeta:</strong> selecciona el pago con tarjeta para continuar en Mercado Pago mediante Checkout Pro y completa las instrucciones de pago.</li><li><strong>Transferencia o depósito:</strong> realiza el pago y envía el voucher o constancia desde las opciones de la factura en el portal.</li></ul><p>Cuando envías un voucher, el equipo de Finanzas lo contrasta con el banco antes de aplicar el pago a la factura. El envío del comprobante de transferencia no significa que el pago ya esté validado. Revisa el estado de la factura en el portal.</p>',
            ],
            [
                'category' => 'facturacion-pagos',
                'slug' => 'descargar-comprobante',
                'title' => 'Cómo descargar tu comprobante electrónico',
                'visibility' => 'public',
                'body' => '<p>Tus comprobantes electrónicos, emitidos como factura o boleta conforme a SUNAT, se descargan desde el portal de cliente.</p><ol><li>Inicia sesión en el portal.</li><li>Abre <strong>Facturas y pagos</strong> y localiza el documento que necesitas.</li><li>Selecciona la opción de descarga del comprobante.</li></ol><p>Si necesitas una factura, revisa que tus datos fiscales, incluido el RUC, estén actualizados en la sección <strong>Datos fiscales (RUC)</strong>. Si no encuentras un comprobante, solicita ayuda al equipo desde el Centro de soporte.</p>',
            ],
            [
                'category' => 'cuenta-seguridad',
                'slug' => 'activar-2fa',
                'title' => 'Cómo activar la verificación en dos pasos (2FA)',
                'visibility' => 'public',
                'body' => '<p>La verificación en dos pasos añade un código temporal a tu inicio de sesión. Puedes configurarla en el portal desde <strong>Seguridad y 2FA</strong> usando una aplicación compatible con TOTP.</p><ol><li>Abre la sección <strong>Seguridad y 2FA</strong> del portal e inicia la configuración.</li><li>Escanea el código de configuración con tu aplicación TOTP y escribe el código temporal para confirmar.</li><li>Guarda los códigos de recuperación en un lugar seguro y separado de tu contraseña.</li></ol><p>Los códigos de recuperación te permiten recuperar el acceso si no puedes usar la aplicación. No los compartas con otras personas.</p>',
            ],
            [
                'category' => 'cuenta-seguridad',
                'slug' => 'agregar-usuarios',
                'title' => 'Cómo agregar usuarios de tu empresa',
                'visibility' => 'public',
                'body' => '<p>La sección <strong>Usuarios del equipo</strong> del portal permite incorporar a otras personas de tu empresa para que accedan a la cuenta.</p><ol><li>Abre <strong>Usuarios del equipo</strong> en el portal.</li><li>Elige la opción para agregar un usuario e indica los datos solicitados.</li><li>Asigna el rol o los permisos que correspondan a las tareas de esa persona y confirma la invitación o el alta.</li></ol><p>Concede solo los permisos que cada persona necesita. Revisa los usuarios y sus permisos cuando cambien las responsabilidades de tu equipo.</p>',
            ],
            [
                'category' => 'procedimientos-internos',
                'slug' => 'aprovisionar-servicio',
                'title' => 'Aprovisionar un servicio (WHM/cPanel)',
                'visibility' => 'internal',
                'body' => '<p>Inicia el aprovisionamiento cuando el pago del servicio ya esté validado. Comprueba la orden y los datos del servicio antes de enviar la solicitud al conector de WHM/cPanel.</p><ol><li>Confirma que Finanzas haya validado el pago y que la factura o el pedido correspondan al servicio.</li><li>Ejecuta el aprovisionamiento mediante el conector WHM/cPanel y revisa el resultado.</li><li>Al activarse el servicio, asegúrate de que el cliente reciba el correo de bienvenida con el enlace de un solo uso.</li><li>Si el conector no puede completar el aprovisionamiento, deja la tarea manual para el equipo responsable y registra el estado para su seguimiento.</li></ol><p>Verifica que el estado del servicio y la comunicación al cliente reflejen el resultado real del aprovisionamiento.</p>',
            ],
            [
                'category' => 'procedimientos-internos',
                'slug' => 'validar-voucher',
                'title' => 'Validar un voucher de pago',
                'visibility' => 'internal',
                'body' => '<p>Finanzas valida cada voucher contrastando la constancia de transferencia o depósito con los movimientos del banco. El archivo enviado por el cliente es evidencia para revisar; por sí solo no confirma el pago.</p><ol><li>Localiza la factura y el voucher asociado en el portal.</li><li>Compara en el banco los datos disponibles de la operación con el importe y la información de la constancia.</li><li>Si el abono coincide, aprueba el voucher y aplica el pago a la factura.</li><li>Si no coincide o no puede verificarse, recházalo y deja el estado de la factura pendiente de pago validado.</li></ol><p>Actualiza el estado para que el cliente pueda consultar el resultado en Facturas y pagos. El aprovisionamiento procede después de que el pago haya sido validado.</p>',
            ],
            [
                'category' => 'procedimientos-internos',
                'slug' => 'atender-reclamo',
                'title' => 'Atender un reclamo del Libro de Reclamaciones',
                'visibility' => 'internal',
                'body' => '<p>Atiende los reclamos recibidos por el Libro de Reclamaciones desde el Centro de soporte. Revisa el registro y controla el plazo de respuesta aplicable para que la atención y la respuesta oficial se emitan dentro del plazo correspondiente.</p><ol><li>Lee el reclamo y verifica que el registro contenga la información necesaria para entender lo ocurrido.</li><li>Coordina con el equipo relacionado y reúne los antecedentes antes de preparar la respuesta.</li><li>Redacta una respuesta oficial, clara y basada en la revisión del caso, y envíala por el canal de atención correspondiente.</li><li>Registra la respuesta y el estado del reclamo, y ciérralo una vez completada la atención.</li></ol><p>Si falta información o se requiere coordinación, da seguimiento al caso sin perder de vista el plazo de respuesta.</p>',
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
