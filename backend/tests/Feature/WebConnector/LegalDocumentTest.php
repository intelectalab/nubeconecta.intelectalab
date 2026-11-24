<?php

declare(strict_types=1);

namespace Tests\Feature\WebConnector;

use App\Models\User;
use App\Modules\WebConnector\Support\LegalHtmlSanitizer;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Support\Facades\DB;
use Tests\Feature\Identity\IdentityTestCase;

/** Documentos legales (web_connector.legal_document.*): metadatos, versiones y publicación. */
final class LegalDocumentTest extends IdentityTestCase
{
    protected string $seeder = DatabaseSeeder::class;

    private const BASE = '/api/v1/admin/web-connector/legal-documents';

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = $this->makeUser(['admin'], mfa: true);
        $this->actingAs($this->admin);
    }

    private function brand(): string
    {
        $entity = DB::table('legal_entities')->value('id') ?? $this->postJson('/api/v1/admin/legal-entities', ['legal_name' => 'Entidad SAC', 'tax_id' => '20000000001'])->assertCreated()->json('data.id');

        return $this->postJson('/api/v1/admin/brands', ['code' => 'marca-ld', 'name' => 'MARCA-LD', 'portal_domain' => 'portal.marca-ld.test', 'default_legal_entity_id' => $entity])->assertCreated()->json('data.id');
    }

    public function test_document_version_and_publish_workflow(): void
    {
        $brand = $this->brand();

        // Crea el documento con su primer borrador (v1).
        $create = $this->postJson(self::BASE, [
            'brand_id' => $brand, 'kind' => 'privacy', 'title' => 'Política de privacidad', 'slug' => 'privacidad',
            'version_label' => '2026-01', 'body' => '<p>Texto inicial.</p>',
        ])->assertCreated()->assertJsonPath('data.slug', 'privacidad')->assertJsonCount(1, 'data.versions');
        $id = $create->json('data.id');
        $v1 = $create->json('data.versions.0.id');
        $this->assertSame('draft', $create->json('data.versions.0.status'));
        $this->assertNull($create->json('data.published_version_id'));

        // Mismo tipo en la misma marca → 422.
        $this->assertProblem($this->postJson(self::BASE, [
            'brand_id' => $brand, 'kind' => 'privacy', 'title' => 'Otra', 'slug' => 'otra', 'version_label' => 'x', 'body' => '<p>a</p>',
        ]), 422, 'validation_failed');

        // Publicar un borrador exige revisión legal y vigencia; al publicar fija la versión vigente.
        $pub = $this->postJson(self::BASE."/{$id}/versions/{$v1}/publish", [
            'version' => $create->json('data.versions.0.version'),
            'legal_reviewed_by' => 'Estudio Jurídico XYZ', 'effective_at' => '2026-02-01',
        ])->assertOk();
        $this->assertSame($v1, $pub->json('data.published_version_id'));
        $this->assertSame('published', collect($pub->json('data.versions'))->firstWhere('id', $v1)['status']);

        // Nueva versión (borrador v2) y su publicación reemplaza a la v1.
        $v2 = $this->postJson(self::BASE."/{$id}/versions", ['version_label' => '2026-06', 'body' => '<p>Texto actualizado.</p>'])
            ->assertCreated()->json('meta.version_id');
        $v2row = collect($this->getJson(self::BASE."/{$id}")->json('data.versions'))->firstWhere('id', $v2);
        $this->postJson(self::BASE."/{$id}/versions/{$v2}/publish", [
            'version' => $v2row['version'], 'legal_reviewed_by' => 'Estudio Jurídico XYZ', 'effective_at' => '2026-07-01',
        ])->assertOk()->assertJsonPath('data.published_version_id', $v2);

        $versions = collect($this->getJson(self::BASE."/{$id}")->json('data.versions'));
        $this->assertSame('superseded', $versions->firstWhere('id', $v1)['status']);
        $this->assertSame('published', $versions->firstWhere('id', $v2)['status']);
        $this->assertSame(1, $versions->where('status', 'published')->count(), 'solo una versión vigente');

        // Una versión publicada ya no se edita.
        $this->assertProblem($this->patchJson(self::BASE."/{$id}/versions/{$v2}", ['version' => $v2row['version'] + 1, 'body' => '<p>x</p>']), 422, 'validation_failed');

        $this->assertNull(app(\App\Shared\Audit\AuditLogger::class)->verify());
    }

    public function test_body_is_sanitized(): void
    {
        $dirty = '<p onclick="steal()">Hola <a href="javascript:alert(1)">link</a> <script>evil()</script><b>fuerte</b></p>';
        $clean = LegalHtmlSanitizer::clean($dirty);

        $this->assertStringNotContainsString('<script', $clean);
        $this->assertStringNotContainsString('onclick', $clean);
        $this->assertStringNotContainsString('javascript:', $clean);
        $this->assertStringContainsString('<b>fuerte</b>', $clean);
        $this->assertStringContainsString('Hola', $clean);
    }
}
