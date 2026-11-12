<?php

declare(strict_types=1);

namespace App\Modules\Domains\Http\Controllers;

use App\Modules\Domains\Http\Resources\DomainResource;
use App\Modules\Domains\Models\Domain;
use App\Modules\Domains\Services\DomainService;
use App\Shared\Contracts\AccessControl;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

final class DomainController
{
    public function __construct(private readonly DomainService $domains) {}

    public function index(Request $request): JsonResponse
    {
        $query = Domain::query()->with(DomainService::relations());
        // Los filtros inválidos (uuid mal formado, enum desconocido) se ignoran, no rompen.
        foreach (['provider_account_id', 'customer_id'] as $column) {
            $value = $request->query($column);
            if (is_string($value) && Str::isUuid($value)) { $query->where($column, $value); }
        }
        $holder = $request->query('holder');
        if (is_string($holder) && in_array($holder, Domain::HOLDERS, true)) { $query->where('holder', $holder); }
        $status = $request->query('status');
        if (is_string($status) && in_array($status, Domain::STATUSES, true)) { $query->where('status', $status); }
        if ($request->boolean('expiring_30d')) {
            $query->whereBetween('registry_expires_at', [now()->toDateString(), now()->addDays(30)->toDateString()]);
        }
        $search = $request->query('search');
        $search = is_string($search) ? trim($search) : '';
        if ($search !== '') {
            $like = '%'.addcslashes($search, '\\%_').'%';
            $query->where(fn (Builder $w) => $w->where('name', 'ilike', $like)
                ->orWhereHas('customer', fn (Builder $c) => $c->where('legal_name', 'ilike', $like)->orWhere('trade_name', 'ilike', $like)));
        }
        return CursorPagination::respond($query, $request, ['created_at', 'name', 'tld', 'status', 'registry_expires_at'], DomainResource::class, 'registry_expires_at');
    }

    public function summary(): JsonResponse
    {
        return response()->json(['data' => $this->domains->summary()]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->lowercaseName($request);
        $domain = $this->domains->create($request->validate($this->domains->rules(null)));
        return (new DomainResource($domain))->response()->setStatusCode(201);
    }

    public function show(Request $request, AccessControl $access, string $id): DomainResource
    {
        $domain = $this->domains->loaded(Domain::query()->findOrFail($id));
        // Los contactos solo se incluyen con su propio permiso de lectura.
        if ($access->allows($request->user(), 'domains.domain_contact.view')) { $domain->load('contacts'); }
        return new DomainResource($domain);
    }

    public function update(Request $request, string $id): DomainResource
    {
        $domain = Domain::query()->findOrFail($id);
        $this->lowercaseName($request);
        return new DomainResource($this->domains->update($domain, $request->validate($this->domains->rules($domain))));
    }

    public function renew(Request $request, string $id): DomainResource
    {
        $domain = Domain::query()->findOrFail($id);
        $data = $request->validate(['years' => ['required', 'integer', 'min:1', 'max:10'], 'version' => ['required', 'integer', 'min:1']]);
        return new DomainResource($this->domains->renew($domain, (int) $data['years'], (int) $data['version']));
    }

    public function destroy(string $id): JsonResponse
    {
        $this->domains->delete(Domain::query()->findOrFail($id));
        return response()->json(null, 204);
    }

    /** El nombre se normaliza antes de validar para que la unicidad no distinga mayúsculas. */
    private function lowercaseName(Request $request): void
    {
        $name = $request->input('name');
        if (is_string($name)) { $request->merge(['name' => Str::lower(trim($name))]); }
    }
}
