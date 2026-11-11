<?php

declare(strict_types=1);

/*
| Configuración propia del hub (no de negocio: los ajustes de negocio viven en
| la tabla `settings`, docs/09). Todo lo que aquí aparece es técnico o es una
| decisión abierta que se deja configurable.
*/

return [
    // Retención máxima de exportaciones de datos personales cifradas.
    'privacy' => [
        'export_ttl_days' => (int) env('HUB_PRIVACY_EXPORT_TTL_DAYS', 7),
    ],

    // Carpeta de los seeds canónicos (roles.json, permissions.json, settings.json).
    'seeds_path' => env('HUB_SEEDS_PATH', base_path('../database/seeds')),

    // Organización operadora única (docs/00 §19). Si hay varias filas se usa esta.
    'organization' => [
        'id' => env('HUB_ORGANIZATION_ID'),
        // Solo se usan al crear la primera organización (seeder / hub:create-superadmin).
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
        // Enlaces de un solo uso del portal (invitación y olvidé mi contraseña).
        'invitation_hours' => (int) env('HUB_INVITATION_HOURS', 72),
        'password_reset_minutes' => (int) env('HUB_PASSWORD_RESET_MINUTES', 60),
        'forgot_per_minute_ip' => (int) env('HUB_FORGOT_PER_MINUTE_IP', 5),
        'forgot_per_hour_email' => (int) env('HUB_FORGOT_PER_HOUR_EMAIL', 3),
    ],

    // Portal del cliente: URL base de los enlaces de los correos ({url}/#/activar?token=...).
    'portal' => [
        'url' => env('HUB_PORTAL_URL', 'http://localhost:3001'),
        'brand' => env('HUB_PORTAL_BRAND', 'AlojamientoPlus'),
    ],

    'files' => [
        'disk' => env('FILES_DISK', 'local'),
        'max_bytes' => 10485760,
        'mime_whitelist' => ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    ],

    // Claves que nunca se guardan en before/after de la auditoría.
    'audit' => [
        'redact' => ['password', 'password_confirmation', 'current_password', 'new_password', 'password_hash', 'session_token_hash', 'preview_token', 'mfa_secret', 'token', 'code_hash', 'secret', 'recovery_codes'],
    ],
    // Bóveda mínima (docs/10 §1) hasta que exista VLT: clave AES-256-GCM fuera de la
    // base (base64 de 32 bytes). Vacía: se deriva de APP_KEY con HKDF (solo desarrollo).
    'vault' => [
        'key' => env('HUB_VAULT_KEY'),
        'key_version' => (int) env('HUB_VAULT_KEY_VERSION', 1),
    ],

    // Usuario de BD restringido (php artisan hub:db:app-user): rol LOGIN que hereda de hub_app.
    // La contraseña solo viene del entorno; nunca del repositorio.
    'database' => [
        'app_username' => env('HUB_DB_APP_USERNAME', 'hub_app_login'),
        'app_password' => env('HUB_DB_APP_PASSWORD'),
    ],

    // Rol admin del sistema (SystemAdminGuard): permisos que nunca puede perder para que la
    // organización no quede sin quien administre accesos. La doc no fija la lista: mínimo seguro.
    'identity' => [
        'admin_minimum_permissions' => [
            'identity.user.view', 'identity.user.update', 'identity.role.view', 'identity.role.update', 'identity.permission.view',
        ],
    ],

    // Llamadas salientes a URL de usuarios (SSRF): permitir destinos privados o no
    // resolubles solo tiene efecto en APP_ENV local/testing (App\Shared\Http\OutboundUrlGuard).
    'outbound' => [
        'allow_private_targets' => (bool) env('HUB_OUTBOUND_ALLOW_PRIVATE', false),
    ],

    // WebConnector (M-WCN): límite de la API del plugin por token (la doc no lo fija).
    'web_connector' => [
        'requests_per_minute' => (int) env('HUB_WP_REQUESTS_PER_MINUTE', 120),
        'embed' => [
            'cache_seconds' => 60,
            'max_origins' => 5,
            'requests_per_minute' => 120,
        ],
    ],

    // Disponibilidad de dominios con RDAP/WHOIS públicos (D-35, solución inicial).
    // `whois`: lista blanca extensión => servidor (no se consultan otros hosts); el resto va por RDAP.
    'domain_availability' => [
        'rdap_bootstrap_url' => 'https://data.iana.org/rdap/dns.json',
        'whois' => [
            'pe' => 'whois.nic.pe',
            'com.pe' => 'whois.nic.pe',
            'org.pe' => 'whois.nic.pe',
            'net.pe' => 'whois.nic.pe',
            'gob.pe' => 'whois.nic.pe',
            'edu.pe' => 'whois.nic.pe',
            'nom.pe' => 'whois.nic.pe',
        ],
        'timeout_seconds' => 4,
        'requests_per_ip_per_10min' => (int) env('HUB_DOMAIN_CHECKS_PER_IP', 30),
        // Segundos de caché por resultado (0 = no se cachea; un fallo nunca se cachea).
        'cache_seconds' => ['available' => 60, 'registered' => 3600, 'unknown' => 0],
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

    // Services (M-SRV, franja MVP): con true, el aprovisionamiento manual activa los
    // servicios al aprobar el pedido (demostración); por defecto quedan `pending`.
    'services' => [
        'auto_activate' => (bool) env('HUB_SERVICES_AUTO_ACTIVATE', false),
    ],

    // Billing (M-BIL, franja MVP). auto_issue: emitir en el acto los borradores
    // generados (pedido aprobado y renovaciones); la doc lo deja a una "regla de
    // automatización" (D-xx pendiente). einvoice.driver: conector OSE/PSE
    // (D-01 sin decidir); 'fake' simula la aceptación con un CDR ficticio y no
    // funciona en producción.
    'billing' => [
        'auto_issue' => (bool) env('HUB_BILLING_AUTO_ISSUE', false),
        'einvoice' => [
            'driver' => env('HUB_EINVOICE_DRIVER', 'fake'),
        ],
        // Constancias de pago (vouchers y comprobantes adjuntos): disco privado,
        // tipos verificados por contenido y tamaño máximo en KB (docs/10 §Archivos).
        'proofs' => [
            'disk' => env('HUB_BILLING_PROOFS_DISK', 'local'),
            'max_kb' => (int) env('HUB_BILLING_PROOF_MAX_KB', 5120),
            'mimes' => ['pdf', 'jpg', 'jpeg', 'png', 'webp'],
        ],
        // Pasarela de tarjetas (D-18): Mercado Pago Checkout Pro. Desactivada (el
        // portal oculta el botón) mientras falten MP_ACCESS_TOKEN o MP_WEBHOOK_SECRET.
        // Las llaves solo viven en el entorno; nunca en logs ni auditoría.
        'card_gateway' => [
            'driver' => env('HUB_CARD_GATEWAY_DRIVER', 'mercadopago'),   // mercadopago | none
            'portal_url' => env('HUB_PORTAL_URL', 'http://localhost:3001'),  // back_urls de retorno (mismo portal que hub.portal.url)
            'checkout_expiry_minutes' => (int) env('HUB_CARD_CHECKOUT_EXPIRY_MINUTES', 60),
            'mercadopago' => [
                'access_token' => env('MP_ACCESS_TOKEN'),
                'public_key' => env('MP_PUBLIC_KEY'),
                'webhook_secret' => env('MP_WEBHOOK_SECRET'),
                'sandbox' => (bool) env('MP_SANDBOX', true),
                'currencies' => env('MP_CURRENCIES', 'PEN'),
                'notification_url' => env('MP_NOTIFICATION_URL'),   // vacío: APP_URL/api/v1/webhooks/mercadopago (solo https)
                'statement_descriptor' => env('MP_STATEMENT_DESCRIPTOR'),
                'webhook_tolerance_seconds' => (int) env('MP_WEBHOOK_TOLERANCE_SECONDS', 300),
                'base_url' => 'https://api.mercadopago.com',
                'timeout' => 15,
            ],
        ],
    ],
];
