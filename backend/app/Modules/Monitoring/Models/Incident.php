<?php

declare(strict_types=1);

namespace App\Modules\Monitoring\Models;

use App\Models\User;
use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Incident extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    public const KINDS = ['availability', 'performance', 'security', 'data', 'other'];
    public const SEVERITIES = ['critical', 'high', 'medium', 'low'];
    public const STATUSES = ['open', 'monitoring', 'resolved'];

    protected $table = 'incidents';
    protected $fillable = ['title', 'kind', 'severity', 'started_at', 'is_public', 'public_summary', 'root_cause', 'problem_id', 'owner_id', 'notes_internal'];
    protected $attributes = ['version' => 1, 'kind' => 'availability', 'status' => 'open', 'is_public' => false];

    protected function casts(): array
    {
        return ['started_at' => 'datetime', 'resolved_at' => 'datetime', 'is_public' => 'boolean', 'version' => 'integer'];
    }

    public function owner(): BelongsTo { return $this->belongsTo(User::class, 'owner_id'); }
}
