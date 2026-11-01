<?php

declare(strict_types=1);

namespace App\Modules\WebConnector\Services\Domains;

use App\Modules\WebConnector\Contracts\DomainAvailabilityChecker;
use App\Modules\WebConnector\Contracts\WhoisClient;
use App\Shared\Http\OutboundUrlGuard;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Throwable;

/**
 * Disponibilidad con registros públicos (solución inicial de D-35): WHOIS para las
 * extensiones de la lista blanca `hub.domain_availability.whois` (.pe) y RDAP para
 * el resto, con los servidores del bootstrap IANA (https, cacheado 24 h, por
 * OutboundUrlGuard, sin redirecciones). RDAP 404 = libre, 200 = registrado.
 * Cualquier otra cosa o error = unknown.
 */
final class PublicDomainAvailabilityChecker implements DomainAvailabilityChecker
{
    public function __construct(private readonly WhoisClient $whois, private readonly OutboundUrlGuard $guard) {}

    public function check(string $label, string $tld): string
    {
        $domain = $label.'.'.$tld;
        try {
            $whoisHosts = (array) config('hub.domain_availability.whois', []);
            if (isset($whoisHosts[$tld])) {
                return $this->viaWhois((string) $whoisHosts[$tld], $domain);
            }

            return $this->viaRdap($domain, $tld);
        } catch (Throwable) {
            return self::UNKNOWN;
        }
    }

    private function viaWhois(string $host, string $domain): string
    {
        $text = $this->whois->query($host, $domain);
        if ($text === null || trim($text) === '') {
            return self::UNKNOWN;
        }
        // Las respuestas negativas conocidas varían bastante entre registros WHOIS.
        // Se evalúan primero para que una etiqueta de estado no las marque como registradas.
        if (preg_match('/\b(?:No Object Found|No match(?: for)?|NOT FOUND|No Data Found|Domain not found|Object does not exist|No entries found)\b|\bStatus\s*:\s*(?:free|available)\b|\bis available for registration\b/i', $text) === 1) {
            return self::AVAILABLE;
        }
        if (preg_match('/\b(?:Sponsoring Registrar|Registrar|Registry Domain ID|Creation Date|Created On|Registered On)\s*:/i', $text) === 1
            || preg_match('/\bDomain Name\s*:\s*'.preg_quote($domain, '/').'\b/i', $text) === 1
            || preg_match('/\bDomain Status\s*:\s*(?!free\b|available\b|unknown\b|not found\b)[a-z][a-z0-9_-]*/i', $text) === 1) {
            return self::REGISTERED;
        }

        return self::UNKNOWN;
    }

    private function viaRdap(string $domain, string $tld): string
    {
        $parts = explode('.', $tld);
        $base = $this->rdapBase(end($parts));
        if ($base === null) {
            return self::UNKNOWN;
        }
        $url = rtrim($base, '/').'/domain/'.rawurlencode($domain);
        $ips = $this->guard->check($url);
        $options = ['allow_redirects' => false, 'http_errors' => false];
        if (($pins = $this->guard->pins($url, $ips)) !== []) {
            $options['curl'] = [CURLOPT_RESOLVE => $pins];
        }
        try {
            $status = Http::timeout((int) config('hub.domain_availability.timeout_seconds', 4))->connectTimeout(3)
                ->withOptions($options)->withHeaders(['Accept' => 'application/rdap+json, application/json'])->get($url)->status();
        } catch (RequestException $e) {
            $status = $e->response->status(); // 404 llega como excepción si el cliente HTTP lanza en errores
        }

        return match ($status) {
            404 => self::AVAILABLE,
            200 => self::REGISTERED,
            default => self::UNKNOWN,
        };
    }

    /** Servidor RDAP https de la extensión (última etiqueta) según el bootstrap IANA. */
    private function rdapBase(string $last): ?string
    {
        $map = Cache::remember('domain-availability:rdap-bootstrap', 86400, function (): array {
            $url = (string) config('hub.domain_availability.rdap_bootstrap_url');
            $this->guard->check($url);
            $response = Http::timeout(5)->withOptions(['allow_redirects' => false])->acceptJson()->get($url);
            $map = [];
            foreach ($response->successful() ? (array) $response->json('services', []) : [] as $service) {
                $https = array_values(array_filter((array) ($service[1] ?? []), fn ($u) => is_string($u) && str_starts_with($u, 'https://')));
                foreach ((array) ($service[0] ?? []) as $t) {
                    if ($https !== [] && is_string($t)) {
                        $map[strtolower($t)] = $https[0];
                    }
                }
            }
            if ($map === []) {
                throw new RuntimeException('Bootstrap RDAP vacío.'); // una excepción no se cachea
            }

            return $map;
        });

        return $map[$last] ?? null;
    }
}
