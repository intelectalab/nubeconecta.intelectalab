<?php

declare(strict_types=1);

namespace App\Modules\Tenancy\Console;

use App\Shared\Audit\AuditLogger;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Suspende los inquilinos cuya suscripción SaaS venció (multitenancy Fase 3).
 * Un inquilino en prueba o activo con `saas_renewal_date` pasada se suspende:
 * se bloquea su acceso y se cierran sus sesiones. El cobro real (pasarela) es
 * externo; esto solo aplica el vencimiento. Idempotente (reejecutable).
 */
final class ExpireSubscriptionsCommand extends Command
{
    protected $signature = 'tenancy:expire-subscriptions';

    protected $description = 'Suspende inquilinos con la suscripción SaaS vencida';

    public function handle(AuditLogger $audit, CurrentOrganization $org): int
    {
        $today = now()->toDateString();
        $expired = DB::table('organizations')
            ->where('is_operator', false)
            ->whereIn('saas_status', ['trial', 'active'])
            ->whereNotNull('saas_renewal_date')
            ->whereDate('saas_renewal_date', '<', $today)
            ->get(['id', 'name']);

        foreach ($expired as $tenant) {
            DB::transaction(function () use ($tenant, $audit, $org): void {
                DB::table('organizations')->where('id', $tenant->id)
                    ->update(['status' => 'suspended', 'saas_status' => 'suspended', 'updated_at' => now()]);
                DB::table('user_sessions')->where('organization_id', $tenant->id)->whereNull('revoked_at')
                    ->update(['revoked_at' => now(), 'updated_at' => now()]);
                // Audita bajo la propia organización del inquilino.
                $org->set($tenant->id);
                $audit->record('tenant.subscription_expired', 'organization', $tenant->id, null, ['status' => 'suspended']);
            });
            $this->line("Inquilino suspendido por vencimiento: {$tenant->name}");
        }

        $this->info('Suscripciones vencidas procesadas: '.$expired->count());

        return self::SUCCESS;
    }
}
