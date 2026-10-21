<?php

declare(strict_types=1);

namespace App\Modules\Settings\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** Historial de solo inserción `setting_changes`: valor anterior y nuevo; null = sin valor en ese nivel. */
class SettingChange extends Model
{
    use BelongsToOrganization, HasUuids;

    public const UPDATED_AT = null;

    protected $table = 'setting_changes';

    protected $guarded = ['id', 'organization_id'];

    protected function casts(): array
    {
        return ['old_value' => 'json', 'new_value' => 'json'];
    }

    public static function bootSettingChange(): void
    {
        static::updating(static fn (): bool => false);
        static::deleting(static fn (): bool => false);
    }
}
