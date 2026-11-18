<?php

declare(strict_types=1);

namespace Tests\Feature\Notifications;

use App\Models\User;
use App\Modules\Notifications\Models\UserNotification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Feature\Identity\IdentityTestCase;

final class UserNotificationsTest extends IdentityTestCase
{
    private function seedFor(User $u, string $title, bool $read = false, ?string $org = null): string
    {
        $id = (string) Str::uuid();
        DB::table('user_notifications')->insert([
            'id' => $id, 'organization_id' => $org ?? $u->organization_id, 'user_id' => $u->id,
            'type' => 'test', 'title' => $title, 'created_at' => now(), 'read_at' => $read ? now() : null,
        ]);

        return $id;
    }

    public function test_user_sees_only_own_with_unread_count(): void
    {
        $a = $this->makeUser(['admin'], mfa: true);
        $b = $this->makeUser(['admin'], mfa: true);
        $this->seedFor($a, 'A1');
        $this->seedFor($a, 'A2', read: true);
        $this->seedFor($b, 'B1');

        $this->actingAs($a);
        $this->getJson('/api/v1/admin/notifications')->assertOk()
            ->assertJsonCount(2, 'data')->assertJsonPath('meta.unread_count', 1);
    }

    public function test_other_organization_rows_are_not_visible(): void
    {
        $a = $this->makeUser(['admin'], mfa: true);
        $otherOrg = (string) Str::uuid();
        DB::table('organizations')->insert(['id' => $otherOrg, 'name' => 'Otra', 'slug' => 'otra-' . Str::random(5)]);
        $this->seedFor($a, 'Ajena', org: $otherOrg);

        $this->actingAs($a);
        $this->getJson('/api/v1/admin/notifications')->assertOk()->assertJsonCount(0, 'data')->assertJsonPath('meta.unread_count', 0);
    }

    public function test_mark_read_and_read_all_and_foreign_is_404(): void
    {
        $a = $this->makeUser(['admin'], mfa: true);
        $b = $this->makeUser(['admin'], mfa: true);
        $n1 = $this->seedFor($a, 'A1');
        $this->seedFor($a, 'A2');
        $nb = $this->seedFor($b, 'B1');

        $this->actingAs($a);
        $this->postJson("/api/v1/admin/notifications/{$nb}/read")->assertNotFound();
        $this->assertNull(DB::table('user_notifications')->where('id', $nb)->value('read_at'));

        $this->postJson("/api/v1/admin/notifications/{$n1}/read")->assertOk()->assertJsonPath('data.id', $n1);
        $this->getJson('/api/v1/admin/notifications')->assertJsonPath('meta.unread_count', 1);

        $this->postJson('/api/v1/admin/notifications/read-all')->assertOk()->assertJsonPath('data.updated', 1);
        $this->getJson('/api/v1/admin/notifications')->assertJsonPath('meta.unread_count', 0);
        $this->assertNull(UserNotification::query()->withoutGlobalScopes()->where('id', $nb)->value('read_at'));
    }

    public function test_requires_authentication(): void
    {
        $this->getJson('/api/v1/admin/notifications')->assertUnauthorized();
    }
}
