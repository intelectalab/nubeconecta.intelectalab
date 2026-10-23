<?php

declare(strict_types=1);

namespace App\Modules\Customers\Services;

use App\Modules\Customers\Events\CommunicationConsentChanged;
use App\Modules\Customers\Models\CommunicationConsent;
use App\Modules\Customers\Models\Contact;
use App\Shared\Audit\AuditLogger;
use App\Shared\Contracts\CommunicationPreferences;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Consentimiento de comunicaciones comerciales (M-CUS §4.5, RN-CUS-001).
 * Las filas solo se agregan. Regla de lectura: una baja en cualquier canal
 * anula todos los canales; solo vuelven los canales con una alta posterior a
 * la última baja. Sin ninguna alta no hay envío comercial. Los avisos
 * transaccionales (cobranza, servicio) no dependen de esto.
 */
final class ConsentService implements CommunicationPreferences
{
    public function __construct(private readonly AuditLogger $audit) {}

    /** @param array<string, mixed> $evidence */
    public function record(Contact $contact, string $channel, bool $granted, string $source, array $evidence = [], string $purpose = 'marketing'): CommunicationConsent
    {
        return DB::transaction(function () use ($contact, $channel, $granted, $source, $evidence, $purpose): CommunicationConsent {
            $row = new CommunicationConsent;
            $row->forceFill([
                'contact_id' => $contact->id, 'email' => $contact->email, 'phone' => $contact->phone,
                'channel' => $channel, 'purpose' => $purpose, 'granted' => $granted, 'source' => $source,
                'evidence' => $evidence, 'recorded_at' => now(),
            ])->save();
            $this->audit->record('communication_consent.recorded', 'communication_consent', $row->id, null, $row->attributesToArray(), ['contact_id' => $contact->id], $contact->customer_id);
            CommunicationConsentChanged::dispatch($row->organization_id, $row->id);

            return $row;
        });
    }

    /**
     * Estado vigente por canal para mostrar en P-CUS-04 y en el portal.
     *
     * @return array{marketing_allowed_channels: list<string>, last_opt_out_at: ?string, last_recorded_at: ?string}
     */
    public function summary(Contact $contact): array
    {
        $rows = $this->rows($contact);
        $optOut = $rows->first(fn (CommunicationConsent $r) => ! $r->granted);

        return [
            'marketing_allowed_channels' => $this->allowedChannels($rows),
            'last_opt_out_at' => $optOut?->recorded_at?->toIso8601String(),
            'last_recorded_at' => $rows->first()?->recorded_at?->toIso8601String(),
        ];
    }

    public function maySend(string $contactId, string $channel, string $kind = 'marketing'): bool
    {
        if ($kind !== 'marketing') {
            return true;
        }
        $contact = Contact::query()->find($contactId);
        if ($contact === null) {
            return false;
        }
        $allowed = $this->allowedChannels($this->rows($contact));

        return in_array('all', $allowed, true) || in_array($channel, $allowed, true);
    }

    public function recordUnsubscribeByEmail(string $email, string $source = 'elastic_email', array $evidence = []): int
    {
        $email = mb_strtolower(trim($email));
        $contacts = Contact::query()->whereRaw('lower(email) = ?', [$email])->get();
        foreach ($contacts as $contact) {
            $this->record($contact, 'all', false, $source, $evidence);
        }
        if ($contacts->isEmpty()) {
            // Correo sin contacto (p. ej. prospecto): la baja queda registrada igual.
            $row = new CommunicationConsent;
            $row->forceFill(['email' => $email, 'channel' => 'all', 'purpose' => 'marketing', 'granted' => false, 'source' => $source, 'evidence' => $evidence, 'recorded_at' => now()])->save();
            CommunicationConsentChanged::dispatch($row->organization_id, $row->id);
        }

        return $contacts->count();
    }

    /** @return Collection<int, CommunicationConsent> más reciente primero */
    private function rows(Contact $contact): Collection
    {
        return CommunicationConsent::query()->where('purpose', 'marketing')
            ->where(function ($q) use ($contact): void {
                $q->where('contact_id', $contact->id);
                if ($contact->email) {
                    $q->orWhere(fn ($w) => $w->whereNull('contact_id')->whereRaw('lower(email) = ?', [mb_strtolower($contact->email)]));
                }
            })
            ->orderByDesc('recorded_at')->orderByDesc('created_at')->orderByDesc('id')->get();
    }

    /**
     * @param  Collection<int, CommunicationConsent>  $rows
     * @return list<string>
     */
    private function allowedChannels(Collection $rows): array
    {
        $allowed = [];
        foreach ($rows as $row) {
            if (! $row->granted) {
                break; // la baja más reciente corta: lo anterior ya no cuenta
            }
            $allowed[] = $row->channel;
        }

        return array_values(array_unique($allowed));
    }
}
