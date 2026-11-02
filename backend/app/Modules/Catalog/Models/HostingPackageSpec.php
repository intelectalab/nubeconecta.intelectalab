<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Ficha técnica de un producto de hosting compartido. */
final class HostingPackageSpec extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    protected $table = 'hosting_package_specs';

    protected $fillable = ['product_id', 'disk_mb', 'bandwidth_mb', 'email_accounts', 'databases', 'websites', 'whm_package', 'preferred_node_id', 'extra_resources'];

    protected $attributes = ['version' => 1, 'extra_resources' => '{}'];

    protected function casts(): array
    {
        return [
            'disk_mb' => 'integer', 'bandwidth_mb' => 'integer', 'email_accounts' => 'integer',
            'databases' => 'integer', 'websites' => 'integer', 'extra_resources' => 'array', 'version' => 'integer',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'product_id');
    }
}
