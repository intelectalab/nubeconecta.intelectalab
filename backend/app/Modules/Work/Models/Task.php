<?php

declare(strict_types=1);

namespace App\Modules\Work\Models;

use App\Models\User;
use App\Modules\Customers\Models\Customer;
use App\Modules\Services\Models\Service;
use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/** Tarea del módulo Work sobre la tabla canónica `tasks`. */
class Task extends Model
{
    use BelongsToOrganization, HasUuids, SoftDeletes, TracksVersionAndActor;

    public const STATUSES = ['todo', 'in_progress', 'blocked', 'in_review', 'done', 'cancelled'];

    public const PRIORITIES = ['critical', 'high', 'medium', 'low'];

    protected $table = 'tasks';

    protected $fillable = [
        'title', 'description', 'priority', 'assignee_id', 'due_at', 'customer_id', 'service_id',
        'is_billable', 'parent_id', 'requires_approval', 'is_sensitive', 'custom',
    ];

    protected $attributes = ['version' => 1, 'status' => 'todo', 'priority' => 'medium', 'source_type' => 'manual', 'is_billable' => false, 'requires_approval' => false, 'is_template' => false, 'is_sensitive' => false];

    protected function casts(): array
    {
        return [
            'due_at' => 'datetime', 'completed_at' => 'datetime', 'approved_at' => 'datetime',
            'is_billable' => 'boolean', 'requires_approval' => 'boolean', 'is_template' => 'boolean',
            'is_sensitive' => 'boolean', 'version' => 'integer', 'custom' => 'array',
        ];
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assignee_id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function service(): BelongsTo
    {
        return $this->belongsTo(Service::class);
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function subtasks(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id');
    }
}
