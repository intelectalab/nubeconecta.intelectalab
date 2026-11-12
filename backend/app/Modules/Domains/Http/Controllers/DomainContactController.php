<?php

declare(strict_types=1);

namespace App\Modules\Domains\Http\Controllers;

use App\Modules\Domains\Http\Resources\DomainContactResource;
use App\Modules\Domains\Models\Domain;
use App\Modules\Domains\Services\DomainService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Contactos por rol de un dominio. El dominio se resuelve siempre primero por el scope de organización. */
final class DomainContactController
{
    public function __construct(private readonly DomainService $domains) {}

    public function index(string $id): JsonResponse
    {
        $domain = Domain::query()->findOrFail($id);
        return DomainContactResource::collection($domain->contacts()->get())->response();
    }

    public function store(Request $request, string $id): JsonResponse
    {
        $domain = Domain::query()->findOrFail($id);
        $contact = $this->domains->createContact($domain, $request->validate($this->domains->contactRules($domain, null)));
        return (new DomainContactResource($contact))->response()->setStatusCode(201);
    }

    public function update(Request $request, string $id, string $contact): DomainContactResource
    {
        $domain = Domain::query()->findOrFail($id);
        $model = $domain->contacts()->findOrFail($contact);
        return new DomainContactResource($this->domains->updateContact($domain, $model, $request->validate($this->domains->contactRules($domain, $model))));
    }

    public function destroy(string $id, string $contact): JsonResponse
    {
        $domain = Domain::query()->findOrFail($id);
        $this->domains->deleteContact($domain, $domain->contacts()->findOrFail($contact));
        return response()->json(null, 204);
    }
}
