<?php

declare(strict_types=1);

return [
    'tokens_object' => 'Tokens must be a JSON object.',
    'tokens_too_deep' => 'Tokens are nested too deeply.',
    'token_name' => 'Invalid token name (lowercase, digits and _).',
    'token_scalar' => 'The token must be text, number or boolean.',
    'token_forbidden' => 'Tokens are declarative: CSS, url(), @import and scripts are not allowed.',
    'token_color' => 'The color must be hexadecimal (#rgb or #rrggbb).',
    'token_font' => 'Font not allowed. Allowed: :fonts.',
    'contrast_pairs_missing' => 'Required colors are missing to check contrast.',
    'surface' => 'Surface not allowed (portal, admin, email).',
];
