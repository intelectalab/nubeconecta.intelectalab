<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Shared\Organization\CurrentOrganization;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class NotificationsSeeder extends Seeder
{
    public function run(): void
    {
        $orgId = app(CurrentOrganization::class)->id();
        $now = now();
        $templates = [
            ['ticket.customer_reply', 'Respuesta a su ticket {{numero}}', '<p>Hola {{cliente}},</p><p>Hay una nueva respuesta en su ticket <strong>{{numero}}</strong>.</p><p>Asunto: {{asunto}}</p><p>{{mensaje}}</p>', ['numero', 'cliente', 'mensaje', 'asunto'], 'canned_reply'],
            ['complaint.received', 'Hemos recibido su reclamo {{numero}}', '<p>Hola {{nombre}},</p><p>Confirmamos la recepcion de su reclamo en el Libro de Reclamaciones.</p><p>Numero de registro: <strong>{{numero}}</strong>.</p><p>Codigo: {{codigo}}</p>', ['numero', 'codigo', 'nombre'], 'complaint_response'],
        ];

        foreach ($templates as [$code, $subject, $body, $variables, $category]) {
            $key = ['organization_id' => $orgId, 'code' => $code, 'channel' => 'email'];
            $values = [
                    'brand_id' => null,
                    'locale' => 'es',
                    'country' => null,
                    'subject' => $subject,
                    'body' => $body,
                    'variables' => json_encode($variables, JSON_THROW_ON_ERROR),
                    'is_active' => true,
                    'category' => $category,
                    'content_format' => 'html',
                    'version' => 1,
                    'updated_at' => $now,
            ];
            $updated = DB::table('notification_templates')->where($key)->update($values);
            if ($updated === 0 && ! DB::table('notification_templates')->where($key)->exists()) {
                DB::table('notification_templates')->insertOrIgnore($key + ['id' => (string) Str::uuid()] + $values + ['created_at' => $now]);
            }
        }
    }
}
