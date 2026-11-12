<?php

declare(strict_types=1);

namespace App\Modules\Domains\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Contacto del dominio por rol (titular, administrativo, técnico, facturación); único por (dominio, rol). */
class DomainContact extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    public const ROLES = ['registrant', 'admin', 'tech', 'billing'];

    protected $table = 'domain_contacts';

    protected $fillable = ['role', 'name', 'company', 'email', 'phone', 'address'];

    protected $attributes = ['version' => 1, 'address' => '{}'];

    protected function casts(): array
    {
        return ['address' => 'array', 'synced_at' => 'datetime', 'version' => 'integer'];
    }

    public function domain(): BelongsTo { return $this->belongsTo(Domain::class); }
}
