<?php

declare(strict_types=1);

namespace App\Modules\Sales\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class QuoteVersion extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    protected $table = 'quote_versions';

    protected $guarded = ['*'];

    protected function casts(): array
    {
        return ['version_number' => 'integer', 'one_time_total_minor' => 'integer', 'recurring_total_minor' => 'integer', 'tax_minor' => 'integer', 'valid_until' => 'date', 'version' => 'integer'];
    }

    public function quote(): BelongsTo { return $this->belongsTo(Quote::class); }

    public function items(): HasMany
    {
        return $this->hasMany(QuoteItem::class, 'quote_version_id')->orderBy('sort_order')->orderBy('id');
    }
}
