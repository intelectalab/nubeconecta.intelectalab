<?php

declare(strict_types=1);

namespace App\Modules\Identity\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** Código de recuperación de MFA de un solo uso (solo hash sha256). */
class MfaRecoveryCode extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    protected $fillable = ['user_id', 'code_hash', 'used_at'];

    protected function casts(): array
    {
        return ['used_at' => 'datetime'];
    }

    public function usesVersion(): bool
    {
        return false;
    }
}
