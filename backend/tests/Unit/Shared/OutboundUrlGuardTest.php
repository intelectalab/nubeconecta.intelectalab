<?php

declare(strict_types=1);

namespace Tests\Unit\Shared;

use App\Shared\Http\OutboundUrlGuard;
use Tests\TestCase;

final class OutboundUrlGuardTest extends TestCase
{
    public function test_rejects_private_embedded_and_invalid_outbound_targets(): void
    {
        config(['hub.outbound.allow_private_targets' => false]);

        $guard = new OutboundUrlGuard(fn (string $host): array => match ($host) {
            'public.example.test' => ['93.184.216.34'],
            'loopback.example.test' => ['127.0.0.1'],
            'private.example.test' => ['10.0.0.1'],
            'lan.example.test' => ['192.168.1.10'],
            'link-local.example.test' => ['169.254.1.1'],
            'unique-local.example.test' => ['fc00::1'],
            'mapped.example.test' => ['::ffff:7f00:1'],
            'nat64.example.test' => ['64:ff9b::7f00:1'],
            'nat64-local.example.test' => ['64:ff9b:1::c0a8:101'],
            default => [],
        });

        $this->assertNull($guard->error('https://public.example.test/hook'));
        $this->assertNotNull($guard->error('https://loopback.example.test/hook'));
        $this->assertNotNull($guard->error('https://private.example.test/hook'));
        $this->assertNotNull($guard->error('https://lan.example.test/hook'));
        $this->assertNotNull($guard->error('https://link-local.example.test/hook'));
        $this->assertNotNull($guard->error('https://unique-local.example.test/hook'));
        $this->assertNotNull($guard->error('https://mapped.example.test/hook'));
        $this->assertNotNull($guard->error('https://nat64.example.test/hook'));
        $this->assertNotNull($guard->error('https://nat64-local.example.test/hook'));
        $this->assertNotNull($guard->error('ftp://public.example.test/hook'));
        $this->assertNotNull($guard->error('https:///hook'));
    }
}
