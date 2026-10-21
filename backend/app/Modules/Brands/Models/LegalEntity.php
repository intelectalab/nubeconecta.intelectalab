<?php

declare(strict_types=1);

namespace App\Modules\Brands\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** Tabla canónica `legal_entities` (database/schema.sql). */
class LegalEntity extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    protected $table = 'legal_entities';

    protected $fillable = ['legal_name', 'tax_id_type', 'tax_id', 'country', 'currency', 'fiscal_address', 'is_services_exporter', 'einvoice_provider_ref'];

    protected $attributes = ['version' => 1];

    protected function casts(): array
    {
        return ['is_services_exporter' => 'boolean', 'version' => 'integer'];
    }
}
