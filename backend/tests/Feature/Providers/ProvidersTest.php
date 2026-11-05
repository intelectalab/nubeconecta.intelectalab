<?php

declare(strict_types=1);

namespace Tests\Feature\Providers;

use App\Models\User;
use App\Modules\Identity\Models\Organization;
use App\Modules\Providers\Models\Provider;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Support\Str;
use Tests\Feature\Identity\IdentityTestCase;

final class ProvidersTest extends IdentityTestCase
{
    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = $this->makeUser(['admin'], mfa: true);
        $this->actingAs($this->admin);
    }

    public function test_staff_can_create_provider_and_code_is_unique_per_organization(): void
    {
        $payload = ['code' => 'ACME-HOST', 'name' => 'Acme Hosting', 'type' => 'hosting'];
        $provider = $this->postJson('/api/v1/admin/providers', $payload)->assertCreated()->json('data');

        $this->assertSame('company', $provider['origin']);
        $this->postJson('/api/v1/admin/providers', $payload)->assertUnprocessable();
    }

    public function test_update_checks_optimistic_version(): void
    {
        $provider = $this->postJson('/api/v1/admin/providers', ['code' => 'ACME-CLOUD', 'name' => 'Acme', 'type' => 'cloud'])->assertCreated()->json('data');
        $this->patchJson("/api/v1/admin/providers/{$provider['id']}", ['version' => $provider['version'], 'name' => 'Acme Cloud'])->assertOk();
        $this->assertProblem($this->patchJson("/api/v1/admin/providers/{$provider['id']}", ['version' => $provider['version'], 'name' => 'Stale edit']), 409, 'version_conflict');
    }

    public function test_provider_account_is_created_under_provider(): void
    {
        $provider = $this->postJson('/api/v1/admin/providers', ['code' => 'ACME-DNS', 'name' => 'Acme DNS', 'type' => 'dns'])->assertCreated()->json('data');
        $account = $this->postJson("/api/v1/admin/providers/{$provider['id']}/accounts", ['label' => 'Production'])->assertCreated()->json('data');

        $this->assertSame($provider['id'], $account['provider_id']);
        $this->assertDatabaseHas('provider_accounts', ['id' => $account['id'], 'provider_id' => $provider['id'], 'organization_id' => $this->admin->organization_id]);
    }

    public function test_customer_origin_requires_customer_id(): void
    {
        $this->postJson('/api/v1/admin/providers', ['code' => 'CUSTOMER-PROVIDER', 'name' => 'Customer DNS', 'type' => 'dns', 'origin' => 'customer'])
            ->assertUnprocessable()->assertJsonValidationErrors('customer_id');
    }

    public function test_provider_from_another_organization_is_not_found(): void
    {
        $other = Organization::query()->create(['name' => 'Other organization', 'slug' => 'other-'.Str::lower(Str::random(8))]);
        app(CurrentOrganization::class)->set($other->id);
        $foreign = Provider::query()->create(['code' => 'FOREIGN', 'name' => 'Foreign provider', 'type' => 'dns']);
        app(CurrentOrganization::class)->set($this->admin->organization_id);

        $this->getJson("/api/v1/admin/providers/{$foreign->id}")->assertNotFound();
    }

    public function test_provider_routes_require_permissions(): void
    {
        $user = $this->makeUser([], mfa: true);
        $this->actingAs($user);
        $this->getJson('/api/v1/admin/providers')->assertForbidden();
    }
}
