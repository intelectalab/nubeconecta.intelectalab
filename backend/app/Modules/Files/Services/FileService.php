<?php

declare(strict_types=1);

namespace App\Modules\Files\Services;

use App\Modules\Files\Models\File;
use App\Shared\Audit\AuditLogger;
use App\Shared\Concurrency\VersionGuard;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;

final class FileService
{
    /** @var array<string, array<string, mixed>> */
    public const ATTACHABLES = [
        'ticket' => [
            'table' => 'tickets',
            'soft_deletes' => true,
            'customer_column' => 'customer_id',
        ],
        'ticket_message' => [
            'table' => 'ticket_messages',
            'soft_deletes' => false,
            'parent_table' => 'tickets',
            'parent_key' => 'ticket_id',
            'parent_customer_column' => 'customer_id',
            'parent_soft_deletes' => true,
        ],
        'customer' => [
            'table' => 'customers',
            'soft_deletes' => true,
            'customer_column' => 'id',
        ],
    ];

    /** @var array<string, string> */
    private const EXTENSIONS = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
        'application/pdf' => 'pdf',
    ];

    public function __construct(
        private readonly AuditLogger $audit,
        private readonly CurrentOrganization $organization,
    ) {}

    /**
     * @param array{attachable_type?: ?string, attachable_id?: ?string, visibility?: string} $opts
     */
    public function upload(UploadedFile $file, array $opts = []): File
    {
        $mime = (string) $file->getMimeType();
        $whitelist = array_values((array) config('hub.files.mime_whitelist', array_keys(self::EXTENSIONS)));
        if (! in_array($mime, $whitelist, true) || ! isset(self::EXTENSIONS[$mime])) {
            throw ProblemException::validation(['file' => ['Tipo de archivo no permitido.']]);
        }

        $size = $file->getSize();
        $maxBytes = (int) config('hub.files.max_bytes', 10 * 1024 * 1024);
        if ($size === false || $size > $maxBytes) {
            throw ProblemException::validation(['file' => ['El archivo excede el tamaño máximo permitido.']]);
        }

        $attachableType = isset($opts['attachable_type']) ? (string) $opts['attachable_type'] : null;
        $attachableId = isset($opts['attachable_id']) ? (string) $opts['attachable_id'] : null;
        $visibility = $opts['visibility'] ?? 'internal';
        if (! in_array($visibility, ['internal', 'customer'], true)) {
            throw ProblemException::validation(['visibility' => ['Visibilidad no válida.']]);
        }
        $this->assertAttachableExists($attachableType, $attachableId);

        $disk = (string) config('hub.files.disk', env('FILES_DISK', 'local'));
        $organizationId = $this->organization->id();
        $pathType = $attachableType !== null && $attachableType !== '' ? $attachableType : 'misc';
        $path = sprintf('organizations/%s/%s/%s.%s', $organizationId, $pathType, (string) Str::uuid7(), self::EXTENSIONS[$mime]);
        $storage = Storage::disk($disk);
        $attemptedUpload = false;

        try {
            return DB::transaction(function () use ($file, $opts, $mime, $size, $disk, $path, $storage, $visibility, &$attemptedUpload): File {
                $realPath = $file->getRealPath();
                if ($realPath === false || $realPath === null) {
                    throw new RuntimeException('No se pudo leer el archivo subido.');
                }

                $stream = fopen($realPath, 'rb');
                if ($stream === false) {
                    throw new RuntimeException('No se pudo abrir el archivo subido.');
                }

                try {
                    $attemptedUpload = true;
                    if (! $storage->put($path, $stream, ['visibility' => 'private'])) {
                        throw new RuntimeException('No se pudo guardar el archivo.');
                    }
                } finally {
                    fclose($stream);
                }

                $checksum = hash_file('sha256', $realPath);
                if ($checksum === false) {
                    throw new RuntimeException('No se pudo calcular el checksum del archivo.');
                }

                $model = new File;
                $model->forceFill([
                    'disk' => $disk,
                    'path' => $path,
                    'original_name' => (string) $file->getClientOriginalName(),
                    'mime_type' => $mime,
                    'size_bytes' => (int) $size,
                    'checksum_sha256' => $checksum,
                    'scan_status' => 'pending',
                    'visibility' => $visibility,
                    'attachable_type' => $opts['attachable_type'] ?? null,
                    'attachable_id' => $opts['attachable_id'] ?? null,
                ])->save();

                $this->audit->record('file.uploaded', 'file', $model->id, null, $model->refresh()->attributesToArray());

                return $model;
            });
        } catch (Throwable $exception) {
            if ($attemptedUpload) {
                try {
                    $storage->delete($path);
                } catch (Throwable) {
                    // La excepción original explica el fallo de la operación.
                }
            }

            throw $exception;
        }
    }

    public function temporaryUrl(File $file, int $minutes = 5): string
    {
        $storage = Storage::disk((string) $file->disk);

        // s3 y el disco local (serve=true) firman la URL; la ruta de servido exige esa
        // firma, así que `url()` sin firmar daba 403. Solo un disco público (sin URLs
        // temporales) cae al enlace directo, que no necesita firma.
        try {
            return $storage->temporaryUrl($file->path, now()->addMinutes($minutes));
        } catch (\RuntimeException) {
            return $storage->url($file->path);
        }
    }

    public function delete(File $file, int $version): void
    {
        DB::transaction(function () use ($file, $version): void {
            $file = File::query()->lockForUpdate()->findOrFail($file->id);
            VersionGuard::check($file, $version);
            $before = $file->attributesToArray();
            // El binario se conserva en MVP para preservar evidencia; su retención se resolverá después.
            $file->delete();
            $this->audit->record('file.deleted', 'file', $file->id, $before, ['deleted' => true]);
        });
    }

    public function markScanned(File $file, string $status): File
    {
        if (! in_array($status, ['clean', 'infected', 'failed'], true)) {
            throw ProblemException::validation(['scan_status' => ['Estado de escaneo no válido.']]);
        }

        return DB::transaction(function () use ($file, $status): File {
            $file = File::query()->lockForUpdate()->findOrFail($file->id);
            $before = $file->attributesToArray();
            $file->forceFill(['scan_status' => $status])->save();
            $this->audit->record('file.scanned', 'file', $file->id, $before, $file->refresh()->attributesToArray());

            return $file;
        });
    }

    public function assertAttachableBelongsToCustomer(?string $type, ?string $id, string $customerId): void
    {
        $entity = $this->findAttachable($type, $id);
        if ($entity === null || $this->attachableCustomerId($type, $entity) !== $customerId) {
            throw ProblemException::notFound();
        }
    }

    private function assertAttachableExists(?string $type, ?string $id): void
    {
        if (($type === null) !== ($id === null) || $type === '' || $id === '') {
            throw ProblemException::validation(['attachable' => ['La entidad adjunta debe incluir tipo e identificador.']]);
        }

        if ($type === null) {
            return;
        }

        if (! array_key_exists($type, self::ATTACHABLES)) {
            throw ProblemException::validation(['attachable_type' => ['Tipo de entidad no permitido.']]);
        }

        if ($this->findAttachable($type, $id) === null) {
            throw ProblemException::validation(['attachable_id' => ['La entidad adjunta no existe en la organización actual.']]);
        }
    }

    private function findAttachable(?string $type, ?string $id): ?object
    {
        if ($type === null || $id === null || ! isset(self::ATTACHABLES[$type])) {
            return null;
        }

        $definition = self::ATTACHABLES[$type];
        $query = DB::table($definition['table'])
            ->where('id', $id)
            ->where('organization_id', $this->organization->id());
        if ($definition['soft_deletes']) {
            $query->whereNull('deleted_at');
        }

        return $query->first();
    }

    private function attachableCustomerId(?string $type, object $entity): ?string
    {
        if ($type === 'ticket' || $type === 'customer') {
            return (string) $entity->{self::ATTACHABLES[$type]['customer_column']};
        }

        if ($type !== 'ticket_message') {
            return null;
        }

        $ticket = DB::table('tickets')
            ->where('id', $entity->ticket_id)
            ->where('organization_id', $this->organization->id())
            ->whereNull('deleted_at')
            ->first();

        return $ticket === null ? null : (string) $ticket->customer_id;
    }
}
