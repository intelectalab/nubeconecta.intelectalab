<?php

declare(strict_types=1);

namespace App\Modules\Mail\Services;

use App\Modules\Domains\Models\Domain;
use App\Modules\Inventory\Models\HostingAccount;
use App\Modules\Mail\Models\MailService;
use App\Modules\Providers\Models\ProviderAccount;
use App\Modules\Services\Models\Service;
use App\Shared\Audit\AuditLogger;
use App\Shared\Concurrency\VersionGuard;
use App\Shared\Http\Problem\ProblemException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/** Correo corporativo en modo manual (sin integración con Google/Microsoft/cPanel). */
final class MailManager
{
    public function __construct(private readonly AuditLogger $audit) {}

    /** @return list<string> */
    public static function relations(): array
    {
        return ['domain:id,name,customer_id', 'domain.customer:id,code,legal_name,trade_name', 'service:id,code,label,status,customer_id', 'providerAccount:id,provider_id,label', 'providerAccount.provider:id,name'];
    }

    public function rules(?MailService $mail): array
    {
        $required = $mail === null ? 'required' : 'sometimes';
        return [
            'domain_id' => [$required, 'uuid'],
            'service_id' => ['sometimes', 'nullable', 'uuid'],
            'provider_kind' => [$required, Rule::in(MailService::PROVIDER_KINDS)],
            'provider_account_id' => ['sometimes', 'nullable', 'uuid'],
            'hosting_account_id' => ['sometimes', 'nullable', 'uuid'],
            'tenant_id' => ['sometimes', 'nullable', 'string', 'max:200'],
            'plan' => ['sometimes', 'nullable', 'string', 'max:200'],
            'account_owner' => ['sometimes', Rule::in(MailService::OWNERS)],
            'seats_purchased' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:1000000'],
            'seats_used' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:1000000'],
            'seats_billed' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:1000000'],
            'mailboxes_count' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:1000000'],
            'storage_used_mb' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'renewal_date' => ['sometimes', 'nullable', 'date'],
            'status' => ['sometimes', Rule::in(MailService::STATUSES)],
        ] + ($mail === null ? [] : ['version' => ['required', 'integer', 'min:1']]);
    }

    public function create(array $data): MailService
    {
        $this->checkLinks($data, null);
        return DB::transaction(function () use ($data): MailService {
            $mail = new MailService($data);
            $mail->sync_mode = 'manual';
            $mail->save();
            $this->audit->record('mail_service.created', 'mail_service', $mail->id, null, $mail->refresh()->attributesToArray(), [], $this->customerOf($mail));
            return $this->loaded($mail);
        });
    }

    public function update(MailService $mail, array $data): MailService
    {
        $version = $data['version'];
        unset($data['version']);
        $this->checkLinks($data, $mail);
        return DB::transaction(function () use ($mail, $data, $version): MailService {
            VersionGuard::check($mail, $version);
            $before = $mail->attributesToArray();
            $mail->fill($data)->save();
            $this->audit->record('mail_service.updated', 'mail_service', $mail->id, $before, $mail->refresh()->attributesToArray(), [], $this->customerOf($mail));
            return $this->loaded($mail);
        });
    }

    public function delete(MailService $mail): void
    {
        DB::transaction(function () use ($mail): void {
            $before = $mail->attributesToArray();
            $customer = $this->customerOf($mail);
            $mail->delete();
            $this->audit->record('mail_service.deleted', 'mail_service', $mail->id, $before, null, [], $customer);
        });
    }

    /** Contadores de las tiles (sobre toda la organización, sin filtros). */
    public function summary(): array
    {
        $today = now()->toDateString();
        $row = MailService::query()->selectRaw(
            'count(*) as total,'
            .' count(*) filter (where seats_used is not null and seats_billed is not null and seats_used <> seats_billed) as with_difference,'
            .' count(*) filter (where seats_used > seats_billed) as under_billed,'
            .' count(*) filter (where renewal_date between ? and ?) as renewing_30d',
            [$today, now()->addDays(30)->toDateString()],
        )->first();
        return [
            'total' => (int) $row->total, 'with_difference' => (int) $row->with_difference,
            'under_billed' => (int) $row->under_billed, 'renewing_30d' => (int) $row->renewing_30d,
        ];
    }

    public function loaded(MailService $mail): MailService
    {
        return $mail->load(self::relations());
    }

    private function customerOf(MailService $mail): ?string
    {
        return Domain::withTrashed()->whereKey($mail->domain_id)->value('customer_id');
    }

    /** Los vínculos se resuelven por el scope de organización: uno de otra organización responde 404. */
    private function checkLinks(array $data, ?MailService $current): void
    {
        $domain = ! empty($data['domain_id']) ? Domain::query()->findOrFail($data['domain_id']) : null;
        $service = ! empty($data['service_id']) ? Service::query()->findOrFail($data['service_id']) : null;
        $account = ! empty($data['provider_account_id']) ? ProviderAccount::query()->findOrFail($data['provider_account_id']) : null;
        if (! empty($data['hosting_account_id'])) { HostingAccount::query()->findOrFail($data['hosting_account_id']); }

        $domain ??= $current === null ? null : Domain::query()->find($current->domain_id);
        $customerId = $domain?->customer_id;

        // El servicio comercial vinculado debe pertenecer al mismo cliente del dominio.
        if ($service !== null && $customerId !== null && (string) $service->customer_id !== (string) $customerId) {
            throw ProblemException::validation(['service_id' => ['El servicio no pertenece al cliente del dominio.']]);
        }
        if ($account !== null && $account->owner === 'customer' && $account->customer_id !== null && (string) $account->customer_id !== (string) $customerId) {
            throw ProblemException::validation(['provider_account_id' => ['La cuenta de proveedor pertenece a otro cliente.']]);
        }
    }
}
