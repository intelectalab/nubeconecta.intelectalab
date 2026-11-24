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
 * Definición de un formulario embebible de la web (tabla `web_forms`): sus
 * campos están en web_form_fields; se muestra con [hub_formulario id="..."].
 */
class WebForm extends Model
{
    use BelongsToOrganization, HasUuids, SoftDeletes, TracksVersionAndActor;

    public const STATUSES = ['draft', 'active', 'inactive'];

    public const DESTINATIONS = ['lead', 'ticket', 'email'];

    protected $table = 'web_forms';

    protected $fillable = [
        'brand_id', 'code', 'name', 'status', 'destination', 'lead_channel_id', 'ticket_type', 'ticket_department',
        'notify_email', 'owner_user_id', 'consent_required', 'consent_purpose', 'consent_text', 'captcha_required',
        'success_message', 'redirect_url',
    ];

    protected $attributes = ['version' => 1, 'status' => 'draft', 'consent_required' => true, 'captcha_required' => true];

    protected function casts(): array
    {
        return [
            'consent_text' => 'array',
            'success_message' => 'array',
            'consent_required' => 'boolean',
            'captcha_required' => 'boolean',
            'version' => 'integer',
        ];
    }

    public function fields(): HasMany
    {
        return $this->hasMany(WebFormField::class)->orderBy('position');
    }
}
