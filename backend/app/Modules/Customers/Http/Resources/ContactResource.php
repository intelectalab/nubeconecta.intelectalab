<?php

declare(strict_types=1);

namespace App\Modules\Customers\Http\Resources;

use App\Modules\Customers\Models\Contact;
use App\Modules\Customers\Services\ConsentService;
use App\Modules\Customers\Services\PortalAccessService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Contacto (P-CUS-04): columnas de `contacts` más `portal_role`,
 * `mfa_enabled`, `last_login_at` y `consent` (x-derived). En el portal
 * ($portal = true) se omiten `custom`, `created_by`, `updated_by`, `user_id`,
 * `mfa_enabled` y `last_login_at`.
 *
 * @property Contact $resource
 */
final class ContactResource extends JsonResource
{
    public function __construct(Contact $resource, private readonly bool $portal = false)
    {
        parent::__construct($resource);
    }

    public function toArray(Request $request): array
    {
        $c = $this->resource;
        $data = $c->makeHidden(['deleted_at', 'organization_id'])->toArray();
        $data['portal_role'] = app(PortalAccessService::class)->portalRole($c);
        if ($this->portal) {
            // Un customer_admin no ve el id interno de usuario ni datos de seguridad (MFA, último acceso) de otros contactos.
            unset($data['custom'], $data['created_by'], $data['updated_by'], $data['user_id']);
        } else {
            $user = $c->user_id ? $c->user()->first() : null;
            $data['mfa_enabled'] = $user?->mfa_enabled_at !== null;
            $data['last_login_at'] = $user?->last_login_at?->toIso8601String();
        }
        $data['consent'] = app(ConsentService::class)->summary($c);

        return $data;
    }
}
