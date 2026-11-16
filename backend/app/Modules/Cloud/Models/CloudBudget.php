<?php

declare(strict_types=1);

namespace App\Modules\Cloud\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Presupuesto mensual por proyecto y gasto real (manual). Sin deleted_at: el borrado es físico. */
class CloudBudget extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    protected $table = 'cloud_budgets';

    protected $fillable = ['cloud_project_id', 'period_month', 'amount_minor', 'cost_currency', 'actual_minor'];

    protected $attributes = ['version' => 1, 'actual_minor' => 0];

    protected function casts(): array
    {
        return ['period_month' => 'date', 'amount_minor' => 'integer', 'actual_minor' => 'integer', 'last_alerted_pct' => 'integer', 'version' => 'integer'];
    }

    public function project(): BelongsTo { return $this->belongsTo(CloudProject::class, 'cloud_project_id'); }
}
