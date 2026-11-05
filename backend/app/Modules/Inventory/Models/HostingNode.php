<?php

declare(strict_types=1);

namespace App\Modules\Inventory\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class HostingNode extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    protected $table = 'hosting_nodes';
    protected $fillable = ['resource_id', 'kind', 'server_id', 'panel', 'hostname', 'ip', 'disk_quota_mb', 'disk_used_mb', 'accounts_limit', 'accounts_used', 'accepts_new_accounts', 'capacity_thresholds', 'cpanel_license_tier'];
    protected $attributes = ['panel' => 'whm', 'status' => 'active', 'accepts_new_accounts' => true, 'version' => 1];
    protected function casts(): array { return ['disk_quota_mb' => 'integer', 'disk_used_mb' => 'integer', 'accounts_limit' => 'integer', 'accounts_used' => 'integer', 'accepts_new_accounts' => 'boolean', 'capacity_thresholds' => 'array', 'last_synced_at' => 'datetime', 'version' => 'integer']; }
    public function resource(): BelongsTo { return $this->belongsTo(Resource::class); }
    public function server(): BelongsTo { return $this->belongsTo(Server::class); }
}
