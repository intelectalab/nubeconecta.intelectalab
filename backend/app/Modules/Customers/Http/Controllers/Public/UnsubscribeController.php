<?php

declare(strict_types=1);

namespace App\Modules\Customers\Http\Controllers\Public;

use App\Modules\Customers\Models\Contact;
use App\Modules\Customers\Services\ConsentService;
use App\Modules\Customers\Support\UnsubscribeToken;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * POST /api/v1/public/communication-unsubscribes {token}: baja por el enlace
 * de los correos comerciales (sin sesión). El token es firmado (HMAC con la
 * APP_KEY) y lleva el contacto y la organización; un token inválido responde
 * igual que uno válido para no revelar contactos.
 */
final class UnsubscribeController
{
    public function __invoke(Request $request, ConsentService $consents, CurrentOrganization $organization): JsonResponse
    {
        $data = $request->validate(['token' => ['required', 'string', 'max:300']]);
        $payload = UnsubscribeToken::parse($data['token']);
        if ($payload !== null) {
            $organization->set($payload['organization_id']);
            $contact = Contact::query()->find($payload['contact_id']);
            if ($contact !== null) {
                $consents->record($contact, 'all', false, 'portal', ['via' => 'unsubscribe_link', 'ip' => $request->ip()]);
            }
        }

        return response()->json(['data' => ['status' => 'unsubscribed']], 202);
    }
}
