<?php

declare(strict_types=1);

namespace App\Modules\WebConnector\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * Envío de un formulario web recibido (`web_form_submissions`, estado received).
 * La derivación a prospecto, ticket o correo (RouteWebFormSubmission, M-WCN §7.7)
 * escucha este evento; los envíos marcados como spam no lo emiten.
 */
final class WebFormSubmitted implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(
        public readonly string $organizationId,
        public readonly string $id,
        public readonly string $webFormId,
        public readonly string $brandId,
        public readonly ?string $wpSiteId,
    ) {}
}
