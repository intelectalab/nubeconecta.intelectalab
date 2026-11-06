<?php

declare(strict_types=1);

namespace App\Modules\Files\Http\Controllers\Portal;

use App\Modules\Customers\Support\PortalCustomer;
use App\Modules\Files\Http\Resources\Portal\PortalFileResource;
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
        $customerId = PortalCustomer::id($request);
        $data = $request->validate([
            'file' => ['required', 'file'],
            'attachable_type' => ['required', 'string', 'max:100'],
            'attachable_id' => ['required', 'uuid'],
            'visibility' => ['sometimes', Rule::in(['internal', 'customer'])],
        ]);

        $this->files->assertAttachableBelongsToCustomer($data['attachable_type'], $data['attachable_id'], $customerId);
        /** @var \Illuminate\Http\UploadedFile $uploaded */
        $uploaded = $request->file('file');
        $file = $this->files->upload($uploaded, [
            'attachable_type' => $data['attachable_type'],
            'attachable_id' => $data['attachable_id'],
            // El portal nunca puede cambiar este valor a internal.
            'visibility' => 'customer',
        ]);
        $file->setAttribute('temporary_url', $this->files->temporaryUrl($file));

        return (new PortalFileResource($file))->response()->setStatusCode(201);
    }

    public function show(Request $request, string $id): PortalFileResource
    {
        $customerId = PortalCustomer::id($request);
        // La visibilidad forma parte del lookup para que un archivo interno responda 404.
        $file = File::query()->where('visibility', 'customer')->findOrFail($id);
        $this->files->assertAttachableBelongsToCustomer($file->attachable_type, $file->attachable_id, $customerId);
        $file->setAttribute('temporary_url', $this->files->temporaryUrl($file));

        return new PortalFileResource($file);
    }
}
