<?php

declare(strict_types=1);

namespace Tests\Feature\Brands;

use App\Models\User;
use App\Modules\Brands\Services\DocumentNumberAllocator;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Support\Facades\DB;
use Tests\Feature\Identity\IdentityTestCase;

final class BrandsTest extends IdentityTestCase
{
    protected string $seeder = DatabaseSeeder::class;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = $this->makeUser(['admin'], mfa: true);
    }

    /** @return array{0: string, 1: string} [legal_entity_id, brand_id] */
    private function brand(string $code = 'marca-a', ?string $portal = 'portal.marca-a.test'): array
    {
        $this->actingAs($this->admin);
        $entity = DB::table('legal_entities')->value('id') ?? $this->postJson('/api/v1/admin/legal-entities', ['legal_name' => 'Entidad de Prueba SAC', 'tax_id' => '20000000001'])->assertCreated()->json('data.id');
        $brand = $this->postJson('/api/v1/admin/brands', ['code' => $code, 'name' => strtoupper($code), 'portal_domain' => $portal, 'default_legal_entity_id' => $entity])->assertCreated()->json('data.id');

        return [$entity, $brand];
    }

    /** @return array<string, mixed> */
    private static function tokens(string $text = '#111111', string $font = 'Inter'): array
    {
        return [
            'colors' => [
                'light' => ['text' => $text, 'background' => '#ffffff', 'primary' => '#0b5394', 'on_primary' => '#ffffff'],
                'dark' => ['text' => '#f5f5f5', 'background' => '#121212'],
            ],
            'typography' => ['font_family' => $font],
            'radius' => ['button' => 8],
        ];
    }

    public function test_brands_legal_entity_and_bank_accounts_crud(): void
    {
        [$entity, $brand] = $this->brand();

        $this->assertProblem($this->postJson('/api/v1/admin/brands', ['code' => 'marca-b', 'name' => 'B', 'portal_domain' => 'PORTAL.marca-a.test', 'default_legal_entity_id' => $entity]), 422, 'validation_failed');
        $this->assertProblem($this->postJson('/api/v1/admin/brands', ['code' => 'marca-a', 'name' => 'A2', 'default_legal_entity_id' => $entity]), 422, 'validation_failed');
        $this->getJson('/api/v1/admin/brands')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.legal_entity.tax_id', '20000000001');
        $this->patchJson("/api/v1/admin/brands/{$brand}", ['version' => 1, 'support_email' => 'soporte@marca-a.test'])->assertOk()->assertJsonPath('data.version', 2);
        $this->assertProblem($this->patchJson("/api/v1/admin/brands/{$brand}", ['version' => 1, 'name' => 'X']), 409, 'version_conflict');

        $this->postJson('/api/v1/admin/bank-accounts', ['legal_entity_id' => $entity, 'bank_name' => 'Banco de la Nación', 'account_type' => 'detraction', 'account_number' => '00-000-000001', 'currency' => 'PEN'])
            ->assertCreated()->assertJsonPath('data.show_on_invoice', true);
        $this->assertProblem($this->postJson('/api/v1/admin/bank-accounts', ['legal_entity_id' => $entity, 'bank_name' => 'Banco de la Nación', 'account_type' => 'savings', 'account_number' => '00-000-000001', 'currency' => 'PEN']), 409, 'conflict');

        $this->assertProblem($this->deleteJson("/api/v1/admin/legal-entities/{$entity}"), 409, 'conflict');
        $this->deleteJson("/api/v1/admin/brands/{$brand}")->assertNoContent();
        $this->assertSoftDeleted('brands', ['id' => $brand]);
        $this->assertDatabaseHas('audit_events', ['action' => 'brand.deleted', 'entity_id' => $brand]);

        $this->actingAs($this->makeUser(['sales'], mfa: true));
        $this->assertProblem($this->postJson('/api/v1/admin/bank-accounts', []), 403, 'forbidden');
    }

    public function test_document_series_numbering_and_protection(): void
    {
        [$entity] = $this->brand();
        $series = $this->postJson('/api/v1/admin/document-series', ['legal_entity_id' => $entity, 'document_type' => 'invoice', 'series' => 'F001'])->assertCreated()->json('data.id');
        $this->assertProblem($this->postJson('/api/v1/admin/document-series', ['legal_entity_id' => $entity, 'document_type' => 'invoice', 'series' => 'f1']), 422, 'validation_failed');

        $allocator = app(DocumentNumberAllocator::class);
        $numbers = DB::transaction(fn (): array => [$allocator->take($series), $allocator->take($series), $allocator->take($series)]);
        $this->assertSame([1, 2, 3], $numbers);

        $this->assertProblem($this->deleteJson("/api/v1/admin/document-series/{$series}"), 409, 'series_in_use');
        $this->assertProblem($this->patchJson("/api/v1/admin/document-series/{$series}", ['version' => 1, 'document_type' => 'receipt']), 409, 'series_in_use');
        $this->patchJson("/api/v1/admin/document-series/{$series}", ['version' => 1, 'is_active' => false])->assertOk()->assertJsonPath('data.is_active', false);

        $unused = $this->postJson('/api/v1/admin/document-series', ['legal_entity_id' => $entity, 'document_type' => 'receipt', 'series' => 'B001', 'next_number' => 500])->assertCreated()->json('data.id');
        $this->deleteJson("/api/v1/admin/document-series/{$unused}")->assertNoContent();
    }

    public function test_theme_lifecycle_contrast_publication_revert_and_public_endpoint(): void
    {
        [, $brand] = $this->brand();
        $sales = $this->makeUser(['sales'], mfa: true);
        $this->actingAs($sales);

        $theme = $this->postJson('/api/v1/admin/brand-themes', ['brand_id' => $brand, 'name' => 'Tema A'])->assertCreated()->json('data.id');
        $this->assertProblem($this->postJson('/api/v1/admin/brand-themes', ['brand_id' => $brand, 'name' => 'Otro']), 409, 'conflict');

        $versions = "/api/v1/admin/brand-themes/{$theme}/versions";
        $this->assertProblem($this->postJson($versions, ['tokens' => ['colors' => ['light' => ['background' => 'url(https://x.test/a.png)']]]]), 422, 'validation_failed');
        $this->assertProblem($this->postJson($versions, ['tokens' => self::tokens(font: 'Comic Sans MS')]), 422, 'validation_failed');
        $this->assertProblem($this->postJson($versions, ['tokens' => self::tokens(), 'surfaces' => ['website']]), 422, 'validation_failed');

        // Borrador con contraste insuficiente (#bbbbbb sobre blanco ≈ 1.9).
        $low = $this->postJson($versions, ['tokens' => self::tokens('#bbbbbb'), 'surfaces' => ['portal', 'email']])->assertCreated()->json('data');
        $this->assertSame(1, $low['version_number']);
        $this->assertProblem($this->postJson("/api/v1/admin/brand-theme-versions/{$low['id']}/publish"), 403, 'forbidden');
        $checked = $this->postJson("/api/v1/admin/brand-theme-versions/{$low['id']}/check-contrast")->assertOk()->json('data');
        $this->assertLessThan(4.5, $checked['contrast_lowest_ratio']);

        $preview = $this->postJson("/api/v1/admin/brand-theme-versions/{$low['id']}/preview-link")->assertCreated()->json('data.token');
        $this->getJson("/api/v1/public/brand-theme-previews/{$preview}")->assertOk()->assertHeader('X-Robots-Tag', 'noindex, nofollow')->assertJsonPath('data.preview', true);

        $good = $this->postJson($versions, ['tokens' => self::tokens()])->assertCreated()->json('data');
        $this->assertSame(2, $good['version_number']);

        $this->actingAs($this->admin);
        $this->assertProblem($this->postJson("/api/v1/admin/brand-theme-versions/{$good['id']}/publish"), 422, 'contrast_not_verified');
        $this->assertProblem($this->postJson("/api/v1/admin/brand-theme-versions/{$low['id']}/publish"), 422, 'contrast_below_minimum');
        $this->postJson("/api/v1/admin/brand-theme-versions/{$good['id']}/check-contrast")->assertOk();
        $this->postJson("/api/v1/admin/brand-theme-versions/{$good['id']}/publish")->assertOk()->assertJsonPath('data.status', 'published');

        $this->getJson('/api/v1/public/brand-themes/marca-a')->assertOk()
            ->assertJsonPath('data.theme.version_number', 2)
            ->assertJsonPath('data.theme.tokens.colors.light.text', '#111111');

        // Una tercera versión publicada archiva la anterior; revertir a la 2 crea la 4 publicada.
        $third = $this->postJson($versions, ['tokens' => self::tokens('#000000')])->json('data.id');
        $this->postJson("/api/v1/admin/brand-theme-versions/{$third}/check-contrast")->assertOk();
        $this->postJson("/api/v1/admin/brand-theme-versions/{$third}/publish")->assertOk();
        $this->assertDatabaseHas('brand_theme_versions', ['id' => $good['id'], 'status' => 'archived']);

        $reverted = $this->postJson("/api/v1/admin/brand-theme-versions/{$good['id']}/revert")->assertCreated()->json('data');
        $this->assertSame(4, $reverted['version_number']);
        $this->assertSame($good['id'], $reverted['restored_from_version_id']);
        $this->assertSame(1, DB::table('brand_theme_versions')->where('brand_id', $brand)->where('status', 'published')->count());
        $this->getJson('/api/v1/public/brand-themes/marca-a')->assertJsonPath('data.theme.version_id', $reverted['id']);
        $this->assertProblem($this->patchJson("/api/v1/admin/brand-theme-versions/{$reverted['id']}", ['version' => $reverted['version'], 'change_note' => 'x']), 409, 'invalid_transition');

        // Vista previa vencida → 404.
        DB::table('brand_theme_versions')->where('id', $low['id'])->update(['preview_expires_at' => now()->subMinute()]);
        $this->getJson("/api/v1/public/brand-theme-previews/{$preview}")->assertNotFound();
        $this->assertNull(app(\App\Shared\Audit\AuditLogger::class)->verify());
    }
}
