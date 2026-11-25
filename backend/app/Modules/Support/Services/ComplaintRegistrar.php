<?php

declare(strict_types=1);

namespace App\Modules\Support\Services;

use App\Modules\Notifications\Services\NotificationService;
use App\Modules\Settings\Services\BusinessCalendar;
use App\Modules\Support\Models\Complaint;
use App\Modules\Support\Models\Ticket;
use App\Shared\Audit\AuditLogger;
use App\Shared\Organization\CurrentOrganization;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Núcleo único de alta de una hoja del Libro de Reclamaciones, compartido por el
 * panel (ComplaintController), el portal del cliente (PortalComplaintController) y
 * el formulario público del sitio (WpComplaintController).
 *
 * Bloquea la marca, asigna el correlativo por marca (sin reutilizar huecos de
 * hojas de prueba eliminadas), abre el ticket interno con el plazo de respuesta,
 * crea la hoja, deja la auditoría y envía la constancia (best-effort).
 */
final class ComplaintRegistrar
{
    public function __construct(
        private readonly AuditLogger $audit,
        private readonly CurrentOrganization $organization,
    ) {}

    /**
     * @param  object  $brand  fila de brands con ->id y ->code (la organización ya está fijada en CurrentOrganization)
     * @param  array<string,mixed>  $attributes  atributos ya resueltos y validados de la hoja (complaint_type, consumer_*, customer_id?, service_id?, service_description, amount_minor?, currency?, detail, consumer_request, wp_site_id?, ip_hash?, is_minor?, guardian_name?, is_test?, test_marked_at?, test_marked_by?, test_reason?)
     */
    public function register(object $brand, array $attributes, int $responseDays): Complaint
    {
        $org = $this->organization->id();

        $complaint = DB::transaction(function () use ($brand, $attributes, $responseDays, $org): Complaint {
            // Serializa el correlativo por marca contra altas concurrentes.
            DB::table('brands')->where('id', $brand->id)->lockForUpdate()->firstOrFail();
            $number = (int) Complaint::query()->where('brand_id', $brand->id)->max('number') + 1;
            $number = max($number, (int) DB::table('complaint_deletions')->where('brand_id', $brand->id)->max('number') + 1);
            $received = now();
            $due = $this->dueDate($received, $responseDays);

            DB::table('code_sequences')->insertOrIgnore(['organization_id' => $org, 'entity' => 'ticket', 'prefix' => 'TIC', 'padding' => 6, 'next_value' => 1]);
            $ticket = Ticket::query()->create([
                'number' => DB::selectOne('select hub_next_code(?, ?) as code', [$org, 'ticket'])->code,
                'brand_id' => $brand->id,
                'customer_id' => $attributes['customer_id'] ?? null,
                'type' => 'complaint',
                'status' => 'open',
                'priority' => 'high',
                'channel' => 'web_form',
                'subject' => 'Libro de Reclamaciones: '.$attributes['complaint_type'].' #'.$number,
                'resolution_due_at' => $due,
            ]);

            $record = Complaint::query()->create(array_merge($attributes, [
                'brand_id' => $brand->id,
                'number' => $number,
                'code' => strtoupper((string) $brand->code).'-'.str_pad((string) $number, 6, '0', STR_PAD_LEFT),
                'status' => 'received',
                'received_at' => $received,
                'response_days' => $responseDays,
                'due_at' => $due,
                'ticket_id' => $ticket->id,
            ]));

            $this->audit->record('complaint.created', 'complaint', $record->id, null, $record->refresh()->attributesToArray());

            return $record;
        });

        $this->notify($complaint);

        return $complaint->load('responses');
    }

    /**
     * Vencimiento legal (Ley 31435: 15 días hábiles). Usa el calendario de días
     * hábiles del negocio si está configurado; si no, cae a días calendario para
     * no bloquear el registro.
     */
    private function dueDate(CarbonInterface $from, int $days): CarbonInterface
    {
        try {
            return app(BusinessCalendar::class)->addBusinessDays($from, $days);
        } catch (\RuntimeException) {
            return $from->copy()->addDays($days);
        }
    }

    private function notify(Complaint $complaint): void
    {
        try {
            app(NotificationService::class)->send([
                'event' => 'complaint.received',
                'template_code' => 'complaint.received',
                'recipient_address' => $complaint->consumer_email,
                'customer_id' => $complaint->customer_id,
                'brand_id' => $complaint->brand_id,
                'entity_type' => 'complaint',
                'entity_id' => $complaint->id,
                'dedupe_key' => 'complaint:'.$complaint->id,
                'variables' => ['numero' => $complaint->number, 'codigo' => $complaint->code ?? '', 'nombre' => $complaint->consumer_name],
            ]);
        } catch (\Throwable $e) {
            // Best-effort: ni el fallo de notificación ni su registro deben tumbar la hoja (ya guardada).
            try {
                Log::warning('notify falló', ['event' => 'complaint.received', 'error' => $e->getMessage()]);
            } catch (\Throwable) { /* logging no disponible */ }
        }
    }
}
