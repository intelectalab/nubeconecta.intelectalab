<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Http\Controllers;

use App\Modules\Notifications\Http\Resources\UserNotificationResource;
use App\Modules\Notifications\Models\UserNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Feed in-app del usuario autenticado: cada quien ve y marca solo lo suyo (scope por user_id + organización). */
final class UserNotificationController
{
    public function index(Request $request): JsonResponse
    {
        $mine = fn () => UserNotification::query()->where('user_id', $request->user()->id);

        $items = $mine()->orderByDesc('created_at')->orderByDesc('id')->limit(50)->get();

        return response()->json([
            'data' => UserNotificationResource::collection($items)->resolve($request),
            'meta' => ['unread_count' => $mine()->whereNull('read_at')->count()],
        ]);
    }

    public function read(Request $request, string $id): JsonResponse
    {
        $n = UserNotification::query()->where('user_id', $request->user()->id)->findOrFail($id);
        if ($n->read_at === null) {
            $n->read_at = now();
            $n->save();
        }

        return response()->json(['data' => (new UserNotificationResource($n))->resolve($request)]);
    }

    public function readAll(Request $request): JsonResponse
    {
        $updated = UserNotification::query()->where('user_id', $request->user()->id)->whereNull('read_at')->update(['read_at' => now()]);

        return response()->json(['data' => ['updated' => $updated]]);
    }
}
