<?php

declare(strict_types=1);

namespace App\Modules\WebConnector\Services\Domains;

use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/** Extensiones vendibles en línea con su precio vigente a 1 año (registro, renovación, transferencia). */
final class DomainPriceCatalog
{
    /**
     * @param  list<string>|null  $tlds  sin punto; null = todas
     * @return list<array<string, mixed>>
     */
    public function prices(string $organizationId, string $currency, ?array $tlds = null): array
    {
        $today = now()->toDateString();
        $extensions = DB::table('domain_extensions')->where('organization_id', $organizationId)
            ->where('is_active', true)->where('sellable_online', true)
            ->when($tlds !== null, fn (Builder $q) => $q->whereIn('tld', $tlds))
            ->orderBy('sort_order')->orderBy('tld')
            ->get(['tld', 'default_registrar_id', 'is_featured', 'allows_transfer_in']);
        $prices = DB::table('domain_tld_prices')->where('organization_id', $organizationId)
            ->whereIn('tld', $extensions->pluck('tld')->all())
            ->where('currency', $currency)->where('years', 1)
            ->whereIn('operation', ['register', 'renew', 'transfer'])
            ->where('effective_from', '<=', $today)
            ->where(fn (Builder $q) => $q->whereNull('effective_to')->orWhere('effective_to', '>', $today))
            ->orderByDesc('effective_from')
            ->get(['tld', 'provider_id', 'operation', 'price_minor']);

        $data = [];
        foreach ($extensions as $ext) {
            $byOperation = [];
            foreach ($prices as $price) {
                if ($price->tld === $ext->tld && $price->provider_id === $ext->default_registrar_id) {
                    $byOperation[$price->operation] ??= (int) $price->price_minor;
                }
            }
            if (! isset($byOperation['register'])) {
                continue;
            }
            $data[] = [
                'tld' => $ext->tld,
                'name' => '.'.$ext->tld,
                'featured' => (bool) $ext->is_featured,
                'allows_transfer_in' => (bool) $ext->allows_transfer_in,
                'currency' => $currency,
                'register_minor' => $byOperation['register'],
                'renew_minor' => $byOperation['renew'] ?? null,
                'transfer_minor' => $ext->allows_transfer_in ? ($byOperation['transfer'] ?? null) : null,
            ];
        }

        return $data;
    }
}
