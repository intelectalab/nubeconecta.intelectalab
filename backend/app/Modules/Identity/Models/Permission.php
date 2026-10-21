<?php

declare(strict_types=1);

namespace App\Modules\Identity\Models;

use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/**
 * Catálogo global de permisos `<modulo>.<entidad>.<accion>` (sin organization_id),
 * cargado por IdentitySeeder desde database/seeds/permissions.json.
 *
 * @property string $id
 * @property string $code
 * @property bool $is_sensitive
 */
class Permission extends Model
{
    use HasUuids, TracksVersionAndActor;

    protected $fillable = ['code', 'module', 'entity', 'action', 'description', 'is_sensitive'];

    protected function casts(): array
    {
        return ['is_sensitive' => 'boolean', 'version' => 'integer'];
    }
}
