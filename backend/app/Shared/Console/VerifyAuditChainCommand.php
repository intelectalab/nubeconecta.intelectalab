<?php

declare(strict_types=1);

namespace App\Shared\Console;

use App\Shared\Audit\AuditLogger;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

final class VerifyAuditChainCommand extends Command
{
    protected $signature = 'hub:audit:verify {--organization= : UUID de la organización (por defecto todas)}';

    protected $description = 'Verifica la cadena de hash de audit_events y reporta el primer eslabón alterado';

    public function handle(AuditLogger $audit): int
    {
        $ids = $this->option('organization')
            ? [(string) $this->option('organization')]
            : DB::table('organizations')->pluck('id')->map(fn ($id) => (string) $id)->all();

        $failed = false;
        foreach ($ids as $id) {
            $broken = $audit->verify($id);
            if ($broken === null) {
                $this->info("Organización {$id}: cadena íntegra.");
            } else {
                $failed = true;
                $this->error("Organización {$id}: cadena alterada desde chain_seq {$broken}.");
            }
        }

        return $failed ? self::FAILURE : self::SUCCESS;
    }
}
