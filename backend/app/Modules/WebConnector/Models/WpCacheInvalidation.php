<?php

declare(strict_types=1);

namespace App\Modules\WebConnector\Models;

use App\Modules\WebConnector\Casts\PgTextArray;
use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** Tabla canónica `wp_cache_invalidations`: un aviso por sitio y event_id, con sus intentos. */
class WpCacheInvalidation extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    public const SCOPES = ['catalog', 'plan', 'bundle', 'domain_prices', 'promotion', 'contact', 'legal_document', 'form', 'service_status', 'all'];

    public const TEST_TRIGGER = 'wp_site.webhook_test';

    protected $table = 'wp_cache_invalidations';

    protected $fillable = ['wp_site_id', 'event_id', 'scope', 'keys', 'trigger_event', 'requested_by'];

    protected $attributes = ['version' => 1, 'status' => 'pending', 'attempts' => 0, 'keys' => '{}'];

    protected function casts(): array
    {
        return [
            'keys' => PgTextArray::class,
            'attempts' => 'integer',
            'response_status' => 'integer',
            'next_retry_at' => 'datetime',
            'delivered_at' => 'datetime',
            'version' => 'integer',
        ];
    }
}
