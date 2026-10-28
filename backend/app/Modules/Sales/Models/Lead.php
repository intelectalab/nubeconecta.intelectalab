<?php

declare(strict_types=1);

namespace App\Modules\Sales\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\DB;

/** Tabla canónica `leads`. `code` lo asigna LeadService con hub_next_code(). */
class Lead extends Model
{
    use BelongsToOrganization, HasUuids, SoftDeletes, TracksVersionAndActor;

    public const STATUSES = ['open', 'won', 'lost'];

    protected $table = 'leads';

    protected $fillable = [
        'name', 'company_name', 'email', 'phone', 'brand_id', 'lead_channel_id', 'pipeline_stage_id', 'owner_id',
        'estimated_amount_minor', 'currency', 'next_follow_up_at',
    ];

    protected $attributes = ['version' => 1, 'status' => 'open', 'attribution' => '{}', 'custom' => '{}', 'marketing_consent' => false];

    protected function casts(): array
    {
        return [
            'attribution' => 'array',
            'custom' => 'array',
            'marketing_consent' => 'boolean',
            'estimated_amount_minor' => 'integer',
            'converted_at' => 'datetime',
            'last_activity_at' => 'datetime',
            'next_follow_up_at' => 'datetime',
            'version' => 'integer',
        ];
    }

    /** Datos de etapa, canal, marca, responsable y cliente por subconsulta (el orden del cursor no se vuelve ambiguo). */
    public function scopeWithInfo(Builder $query): Builder
    {
        $sub = fn (string $table, string $column, string $fk) => DB::table($table)->select($column)->whereColumn("{$table}.id", "leads.{$fk}");

        return $query->select('leads.*')
            ->selectSub($sub('pipeline_stages', 'name', 'pipeline_stage_id'), 'stage_name')
            ->selectSub($sub('pipeline_stages', 'outcome', 'pipeline_stage_id'), 'stage_outcome')
            ->selectSub($sub('lead_channels', 'name', 'lead_channel_id'), 'channel_name')
            ->selectSub($sub('lead_channels', 'code', 'lead_channel_id'), 'channel_code')
            ->selectSub($sub('brands', 'name', 'brand_id'), 'brand_name')
            ->selectSub($sub('users', 'name', 'owner_id'), 'owner_name')
            ->selectSub($sub('customers', 'code', 'customer_id'), 'customer_code')
            ->selectSub($sub('customers', 'legal_name', 'customer_id'), 'customer_name');
    }
}
