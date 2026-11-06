<?php

declare(strict_types=1);

namespace Tests\Feature\Files;

use App\Models\User;
use App\Modules\Customers\Models\Contact;
use App\Modules\Files\Models\File;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\Feature\Identity\IdentityTestCase;

final class FilesTest extends IdentityTestCase
{
    protected string $seeder = DatabaseSeeder::class;

    private User $admin;

    private string $brand;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        config(['hub.files.disk' => 'local', 'hub.files.max_bytes' => 10 * 1024 * 1024]);
        $this->admin = $this->makeUser(['admin'], mfa: true);
        $this->actingAs($this->admin);
    }

    public function test_staff_uploads_image_to_configured_disk(): void
    {
        $response = $this->post('/api/v1/admin/files', [
            'file' => UploadedFile::fake()->image('foto.jpg'),
        ])->assertCreated()->assertJsonPath('data.scan_status', 'pending');

        $file = File::query()->findOrFail($response->json('data.id'));
        $this->assertSame('local', $file->disk);
        $this->assertStringContainsString('organizations/'.$file->organization_id.'/', $file->path);
        $this->assertNotNull($file->checksum_sha256);
        $this->assertSame('pending', $file->scan_status);
        Storage::disk('local')->assertExists($file->path);
    }

    public function test_rejects_mime_not_in_whitelist(): void
    {
        $this->assertProblem(
            $this->post('/api/v1/admin/files', ['file' => UploadedFile::fake()->create('x.exe', 10, 'application/x-msdownload')]),
            422,
            'validation_failed',
        );
    }

    public function test_rejects_file_over_configured_size_limit(): void
    {
        config(['hub.files.max_bytes' => 10 * 1024]);

        $this->assertProblem(
            $this->post('/api/v1/admin/files', ['file' => UploadedFile::fake()->image('grande.jpg')->size(11 * 1024)]),
            422,
            'validation_failed',
        );
    }

    public function test_show_returns_url_without_storage_coordinates(): void
    {
        $id = $this->post('/api/v1/admin/files', ['file' => UploadedFile::fake()->create('doc.pdf', 100, 'application/pdf')])
            ->assertCreated()->json('data.id');

        $data = $this->getJson("/api/v1/admin/files/{$id}")->assertOk()->json('data');
        $this->assertNotEmpty($data['url']);
        $this->assertArrayNotHasKey('disk', $data);
        $this->assertArrayNotHasKey('path', $data);
    }

    public function test_files_are_isolated_by_organization(): void
    {
        $foreignOrg = (string) Str::uuid();
        DB::table('organizations')->insert(['id' => $foreignOrg, 'name' => 'Otra org files', 'slug' => 'otra-org-files']);
        $id = (string) Str::uuid();
        $now = now();
        DB::table('files')->insert([
            'id' => $id,
            'organization_id' => $foreignOrg,
            'disk' => 'local',
            'path' => 'organizations/'.$foreignOrg.'/misc/'.$id.'.pdf',
            'original_name' => 'ajeno.pdf',
            'mime_type' => 'application/pdf',
            'size_bytes' => 10,
            'checksum_sha256' => str_repeat('a', 64),
            'scan_status' => 'pending',
            'visibility' => 'internal',
            'version' => 1,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        $this->getJson("/api/v1/admin/files/{$id}")->assertNotFound();
    }

    public function test_sales_role_cannot_upload_files(): void
    {
        $this->actingAs($this->makeUser(['sales'], mfa: true));

        $this->assertProblem(
            $this->post('/api/v1/admin/files', ['file' => UploadedFile::fake()->image('foto.jpg')]),
            403,
            'forbidden',
        );
    }

    public function test_portal_cannot_download_internal_files(): void
    {
        $entity = $this->postJson('/api/v1/admin/legal-entities', [
            'legal_name' => 'Entidad Files SAC', 'tax_id' => '20000000091',
        ])->assertCreated()->json('data.id');
        $this->brand = $this->postJson('/api/v1/admin/brands', [
            'code' => 'files-portal-test', 'name' => 'Files Portal Test',
            'portal_domain' => 'files.test', 'default_legal_entity_id' => $entity,
        ])->assertCreated()->json('data.id');
        $customer = $this->postJson('/api/v1/admin/customers', [
            'type' => 'company', 'legal_name' => 'Cliente Files SAC', 'tax_id_type' => 'ruc',
            'tax_id' => '20100070970', 'country' => 'PE', 'currency' => 'PEN', 'origin_brand_id' => $this->brand,
        ])->assertCreated()->json('data.id');
        $contactId = $this->postJson("/api/v1/admin/customers/{$customer}/contacts", [
            'name' => 'Contacto Files', 'email' => 'files@cliente.test', 'roles' => ['administrative'], 'portal_role' => 'customer_admin',
        ])->assertCreated()->json('data.id');
        $contactUser = User::query()->findOrFail(Contact::query()->findOrFail($contactId)->user_id);

        $this->actAs($contactUser);
        $ticket = $this->postJson('/api/v1/portal/tickets', ['subject' => 'Adjunto privado'])->assertCreated()->json('data.id');

        $this->actAs($this->admin);
        $file = $this->post('/api/v1/admin/files', [
            'file' => UploadedFile::fake()->create('interno.pdf', 100, 'application/pdf'),
            'attachable_type' => 'ticket', 'attachable_id' => $ticket, 'visibility' => 'internal',
        ])->assertCreated()->json('data.id');

        $this->actAs($contactUser);
        $this->getJson("/api/v1/portal/files/{$file}")->assertNotFound();
    }

    private function actAs(User $user): void
    {
        $this->flushSession();
        $this->app['auth']->forgetGuards();
        $this->actingAs($user);
    }
}
