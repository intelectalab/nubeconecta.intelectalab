<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class NotificationDeliveryEvent extends Model
{
    use BelongsToOrganization, HasUuids;

    public const UPDATED_AT = null;

    protected $table = 'notification_delivery_events';

    protected $guarded = ['*'];

    protected function casts(): array { return ['detail' => 'array', 'occurred_at' => 'datetime', 'created_at' => 'datetime']; }
    public function delivery(): BelongsTo { return $this->belongsTo(NotificationDelivery::class, 'notification_delivery_id'); }
}
