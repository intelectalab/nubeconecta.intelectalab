<?php

declare(strict_types=1);

namespace App\Modules\Settings\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/** Un ajuste cambió en un nivel (M-CFG §9). AUT y los jobs recalculan lo que corresponda. */
final class SettingChanged implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(
        public readonly string $organizationId,
        public readonly string $key,
        public readonly string $scopeType,
        public readonly ?string $scopeId,
        public readonly mixed $oldValue,
        public readonly mixed $newValue,
        public readonly string $changeId,
    ) {}
}
