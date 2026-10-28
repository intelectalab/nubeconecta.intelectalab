<?php

declare(strict_types=1);

namespace App\Modules\WebConnector\Http\Controllers;

use App\Modules\WebConnector\Models\WebFormSubmission;
use App\Shared\Audit\AuditLogger;
use App\Shared\Concurrency\VersionGuard;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Http\Resources\ModelResource;
use App\Shared\Organization\CurrentOrganization;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * /api/v1/admin/web-connector/form-submissions (web_connector.form_submission.*):
 * bandeja «Solicitudes web» del panel con los envíos de contacto y cotización.
 *
 * Estados del esquema: received (nueva), routed (derivada a prospecto o ticket),
 * failed (falló la derivación automática) y spam. A mano se marca spam, se
 * restaura a received o se deriva (routed) indicando el prospecto o el ticket,
 * porque el CHECK de la tabla exige ese vínculo.
 */
final class WebFormSubmissionController
{
    private const AUDITED = ['status', 'lead_id', 'ticket_id', 'routed_at', 'last_error', 'version'];

    public function __construct(private readonly AuditLogger $audit) {}

    public function index(Request $request): JsonResponse
    {
        $query = WebFormSubmission::query()->withFormInfo();

        $status = $request->input('filter.status');
        if ($status !== null && $status !== '') {
            $list = array_values(array_filter(array_map('trim', explode(',', (string) $status))));
            if (array_diff($list, WebFormSubmission::STATUSES) !== []) {
                throw ProblemException::validation(['filter.status' => ['Estado no válido.']]);
            }
            $query->whereIn('web_form_submissions.status', $list);
        } else {
            $query->where('web_form_submissions.status', '<>', 'spam'); // por defecto la bandeja no muestra spam
        }
        if (($code = $request->input('filter.form_code')) !== null && $code !== '') {
            $query->whereIn('web_form_submissions.web_form_id', DB::table('web_forms')->select('id')->where('code', (string) $code));
        }
        foreach (['brand_id', 'web_form_id'] as $filter) {
            if (($value = $request->input("filter.{$filter}")) !== null && $value !== '') {
                if (! is_string($value) || ! Str::isUuid($value)) {
                    throw ProblemException::validation(["filter.{$filter}" => ['Identificador no válido.']]);
                }
                $query->where("web_form_submissions.{$filter}", $value);
            }
        }
        $q = trim((string) $request->input('q', ''));
        if ($q !== '') {
            $like = '%'.addcslashes(mb_strtolower($q), '%_\\').'%';
            $query->where(function ($w) use ($like): void {
                $w->whereRaw("lower(payload->>'name') LIKE ?", [$like])
                    ->orWhereRaw("lower(payload->>'email') LIKE ?", [$like])
                    ->orWhereRaw("lower(payload->>'company') LIKE ?", [$like]);
            });
        }

        return CursorPagination::respond($query, $request, ['created_at'], ModelResource::class);
    }

    /** Conteo por estado para el contador del menú y la cabecera de la bandeja. */
    public function summary(): JsonResponse
    {
        $counts = WebFormSubmission::query()->toBase()->select('status', DB::raw('count(*) as n'))->groupBy('status')->pluck('n', 'status');

        return response()->json(['data' => collect(WebFormSubmission::STATUSES)->mapWithKeys(fn (string $s) => [$s => (int) ($counts[$s] ?? 0)])->all()]);
    }

    public function show(string $id): ModelResource
    {
        return new ModelResource(WebFormSubmission::query()->withFormInfo()->findOrFail($id));
    }

    public function update(Request $request, string $id): ModelResource
    {
        $org = app(CurrentOrganization::class)->id();
        $data = $request->validate([
            'version' => ['required', 'integer'],
            'status' => ['required', Rule::in(['received', 'spam', 'routed'])],
            'lead_id' => ['nullable', 'uuid', Rule::exists('leads', 'id')->where('organization_id', $org)],
            'ticket_id' => ['nullable', 'uuid', Rule::exists('tickets', 'id')->where('organization_id', $org)],
        ], [], ['status' => 'estado', 'lead_id' => 'prospecto', 'ticket_id' => 'ticket']);
        if ($data['status'] === 'routed' && empty($data['lead_id']) && empty($data['ticket_id'])) {
            throw ProblemException::validation(['lead_id' => ['Para marcarla como derivada indica el prospecto o el ticket.']]);
        }

        $submission = WebFormSubmission::query()->findOrFail($id);

        DB::transaction(function () use ($submission, $data): void {
            VersionGuard::check($submission, (int) $data['version']);
            if ($submission->status === 'routed' && $data['status'] !== 'routed') {
                throw new ProblemException(409, 'conflict', 'Una solicitud ya derivada no cambia de estado.');
            }
            $before = $submission->only(self::AUDITED);
            $changes = ['status' => $data['status']];
            if ($data['status'] === 'routed') {
                $changes += [
                    'lead_id' => $data['lead_id'] ?? $submission->lead_id,
                    'ticket_id' => $data['ticket_id'] ?? $submission->ticket_id,
                    'routed_at' => $submission->routed_at ?? now(),
                    'last_error' => null,
                ];
            }
            $submission->forceFill($changes)->save();
            $action = match ($data['status']) {
                'spam' => 'web_form_submission.marked_spam',
                'routed' => 'web_form_submission.routed',
                default => 'web_form_submission.restored',
            };
            // Solo el estado: el contenido (datos personales del visitante) no va a la auditoría.
            $this->audit->record($action, 'web_form_submission', $submission->id, $before, $submission->refresh()->only(self::AUDITED), ['web_form_id' => $submission->web_form_id]);
        });

        return new ModelResource(WebFormSubmission::query()->withFormInfo()->findOrFail($id));
    }
}
