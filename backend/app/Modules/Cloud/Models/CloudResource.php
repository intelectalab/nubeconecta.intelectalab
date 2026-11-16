<?php

declare(strict_types=1);

namespace App\Modules\Cloud\Models;

use App\Modules\Customers\Models\Customer;
use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Recurso descubierto por API: solo lectura en el MVP (sin endpoints de escritura). */
class CloudResource extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    public const KINDS = ['server', 'database', 'storage', 'dns', 'network', 'load_balancer', 'other'];

    public const STATUSES = ['active', 'stopped', 'terminated', 'not_found'];

    protected $table = 'cloud_resources';

    protected $guarded = ['*'];

    protected function casts(): array
    {
        return ['tags' => 'array', 'is_shared' => 'boolean', 'monthly_cost_minor' => 'integer', 'last_synced_at' => 'datetime', 'version' => 'integer'];
    }

    public function project(): BelongsTo { return $this->belongsTo(CloudProject::class, 'cloud_project_id'); }
    public function customer(): BelongsTo { return $this->belongsTo(Customer::class, 'assigned_customer_id'); }
}
