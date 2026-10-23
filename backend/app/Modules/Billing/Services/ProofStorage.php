<?php

declare(strict_types=1);

namespace App\Modules\Billing\Services;

use App\Modules\Billing\Models\StoredFile;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Constancias de pago (vouchers) en la tabla `files` (docs/10 §Archivos): tipo
 * verificado por contenido y tamaño máximo (`hub.billing.proofs`), disco
 * privado fuera del directorio público, ruta con organization_id y nombre
 * aleatorio; el nombre original solo se guarda como dato. El antivirus en cola
 * queda pendiente (scan_status = pending).
 */
final class ProofStorage
{
    public function __construct(private readonly CurrentOrganization $organization) {}

    /** @return list<string> */
    public static function rules(bool $required): array
    {
        $mimes = (array) config('hub.billing.proofs.mimes', ['pdf', 'jpg', 'jpeg', 'png']);

        return [$required ? 'required' : 'nullable', 'file', 'mimes:'.implode(',', $mimes), 'max:'.(int) config('hub.billing.proofs.max_kb', 5120)];
    }

    /** Guarda el archivo; devuelve la fila de `files` (sin enlazar todavía al pago). */
    public function store(UploadedFile $file): StoredFile
    {
        $disk = (string) config('hub.billing.proofs.disk', 'local');
        $ext = strtolower((string) ($file->guessExtension() ?: 'bin'));
        $name = Str::uuid()->toString().'.'.$ext;
        $dir = $this->organization->id().'/payment-proofs/'.now()->format('Y/m');
        Storage::disk($disk)->putFileAs($dir, $file, $name);
        $original = preg_replace('/[^\pL\pN._ -]+/u', '_', (string) $file->getClientOriginalName()) ?: $name;

        $stored = new StoredFile;
        $stored->forceFill([
            'disk' => $disk, 'path' => "{$dir}/{$name}", 'original_name' => mb_substr($original, 0, 200),
            'mime_type' => (string) ($file->getMimeType() ?: 'application/octet-stream'), 'size_bytes' => (int) $file->getSize(),
            'checksum_sha256' => hash_file('sha256', (string) $file->getRealPath()) ?: null, 'visibility' => 'customer', 'attachable_type' => 'payment',
        ])->save();

        return $stored;
    }

    /** Borra el archivo físico (rollback de la operación que lo subió). */
    public function discard(StoredFile $file): void
    {
        Storage::disk($file->disk)->delete($file->path);
    }

    public function download(StoredFile $file): StreamedResponse
    {
        $ext = pathinfo($file->path, PATHINFO_EXTENSION);

        return Storage::disk($file->disk)->download($file->path, 'constancia-'.substr($file->id, 0, 8).'.'.$ext, [
            'Content-Type' => $file->mime_type, 'X-Content-Type-Options' => 'nosniff', 'Cache-Control' => 'private, no-store',
            'Content-Security-Policy' => "default-src 'none'",
        ]);
    }
}
