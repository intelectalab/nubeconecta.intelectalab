<?php

declare(strict_types=1);

/*
| Configuración propia del hub (no de negocio: los ajustes de negocio viven en
| la tabla `settings`, docs/09). Todo lo que aquí aparece es técnico o es una
| decisión abierta que se deja configurable.
*/

return [
    // Carpeta de los seeds canónicos (roles.json, permissions.json, settings.json).
    'seeds_path' => env('HUB_SEEDS_PATH', base_path('../database/seeds')),

    // Organización operadora única (docs/00 §19). Si hay varias filas se usa esta.
    'organization' => [
        'id' => env('HUB_ORGANIZATION_ID'),
        // Solo se usan al crear la primera organización (seeder / hub:create-admin).
        'name' => env('HUB_ORGANIZATION_NAME', 'Hub'),
        'slug' => env('HUB_ORGANIZATION_SLUG', 'hub'),
    ],

    // Errores RFC 9457: base del URI `type` de cada problema.
    'problem_base_uri' => rtrim((string) env('HUB_PROBLEM_BASE_URI', 'https://hub.example/problems'), '/'),

    'idempotency' => [
        'ttl_hours' => (int) env('HUB_IDEMPOTENCY_TTL_HOURS', 24),
        'lock_seconds' => (int) env('HUB_IDEMPOTENCY_LOCK_SECONDS', 30),
    ],

    'auth' => [
        // Límite de intentos por IP en login y MFA (por minuto). El límite por cuenta
        // lo dan security.login_max_attempts / security.login_lockout_minutes.
        'ip_attempts_per_minute' => (int) env('HUB_LOGIN_IP_ATTEMPTS_PER_MINUTE', 20),
        'mfa_pending_minutes' => (int) env('HUB_MFA_PENDING_MINUTES', 10),
        'mfa_max_attempts' => (int) env('HUB_MFA_MAX_ATTEMPTS', 5),
        'totp_issuer' => env('HUB_TOTP_ISSUER', env('APP_NAME', 'Hub')),
        'recovery_codes' => 10,
    ],

    // Claves que nunca se guardan en before/after de la auditoría.
    'audit' => [
        'redact' => ['password', 'password_confirmation', 'current_password', 'new_password', 'password_hash', 'session_token_hash', 'preview_token', 'mfa_secret', 'token', 'code_hash', 'secret', 'recovery_codes'],
    ],
    // Temas por marca (M-BRD). Estructura de tokens propuesta por el código, no por
    // los documentos: colores por modo en tokens.colors.<modo>.<nombre> y pares
    // texto/fondo que se miden contra brands.theme.min_contrast_ratio. Revisar con diseño.
    'brands' => [
        'theme' => [
            'modes' => ['light', 'dark'],
            'contrast_pairs' => [
                ['text', 'background'],
                ['text_muted', 'background'],
                ['on_primary', 'primary'],
                ['on_secondary', 'secondary'],
                ['on_accent', 'accent'],
            ],
            // Pares obligatorios en cada modo para poder verificar el contraste.
            'required_pairs' => [['text', 'background']],
            'max_depth' => 5,
        ],
    ],
];
