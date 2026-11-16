<?php

declare(strict_types=1);

namespace App\Modules\Mail\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Resultado de una verificación DNS (MX/SPF/DKIM/DMARC). En el MVP es solo lectura. */
class MailDnsCheck extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    public const RECORD_TYPES = ['MX', 'SPF', 'DKIM', 'DMARC'];

    public const RESULTS = ['ok', 'missing', 'changed', 'invalid'];

    protected $table = 'mail_dns_checks';

    protected $fillable = ['mail_service_id', 'record_type', 'expected', 'observed', 'result', 'checked_at'];

    protected $attributes = ['version' => 1];

    protected function casts(): array
    {
        return ['checked_at' => 'datetime', 'version' => 'integer'];
    }

    public function mailService(): BelongsTo { return $this->belongsTo(MailService::class); }
}
