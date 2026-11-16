<?php

declare(strict_types=1);

namespace App\Modules\Mail\Services;

use App\Modules\Domains\Models\Domain;
use App\Modules\Mail\Models\SslCertificate;
use App\Modules\Providers\Models\ProviderAccount;
use App\Modules\Services\Models\Service;
use App\Shared\Audit\AuditLogger;
use App\Shared\Concurrency\VersionGuard;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/** Certificados SSL en modo manual: registro y renovación de fechas; sin emisión ni verificación en vivo. */
final class SslCertificateService
{
    private const HOST = '/\A(\*\.)?([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}\z/i';

    public function __construct(private readonly AuditLogger $audit, private readonly CurrentOrganization $organization) {}

    /** @return list<string> */
    public static function relations(): array
    {
        return ['domain:id,name,customer_id', 'domain.customer:id,code,legal_name,trade_name', 'service:id,code,label,status,customer_id', 'service.customer:id,code,legal_name,trade_name'];
    }

    public function rules(?SslCertificate $cert): array
    {
        $required = $cert === null ? 'required' : 'sometimes';
        $org = $this->organization->id();
        return [
            'service_id' => ['sometimes', 'nullable', 'uuid'],
            'domain_id' => ['sometimes', 'nullable', 'uuid'],
            'common_name' => [$required, 'string', 'max:253', 'regex:'.self::HOST],
            'covered_names' => ['sometimes', 'array', 'max:100'],
            'covered_names.*' => ['string', 'max:253', 'regex:'.self::HOST],
            'is_wildcard' => ['sometimes', 'boolean'],
            'issuer' => ['sometimes', 'nullable', 'string', 'max:200'],
            'kind' => [$required, Rule::in(SslCertificate::KINDS)],
            'purchase_provider_account_id' => ['sometimes', 'nullable', 'uuid'],
            'cost_minor' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'cost_currency' => ['sometimes', 'nullable', 'string', 'regex:/^[A-Z]{3}$/'],
            'price_minor' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'currency' => ['sometimes', 'nullable', Rule::in(['PEN', 'USD'])],
            'issued_at' => ['sometimes', 'nullable', 'date'],
            'expires_at' => ['sometimes', 'nullable', 'date', 'after_or_equal:issued_at'],
            'installed_on_type' => ['sometimes', 'nullable', Rule::in(SslCertificate::INSTALLED_ON)],
            'installed_on_id' => ['sometimes', 'nullable', 'uuid'],
            'renewal_mode' => [$required, Rule::in(SslCertificate::RENEWAL_MODES)],
            'responsible_user_id' => ['sometimes', 'nullable', 'uuid', Rule::exists('users', 'id')->where('organization_id', $org)],
            'is_published' => ['sometimes', 'boolean'],
            'status' => ['sometimes', Rule::in(SslCertificate::STATUSES)],
        ] + ($cert === null ? [] : ['version' => ['required', 'integer', 'min:1']]);
    }

    public function create(array $data): SslCertificate
    {
        $data = $this->normalize($data);
        $this->checkLinks($data, null);
        return DB::transaction(function () use ($data): SslCertificate {
            $cert = new SslCertificate($data);
            $cert->save();
            $this->audit->record('ssl_certificate.created', 'ssl_certificate', $cert->id, null, $cert->refresh()->attributesToArray(), [], $this->customerOf($cert));
            return $this->loaded($cert);
        });
    }

    public function update(SslCertificate $cert, array $data): SslCertificate
    {
        $version = $data['version'];
        unset($data['version']);
        $data = $this->normalize($data);
        $this->checkLinks($data, $cert);
        return DB::transaction(function () use ($cert, $data, $version): SslCertificate {
            VersionGuard::check($cert, $version);
            $before = $cert->attributesToArray();
            $cert->fill($data)->save();
            $this->audit->record('ssl_certificate.updated', 'ssl_certificate', $cert->id, $before, $cert->refresh()->attributesToArray(), [], $this->customerOf($cert));
            return $this->loaded($cert);
        });
    }

    /**
     * Renovación manual: el certificado renovado es uno nuevo, así que la vigencia cuenta desde hoy
     * (`issued_at` = hoy, `expires_at` = hoy + días). Sin `days` se usa 90 (gratuito) o 365 (de pago).
     */
    public function renew(SslCertificate $cert, ?int $days, int $version): SslCertificate
    {
        return DB::transaction(function () use ($cert, $days, $version): SslCertificate {
            VersionGuard::check($cert, $version);
            $before = $cert->attributesToArray();
            $days ??= $cert->kind === 'free_auto' ? 90 : 365;
            $today = now()->startOfDay();
            $cert->issued_at = $today;
            $cert->expires_at = $today->copy()->addDays($days);
            if (in_array($cert->status, ['expiring', 'expired', 'unknown'], true)) { $cert->status = 'valid'; }
            $cert->save();
            $this->audit->record('ssl_certificate.renewed', 'ssl_certificate', $cert->id, $before, $cert->refresh()->attributesToArray(), ['days' => $days], $this->customerOf($cert));
            return $this->loaded($cert);
        });
    }

    public function delete(SslCertificate $cert): void
    {
        DB::transaction(function () use ($cert): void {
            $before = $cert->attributesToArray();
            $customer = $this->customerOf($cert);
            $cert->delete();
            $this->audit->record('ssl_certificate.deleted', 'ssl_certificate', $cert->id, $before, null, [], $customer);
        });
    }

    public function summary(): array
    {
        $today = now()->toDateString();
        $row = SslCertificate::query()->selectRaw(
            'count(*) as total,'
            .' count(*) filter (where expires_at between ? and ?) as expiring_30d,'
            ." count(*) filter (where status = 'expired' or expires_at < ?) as expired,"
            ." count(*) filter (where renewal_mode = 'manual') as manual_renewal",
            [$today, now()->addDays(30)->toDateString(), $today],
        )->first();
        return [
            'total' => (int) $row->total, 'expiring_30d' => (int) $row->expiring_30d,
            'expired' => (int) $row->expired, 'manual_renewal' => (int) $row->manual_renewal,
        ];
    }

    public function loaded(SslCertificate $cert): SslCertificate
    {
        return $cert->load(self::relations());
    }

    private function normalize(array $data): array
    {
        if (isset($data['common_name'])) { $data['common_name'] = Str::lower(trim($data['common_name'])); }
        if (array_key_exists('covered_names', $data)) {
            $data['covered_names'] = array_values(array_unique(array_map(static fn ($n) => Str::lower((string) $n), $data['covered_names'] ?? [])));
        }
        if (isset($data['common_name']) && str_starts_with($data['common_name'], '*.')) { $data['is_wildcard'] = true; }
        return $data;
    }

    private function customerOf(SslCertificate $cert): ?string
    {
        $fromDomain = $cert->domain_id === null ? null : Domain::withTrashed()->whereKey($cert->domain_id)->value('customer_id');
        return $fromDomain ?? ($cert->service_id === null ? null : Service::query()->whereKey($cert->service_id)->value('customer_id'));
    }

    /** Los vínculos se resuelven por el scope de organización: uno de otra organización responde 404. */
    private function checkLinks(array $data, ?SslCertificate $current): void
    {
        $domain = ! empty($data['domain_id']) ? Domain::query()->findOrFail($data['domain_id']) : null;
        $service = ! empty($data['service_id']) ? Service::query()->findOrFail($data['service_id']) : null;
        $account = ! empty($data['purchase_provider_account_id']) ? ProviderAccount::query()->findOrFail($data['purchase_provider_account_id']) : null;

        $kind = $data['kind'] ?? $current?->kind;
        $accountId = array_key_exists('purchase_provider_account_id', $data) ? $data['purchase_provider_account_id'] : $current?->purchase_provider_account_id;
        if ($kind !== 'paid' && $accountId !== null) {
            throw ProblemException::validation(['purchase_provider_account_id' => ['Solo un certificado de pago tiene proveedor de compra.']]);
        }
        foreach ([['cost_minor', 'cost_currency'], ['price_minor', 'currency']] as [$amount, $cur]) {
            $a = array_key_exists($amount, $data) ? $data[$amount] : $current?->{$amount};
            $c = array_key_exists($cur, $data) ? $data[$cur] : $current?->{$cur};
            if (($a === null) !== ($c === null)) {
                throw ProblemException::validation([$cur => ['El monto y su moneda se informan juntos.']]);
            }
        }
        $type = array_key_exists('installed_on_type', $data) ? $data['installed_on_type'] : $current?->installed_on_type;
        $installedId = array_key_exists('installed_on_id', $data) ? $data['installed_on_id'] : $current?->installed_on_id;
        if ($installedId !== null && $type === null) {
            throw ProblemException::validation(['installed_on_type' => ['Indica dónde está instalado el certificado.']]);
        }

        if ($domain === null && ! array_key_exists('domain_id', $data) && $current?->domain_id !== null) {
            $domain = Domain::query()->find($current->domain_id);
        }
        $customerId = $domain?->customer_id;
        if ($service !== null && $customerId !== null && (string) $service->customer_id !== (string) $customerId) {
            throw ProblemException::validation(['service_id' => ['El servicio no pertenece al cliente del dominio.']]);
        }
        if ($account !== null && $account->owner === 'customer' && $account->customer_id !== null && (string) $account->customer_id !== (string) $customerId) {
            throw ProblemException::validation(['purchase_provider_account_id' => ['La cuenta de proveedor pertenece a otro cliente.']]);
        }
    }
}
