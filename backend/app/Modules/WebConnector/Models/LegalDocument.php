<?php

declare(strict_types=1);

namespace App\Modules\WebConnector\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Documento legal de una marca (tabla `legal_documents`): términos, privacidad,
 * reembolsos, SLA, uso aceptable o aviso legal. Se redacta y versiona en el
 * sistema; WordPress muestra la versión vigente con [hub_documento_legal].
 */
class LegalDocument extends Model
{
    use BelongsToOrganization, HasUuids, SoftDeletes, TracksVersionAndActor;

    public const KINDS = ['terms', 'privacy', 'refunds', 'sla', 'acceptable_use', 'legal_notice'];

    protected $table = 'legal_documents';

    protected $fillable = ['brand_id', 'kind', 'product_category_id', 'locale', 'title', 'slug', 'published_version_id'];

    protected $attributes = ['version' => 1, 'locale' => 'es'];

    protected function casts(): array
    {
        return ['version' => 'integer'];
    }

    /** @return HasMany<LegalDocumentVersion> */
    public function versions(): HasMany
    {
        return $this->hasMany(LegalDocumentVersion::class)->orderByDesc('version_number');
    }
}
