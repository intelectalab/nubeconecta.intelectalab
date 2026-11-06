<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Http\Controllers;

use App\Modules\Notifications\Http\Resources\NotificationDeliveryResource;
use App\Modules\Notifications\Services\NotificationService;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

final class NotificationTestController
{
    public function __construct(private readonly NotificationService $notifications) {}

    public function __invoke(Request $request): NotificationDeliveryResource
    {
        $data = $request->validate(['template_code' => ['required','string','max:160'], 'to' => ['required','email','max:320']]);
        return new NotificationDeliveryResource($this->notifications->send([
            'event' => 'manual.test', 'template_code' => $data['template_code'], 'recipient_address' => $data['to'],
            'dedupe_key' => 'manual-test:'.Str::uuid(), 'is_manual' => true, 'variables' => [],
        ]));
    }
}
