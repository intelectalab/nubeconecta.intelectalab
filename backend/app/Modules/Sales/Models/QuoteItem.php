<?php

declare(strict_types=1);

namespace App\Modules\Sales\Models;

use App\Modules\Catalog\Models\Plan;
use App\Modules\Catalog\Models\Product;
use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class QuoteItem extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    protected $table = 'quote_items';

    protected $guarded = ['*'];

    protected function casts(): array
    {
        return ['quantity' => 'decimal:3', 'unit_price_minor' => 'integer', 'discount_minor' => 'integer', 'total_minor' => 'integer', 'sort_order' => 'integer', 'version' => 'integer'];
    }

    public function quoteVersion(): BelongsTo { return $this->belongsTo(QuoteVersion::class, 'quote_version_id'); }
    public function product(): BelongsTo { return $this->belongsTo(Product::class); }
    public function plan(): BelongsTo { return $this->belongsTo(Plan::class); }
}
