<?php

declare(strict_types=1);

namespace App\Modules\Finance\Models;

use App\Modules\Services\Models\Service;
use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CostAllocation extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    protected $table = 'cost_allocations';
    protected $fillable = ['cost_id', 'service_id', 'saas_instance_id', 'share_percent', 'amount_minor', 'cost_currency', 'basis'];
    protected $attributes = ['version' => 1, 'basis' => '{}'];

    protected function casts(): array { return ['share_percent' => 'decimal:6', 'amount_minor' => 'integer', 'basis' => 'array', 'version' => 'integer']; }
    public function cost(): BelongsTo { return $this->belongsTo(Cost::class); }
    public function service(): BelongsTo { return $this->belongsTo(Service::class); }
}
