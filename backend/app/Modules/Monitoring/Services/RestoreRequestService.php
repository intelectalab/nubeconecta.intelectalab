<?php

declare(strict_types=1);

namespace App\Modules\Monitoring\Services;

use App\Modules\Monitoring\Models\RestoreRequest;
use App\Modules\Services\Models\Service;
use App\Modules\Support\Models\Ticket;
use App\Shared\Audit\AuditLogger;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Support\Facades\DB;

/**
 * Alta y transiciones de las solicitudes de restauración. Cada solicitud nace con
 * un ticket de soporte asociado (RN: el cliente siempre tiene trazabilidad). La
 * ejecución (in_progress/completed/failed) se maneja en una fase posterior.
 */
final class RestoreRequestService
{
    public function __construct(
        private readonly CurrentOrganization $organization,
        private readonly AuditLogger $audit,
    ) {}

    /**
     * @param  array{service_id:string,target_kind:string,target_name:string,restore_point_at:string,hosting_account_id?:?string}  $data
     */
    public function create(array $data, string $via, string $requestedBy, ?string $contactId = null): RestoreRequest
    {
        $org = $this->organization->id();
        $service = Service::query()->findOrFail($data['service_id']);

        return DB::transaction(function () use ($data, $via, $requestedBy, $contactId, $org, $service): RestoreRequest {
            DB::table('code_sequences')->insertOrIgnore(['organization_id' => $org, 'entity' => 'restore_request', 'prefix' => 'RST', 'padding' => 6, 'next_value' => 1]);
            $code = (string) DB::selectOne('select hub_next_code(?, ?) as code', [$org, 'restore_request'])->code;

            DB::table('code_sequences')->insertOrIgnore(['organization_id' => $org, 'entity' => 'ticket', 'prefix' => 'TIC', 'padding' => 6, 'next_value' => 1]);
            $ticket = (new Ticket)->fill([
                'number' => (string) DB::selectOne('select hub_next_code(?, ?) as code', [$org, 'ticket'])->code,
                'customer_id' => $service->customer_id,
                'brand_id' => $service->brand_id,
                'contact_id' => $contactId,
                'channel' => $via === 'portal' ? 'portal' : 'internal',
                'status' => 'new',
                'priority' => 'high',
                'type' => 'request',
                'subject' => "Solicitud de restauración {$code} · {$data['target_name']}",
            ]);
            $ticket->save();

            $req = new RestoreRequest;
            $req->forceFill([
                'code' => $code,
                'customer_id' => $service->customer_id,
                'service_id' => $service->id,
                'hosting_account_id' => $data['hosting_account_id'] ?? null,
                'target_kind' => $data['target_kind'],
                'target_name' => $data['target_name'],
                'restore_point_at' => $data['restore_point_at'],
                'requested_via' => $via,
                'requested_by' => $requestedBy,
                'overwrite_confirmed' => true,
                'status' => 'requested',
                'ticket_id' => $ticket->id,
            ])->save();

            $this->audit->record('restore_request.created', 'restore_request', $req->id, null, $req->attributesToArray(), ['code' => $code, 'via' => $via], $service->customer_id);

            return $req;
        });
    }

    public function approve(RestoreRequest $req, string $approverId): RestoreRequest
    {
        $this->assertStatus($req, ['requested']);

        return DB::transaction(function () use ($req, $approverId): RestoreRequest {
            $before = $req->attributesToArray();
            $req->forceFill(['status' => 'approved', 'approved_by' => $approverId, 'approved_at' => now()])->save();
            $this->audit->record('restore_request.approved', 'restore_request', $req->id, $before, $req->refresh()->attributesToArray(), [], $req->customer_id);

            return $req;
        });
    }

    public function reject(RestoreRequest $req, string $reason): RestoreRequest
    {
        $this->assertStatus($req, ['requested']);

        return DB::transaction(function () use ($req, $reason): RestoreRequest {
            $before = $req->attributesToArray();
            $req->forceFill(['status' => 'rejected', 'rejection_reason' => $reason])->save();
            $this->audit->record('restore_request.rejected', 'restore_request', $req->id, $before, $req->refresh()->attributesToArray(), [], $req->customer_id);

            return $req;
        });
    }

    public function cancel(RestoreRequest $req): RestoreRequest
    {
        $this->assertStatus($req, ['requested', 'approved']);

        return DB::transaction(function () use ($req): RestoreRequest {
            $before = $req->attributesToArray();
            $req->forceFill(['status' => 'cancelled'])->save();
            $this->audit->record('restore_request.cancelled', 'restore_request', $req->id, $before, $req->refresh()->attributesToArray(), [], $req->customer_id);

            return $req;
        });
    }

    /** @param list<string> $allowed */
    private function assertStatus(RestoreRequest $req, array $allowed): void
    {
        if (! in_array($req->status, $allowed, true)) {
            throw new ProblemException(409, 'invalid_transition', "La solicitud en estado «{$req->status}» no admite esta acción.");
        }
    }
}
