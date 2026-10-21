<?php

declare(strict_types=1);

namespace App\Modules\Identity\Models;

use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

/** Organización operadora (tabla `organizations`; una sola fila hoy, docs/00 §19). */
class Organization extends Model
{
    use HasUuids, SoftDeletes, TracksVersionAndActor;

    protected $fillable = ['name', 'slug', 'country', 'default_currency', 'default_locale', 'default_timezone'];

    /** Devuelve la organización existente o crea la primera con config('hub.organization'). */
    public static function ensureDefault(): self
    {
        return static::query()->orderBy('created_at')->first()
            ?? static::query()->create([
                'name' => config('hub.organization.name'),
                'slug' => config('hub.organization.slug'),
            ]);
    }
}
