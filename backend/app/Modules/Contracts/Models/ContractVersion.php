<?php

declare(strict_types=1);

namespace App\Modules\Contracts\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ContractVersion extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    protected $table = 'contract_versions';

    protected $guarded = ['*'];

    protected function casts(): array
    {
        return ['version_number' => 'integer', 'variables_snapshot' => 'array', 'locked_at' => 'datetime', 'version' => 'integer'];
    }

    public function getClauseIdsAttribute(mixed $value): array
    {
        if (is_array($value)) { return $value; }
        if (! is_string($value) || $value === '{}' || $value === '') { return []; }
        if ($value[0] === '[') { return json_decode($value, true) ?: []; }
        return array_values(array_filter(explode(',', trim($value, '{}')), static fn (string $id): bool => $id !== ''));
    }

    public function setClauseIdsAttribute(array $value): void
    {
        $this->attributes['clause_ids'] = '{'.implode(',', array_map(static fn (string $id): string => strtolower($id), $value)).'}';
    }

    public function contract(): BelongsTo { return $this->belongsTo(Contract::class); }
}
