<?php

declare(strict_types=1);

namespace App\Modules\Brands\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** Tabla canónica `bank_accounts` (database/schema.sql). */
class BankAccount extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    protected $table = 'bank_accounts';

    protected $fillable = ['legal_entity_id', 'brand_id', 'bank_name', 'account_type', 'account_number', 'cci', 'currency', 'show_on_invoice', 'is_active'];

    protected $attributes = ['version' => 1];

    protected function casts(): array
    {
        return ['show_on_invoice' => 'boolean', 'is_active' => 'boolean', 'version' => 'integer'];
    }
}
