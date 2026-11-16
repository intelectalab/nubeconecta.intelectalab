<?php

declare(strict_types=1);

namespace App\Modules\Mail\Http\Controllers;

use App\Modules\Mail\Http\Resources\MailDnsCheckResource;
use App\Modules\Mail\Http\Resources\MailServiceResource;
use App\Modules\Mail\Models\MailDnsCheck;
use App\Modules\Mail\Models\MailService;
use App\Modules\Mail\Services\MailManager;
use App\Modules\Mail\Services\SslCertificateService;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

final class MailServiceController
{
    public function __construct(private readonly MailManager $mail, private readonly SslCertificateService $ssl) {}

    public function index(Request $request): JsonResponse
    {
        $query = MailService::query()->with(MailManager::relations());
        // Los filtros inválidos (uuid mal formado, enum desconocido) se ignoran, no rompen.
        foreach (['domain_id', 'service_id'] as $column) {
            $value = $request->query($column);
            if (is_string($value) && Str::isUuid($value)) { $query->where($column, $value); }
        }
        $customer = $request->query('customer_id');
        if (is_string($customer) && Str::isUuid($customer)) {
            $query->whereHas('domain', fn (Builder $d) => $d->where('customer_id', $customer));
        }
        foreach (['provider_kind' => MailService::PROVIDER_KINDS, 'status' => MailService::STATUSES, 'account_owner' => MailService::OWNERS] as $column => $allowed) {
            $value = $request->query($column);
            if (is_string($value) && in_array($value, $allowed, true)) { $query->where($column, $value); }
        }
        if ($request->boolean('with_difference')) {
            $query->whereNotNull('seats_used')->whereNotNull('seats_billed')->whereColumn('seats_used', '<>', 'seats_billed');
        }
        if ($request->boolean('renewing_30d')) {
            $query->whereBetween('renewal_date', [now()->toDateString(), now()->addDays(30)->toDateString()]);
        }
        $search = $request->query('search');
        $search = is_string($search) ? trim($search) : '';
        if ($search !== '') {
            $like = '%'.addcslashes($search, '\\%_').'%';
            $query->where(fn (Builder $w) => $w->where('plan', 'ilike', $like)->orWhere('tenant_id', 'ilike', $like)
                ->orWhereHas('domain', fn (Builder $d) => $d->where('name', 'ilike', $like)
                    ->orWhereHas('customer', fn (Builder $c) => $c->where('legal_name', 'ilike', $like)->orWhere('trade_name', 'ilike', $like))));
        }
        return CursorPagination::respond($query, $request, ['created_at', 'provider_kind', 'status', 'renewal_date', 'seats_used', 'seats_billed'], MailServiceResource::class, 'renewal_date');
    }

    /** Tiles de las dos pestañas: licencias de correo y certificados SSL. */
    public function summary(): JsonResponse
    {
        return response()->json(['data' => ['mail' => $this->mail->summary(), 'ssl' => $this->ssl->summary()]]);
    }

    public function store(Request $request): JsonResponse
    {
        $mail = $this->mail->create($request->validate($this->mail->rules(null)));
        return (new MailServiceResource($mail))->response()->setStatusCode(201);
    }

    public function show(string $id): MailServiceResource
    {
        return new MailServiceResource($this->mail->loaded(MailService::query()->findOrFail($id)));
    }

    public function update(Request $request, string $id): MailServiceResource
    {
        $mail = MailService::query()->findOrFail($id);
        return new MailServiceResource($this->mail->update($mail, $request->validate($this->mail->rules($mail))));
    }

    public function destroy(string $id): JsonResponse
    {
        $this->mail->delete(MailService::query()->findOrFail($id));
        return response()->json(null, 204);
    }

    /** Verificaciones DNS del servicio (solo lectura). El servicio se resuelve antes por el scope de organización. */
    public function dnsChecks(Request $request, string $id): JsonResponse
    {
        $mail = MailService::query()->findOrFail($id);
        $query = MailDnsCheck::query()->where('mail_service_id', $mail->id);
        $type = $request->query('record_type');
        if (is_string($type) && in_array($type, MailDnsCheck::RECORD_TYPES, true)) { $query->where('record_type', $type); }
        $result = $request->query('result');
        if (is_string($result) && in_array($result, MailDnsCheck::RESULTS, true)) { $query->where('result', $result); }
        return CursorPagination::respond($query, $request, ['checked_at', 'record_type', 'result'], MailDnsCheckResource::class, '-checked_at');
    }
}
