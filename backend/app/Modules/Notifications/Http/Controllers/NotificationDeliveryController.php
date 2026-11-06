<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Http\Controllers;

use App\Modules\Notifications\Http\Resources\NotificationDeliveryResource;
use App\Modules\Notifications\Models\NotificationDelivery;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class NotificationDeliveryController
{
    public function index(Request $request): JsonResponse
    {
        $request->validate(['filter.event' => ['sometimes','string','max:160'], 'filter.channel' => ['sometimes',Rule::in(['email','portal','whatsapp'])], 'filter.customer_id' => ['sometimes','nullable','uuid'], 'filter.entity_type' => ['sometimes','nullable','string','max:100'], 'filter.entity_id' => ['sometimes','nullable','uuid'], 'filter.from' => ['sometimes','date'], 'filter.to' => ['sometimes','date','after_or_equal:filter.from']]);
        $query = NotificationDelivery::query();
        foreach (['event','channel','customer_id','entity_type','entity_id'] as $column) if ($request->exists("filter.$column")) $query->where($column, $request->input("filter.$column"));
        if ($request->filled('filter.from')) $query->where('created_at', '>=', $request->input('filter.from'));
        if ($request->filled('filter.to')) $query->where('created_at', '<=', $request->input('filter.to'));
        $q = trim((string) $request->query('q', ''));
        if ($q !== '') $query->where(fn (Builder $builder) => $builder->where('event', 'ilike', "%{$q}%"));
        return CursorPagination::respond($query, $request, ['created_at','event','channel'], NotificationDeliveryResource::class);
    }

    public function show(string $id): NotificationDeliveryResource
    {
        return new NotificationDeliveryResource(NotificationDelivery::query()->with('events')->findOrFail($id));
    }
}
