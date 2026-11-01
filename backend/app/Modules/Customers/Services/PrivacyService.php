<?php

declare(strict_types=1);

namespace App\Modules\Customers\Services;

use App\Models\User;
use App\Modules\Customers\Events\PersonalDataErased;
use App\Modules\Customers\Jobs\ExportPersonalData;
use App\Modules\Customers\Models\Contact;
use App\Modules\Customers\Models\Customer;
use App\Modules\Identity\Services\AuthSessionManager;
use App\Shared\Audit\AuditLogger;
use App\Shared\Http\Problem\ProblemException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Solicitudes de privacidad del titular (M-CUS §4.6, P-CUS-06).
 *
 * Eliminación: anonimiza contactos y datos personales sin retención legal; los
 * comprobantes fiscales (invoices y demás) no se tocan. Si el cliente tiene
 * facturas emitidas, su razón social y documento se conservan por obligación
 * tributaria. 409 si hay deuda o servicios activos. Los plazos por país siguen
 * abiertos (M-CUS §14): se aplica lo mínimo seguro, que es no borrar nada fiscal.
 */
final class PrivacyService
{
    public const ANONYMIZED = 'Titular anonimizado';

    private const OPEN_INVOICE = ['issued', 'partially_paid', 'overdue'];

    public function __construct(private readonly AuditLogger $audit, private readonly AuthSessionManager $sessions) {}

    public function requestExport(Customer $customer, ?Contact $contact): string
    {
        $requestId = (string) \Illuminate\Support\Str::uuid7();
        ExportPersonalData::dispatch($customer->organization_id, $customer->id, $contact?->id, $requestId, auth()->id())->onQueue('default');
        $this->audit->record('customer.personal_data_export_requested', 'customer', $customer->id, null, null, ['request_id' => $requestId, 'contact_id' => $contact?->id], $customer->id);

        return $requestId;
    }

    /** @return array{anonymized_contacts: int, retained: list<string>} */
    public function erase(Customer $customer, ?Contact $contact = null): array
    {
        return DB::transaction(function () use ($customer, $contact): array {
            $contacts = $contact !== null ? collect([$contact]) : $customer->contacts()->get();
            if ($contact === null) {
                $this->assertErasable($customer);
            }
            foreach ($contacts as $c) {
                $this->anonymizeContact($c);
            }

            $retained = ['invoices', 'communication_consents (evidencia de la baja)', 'audit_events'];
            if ($contact === null) {
                $hasFiscal = DB::table('invoices')->where('customer_id', $customer->id)->whereNotNull('issued_at')->exists();
                $changes = ['email' => null, 'phone' => null, 'trade_name' => null, 'custom' => [], 'status' => 'inactive', 'account_manager_id' => null];
                if ($customer->type === 'individual' && ! $hasFiscal) {
                    $changes += ['legal_name' => self::ANONYMIZED, 'tax_id' => null, 'tax_id_type' => null, 'address' => null];
                } else {
                    $retained[] = 'customers.legal_name, tax_id y address (comprobantes emitidos o persona jurídica)';
                }
                $customer->forceFill($changes)->save();
                // Minimización (docs/10): la auditoría no guarda los datos personales borrados, solo qué campos se tocaron.
                $this->audit->record('customer.personal_data_erased', 'customer', $customer->id, null, null, ['fields' => array_keys($changes), 'contacts' => $contacts->count(), 'retained' => $retained], $customer->id);
            } else {
                $this->audit->record('contact.personal_data_erased', 'contact', $contact->id, null, null, ['retained' => $retained], $customer->id);
            }
            PersonalDataErased::dispatch($customer->organization_id, $contact?->id ?? $customer->id);
            // El paquete cifrado sigue conteniendo datos personales: bórralo tras validar y aplicar la supresión.
            Storage::disk('local')->deleteDirectory("privacy-exports/{$customer->id}");

            return ['anonymized_contacts' => $contacts->count(), 'retained' => $retained];
        });
    }

    public function assertErasable(Customer $customer): void
    {
        $debt = DB::table('invoices')->where('customer_id', $customer->id)->whereIn('status', self::OPEN_INVOICE)->where('balance_minor', '>', 0)->exists();
        $services = DB::table('services')->where('customer_id', $customer->id)->whereIn('status', ['active', 'suspended', 'pending'])->whereNull('deleted_at')->exists();
        if ($debt || $services) {
            throw new ProblemException(409, 'customer_has_obligations', 'El cliente tiene deuda o servicios activos; no se puede eliminar.');
        }
    }

    private function anonymizeContact(Contact $contact): void
    {
        if ($contact->user_id !== null && ($user = User::query()->find($contact->user_id)) !== null) {
            $this->sessions->revokeAll($user);
            $user->tokens()->delete();
            $user->forceFill(['status' => 'disabled', 'disabled_at' => now(), 'name' => self::ANONYMIZED, 'email' => 'anon+'.$user->id.'@invalid.local', 'mfa_secret' => null, 'mfa_method' => null, 'mfa_enabled_at' => null])->save();
            $user->delete();
        }
        $contact->forceFill(['name' => self::ANONYMIZED, 'email' => null, 'phone' => null, 'whatsapp' => null, 'custom' => [], 'user_id' => null])->save();
        $contact->delete();
    }
}
