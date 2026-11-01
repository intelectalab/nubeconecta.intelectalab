<?php

declare(strict_types=1);

namespace App\Modules\Customers\Jobs;

use App\Modules\Customers\Models\CommunicationConsent;
use App\Modules\Customers\Models\Contact;
use App\Modules\Customers\Models\Customer;
use App\Modules\Customers\Services\RelatedRecords;
use App\Shared\Audit\AuditLogger;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Storage;

/**
 * Paquete de datos del titular (M-CUS §4.6, §9: cola `default`). Se guarda en
 * el disco `local` (privado) como JSON: datos del cliente, contactos y
 * consentimientos; sin notas internas ni rentabilidad. La entrega al titular
 * (enlace de descarga vía AUT/archivos) queda pendiente de esos módulos.
 */
final class ExportPersonalData implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public function __construct(
        public readonly string $organizationId,
        public readonly string $customerId,
        public readonly ?string $contactId,
        public readonly string $requestId,
        public readonly ?string $requestedBy,
    ) {}

    public static function path(string $customerId, string $requestId): string
    {
        return "privacy-exports/{$customerId}/{$requestId}.json";
    }

    public function handle(CurrentOrganization $organization, AuditLogger $audit, RelatedRecords $related): void
    {
        $organization->set($this->organizationId);
        $customer = Customer::withTrashed()->findOrFail($this->customerId);
        $contacts = Contact::query()->where('customer_id', $customer->id)
            ->when($this->contactId, fn ($q) => $q->whereKey($this->contactId))->get();

        $package = [
            'generated_at' => now()->toIso8601String(),
            'customer' => $this->contactId ? null : $customer->makeHidden(['account_manager_id', 'created_by', 'updated_by'])->toArray(),
            'contacts' => $contacts->map(fn (Contact $c) => $c->makeHidden(['created_by', 'updated_by'])->toArray())->all(),
            'communication_consents' => CommunicationConsent::query()->whereIn('contact_id', $contacts->pluck('id'))->orderBy('recorded_at')->get()->toArray(),
            'related_records' => $this->contactId ? null : $related->counts($customer->id),
        ];
        $json = json_encode($package, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        Storage::disk('local')->put(self::path($customer->id, $this->requestId), Crypt::encryptString($json));
        $audit->record('customer.personal_data_exported', 'customer', $customer->id, null, null, ['request_id' => $this->requestId, 'contact_id' => $this->contactId], $customer->id, ['type' => 'system', 'id' => null], $this->organizationId);
    }
}
