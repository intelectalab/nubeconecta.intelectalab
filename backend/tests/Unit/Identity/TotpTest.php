<?php

declare(strict_types=1);

namespace Tests\Unit\Identity;

use App\Modules\Identity\Services\Totp;
use PHPUnit\Framework\TestCase;

final class TotpTest extends TestCase
{
    public function test_round_trip_and_window_tolerance(): void
    {
        $secret = Totp::generateSecret();
        $timestamp = 1_700_000_017;
        $code = Totp::code($secret, $timestamp);

        $this->assertMatchesRegularExpression('/^\d{'.Totp::DIGITS.'}$/', $code);
        $this->assertSame(intdiv($timestamp, Totp::PERIOD), Totp::verify($secret, $code, 0, $timestamp));

        $previousCode = Totp::code($secret, $timestamp - Totp::PERIOD);

        $this->assertSame(
            intdiv($timestamp, Totp::PERIOD) - 1,
            Totp::verify($secret, $previousCode, 1, $timestamp),
        );
        $this->assertNull(Totp::verify($secret, $previousCode, 0, $timestamp));
    }

    public function test_rejects_incorrect_and_malformed_codes(): void
    {
        $secret = Totp::generateSecret();
        $timestamp = 1_700_000_017;
        $code = Totp::code($secret, $timestamp);
        $incorrectCode = $code === '000000' ? '111111' : '000000';

        $this->assertSame(
            [null, null, null],
            [
                Totp::verify($secret, $incorrectCode, 0, $timestamp),
                Totp::verify($secret, 'ABCDEF', 0, $timestamp),
                Totp::verify($secret, '12345', 0, $timestamp),
            ],
        );
    }

    public function test_accepts_codes_with_interspersed_spaces(): void
    {
        $secret = Totp::generateSecret();
        $timestamp = 1_700_000_017;
        $code = Totp::code($secret, $timestamp);

        $this->assertSame(
            intdiv($timestamp, Totp::PERIOD),
            Totp::verify($secret, implode(' ', str_split($code)), 0, $timestamp),
        );
    }

    public function test_builds_provisioning_uri(): void
    {
        $secret = Totp::generateSecret();
        $account = 'user+test@example.com';
        $issuer = 'Acme Identity';
        $uri = Totp::provisioningUri($secret, $account, $issuer);

        $this->assertStringStartsWith('otpauth://totp/', $uri);
        $this->assertStringContainsString(rawurlencode($issuer), $uri);
        $this->assertStringContainsString(rawurlencode($account), $uri);
        $this->assertStringContainsString('secret='.$secret, $uri);
    }
}
