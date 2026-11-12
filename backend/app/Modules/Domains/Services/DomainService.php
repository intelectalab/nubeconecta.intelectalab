<?php

declare(strict_types=1);

namespace App\Modules\Domains\Services;

use App\Modules\Customers\Models\Customer;
use App\Modules\Domains\Models\Domain;
use App\Modules\Domains\Models\DomainContact;
use App\Modules\Providers\Models\ProviderAccount;
use App\Modules\Services\Models\Service;
use App\Shared\Audit\AuditLogger;
use App\Shared\Concurrency\VersionGuard;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/** Fase 1: dominios en modo manual (sin integración con registrador). */
final class DomainService
{
    public function __construct(private readonly AuditLogger $audit, private readonly CurrentOrganization $organization) {}

    /** @return list<string> */
    public static function relations(): array
    {
        return ['customer:id,code,legal_name,trade_name', 'service:id,code,label,status,commercial_due_date', 'providerAccount:id,provider_id,label', 'providerAccount.provider:id,name'];
    }

    public function rules(?Domain $domain): array
    {
        $required = $domain === null ? 'required' : 'sometimes';
        $org = $this->organization->id();
        return [
            'name' => [$required, 'string', 'max:253', 'regex:/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/i',
                Rule::unique('domains', 'name')->where('organization_id', $org)->whereNull('deleted_at')->ignore($domain?->id)],
            'tld' => ['sometimes', 'nullable', 'string', 'max:63', 'regex:/^\.?[a-z0-9.-]+$/i'],
            'provider_account_id' => ['sometimes', 'nullable', 'uuid'],
            'customer_id' => ['sometimes', 'nullable', 'uuid'],
            'service_id' => ['sometimes', 'nullable', 'uuid'],
            'holder' => [$required, Rule::in(Domain::HOLDERS)],
            'registered_at' => ['sometimes', 'nullable', 'date'],
            'registry_expires_at' => ['sometimes', 'nullable', 'date'],
            'auto_renew' => ['sometimes', 'boolean'], 'lock' => ['sometimes', 'boolean'],
            'dnssec' => ['sometimes', 'boolean'], 'privacy' => ['sometimes', 'boolean'],
            'nameservers' => ['sometimes', 'array', 'max:13'],
            'nameservers.*' => ['string', 'max:253', 'regex:/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i'],
            'transfer_locked_until' => ['sometimes', 'nullable', 'date'],
            'status' => ['sometimes', Rule::in(Domain::STATUSES)],
        ] + ($domain === null ? [] : ['version' => ['required', 'integer', 'min:1']]);
    }

    public function create(array $data): Domain
    {
        $data = $this->normalize($data);
        $this->checkLinks($data, null);
        return DB::transaction(function () use ($data): Domain {
            $domain = new Domain($data);
            $domain->sync_mode = 'manual';
            $domain->save();
            $this->audit->record('domain.created', 'domain', $domain->id, null, $domain->refresh()->attributesToArray(), [], $domain->customer_id);
            return $this->loaded($domain);
        });
    }

    public function update(Domain $domain, array $data): Domain
    {
        $version = $data['version'];
        unset($data['version']);
        $data = $this->normalize($data);
        $this->checkLinks($data, $domain);
        return DB::transaction(function () use ($domain, $data, $version): Domain {
            VersionGuard::check($domain, $version);
            $before = $domain->attributesToArray();
            $domain->fill($data)->save();
            $this->audit->record('domain.updated', 'domain', $domain->id, $before, $domain->refresh()->attributesToArray(), [], $domain->customer_id);
            return $this->loaded($domain);
        });
    }

    /** Extiende la fecha real del registrador (`registry_expires_at`) por N años; sin fecha previa parte de hoy. */
    public function renew(Domain $domain, int $years, int $version): Domain
    {
        return DB::transaction(function () use ($domain, $years, $version): Domain {
            VersionGuard::check($domain, $version);
            $before = $domain->attributesToArray();
            $base = $domain->registry_expires_at ?? now();
            $domain->registry_expires_at = $base->copy()->startOfDay()->addYearsNoOverflow($years);
            if (in_array($domain->status, ['expired', 'redemption'], true) && ! $domain->registry_expires_at->isPast()) {
                $domain->status = 'active';
            }
            $domain->save();
            $this->audit->record('domain.renewed', 'domain', $domain->id, $before, $domain->refresh()->attributesToArray(), ['years' => $years], $domain->customer_id);
            return $this->loaded($domain);
        });
    }

    public function delete(Domain $domain): void
    {
        DB::transaction(function () use ($domain): void {
            $before = $domain->attributesToArray();
            $domain->delete();
            $this->audit->record('domain.deleted', 'domain', $domain->id, $before, null, [], $domain->customer_id);
        });
    }

    public function contactRules(Domain $domain, ?DomainContact $contact): array
    {
        $required = $contact === null ? 'required' : 'sometimes';
        return [
            'role' => [$required, Rule::in(DomainContact::ROLES), Rule::unique('domain_contacts', 'role')->where('domain_id', $domain->id)->ignore($contact?->id)],
            'name' => [$required, 'string', 'min:1', 'max:200'],
            'company' => ['sometimes', 'nullable', 'string', 'max:200'],
            'email' => [$required, 'email:rfc', 'max:254'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:40'],
            'address' => ['sometimes', 'nullable', 'array'],
            'address.line1' => ['sometimes', 'nullable', 'string', 'max:200'], 'address.line2' => ['sometimes', 'nullable', 'string', 'max:200'],
            'address.city' => ['sometimes', 'nullable', 'string', 'max:100'], 'address.state' => ['sometimes', 'nullable', 'string', 'max:100'],
            'address.postal_code' => ['sometimes', 'nullable', 'string', 'max:20'], 'address.country' => ['sometimes', 'nullable', 'string', 'size:2'],
        ] + ($contact === null ? [] : ['version' => ['required', 'integer', 'min:1']]);
    }

    public function createContact(Domain $domain, array $data): DomainContact
    {
        $data['address'] ??= [];
        return DB::transaction(function () use ($domain, $data): DomainContact {
            $contact = new DomainContact($data);
            $contact->domain_id = $domain->id;
            $contact->save();
            $this->audit->record('domain_contact.created', 'domain_contact', $contact->id, null, $contact->refresh()->attributesToArray(), ['domain_id' => $domain->id], $domain->customer_id);
            return $contact;
        });
    }

    public function updateContact(Domain $domain, DomainContact $contact, array $data): DomainContact
    {
        $version = $data['version'];
        unset($data['version']);
        if (array_key_exists('address', $data)) { $data['address'] ??= []; }
        return DB::transaction(function () use ($domain, $contact, $data, $version): DomainContact {
            VersionGuard::check($contact, $version);
            $before = $contact->attributesToArray();
            $contact->fill($data)->save();
            $this->audit->record('domain_contact.updated', 'domain_contact', $contact->id, $before, $contact->refresh()->attributesToArray(), ['domain_id' => $domain->id], $domain->customer_id);
            return $contact;
        });
    }

    public function deleteContact(Domain $domain, DomainContact $contact): void
    {
        DB::transaction(function () use ($domain, $contact): void {
            $before = $contact->attributesToArray();
            $contact->delete();
            $this->audit->record('domain_contact.deleted', 'domain_contact', $contact->id, $before, null, ['domain_id' => $domain->id], $domain->customer_id);
        });
    }

    /** Contadores de las tiles del listado (sobre toda la organización, sin filtros). */
    public function summary(): array
    {
        $today = now()->toDateString();
        $row = Domain::query()->selectRaw(
            'count(*) as total,'
            .' count(*) filter (where registry_expires_at between ? and ?) as expiring_30d,'
            ." count(*) filter (where status in ('expired','redemption') or registry_expires_at < ?) as expired,"
            ." count(*) filter (where holder = 'company') as holder_company,"
            .' count(*) filter (where auto_renew = false) as no_auto_renew',
            [$today, now()->addDays(30)->toDateString(), $today],
        )->first();
        return [
            'total' => (int) $row->total, 'expiring_30d' => (int) $row->expiring_30d, 'expired' => (int) $row->expired,
            'holder_company' => (int) $row->holder_company, 'no_auto_renew' => (int) $row->no_auto_renew,
        ];
    }

    public function loaded(Domain $domain): Domain
    {
        return $domain->load(self::relations());
    }

    private function normalize(array $data): array
    {
        if (isset($data['name'])) {
            $data['name'] = Str::lower(trim($data['name']));
            if (! isset($data['tld']) || $data['tld'] === '') { $data['tld'] = Str::after($data['name'], '.'); }
        }
        if (isset($data['tld'])) { $data['tld'] = Str::lower(ltrim(trim($data['tld']), '.')); }
        if (array_key_exists('nameservers', $data)) { $data['nameservers'] = array_values(array_map(static fn ($ns) => Str::lower((string) $ns), $data['nameservers'] ?? [])); }
        return $data;
    }

    /** Los vínculos se resuelven por el scope de organización: uno de otra organización responde 404. */
    private function checkLinks(array $data, ?Domain $current): void
    {
        if (! empty($data['customer_id'])) { Customer::query()->findOrFail($data['customer_id']); }
        if (! empty($data['provider_account_id'])) { ProviderAccount::query()->findOrFail($data['provider_account_id']); }
        if (! empty($data['service_id'])) { Service::query()->findOrFail($data['service_id']); }
        $customerId = array_key_exists('customer_id', $data) ? $data['customer_id'] : $current?->customer_id;
        $serviceId = array_key_exists('service_id', $data) ? $data['service_id'] : $current?->service_id;
        if ($customerId !== null && $serviceId !== null && (array_key_exists('service_id', $data) || array_key_exists('customer_id', $data))
            && (string) Service::query()->findOrFail($serviceId)->customer_id !== (string) $customerId) {
            throw ProblemException::validation(['service_id' => ['El servicio no pertenece al cliente del dominio.']]);
        }
    }
}
