<?php

declare(strict_types=1);

namespace App\Modules\Customers\Models;

use App\Models\User;
use App\Modules\WebConnector\Casts\PgTextArray;
use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/** Tabla canónica `contacts`: roles de aviso y acceso opcional al portal (`user_id`). */
class Contact extends Model
{
    use BelongsToOrganization, HasUuids, SoftDeletes, TracksVersionAndActor;

    public const ROLES = ['technical', 'administrative', 'billing', 'authorized'];

    protected $table = 'contacts';

    protected $fillable = ['name', 'email', 'phone', 'whatsapp', 'roles', 'is_primary', 'locale', 'custom'];

    protected $attributes = ['version' => 1, 'roles' => '{}', 'custom' => '{}', 'is_primary' => false];

    protected function casts(): array
    {
        return [
            'roles' => PgTextArray::class,
            'custom' => 'array',
            'is_primary' => 'boolean',
            'version' => 'integer',
        ];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
