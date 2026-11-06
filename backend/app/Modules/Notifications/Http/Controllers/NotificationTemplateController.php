<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Http\Controllers;

use App\Modules\Notifications\Http\Resources\NotificationTemplateResource;
use App\Modules\Notifications\Models\NotificationTemplate;
use App\Modules\Notifications\Services\NotificationTemplateService;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class NotificationTemplateController
{
    public function __construct(private readonly NotificationTemplateService $templates) {}

    public function index(Request $request): JsonResponse
    {
        $request->validate(['filter.channel' => ['sometimes', Rule::in(['email','portal','whatsapp'])], 'filter.category' => ['sometimes', Rule::in(['notice','canned_reply','complaint_response','form_confirmation'])], 'filter.is_active' => ['sometimes','boolean'], 'q' => ['sometimes','nullable','string','max:100']]);
        $query = NotificationTemplate::query();
        foreach (['channel', 'category', 'is_active'] as $column) if ($request->exists("filter.$column")) $query->where($column, $request->input("filter.$column"));
        $q = trim((string) $request->query('q', ''));
        if ($q !== '') $query->where(fn (Builder $builder) => $builder->where('code', 'ilike', "%{$q}%"));
        return CursorPagination::respond($query, $request, ['created_at','updated_at','code','category','channel'], NotificationTemplateResource::class);
    }

    public function store(Request $request): JsonResponse
    {
        $template = $this->templates->create($request->validate($this->templates->rules()));
        return (new NotificationTemplateResource($template))->response()->setStatusCode(201);
    }

    public function show(string $id): NotificationTemplateResource { return new NotificationTemplateResource(NotificationTemplate::query()->findOrFail($id)); }

    public function update(Request $request, string $id): NotificationTemplateResource
    {
        $data = $request->validate(['version' => ['required','integer']] + $this->templates->rules(true));
        return new NotificationTemplateResource($this->templates->update(NotificationTemplate::query()->findOrFail($id), $data));
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $data = $request->validate(['version' => ['required','integer']]);
        $this->templates->delete(NotificationTemplate::query()->findOrFail($id), (int) $data['version']);
        return response()->json(null, 204);
    }
}
