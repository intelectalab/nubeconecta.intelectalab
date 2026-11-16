<?php

declare(strict_types=1);

namespace App\Modules\Cloud\Models;

use App\Modules\Customers\Models\Customer;
use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/** Proyecto cloud por ambiente; ocultable al cliente. El costo se deriva de sus recursos y presupuestos. */
class CloudProject extends Model
{
    use BelongsToOrganization, HasUuids, SoftDeletes, TracksVersionAndActor;

    public const ENVIRONMENTS = ['production', 'staging', 'testing', 'development'];

    protected $table = 'cloud_projects';

    protected $fillable = ['cloud_account_id', 'customer_id', 'name', 'external_id', 'environment', 'region', 'visible_to_customer', 'tags', 'is_shared'];

    protected $attributes = ['version' => 1, 'environment' => 'production', 'visible_to_customer' => true, 'is_shared' => false, 'tags' => '{}'];

    protected function casts(): array
    {
        return ['visible_to_customer' => 'boolean', 'is_shared' => 'boolean', 'tags' => 'array', 'version' => 'integer'];
    }

    public function account(): BelongsTo { return $this->belongsTo(CloudAccount::class, 'cloud_account_id'); }
    public function customer(): BelongsTo { return $this->belongsTo(Customer::class); }
    public function resources(): HasMany { return $this->hasMany(CloudResource::class); }
    public function budgets(): HasMany { return $this->hasMany(CloudBudget::class); }
}
