<?php

declare(strict_types=1);

namespace App\Modules\WebConnector\Services\Domains;

use App\Modules\WebConnector\Contracts\WhoisClient;
use App\Shared\Http\OutboundUrlGuard;
use Throwable;

/** WHOIS por socket: IP verificada por OutboundUrlGuard, timeout corto y respuesta acotada. */
final class SocketWhoisClient implements WhoisClient
{
    public function __construct(private readonly OutboundUrlGuard $guard) {}

    public function query(string $host, string $domain): ?string
    {
        try {
            $ips = $this->guard->check('https://'.$host.'/');
            $target = $ips[0] ?? $host;
            $timeout = (float) config('hub.domain_availability.timeout_seconds', 4);
            $socket = @stream_socket_client('tcp://'.(str_contains($target, ':') ? "[{$target}]" : $target).':43', $errno, $err, $timeout);
            if ($socket === false) {
                return null;
            }
            stream_set_timeout($socket, (int) ceil($timeout));
            fwrite($socket, $domain."\r\n");
            $out = '';
            $deadline = microtime(true) + $timeout;
            while (! feof($socket) && strlen($out) < 20000 && microtime(true) < $deadline) {
                $chunk = fread($socket, 2048);
                if ($chunk === false || $chunk === '') {
                    if (stream_get_meta_data($socket)['timed_out']) {
                        break;
                    }

                    continue;
                }
                $out .= $chunk;
            }
            fclose($socket);

            return $out !== '' ? $out : null;
        } catch (Throwable) {
            return null;
        }
    }
}
