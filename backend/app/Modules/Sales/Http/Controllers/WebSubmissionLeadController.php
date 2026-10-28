<?php

declare(strict_types=1);

namespace App\Modules\Sales\Http\Controllers;

use App\Modules\Sales\Services\LeadService;
use Illuminate\Http\JsonResponse;

/** POST /admin/web-connector/form-submissions/{id}/lead: «Convertir en prospecto» de la bandeja Solicitudes web. */
final class WebSubmissionLeadController
{
    public function __invoke(string $id, LeadService $leads): JsonResponse
    {
        $result = $leads->fromSubmission($id);

        return response()->json(['data' => ['lead_id' => $result['lead']->id, 'code' => $result['lead']->code, 'created' => $result['created']]], $result['created'] ? 201 : 200);
    }
}
