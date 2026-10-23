<?php

declare(strict_types=1);

namespace App\Modules\WebConnector\Models;

use App\Modules\Brands\Models\Brand;
use App\Modules\WebConnector\Casts\PgTextArray;
use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Tabla canónica `wp_sites`. El estado solo cambia por activate/disable; el
 * secreto de firma vive cifrado en `secrets` (owner_type wp_site) y nunca se expone.
 */
class WpSite extends Model
{
    use BelongsToOrganization, HasUuids, SoftDeletes, TracksVersionAndActor;

    protected $table = 'wp_sites';

    protected $fillable = ['brand_id', 'name', 'base_url', 'network_site_id', 'webhook_url', 'allowed_origins', 'thank_you_url'];

    protected $hidden = ['webhook_secret_id'];

    protected $appends = ['has_webhook_secret'];

    protected $attributes = ['version' => 1, 'status' => 'pending', 'allowed_origins' => '{}'];

    protected function casts(): array
    {
        return [
            'allowed_origins' => PgTextArray::class,
            'network_site_id' => 'integer',
            'last_seen_at' => 'datetime',
            'last_invalidation_at' => 'datetime',
            'version' => 'integer',
        ];
    }

    public function getHasWebhookSecretAttribute(): bool
    {
        return $this->webhook_secret_id !== null;
    }

    public function brand(): BelongsTo
    {
        return $this->belongsTo(Brand::class);
    }

    public function tokens(): HasMany
    {
        return $this->hasMany(WpSiteToken::class);
    }
}
