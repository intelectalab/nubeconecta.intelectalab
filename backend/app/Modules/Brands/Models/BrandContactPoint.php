<?php

declare(strict_types=1);

namespace App\Modules\Brands\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Punto de contacto de una marca (tabla `brand_contact_points`): teléfono,
 * correo, WhatsApp, dirección u horario. Se muestra en las webs de la marca
 * con [hub_contacto]; el panel lo gestiona.
 */
class BrandContactPoint extends Model
{
    use BelongsToOrganization, HasUuids, SoftDeletes, TracksVersionAndActor;

    public const KINDS = ['phone', 'email', 'whatsapp', 'address', 'hours'];

    protected $table = 'brand_contact_points';

    protected $fillable = ['brand_id', 'kind', 'label', 'value', 'is_primary', 'is_public', 'position'];

    protected $attributes = ['version' => 1, 'is_primary' => false, 'is_public' => true, 'position' => 0];

    protected function casts(): array
    {
        return [
            'label' => 'array',
            'is_primary' => 'boolean',
            'is_public' => 'boolean',
            'position' => 'integer',
            'version' => 'integer',
        ];
    }
}
