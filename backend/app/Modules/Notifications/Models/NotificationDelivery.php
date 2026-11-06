<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Models;

use App\Modules\Customers\Models\Customer;
use App\Shared\Database\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

final class NotificationDelivery extends Model
{
    use BelongsToOrganization, HasUuids;

    public const UPDATED_AT = null;

    protected $table = 'notification_deliveries';

    protected $guarded = ['*'];

    protected function casts(): array
    {
        return ['is_manual' => 'boolean', 'created_at' => 'datetime'];
    }

    public function events(): HasMany { return $this->hasMany(NotificationDeliveryEvent::class, 'notification_delivery_id')->orderBy('occurred_at'); }
    public function template(): BelongsTo { return $this->belongsTo(NotificationTemplate::class, 'notification_template_id'); }
    public function customer(): BelongsTo { return $this->belongsTo(Customer::class); }
}
