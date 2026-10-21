<?php

declare(strict_types=1);

namespace App\Shared\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Idioma de mensajes y errores según Accept-Language (es, en) (docs/06 §2). */
final class SetLocaleFromHeader
{
    private const SUPPORTED = ['es', 'en'];

    public function handle(Request $request, Closure $next): Response
    {
        if ($request->headers->has('Accept-Language')) {
            $locale = $request->getPreferredLanguage(self::SUPPORTED);
            if ($locale !== null) {
                app()->setLocale(substr($locale, 0, 2));
            }
        }

        return $next($request);
    }
}
