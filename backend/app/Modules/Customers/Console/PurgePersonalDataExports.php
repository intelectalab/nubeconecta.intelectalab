<?php

declare(strict_types=1);

namespace App\Modules\Customers\Console;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

/** Elimina paquetes cifrados de privacidad que superaron su plazo de retención. */
final class PurgePersonalDataExports extends Command
{
    protected $signature = 'hub:privacy:purge-exports';

    protected $description = 'Elimina exportaciones de datos personales vencidas';

    public function handle(): int
    {
        $disk = Storage::disk('local');
        $directory = 'privacy-exports';
        $ttlDays = max(0, (int) config('hub.privacy.export_ttl_days', 7));
        $expiresAt = now()->subDays($ttlDays)->getTimestamp();
        $purged = 0;

        foreach ($disk->allFiles($directory) as $path) {
            if ($disk->lastModified($path) < $expiresAt) {
                $disk->delete($path);
                $purged++;
            }
        }

        $this->info("Exportaciones eliminadas: {$purged}");

        return self::SUCCESS;
    }
}
