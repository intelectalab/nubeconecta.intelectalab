<?php

declare(strict_types=1);

namespace App\Shared\Http;

use Closure;
use RuntimeException;

/**
 * Protección SSRF para llamadas salientes a URL configuradas por usuarios
 * (webhooks del plugin de WordPress y futuros conectores).
 *
 * Rechaza destinos que sean o resuelvan a IP privada, loopback, link-local
 * (incluida la de metadatos 169.254.169.254), CGNAT, reservada o no global
 * (RFC 6890), también como IPv6 mapeada. Un host que no resuelve se rechaza
 * (falla cerrada). `pins()` devuelve las entradas CURLOPT_RESOLVE para que la
 * conexión use exactamente las IP verificadas (evita el rebinding de DNS).
 *
 * Excepción: `hub.outbound.allow_private_targets` (HUB_OUTBOUND_ALLOW_PRIVATE)
 * solo tiene efecto en los entornos `local` y `testing`.
 */
final class OutboundUrlGuard
{
    /** @var Closure(string): list<string> */
    private readonly Closure $resolver;

    /** @param (callable(string): list<string>)|null $resolver resolución de nombres (inyectable en pruebas) */
    public function __construct(?callable $resolver = null)
    {
        $this->resolver = $resolver !== null ? Closure::fromCallable($resolver) : self::dnsResolve(...);
    }

    public function allowsPrivateTargets(): bool
    {
        return (bool) config('hub.outbound.allow_private_targets', false) && app()->environment(['local', 'testing']);
    }

    /** Mensaje de error en español o null si el destino es seguro. */
    public function error(string $url): ?string
    {
        try {
            $this->check($url);

            return null;
        } catch (RuntimeException $e) {
            return $e->getMessage();
        }
    }

    /**
     * Verifica la URL y devuelve las IP públicas a las que se conectará
     * (vacío solo cuando el flag de desarrollo permite cualquier destino).
     *
     * @return list<string>
     *
     * @throws RuntimeException con mensaje en español
     */
    public function check(string $url): array
    {
        $parts = parse_url($url);
        $host = is_array($parts) ? strtolower(trim((string) ($parts['host'] ?? ''), '[]')) : '';
        if ($host === '' || ! in_array(strtolower((string) ($parts['scheme'] ?? '')), ['https', 'http'], true) || isset($parts['user']) || isset($parts['pass'])) {
            throw new RuntimeException('La URL de destino no es válida.');
        }
        if ($this->allowsPrivateTargets()) {
            return [];
        }

        $ips = filter_var($host, FILTER_VALIDATE_IP) !== false ? [$host] : ($this->resolver)($host);
        if ($ips === []) {
            throw new RuntimeException('No se pudo resolver el host de destino.');
        }
        foreach ($ips as $ip) {
            if (! self::isPublicIp($ip)) {
                throw new RuntimeException('El destino apunta a una dirección privada, local o reservada.');
            }
        }

        return array_values(array_unique($ips));
    }

    /**
     * Entradas CURLOPT_RESOLVE ("host:puerto:ip") para fijar la conexión a las IP verificadas.
     *
     * @param  list<string>  $ips
     * @return list<string>
     */
    public function pins(string $url, array $ips): array
    {
        $parts = (array) parse_url($url);
        $host = strtolower(trim((string) ($parts['host'] ?? ''), '[]'));
        if ($ips === [] || filter_var($host, FILTER_VALIDATE_IP) !== false) {
            return [];
        }
        $port = (int) ($parts['port'] ?? (strtolower((string) ($parts['scheme'] ?? 'https')) === 'http' ? 80 : 443));

        return [$host.':'.$port.':'.implode(',', array_map(fn (string $ip) => str_contains($ip, ':') ? "[{$ip}]" : $ip, $ips))];
    }

    public static function isPublicIp(string $ip): bool
    {
        if (filter_var($ip, FILTER_VALIDATE_IP) === false) {
            return false;
        }
        // IPv6 que embebe IPv4 (::ffff:a.b.c.d, ::a.b.c.d, 64:ff9b::a.b.c.d): se evalúa la IPv4.
        if (str_contains($ip, ':') && preg_match('/(\d{1,3}(?:\.\d{1,3}){3})$/', $ip, $m) === 1) {
            return self::isPublicIp($m[1]);
        }
        $flags = FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE | (defined('FILTER_FLAG_GLOBAL_RANGE') ? FILTER_FLAG_GLOBAL_RANGE : 0);
        if (filter_var($ip, FILTER_VALIDATE_IP, $flags) === false) {
            return false;
        }
        if (! str_contains($ip, ':')) {
            $long = ip2long($ip);
            // 100.64.0.0/10 (CGNAT), 0.0.0.0/8, 198.18.0.0/15 (pruebas de red).
            foreach ([['100.64.0.0', 10], ['0.0.0.0', 8], ['198.18.0.0', 15], ['169.254.0.0', 16], ['127.0.0.0', 8]] as [$net, $bits]) {
                $mask = -1 << (32 - $bits);
                if (($long & $mask) === (ip2long($net) & $mask)) {
                    return false;
                }
            }
        } else {
            $bin = (string) inet_pton($ip);
            // fe80::/10 link-local, fc00::/7 únicas locales, ::1 y :: (por si faltara GLOBAL_RANGE).
            if ((ord($bin[0]) === 0xFE && (ord($bin[1]) & 0xC0) === 0x80) || (ord($bin[0]) & 0xFE) === 0xFC || $bin === inet_pton('::1') || $bin === inet_pton('::')) {
                return false;
            }
        }

        return true;
    }

    /** @return list<string> */
    private static function dnsResolve(string $host): array
    {
        $ips = gethostbynamel($host) ?: [];
        $aaaa = @dns_get_record($host, DNS_AAAA) ?: [];
        foreach ($aaaa as $record) {
            if (isset($record['ipv6'])) {
                $ips[] = $record['ipv6'];
            }
        }

        return array_values(array_unique($ips));
    }
}
