<?php

declare(strict_types=1);

namespace App\Modules\WebConnector\Console;

use App\Shared\Organization\CurrentOrganization;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Contenido de demostración de la web (MVP): formularios `contacto` y
 * `cotizacion` (destino correo) y documentos legales de ejemplo de la marca.
 * Los textos legales son de ejemplo y van marcados «[Texto pendiente de
 * asesoría legal]» (D-27 abierta). Idempotente; se niega en producción.
 */
final class DemoWebCommand extends Command
{
    protected $signature = 'hub:demo:web {--brand=alojamientoplus : Código de la marca destino} {--notify-email= : Correo que recibe los envíos de los formularios}';

    protected $description = 'Carga formularios y documentos legales de ejemplo para la web (no se ejecuta en producción)';

    public const PENDING = '[Texto pendiente de asesoría legal]';

    /** slug => [kind, título] */
    private const LEGAL = [
        'terminos-y-condiciones' => ['terms', 'Términos y condiciones'],
        'politica-de-privacidad' => ['privacy', 'Política de privacidad'],
        'reembolsos-y-cancelaciones' => ['refunds', 'Reembolsos y cancelaciones'],
        'uso-aceptable' => ['acceptable_use', 'Política de uso aceptable'],
    ];

    private string $org;

    public function handle(CurrentOrganization $organization): int
    {
        if ($this->laravel->environment('production')) {
            $this->error('hub:demo:web no se ejecuta en producción.');

            return self::FAILURE;
        }
        $this->org = $organization->id();
        $code = (string) $this->option('brand');
        $brand = DB::table('brands')->where('organization_id', $this->org)->where('code', $code)->whereNull('deleted_at')->value('id');
        if ($brand === null) {
            $this->error("No existe la marca {$code}. Ejecuta antes hub:demo:catalog.");

            return self::FAILURE;
        }
        $notify = (string) ($this->option('notify-email') ?: DB::table('brand_contact_points')->where('brand_id', $brand)->where('kind', 'email')
            ->where('is_public', true)->whereNull('deleted_at')->orderByDesc('is_primary')->value('value') ?: 'formularios-demo@example.com');
        $publisher = DB::table('users')->where('organization_id', $this->org)->where('type', 'staff')->orderBy('created_at')->value('id');

        DB::transaction(function () use ($brand, $notify, $publisher): void {
            $this->forms((string) $brand, $notify);
            $this->legal((string) $brand, $publisher === null ? null : (string) $publisher);
        });
        $this->info('Formularios y documentos legales de ejemplo cargados'.($publisher === null ? ' (legales en borrador: no hay usuario del personal que los publique).' : '.'));

        return self::SUCCESS;
    }

    private function forms(string $brand, string $notify): void
    {
        foreach (['contacto' => 'Formulario de contacto', 'cotizacion' => 'Solicitud de cotización'] as $code => $name) {
            $this->upsert('web_forms', ['brand_id' => $brand, 'code' => $code, 'deleted_at' => null], [
                'name' => $name, 'status' => 'active', 'destination' => 'email', 'notify_email' => $notify,
                'consent_required' => true, 'consent_purpose' => 'privacy',
                'consent_text' => json_encode(['es' => "Acepto la política de privacidad y que me contacten sobre mi consulta."], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                // D-24: sin proveedor de captcha; se activará cuando se elija.
                'captcha_required' => false,
                'success_message' => json_encode(['es' => $code === 'cotizacion'
                    ? 'Recibimos tu solicitud. Te enviaremos la cotización en menos de 24 horas hábiles.'
                    : 'Gracias por escribirnos. Te responderemos a la brevedad.'], JSON_UNESCAPED_UNICODE),
            ]);
        }
    }

    private function legal(string $brand, ?string $publisher): void
    {
        foreach (self::LEGAL as $slug => [$kind, $title]) {
            $doc = $this->upsert('legal_documents', ['brand_id' => $brand, 'kind' => $kind, 'locale' => 'es', 'product_category_id' => null, 'deleted_at' => null], ['title' => $title, 'slug' => $slug]);
            $body = '<p><strong>'.self::PENDING.'</strong></p>'
                .'<p>Este es un texto de ejemplo para la demostración de la web. No tiene validez legal y será reemplazado por el texto que apruebe la asesoría legal (decisión D-27).</p>'
                .'<h2>1. Titular</h2><p>GRUPO DE SOLUCIONES CREATIVAS, RUC 20607431117, marca NubeConecta.</p>'
                .'<h2>2. Alcance</h2><p>'.self::PENDING.'</p>';
            $values = ['organization_id' => $this->org, 'legal_document_id' => $doc, 'version_label' => 'demo-2026-10', 'body' => $body,
                'change_summary' => 'Texto de ejemplo (demo).'];
            if ($publisher !== null) {
                $values += ['status' => 'published', 'legal_reviewed_by' => self::PENDING, 'legal_reviewed_at' => now(), 'effective_at' => now()->startOfDay(),
                    'published_at' => now(), 'published_by' => $publisher];
            }
            $version = DB::table('legal_document_versions')->where('legal_document_id', $doc)->where('version_number', 1)->value('id');
            if ($version === null) {
                $version = (string) Str::uuid();
                DB::table('legal_document_versions')->insert(['id' => $version, 'version_number' => 1] + $values);
            } else {
                DB::table('legal_document_versions')->where('id', $version)->update($values + ['updated_at' => now()]);
            }
            if ($publisher !== null) {
                DB::table('legal_documents')->where('id', $doc)->update(['published_version_id' => $version]);
            }
        }
    }

    /**
     * @param  array<string, mixed>  $keys
     * @param  array<string, mixed>  $values
     */
    private function upsert(string $table, array $keys, array $values): string
    {
        $query = DB::table($table)->where('organization_id', $this->org);
        foreach ($keys as $column => $value) {
            $value === null ? $query->whereNull($column) : $query->where($column, $value);
        }
        $id = $query->value('id');
        if ($id !== null) {
            DB::table($table)->where('id', $id)->update($values + ['updated_at' => now()]);

            return (string) $id;
        }
        $id = (string) Str::uuid();
        DB::table($table)->insert(['id' => $id, 'organization_id' => $this->org] + array_filter($keys, fn ($v) => $v !== null) + $values);

        return $id;
    }
}
