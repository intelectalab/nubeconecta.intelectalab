<?php

declare(strict_types=1);

namespace App\Modules\WebConnector\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Tabla canónica `wp_site_tokens`: solo el hash; un revocado no se reactiva (trigger). */
class WpSiteToken extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    protected $table = 'wp_site_tokens';

    protected $fillable = ['name'];

    protected $hidden = ['token_hash', 'last_used_ip_hash'];

    protected $attributes = ['version' => 1, 'scope' => 'read'];

    protected function casts(): array
    {
        return ['expires_at' => 'datetime', 'last_used_at' => 'datetime', 'revoked_at' => 'datetime', 'version' => 'integer'];
    }

    public function site(): BelongsTo
    {
        return $this->belongsTo(WpSite::class, 'wp_site_id');
    }

    public function scopeUsable(Builder $query): Builder
    {
        return $query->whereNull('revoked_at')->where(fn (Builder $q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()));
    }
}
