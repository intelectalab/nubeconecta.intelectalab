<?php

declare(strict_types=1);

namespace App\Modules\Inventory\Models;

use App\Modules\Customers\Models\Customer;
use App\Modules\Services\Models\Service;
use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class HostingAccount extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    protected $table = 'hosting_accounts';
    protected $fillable = ['hosting_node_id', 'resource_id', 'username', 'primary_domain', 'disk_quota_mb', 'disk_used_mb', 'service_id', 'customer_id'];
    protected $attributes = ['status' => 'active', 'version' => 1];
    protected function casts(): array { return ['disk_quota_mb' => 'integer', 'disk_used_mb' => 'integer', 'last_synced_at' => 'datetime', 'version' => 'integer']; }
    public function hostingNode(): BelongsTo { return $this->belongsTo(HostingNode::class); }
    public function resource(): BelongsTo { return $this->belongsTo(Resource::class); }
    public function service(): BelongsTo { return $this->belongsTo(Service::class); }
    public function customer(): BelongsTo { return $this->belongsTo(Customer::class); }
}
