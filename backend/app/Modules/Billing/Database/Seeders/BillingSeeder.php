<?php

declare(strict_types=1);

namespace App\Modules\Billing\Database\Seeders;

use App\Shared\Organization\CurrentOrganization;
use App\Shared\Settings\SettingsReader;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Medios de pago iniciales (P-BIL-13) desde `billing.payment_methods.defaults`:
 * transferencia o depósito, PayPal, Global66 y tarjeta (inactiva mientras no
 * se elija la pasarela, D-18). Comisiones "según tarifa vigente" (null) quedan
 * en 0 hasta que finanzas las cargue. Idempotente por (organización, código).
 */
final class BillingSeeder extends Seeder
{
    private const NAMES = [
        'bank_transfer' => 'Transferencia o depósito bancario',
        'paypal' => 'PayPal',
        'global66' => 'Global66',
        'card_gateway' => 'Tarjeta de crédito o débito',
    ];

    public function run(): void
    {
        $org = app(CurrentOrganization::class)->id();
        $defaults = (array) (app(SettingsReader::class)->get('billing.payment_methods.defaults', []) ?? []);
        foreach ($defaults as $row) {
            $code = (string) ($row['code'] ?? '');
            if (! isset(self::NAMES[$code])) {
                continue;
            }
            DB::table('payment_methods')->insertOrIgnore([
                'id' => (string) Str::uuid(), 'organization_id' => $org, 'code' => $code, 'name' => self::NAMES[$code], 'kind' => $code,
                'connector' => null, 'fee_percent' => (string) ($row['fee_percent'] ?? 0), 'fee_fixed_minor' => 0,
                'pass_to_customer' => (bool) ($row['pass_to_customer'] ?? false), 'requires_proof' => $code !== 'card_gateway',
                'available_in_portal' => true, 'is_active' => $code !== 'card_gateway', 'instructions' => '{}',
            ]);
        }
    }
}
