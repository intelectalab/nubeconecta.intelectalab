<?php

declare(strict_types=1);

namespace App\Modules\Brands\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/** Tabla canónica `brands` (database/schema.sql). */
class Brand extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor, SoftDeletes;

    protected $table = 'brands';

    protected $fillable = ['code', 'name', 'domain', 'portal_domain', 'default_legal_entity_id', 'email_from', 'support_email', 'status', 'locale', 'email_from_name', 'status_page_slug'];

    protected $attributes = ['version' => 1];

    protected function casts(): array
    {
        return ['theme' => 'array', 'version' => 'integer'];
    }

    public function legalEntity(): BelongsTo
    {
        return $this->belongsTo(LegalEntity::class, 'default_legal_entity_id');
    }
}
