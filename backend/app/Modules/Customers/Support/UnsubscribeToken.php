<?php

declare(strict_types=1);

namespace App\Modules\Customers\Support;

use App\Modules\Customers\Models\Contact;

/** Token del enlace de baja: base64url(org:contact).hmac-sha256 con la APP_KEY. No vence: una baja siempre debe poder registrarse. */
final class UnsubscribeToken
{
    public static function for(Contact $contact): string
    {
        $body = rtrim(strtr(base64_encode($contact->organization_id.':'.$contact->id), '+/', '-_'), '=');

        return $body.'.'.self::sign($body);
    }

    /** @return array{organization_id: string, contact_id: string}|null */
    public static function parse(string $token): ?array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 2 || ! hash_equals(self::sign($parts[0]), $parts[1])) {
            return null;
        }
        $decoded = base64_decode(strtr($parts[0], '-_', '+/'), true);
        $ids = $decoded === false ? [] : explode(':', $decoded);
        if (count($ids) !== 2 || ! \Illuminate\Support\Str::isUuid($ids[0]) || ! \Illuminate\Support\Str::isUuid($ids[1])) {
            return null;
        }

        return ['organization_id' => $ids[0], 'contact_id' => $ids[1]];
    }

    private static function sign(string $body): string
    {
        return hash_hmac('sha256', 'unsubscribe|'.$body, (string) config('app.key'));
    }
}
