<?php

declare(strict_types=1);

namespace App\Modules\Mail\Http\Controllers;

use App\Modules\Mail\Http\Resources\SslCertificateResource;
use App\Modules\Mail\Models\SslCertificate;
use App\Modules\Mail\Services\SslCertificateService;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

final class SslCertificateController
{
    public function __construct(private readonly SslCertificateService $certs) {}

    public function index(Request $request): JsonResponse
    {
        $query = SslCertificate::query()->with(SslCertificateService::relations());
        foreach (['domain_id', 'service_id'] as $column) {
            $value = $request->query($column);
            if (is_string($value) && Str::isUuid($value)) { $query->where($column, $value); }
        }
        $customer = $request->query('customer_id');
        if (is_string($customer) && Str::isUuid($customer)) {
            $query->where(fn (Builder $w) => $w->whereHas('domain', fn (Builder $d) => $d->where('customer_id', $customer))
                ->orWhereHas('service', fn (Builder $s) => $s->where('customer_id', $customer)));
        }
        foreach (['kind' => SslCertificate::KINDS, 'status' => SslCertificate::STATUSES, 'renewal_mode' => SslCertificate::RENEWAL_MODES] as $column => $allowed) {
            $value = $request->query($column);
            if (is_string($value) && in_array($value, $allowed, true)) { $query->where($column, $value); }
        }
        if ($request->boolean('expiring_30d')) {
            $query->whereBetween('expires_at', [now()->toDateString(), now()->addDays(30)->toDateString()]);
        }
        $search = $request->query('search');
        $search = is_string($search) ? trim($search) : '';
        if ($search !== '') {
            $like = '%'.addcslashes($search, '\\%_').'%';
            $query->where(fn (Builder $w) => $w->where('common_name', 'ilike', $like)->orWhere('issuer', 'ilike', $like)
                ->orWhereHas('domain', fn (Builder $d) => $d->where('name', 'ilike', $like)));
        }
        return CursorPagination::respond($query, $request, ['created_at', 'common_name', 'kind', 'status', 'expires_at'], SslCertificateResource::class, 'expires_at');
    }

    public function store(Request $request): JsonResponse
    {
        $this->lowercaseName($request);
        $cert = $this->certs->create($request->validate($this->certs->rules(null)));
        return (new SslCertificateResource($cert))->response()->setStatusCode(201);
    }

    public function show(string $id): SslCertificateResource
    {
        return new SslCertificateResource($this->certs->loaded(SslCertificate::query()->findOrFail($id)));
    }

    public function update(Request $request, string $id): SslCertificateResource
    {
        $cert = SslCertificate::query()->findOrFail($id);
        $this->lowercaseName($request);
        return new SslCertificateResource($this->certs->update($cert, $request->validate($this->certs->rules($cert))));
    }

    public function renew(Request $request, string $id): SslCertificateResource
    {
        $cert = SslCertificate::query()->findOrFail($id);
        $data = $request->validate(['days' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:825'], 'version' => ['required', 'integer', 'min:1']]);
        return new SslCertificateResource($this->certs->renew($cert, isset($data['days']) ? (int) $data['days'] : null, (int) $data['version']));
    }

    public function destroy(string $id): JsonResponse
    {
        $this->certs->delete(SslCertificate::query()->findOrFail($id));
        return response()->json(null, 204);
    }

    private function lowercaseName(Request $request): void
    {
        $name = $request->input('common_name');
        if (is_string($name)) { $request->merge(['common_name' => Str::lower(trim($name))]); }
    }
}
