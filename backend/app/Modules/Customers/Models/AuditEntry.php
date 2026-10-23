<?php

declare(strict_types=1);

namespace App\Modules\Customers\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** Lectura de `audit_events` para el historial del cliente (solo lectura; escribe AuditLogger). */
class AuditEntry extends Model
{
    use BelongsToOrganization, HasUuids;

    protected $table = 'audit_events';

    public $timestamps = false;

    protected $hidden = ['prev_hash', 'hash', 'ip', 'user_agent'];

    protected function casts(): array
    {
        return ['before' => 'array', 'after' => 'array', 'metadata' => 'array', 'occurred_at' => 'datetime', 'chain_seq' => 'integer'];
    }

    public function save(array $options = []): bool
    {
        throw new \LogicException('audit_events es de solo inserción (AuditLogger).');
    }
}
