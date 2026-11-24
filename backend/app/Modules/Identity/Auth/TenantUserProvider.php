<?php

declare(strict_types=1);

namespace App\Modules\Identity\Auth;

use Illuminate\Auth\EloquentUserProvider;

/**
 * Multitenancy Fase 1 (Opción A). Resuelve al usuario para la autenticación
 * SIN el filtro global por organización: el id (UUID) y el correo son únicos en
 * todo el sistema, así que buscarlos no necesita el contexto del inquilino —y de
 * hecho no puede tenerlo todavía, porque el inquilino se deduce DEL usuario que
 * se está resolviendo (el arranque circular que rompe la Opción A).
 *
 * Solo se usa para cargar al usuario que inicia sesión o cuya sesión se reanuda;
 * el aislamiento de datos lo sigue garantizando el scope global en todo lo demás
 * (se fija la organización del usuario justo después de autenticar, ver
 * SetCurrentOrganization).
 */
final class TenantUserProvider extends EloquentUserProvider
{
    /** @param \Illuminate\Database\Eloquent\Model|null $model */
    protected function newModelQuery($model = null)
    {
        return parent::newModelQuery($model)->withoutGlobalScope('organization');
    }
}
