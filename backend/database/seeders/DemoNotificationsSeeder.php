<?php

declare(strict_types=1);

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Notificaciones in-app de ejemplo para los usuarios STAFF (campana del header).
 * Idempotente: no duplica si el usuario ya tiene notificaciones demo (type 'demo.*').
 * Ejecutar: php artisan db:seed --class=DemoNotificationsSeeder (no va en DatabaseSeeder).
 */
final class DemoNotificationsSeeder extends Seeder
{
    public function run(): void
    {
        $items = [
            ['demo.payment', 'Pago por validar', 'Hay un voucher de pago pendiente de revisión.', '#cobranza/vouchers', 20, false],
            ['demo.ticket', 'Ticket asignado', 'Se te asignó un ticket abierto de soporte.', '#tickets', 90, false],
            ['demo.domain', 'Dominio por vencer', 'Un dominio de cliente vence en menos de 30 días.', '#dominios', 300, false],
            ['demo.invoice', 'Factura vence hoy', 'Revisa las facturas con vencimiento de hoy.', '#cobranza/antiguedad', 1500, true],
            ['demo.crm', 'Seguimiento de CRM', 'Tienes un seguimiento comercial programado.', '#crm', 3000, true],
        ];

        $users = DB::table('users')->where('type', 'staff')->get(['id', 'organization_id']);
        $created = 0;

        foreach ($users as $user) {
            $exists = DB::table('user_notifications')->where('user_id', $user->id)->where('type', 'like', 'demo.%')->exists();
            if ($exists) {
                continue;
            }
            foreach ($items as [$type, $title, $body, $link, $minutesAgo, $read]) {
                DB::table('user_notifications')->insert([
                    'id' => (string) Str::uuid(),
                    'organization_id' => $user->organization_id,
                    'user_id' => $user->id,
                    'type' => $type,
                    'title' => $title,
                    'body' => $body,
                    'link' => $link,
                    'read_at' => $read ? now()->subMinutes($minutesAgo - 5) : null,
                    'created_at' => now()->subMinutes($minutesAgo),
                ]);
                $created++;
            }
        }

        $this->command?->info("DemoNotificationsSeeder: {$created} notificaciones creadas.");
    }
}
