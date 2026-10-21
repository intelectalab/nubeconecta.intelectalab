<?php

declare(strict_types=1);

namespace App\Modules\Brands\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** Tabla canónica `document_series` (database/schema.sql). */
class DocumentSeries extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    protected $table = 'document_series';

    protected $fillable = ['legal_entity_id', 'document_type', 'series', 'next_number', 'is_active'];

    protected $attributes = ['version' => 1];

    protected function casts(): array
    {
        return ['next_number' => 'integer', 'is_active' => 'boolean', 'version' => 'integer'];
    }
}
