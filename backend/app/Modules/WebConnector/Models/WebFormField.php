<?php

declare(strict_types=1);

namespace App\Modules\WebConnector\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** Campo de un formulario embebible (tabla `web_form_fields`). */
class WebFormField extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    public const TYPES = ['text', 'textarea', 'email', 'phone', 'select', 'checkboxes', 'file'];

    public const MAPS_TO = ['name', 'email', 'phone', 'company', 'subject', 'message'];

    protected $table = 'web_form_fields';

    protected $fillable = ['web_form_id', 'key', 'label', 'help_text', 'field_type', 'is_required', 'options', 'validation', 'maps_to', 'position'];

    protected $attributes = ['version' => 1, 'is_required' => false];

    protected function casts(): array
    {
        return [
            'label' => 'array',
            'help_text' => 'array',
            'options' => 'array',
            'validation' => 'array',
            'is_required' => 'boolean',
            'position' => 'integer',
            'version' => 'integer',
        ];
    }
}
