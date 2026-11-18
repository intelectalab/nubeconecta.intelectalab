<?php

declare(strict_types=1);

namespace Tests\Feature\Notifications;

use App\Models\User;
use App\Modules\Notifications\Models\UserNotification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Feature\Billing\SalesFlowTestCase;

/** Productores reales del feed de notificaciones: ticket asignado y pago por validar. */
final class NotificationProducersTest extends SalesFlowTestCase
{
    private function feed(User $u, string $type): \Illuminate\Support\Collection
    {
        return UserNotification::query()->withoutGlobalScopes()->where('user_id', $u->id)->where('type', $type)->get();
    }

    private function ticket(array $extra = []): array
    {
        return $this->postJson('/api/v1/admin/tickets', ['brand_id' => $this->brand, 'channel' => 'portal', 'subject' => 'Sin acceso al correo'] + $extra)->assertCreated()->json('data');
    }

    private function report(): void
    {
        $method = DB::table('payment_methods')->where('code', 'bank_transfer')->value('id');
        $this->postJson('/api/v1/admin/payments', [
            'customer_id' => $this->rucCustomer, 'payment_method_id' => $method, 'amount_minor' => 12550, 'currency' => 'PEN', 'validate' => false,
        ], $this->key())->assertCreated();
    }

    public function test_assigning_a_ticket_notifies_the_new_assignee_only_on_change(): void
    {
        $agent = $this->makeUser(['admin'], mfa: true);
        $other = $this->makeUser(['admin'], mfa: true);

        $t = $this->ticket(['assignee_id' => $agent->id]);
        $rows = $this->feed($agent, 'ticket.assigned');
        $this->assertCount(1, $rows);
        $this->assertSame('Ticket asignado', $rows[0]->title);
        $this->assertSame('#tickets/'.$t['number'], $rows[0]->link);
        $this->assertStringContainsString('Sin acceso al correo', $rows[0]->body);
        $this->assertSame($agent->organization_id, $rows[0]->organization_id);

        // Reasignación: avisa al nuevo, no repite al mismo.
        $this->patchJson("/api/v1/admin/tickets/{$t['id']}", ['version' => $t['version'], 'assignee_id' => $other->id])->assertOk();
        $this->assertCount(1, $this->feed($other, 'ticket.assigned'));
        $this->assertCount(1, $this->feed($agent, 'ticket.assigned'));

        $v = DB::table('tickets')->where('id', $t['id'])->value('version');
        $this->patchJson("/api/v1/admin/tickets/{$t['id']}", ['version' => $v, 'subject' => 'Otro asunto', 'assignee_id' => $other->id])->assertOk();
        $this->assertCount(1, $this->feed($other, 'ticket.assigned'));
    }

    public function test_self_assignment_does_not_notify(): void
    {
        $this->ticket(['assignee_id' => $this->admin->id]);
        $this->assertCount(0, $this->feed($this->admin, 'ticket.assigned'));
    }

    public function test_ticket_assignment_succeeds_even_if_notification_fails(): void
    {
        $agent = $this->makeUser(['admin'], mfa: true);
        DB::statement('drop table user_notifications');
        $t = $this->ticket(['assignee_id' => $agent->id]);
        $this->assertSame($agent->id, DB::table('tickets')->where('id', $t['id'])->value('assignee_id'));
    }

    public function test_pending_payment_notifies_validators_not_others_nor_other_organizations(): void
    {
        $finance = $this->makeUser(['finance'], mfa: true);
        $sales = $this->makeUser(['sales'], mfa: true);

        // Otra organización con su propio finance.
        $org2 = (string) Str::uuid();
        DB::table('organizations')->insert(['id' => $org2, 'name' => 'Otra', 'slug' => 'otra-'.Str::random(5)]);
        $role2 = (string) Str::uuid();
        $src = DB::table('roles')->where('code', 'finance')->first();
        DB::table('roles')->insert(['id' => $role2, 'organization_id' => $org2, 'code' => 'finance', 'name' => 'Finance 2'] + array_intersect_key((array) $src, array_flip(['is_system', 'audience'])));
        foreach (DB::table('role_permissions')->where('role_id', $src->id)->pluck('permission_id') as $pid) {
            DB::table('role_permissions')->insert(['role_id' => $role2, 'organization_id' => $org2, 'permission_id' => $pid]);
        }
        $foreign = User::factory()->state(['type' => 'staff', 'organization_id' => $org2])->create();
        DB::table('user_roles')->insert(['user_id' => $foreign->id, 'role_id' => $role2, 'organization_id' => $org2]);

        $this->report();

        $rows = $this->feed($finance, 'payment.pending');
        $this->assertCount(1, $rows);
        $this->assertSame('Pago por validar', $rows[0]->title);
        $this->assertSame('#cobranza/vouchers', $rows[0]->link);
        $this->assertStringContainsString('125.50', $rows[0]->body);
        $this->assertStringContainsString('Cliente RUC SAC', $rows[0]->body);
        $this->assertCount(0, $this->feed($sales, 'payment.pending'));
        $this->assertCount(0, $this->feed($foreign, 'payment.pending'));
        $this->assertCount(0, $this->feed($this->admin, 'payment.pending'), 'el autor no se notifica a sí mismo');
    }

    public function test_payment_is_recorded_even_if_notification_fails(): void
    {
        $this->makeUser(['finance'], mfa: true);
        DB::statement('drop table user_notifications');
        $this->report();
        $this->assertSame(1, DB::table('payments')->where('status', 'reported')->count());
    }
}
