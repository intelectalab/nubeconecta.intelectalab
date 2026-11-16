<?php

declare(strict_types=1);

namespace App\Modules\Mail\Models;

use App\Modules\Domains\Models\Domain;
use App\Modules\Services\Models\Service;
use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/** Certificado SSL registrado a mano (sin emisión ni verificación en vivo). */
class SslCertificate extends Model
{
    use BelongsToOrganization, HasUuids, SoftDeletes, TracksVersionAndActor;

    public const KINDS = ['free_auto', 'paid'];

    public const RENEWAL_MODES = ['automatic', 'manual'];

    public const STATUSES = ['valid', 'expiring', 'expired', 'revoked', 'unknown'];

    public const INSTALLED_ON = ['server', 'hosting_account', 'cdn', 'load_balancer', 'other'];

    protected $table = 'ssl_certificates';

    protected $fillable = [
        'service_id', 'domain_id', 'common_name', 'covered_names', 'is_wildcard', 'issuer', 'kind', 'purchase_provider_account_id',
        'cost_minor', 'cost_currency', 'price_minor', 'currency', 'issued_at', 'expires_at', 'installed_on_type', 'installed_on_id',
        'renewal_mode', 'responsible_user_id', 'is_published', 'status',
    ];

    protected $attributes = ['version' => 1, 'status' => 'valid', 'renewal_mode' => 'manual', 'is_wildcard' => false, 'is_published' => true];

    protected function casts(): array
    {
        return [
            'issued_at' => 'date', 'expires_at' => 'date', 'is_wildcard' => 'boolean', 'is_published' => 'boolean',
            'last_checked_at' => 'datetime', 'version' => 'integer', 'cost_minor' => 'integer', 'price_minor' => 'integer',
        ];
    }

    /** Columna text[] de Postgres: se lee y escribe como lista PHP (los nombres son hostnames validados, sin comillas ni comas). */
    protected function coveredNames(): Attribute
    {
        return Attribute::make(
            get: static function (mixed $value): array {
                $raw = trim((string) $value, '{}');
                return $raw === '' ? [] : array_map(static fn (string $n): string => trim($n, '"'), explode(',', $raw));
            },
            set: static fn (mixed $value): string => '{'.implode(',', array_map(static fn ($n): string => '"'.str_replace(['\\', '"'], '', (string) $n).'"', (array) $value)).'}',
        );
    }

    public function domain(): BelongsTo { return $this->belongsTo(Domain::class)->withTrashed(); }
    public function service(): BelongsTo { return $this->belongsTo(Service::class); }
}
