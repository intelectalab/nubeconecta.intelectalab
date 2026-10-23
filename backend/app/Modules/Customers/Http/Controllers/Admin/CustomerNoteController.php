<?php

declare(strict_types=1);

namespace App\Modules\Customers\Http\Controllers\Admin;

use App\Modules\Customers\Models\Customer;
use App\Modules\Customers\Models\CustomerNote;
use App\Shared\Audit\AuditLogger;
use App\Shared\Concurrency\VersionGuard;
use App\Shared\Http\Resources\ModelResource;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;

/** Notas internas del cliente (customers.customer_note.*). Nunca viajan al portal. */
final class CustomerNoteController
{
    public function __construct(private readonly AuditLogger $audit) {}

    public function index(Request $request, string $customerId): JsonResponse
    {
        $customer = Customer::query()->findOrFail($customerId);

        return CursorPagination::respond(CustomerNote::query()->where('customer_id', $customer->id), $request, ['created_at', 'is_pinned'], ModelResource::class, '-is_pinned,-created_at');
    }

    public function store(Request $request, string $customerId): JsonResponse
    {
        $customer = Customer::query()->findOrFail($customerId);
        $data = $request->validate(['body' => ['required', 'string', 'max:10000'], 'is_pinned' => ['sometimes', 'boolean']]);
        $note = DB::transaction(function () use ($customer, $data): CustomerNote {
            $note = new CustomerNote;
            $note->forceFill(['customer_id' => $customer->id, 'body' => $data['body'], 'is_pinned' => (bool) ($data['is_pinned'] ?? false)])->save();
            $this->audit->record('customer_note.created', 'customer_note', $note->id, null, ['is_pinned' => $note->is_pinned], [], $customer->id);

            return $note;
        });

        return (new ModelResource($note->refresh()))->response()->setStatusCode(201);
    }

    public function update(Request $request, string $id): ModelResource
    {
        $note = CustomerNote::query()->findOrFail($id);
        $data = $request->validate(['version' => ['required', 'integer'], 'body' => ['sometimes', 'string', 'max:10000'], 'is_pinned' => ['sometimes', 'boolean']]);
        DB::transaction(function () use ($note, $data): void {
            VersionGuard::check($note, (int) $data['version']);
            $before = $note->only(['body', 'is_pinned']);
            $note->forceFill(array_intersect_key($data, array_flip(['body', 'is_pinned'])))->save();
            $this->audit->record('customer_note.updated', 'customer_note', $note->id, $before, $note->only(['body', 'is_pinned']), [], $note->customer_id);
        });

        return new ModelResource($note->refresh());
    }

    public function destroy(string $id): Response
    {
        $note = CustomerNote::query()->findOrFail($id);
        DB::transaction(function () use ($note): void {
            $note->delete();
            $this->audit->record('customer_note.deleted', 'customer_note', $note->id, null, null, [], $note->customer_id);
        });

        return response()->noContent();
    }
}
