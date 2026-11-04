<?php

declare(strict_types=1);

namespace App\Modules\Support\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class ComplaintResponse extends Model
{
    use BelongsToOrganization, HasUuids;

    protected $table = 'complaint_responses';
    public const UPDATED_AT = null;
    protected $fillable = ['complaint_id', 'body', 'body_html', 'template_id', 'previewed_at', 'preview_sha256', 'responded_by', 'sent_to_email', 'sent_at', 'file_id', 'is_final'];
    protected $attributes = ['is_final' => true];

    protected static function booted(): void
    {
        static::creating(static function (ComplaintResponse $response): void { $response->created_by ??= auth()->id(); });
    }
    protected function casts(): array { return ['previewed_at' => 'datetime', 'sent_at' => 'datetime', 'is_final' => 'boolean']; }
}
