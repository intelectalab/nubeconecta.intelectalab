<?php

declare(strict_types=1);

namespace App\Modules\Cloud\Http\Controllers;

use App\Modules\Cloud\Services\CloudService;
use Illuminate\Http\JsonResponse;

final class CloudSummaryController
{
    public function __invoke(CloudService $cloud): JsonResponse
    {
        return response()->json(['data' => $cloud->summary()]);
    }
}
