<?php

declare(strict_types=1);

namespace App\Modules\Sales\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** Tabla canónica `pipeline_stages`: etapas del embudo; solo `won` y `lost` cierran el prospecto. */
class PipelineStage extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    protected $table = 'pipeline_stages';

    protected $fillable = ['code', 'name', 'outcome', 'sort_order', 'is_active', 'probability'];

    protected function casts(): array
    {
        return ['is_active' => 'boolean', 'sort_order' => 'integer', 'probability' => 'integer', 'version' => 'integer'];
    }
}
