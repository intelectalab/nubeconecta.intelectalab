<?php

declare(strict_types=1);

namespace App\Modules\WebConnector\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/**
 * Versión con fecha de un documento legal (tabla `legal_document_versions`):
 * borrador, publicada (una sola vigente por documento) o reemplazada. Nunca se
 * borran una vez publicadas; el carrito registra qué versión aceptó cada cliente.
 */
class LegalDocumentVersion extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    public const STATUSES = ['draft', 'published', 'superseded'];

    protected $table = 'legal_document_versions';

    protected $fillable = [
        'legal_document_id', 'version_number', 'version_label', 'body', 'change_summary',
        'legal_reviewed_by', 'legal_reviewed_at', 'effective_at', 'status',
        'published_at', 'published_by', 'superseded_at',
    ];

    protected $attributes = ['version' => 1, 'status' => 'draft'];

    protected function casts(): array
    {
        return [
            'version_number' => 'integer',
            'legal_reviewed_at' => 'immutable_datetime',
            'effective_at' => 'immutable_datetime',
            'published_at' => 'immutable_datetime',
            'superseded_at' => 'immutable_datetime',
            'version' => 'integer',
        ];
    }
}
