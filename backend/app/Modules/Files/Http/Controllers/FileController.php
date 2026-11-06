<?php

declare(strict_types=1);

namespace App\Modules\Files\Http\Controllers;

use App\Modules\Files\Http\Resources\FileResource;
use App\Modules\Files\Models\File;
use App\Modules\Files\Services\FileService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class FileController
{
    public function __construct(private readonly FileService $files) {}

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'file' => ['required', 'file'],
            'attachable_type' => ['sometimes', 'nullable', 'string', 'max:100'],
            'attachable_id' => ['sometimes', 'nullable', 'uuid'],
            'visibility' => ['sometimes', Rule::in(['internal', 'customer'])],
        ]);

        /** @var \Illuminate\Http\UploadedFile $uploaded */
        $uploaded = $request->file('file');
        $file = $this->files->upload($uploaded, [
            'attachable_type' => $data['attachable_type'] ?? null,
            'attachable_id' => $data['attachable_id'] ?? null,
            'visibility' => $data['visibility'] ?? 'internal',
        ]);

        return (new FileResource($file))->response()->setStatusCode(201);
    }

    public function show(string $id): FileResource
    {
        $file = File::query()->findOrFail($id);
        $file->setAttribute('temporary_url', $this->files->temporaryUrl($file));

        return new FileResource($file);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $data = $request->validate(['version' => ['required', 'integer']]);
        $this->files->delete(File::query()->findOrFail($id), (int) $data['version']);

        return response()->json(null, 204);
    }
}
