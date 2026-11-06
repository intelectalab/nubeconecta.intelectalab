<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

final class NotificationTemplate extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    protected $table = 'notification_templates';

    protected $fillable = ['code', 'channel', 'brand_id', 'locale', 'country', 'subject', 'body', 'variables', 'is_active', 'category', 'content_format'];

    protected function casts(): array
    {
        return ['variables' => 'array', 'is_active' => 'boolean', 'version' => 'integer'];
    }
}
