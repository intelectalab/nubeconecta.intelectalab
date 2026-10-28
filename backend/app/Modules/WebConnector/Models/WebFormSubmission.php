<?php

declare(strict_types=1);

namespace App\Modules\WebConnector\Models;

use App\Modules\WebConnector\Casts\PgTextArray;
use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * Tabla canónica `web_form_submissions`: envíos de los formularios de las webs.
 * Los crea WpFormSubmissionController (inserción directa); el panel los lee y
 * cambia su estado. ip_hash e idempotency_key no salen en la API.
 */
class WebFormSubmission extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    /** CHECK de status en database/schema.sql. */
    public const STATUSES = ['received', 'routed', 'failed', 'spam'];

    protected $table = 'web_form_submissions';

    protected $fillable = [];

    protected $hidden = ['ip_hash', 'idempotency_key'];

    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'attribution' => 'array',
            'file_ids' => PgTextArray::class,
            'consent_given' => 'boolean',
            'captcha_verified_at' => 'datetime',
            'emailed_at' => 'datetime',
            'routed_at' => 'datetime',
            'version' => 'integer',
        ];
    }

    /** Código y nombre del formulario y nombre de la marca (subconsultas: el orden del cursor no se vuelve ambiguo). */
    public function scopeWithFormInfo(Builder $query): Builder
    {
        return $query->select('web_form_submissions.*')
            ->selectSub(DB::table('web_forms')->select('code')->whereColumn('web_forms.id', 'web_form_submissions.web_form_id'), 'form_code')
            ->selectSub(DB::table('web_forms')->select('name')->whereColumn('web_forms.id', 'web_form_submissions.web_form_id'), 'form_name')
            ->selectSub(DB::table('brands')->select('name')->whereColumn('brands.id', 'web_form_submissions.brand_id'), 'brand_name');
    }
}
