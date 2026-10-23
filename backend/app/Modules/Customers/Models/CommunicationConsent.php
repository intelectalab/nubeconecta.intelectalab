<?php

declare(strict_types=1);

namespace App\Modules\Customers\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** Tabla canónica `communication_consents`: solo se agrega; la última fila manda (M-CUS §3). */
class CommunicationConsent extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    public const CHANNELS = ['all', 'email', 'whatsapp', 'sms', 'phone'];

    public const SOURCES = ['portal', 'form', 'elastic_email', 'whatsapp', 'manual', 'import', 'checkout'];

    protected $table = 'communication_consents';

    /** Microsegundos: "la última fila manda" necesita un orden estricto entre filas del mismo segundo. */
    protected $dateFormat = 'Y-m-d H:i:s.uP';

    protected $fillable = ['contact_id', 'lead_id', 'email', 'phone', 'channel', 'purpose', 'granted', 'source', 'evidence', 'recorded_at'];

    protected $attributes = ['version' => 1, 'evidence' => '{}', 'purpose' => 'marketing'];

    protected function casts(): array
    {
        return ['granted' => 'boolean', 'evidence' => 'array', 'recorded_at' => 'datetime', 'version' => 'integer'];
    }
}
