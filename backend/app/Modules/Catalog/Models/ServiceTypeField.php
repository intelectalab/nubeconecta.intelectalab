<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class ServiceTypeField extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    protected $table = 'service_type_fields';

    protected $fillable = [
        'service_type_id', 'key', 'label', 'help_text', 'field_type', 'options', 'validation',
        'is_required', 'filled_by', 'position', 'is_active',
    ];

    protected $attributes = ['version' => 1];

    protected function casts(): array
    {
        return [
            'label' => 'array', 'help_text' => 'array', 'options' => 'array', 'validation' => 'array',
            'is_required' => 'boolean', 'is_active' => 'boolean', 'position' => 'integer', 'version' => 'integer',
        ];
    }
}
