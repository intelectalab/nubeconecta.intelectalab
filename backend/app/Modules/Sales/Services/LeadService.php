<?php

declare(strict_types=1);

namespace App\Modules\Sales\Services;

use App\Modules\Customers\Models\Contact;
use App\Modules\Customers\Models\Customer;
use App\Modules\Customers\Services\ConsentService;
use App\Modules\Customers\Services\CustomerService;
use App\Modules\Sales\Events\LeadCreated;
use App\Modules\Sales\Events\LeadLost;
use App\Modules\Sales\Events\LeadStageChanged;
use App\Modules\Sales\Events\LeadWon;
use App\Modules\Sales\Models\Lead;
use App\Modules\Sales\Models\LeadActivity;
use App\Modules\Sales\Models\LeadChannel;
use App\Modules\Sales\Models\PipelineStage;
use App\Modules\WebConnector\Models\WebFormSubmission;
use App\Shared\Audit\AuditLogger;
use App\Shared\Concurrency\VersionGuard;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Casos de uso del CRM básico (M-SAL §4): alta, edición, movimiento por el
 * embudo, pérdida con motivo, conversión a cliente y actividades. La
 * auditoría guarda ids y estados, nunca nombre, correo ni teléfono.
 */
final class LeadService
{
    private const AUDITED = ['code', 'status', 'pipeline_stage_id', 'lead_channel_id', 'brand_id', 'owner_id', 'customer_id', 'lost_reason', 'estimated_amount_minor', 'currency', 'converted_at', 'version'];

    /** Etapas por defecto (M-SAL §2). La doc no fija probabilidades: solo ganado 100 y perdido 0. */
    private const STAGES = [
        ['new', 'Nuevo', 'open', 10, null],
        ['contacted', 'Contactado', 'open', 20, null],
        ['proposal_sent', 'Propuesta enviada', 'open', 30, null],
        ['negotiation', 'Negociación', 'open', 40, null],
        ['won', 'Ganado', 'won', 90, 100],
        ['lost', 'Perdido', 'lost', 100, 0],
    ];

    private const CHANNELS = [
        ['web', 'Web', 'web_form'],
        ['whatsapp', 'WhatsApp', 'whatsapp'],
        ['call', 'Llamada', 'call'],
        ['referral', 'Referido', 'referral'],
        ['manual', 'Registro manual', 'other'],
    ];

    public function __construct(
        private readonly AuditLogger $audit,
        private readonly CurrentOrganization $organization,
        private readonly CustomerService $customers,
        private readonly ConsentService $consents,
    ) {}

    /** Siembra idempotente de etapas, canales y correlativo de la organización (también la invoca SalesSeeder). */
    public function ensureDefaults(): void
    {
        $org = $this->organization->id();
        foreach (self::STAGES as [$code, $name, $outcome, $order, $probability]) {
            DB::table('pipeline_stages')->insertOrIgnore(['id' => (string) Str::uuid(), 'organization_id' => $org, 'code' => $code, 'name' => $name, 'outcome' => $outcome, 'sort_order' => $order, 'probability' => $probability]);
        }
        foreach (self::CHANNELS as [$code, $name, $kind]) {
            DB::table('lead_channels')->insertOrIgnore(['id' => (string) Str::uuid(), 'organization_id' => $org, 'code' => $code, 'name' => $name, 'kind' => $kind]);
        }
        DB::table('code_sequences')->insertOrIgnore(['id' => (string) Str::uuid(), 'organization_id' => $org, 'entity' => 'lead', 'prefix' => 'PRO', 'padding' => 6, 'next_value' => 1]);
    }

    /**
     * Alta de prospecto en la primera etapa abierta. El responsable queda vacío
     * si no se indica: las reglas de asignación (assignment_rules) no están en el MVP.
     *
     * @param  array<string, mixed>  $data  campos de Lead::$fillable más attribution y marketing_consent
     */
    public function create(array $data, string $source = 'created'): Lead
    {
        $this->ensureDefaults();

        return DB::transaction(function () use ($data, $source): Lead {
            $lead = new Lead;
            $lead->forceFill(Arr::only($data, array_merge($lead->getFillable(), ['attribution', 'marketing_consent'])));
            $lead->lead_channel_id ??= LeadChannel::query()->where('code', 'manual')->value('id');
            $lead->pipeline_stage_id ??= $this->openStages()->first()->id;
            $lead->code = (string) DB::selectOne('select hub_next_code(?, ?) as code', [$this->organization->id(), 'lead'])->code;
            $lead->save();
            $this->recordStage($lead->id, null, $lead->pipeline_stage_id, $source);
            $this->audit->record('lead.created', 'lead', $lead->id, null, $lead->refresh()->only(self::AUDITED), ['source' => $source]);
            LeadCreated::dispatch($lead->organization_id, $lead->id);

            return $lead;
        });
    }

    /** @param array<string, mixed> $data */
    public function update(Lead $lead, array $data): Lead
    {
        return DB::transaction(function () use ($lead, $data): Lead {
            VersionGuard::check($lead, (int) $data['version']);
            $this->assertOpen($lead);
            $before = $lead->only(self::AUDITED);
            $lead->forceFill(Arr::only($data, $lead->getFillable()));
            if (($data['clear_amount'] ?? false) === true) {
                $lead->estimated_amount_minor = null;
                $lead->currency = null;
            }
            $changed = array_keys($lead->getDirty());
            $lead->save();
            // Los datos personales (nombre, correo, teléfono) solo se registran como "cambió el campo".
            $this->audit->record('lead.updated', 'lead', $lead->id, $before, $lead->refresh()->only(self::AUDITED), ['fields' => array_values(array_diff($changed, ['version']))]);

            return $lead;
        });
    }

    /** Mueve entre etapas abiertas; ganado y perdido se alcanzan con convert() y lose(). */
    public function move(Lead $lead, string $stageId, int $version, string $source = 'form', ?string $note = null): Lead
    {
        return DB::transaction(function () use ($lead, $stageId, $version, $source, $note): Lead {
            VersionGuard::check($lead, $version);
            $this->assertOpen($lead);
            $stage = PipelineStage::query()->where('is_active', true)->find($stageId);
            if ($stage === null) {
                throw ProblemException::validation(['stage_id' => ['Etapa no válida.']]);
            }
            if ($stage->outcome !== 'open') {
                throw ProblemException::validation(['stage_id' => ['Para ganar o perder el prospecto usa convertir en cliente o marcar perdido.']]);
            }
            if ($stage->id === $lead->pipeline_stage_id) {
                return $lead;
            }
            $before = $lead->only(self::AUDITED);
            $from = $lead->pipeline_stage_id;
            $lead->forceFill(['pipeline_stage_id' => $stage->id])->save();
            $this->recordStage($lead->id, $from, $stage->id, $source, $note);
            $this->audit->record('lead.stage_changed', 'lead', $lead->id, $before, $lead->refresh()->only(self::AUDITED), ['source' => $source]);
            LeadStageChanged::dispatch($lead->organization_id, $lead->id);

            return $lead;
        });
    }

    public function lose(Lead $lead, int $version, string $reason, string $source = 'form'): Lead
    {
        $reason = trim($reason);
        if ($reason === '') {
            throw ProblemException::validation(['reason' => ['El motivo es obligatorio para marcar el prospecto como perdido.']]);
        }

        return DB::transaction(function () use ($lead, $version, $reason, $source): Lead {
            VersionGuard::check($lead, $version);
            $this->assertOpen($lead);
            $before = $lead->only(self::AUDITED);
            $from = $lead->pipeline_stage_id;
            $to = $this->outcomeStage('lost');
            $lead->forceFill(['status' => 'lost', 'lost_reason' => $reason, 'pipeline_stage_id' => $to])->save();
            $this->recordStage($lead->id, $from, $to, $source);
            $this->audit->record('lead.lost', 'lead', $lead->id, $before, $lead->refresh()->only(self::AUDITED));
            LeadLost::dispatch($lead->organization_id, $lead->id);

            return $lead;
        });
    }

    /**
     * Gana el prospecto y lo convierte en cliente (RN-SAL-003, solo la parte de
     * cliente: el pedido y los avisos quedan fuera del MVP). Idempotente: un
     * prospecto ya ganado devuelve su cliente sin cambios. No da acceso al portal.
     *
     * @param  array<string, mixed>  $opts  customer_id (vincular a uno existente) o type, legal_name, tax_id_type, tax_id
     * @return array{lead: Lead, customer: Customer, created: bool}
     */
    public function convert(Lead $lead, int $version, array $opts = []): array
    {
        if ($lead->status === 'won' && $lead->customer_id !== null) {
            return ['lead' => $lead, 'customer' => Customer::query()->findOrFail($lead->customer_id), 'created' => false];
        }

        return DB::transaction(function () use ($lead, $version, $opts): array {
            VersionGuard::check($lead, $version);
            $this->assertOpen($lead);
            [$customer, $created] = $this->resolveCustomer($lead, $opts);
            $contact = $this->ensureContact($lead, $customer, $created);
            if ($created && $lead->marketing_consent && $contact?->email) {
                $this->consents->record($contact, 'email', true, 'form', ['lead_id' => $lead->id]);
            }
            $before = $lead->only(self::AUDITED);
            $from = $lead->pipeline_stage_id;
            $to = $this->outcomeStage('won');
            $lead->forceFill(['status' => 'won', 'customer_id' => $customer->id, 'converted_at' => now(), 'pipeline_stage_id' => $to])->save();
            $this->recordStage($lead->id, $from, $to, 'conversion');
            $this->audit->record('lead.won', 'lead', $lead->id, $before, $lead->refresh()->only(self::AUDITED), ['customer_created' => $created], $customer->id);
            LeadWon::dispatch($lead->organization_id, $lead->id);

            return ['lead' => $lead, 'customer' => $customer, 'created' => $created];
        });
    }

    /** @param array<string, mixed> $data */
    public function addActivity(Lead $lead, array $data): LeadActivity
    {
        return DB::transaction(function () use ($lead, $data): LeadActivity {
            $activity = new LeadActivity;
            $isFollowUp = $data['type'] === 'follow_up';
            $activity->forceFill(Arr::only($data, ['type', 'subject', 'notes', 'due_at', 'reminder_at']) + [
                'lead_id' => $lead->id,
                'assigned_to' => $data['assigned_to'] ?? Auth::id(),
                'completed_at' => $isFollowUp ? null : now(),
            ])->save();
            // Sin pasar por Eloquent: registrar una actividad no cambia `version` y no invalida a quien edita el prospecto.
            $touch = ['last_activity_at' => now()];
            if ($isFollowUp && ! empty($data['due_at'])) {
                $touch['next_follow_up_at'] = $data['due_at'];
            }
            DB::table('leads')->where('id', $lead->id)->update($touch);
            $this->audit->record('lead.activity_added', 'lead', $lead->id, null, ['activity_id' => $activity->id, 'type' => $activity->type]);

            return $activity;
        });
    }

    public function completeActivity(LeadActivity $activity, int $version, bool $completed): LeadActivity
    {
        return DB::transaction(function () use ($activity, $version, $completed): LeadActivity {
            VersionGuard::check($activity, $version);
            $activity->forceFill(['completed_at' => $completed ? ($activity->completed_at ?? now()) : null])->save();
            $this->audit->record('lead.activity_updated', 'lead', $activity->lead_id, null, ['activity_id' => $activity->id, 'completed' => $completed]);

            return $activity;
        });
    }

    /**
     * "Convertir en prospecto" desde la bandeja Solicitudes web. Idempotente:
     * si la solicitud ya tiene prospecto lo devuelve. El mensaje del visitante
     * queda como primera nota del prospecto.
     *
     * @return array{lead: Lead, created: bool}
     */
    public function fromSubmission(string $submissionId): array
    {
        $this->ensureDefaults();

        return DB::transaction(function () use ($submissionId): array {
            $sub = WebFormSubmission::query()->lockForUpdate()->findOrFail($submissionId);
            if ($sub->lead_id !== null) {
                return ['lead' => Lead::query()->findOrFail($sub->lead_id), 'created' => false];
            }
            if ($sub->status === 'spam') {
                throw new ProblemException(409, 'conflict', 'Una solicitud marcada como spam no se convierte en prospecto.');
            }
            $payload = (array) $sub->payload;
            $form = DB::table('web_forms')->where('id', $sub->web_form_id)->first(['code', 'consent_purpose']);
            $email = isset($payload['email']) ? mb_strtolower(trim((string) $payload['email'])) : null;
            $lead = $this->create([
                'name' => Str::limit(trim((string) ($payload['name'] ?? '')) ?: ($email ?? 'Sin nombre'), 200, ''),
                'company_name' => $payload['company'] ?? null,
                'email' => $email,
                'phone' => $payload['phone'] ?? null,
                'brand_id' => $sub->brand_id,
                'lead_channel_id' => LeadChannel::query()->where('code', 'web')->value('id'),
                'attribution' => array_filter([
                    'page_url' => $sub->page_url, 'form_code' => $form->code ?? null, 'web_form_submission_id' => $sub->id,
                    'source' => $payload['source'] ?? null,
                ] + (array) $sub->attribution, fn ($v) => $v !== null && $v !== ''),
                // Solo cuenta como consentimiento comercial el de un formulario cuyo propósito es marketing.
                'marketing_consent' => $sub->consent_given && ($form->consent_purpose ?? null) === 'marketing',
            ]);
            if (! empty($payload['message'])) {
                $note = new LeadActivity;
                $note->forceFill(['lead_id' => $lead->id, 'type' => 'note', 'subject' => 'Mensaje del formulario web', 'notes' => (string) $payload['message'], 'completed_at' => now()])->save();
            }
            $before = $sub->only(['status', 'lead_id', 'routed_at', 'version']);
            $sub->forceFill(['status' => 'routed', 'lead_id' => $lead->id, 'routed_at' => $sub->routed_at ?? now(), 'last_error' => null])->save();
            $this->audit->record('web_form_submission.routed', 'web_form_submission', $sub->id, $before, $sub->refresh()->only(['status', 'lead_id', 'routed_at', 'version']), ['lead_id' => $lead->id]);

            return ['lead' => $lead, 'created' => true];
        });
    }

    /** @return \Illuminate\Database\Eloquent\Collection<int, PipelineStage> */
    public function openStages()
    {
        return PipelineStage::query()->where('is_active', true)->where('outcome', 'open')->orderBy('sort_order')->get();
    }

    private function outcomeStage(string $outcome): string
    {
        $id = PipelineStage::query()->where('is_active', true)->where('outcome', $outcome)->orderBy('sort_order')->value('id');
        if ($id === null) {
            throw new ProblemException(409, 'conflict', 'El embudo no tiene una etapa activa de resultado '.($outcome === 'won' ? 'ganado' : 'perdido').'.');
        }

        return $id;
    }

    private function assertOpen(Lead $lead): void
    {
        if ($lead->status !== 'open') {
            throw new ProblemException(409, 'lead_closed', 'El prospecto ya está cerrado.');
        }
    }

    private function recordStage(string $leadId, ?string $from, string $to, string $source, ?string $note = null): void
    {
        if ($from === $to) {
            return;
        }
        DB::table('lead_stage_changes')->insert([
            'id' => (string) Str::uuid(), 'organization_id' => $this->organization->id(), 'lead_id' => $leadId,
            'from_stage_id' => $from, 'to_stage_id' => $to, 'source' => $source, 'changed_by' => Auth::id(), 'note' => $note, 'created_by' => Auth::id(),
        ]);
    }

    /**
     * @param  array<string, mixed>  $opts
     * @return array{0: Customer, 1: bool} cliente y si se creó ahora
     */
    private function resolveCustomer(Lead $lead, array $opts): array
    {
        if (! empty($opts['customer_id'])) {
            return [Customer::query()->whereNull('merged_into_id')->findOrFail($opts['customer_id']), false];
        }
        $hasTax = ! empty($opts['tax_id_type']) && ! empty($opts['tax_id']);
        // Sin documento: si el correo ya es de un cliente (o de uno de sus contactos) se vincula en vez de duplicar.
        if (! $hasTax && $lead->email !== null) {
            $email = mb_strtolower(trim($lead->email));
            $existing = Customer::query()->whereNull('merged_into_id')->where(function ($q) use ($email): void {
                $q->whereRaw('lower(email) = ?', [$email])
                    ->orWhereIn('id', Contact::query()->select('customer_id')->whereRaw('lower(email) = ?', [$email]));
            })->orderBy('created_at')->first();
            if ($existing !== null) {
                return [$existing, false];
            }
        }
        $data = [
            'type' => $opts['type'] ?? ($lead->company_name ? 'company' : 'individual'),
            'legal_name' => $opts['legal_name'] ?? ($lead->company_name ?: $lead->name),
            'country' => 'PE',                      // pendiente de decisión: país y moneda por defecto del cliente convertido
            'currency' => $lead->currency ?? 'PEN',
            'origin_brand_id' => $lead->brand_id,
            'email' => $lead->email,
            'phone' => $lead->phone,
            'account_manager_id' => $lead->owner_id,
        ] + ($hasTax ? Arr::only($opts, ['tax_id_type', 'tax_id']) : []);
        $customer = $this->customers->createFromLead($lead->id, $data);

        return [$customer, $customer->wasRecentlyCreated];
    }

    /** Contacto principal del cliente nuevo; en uno existente solo se agrega si el correo no está. */
    private function ensureContact(Lead $lead, Customer $customer, bool $newCustomer): ?Contact
    {
        if (! $newCustomer && ($lead->email === null || Contact::query()->where('customer_id', $customer->id)->whereRaw('lower(email) = ?', [mb_strtolower($lead->email)])->exists())) {
            return null;
        }
        $contact = new Contact;
        $contact->forceFill([
            'customer_id' => $customer->id, 'name' => $lead->name, 'email' => $lead->email, 'phone' => $lead->phone,
            'roles' => ['administrative', 'billing'], 'is_primary' => $newCustomer,
        ])->save();
        $this->audit->record('contact.created', 'contact', $contact->id, null, ['customer_id' => $customer->id, 'is_primary' => $newCustomer], ['lead_id' => $lead->id], $customer->id);

        return $contact;
    }
}
