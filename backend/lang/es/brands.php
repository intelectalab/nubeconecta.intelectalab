<?php

declare(strict_types=1);

return [
    'tokens_object' => 'Los tokens deben ser un objeto JSON.',
    'tokens_too_deep' => 'Los tokens tienen demasiados niveles.',
    'token_name' => 'Nombre de token inválido (minúsculas, números y _).',
    'token_scalar' => 'El token debe ser texto, número o booleano.',
    'token_forbidden' => 'Los tokens son declarativos: no se admite CSS, url(), @import ni scripts.',
    'token_color' => 'El color debe ser hexadecimal (#rgb o #rrggbb).',
    'token_font' => 'Tipografía no permitida. Permitidas: :fonts.',
    'contrast_pairs_missing' => 'Faltan colores obligatorios para verificar el contraste.',
    'surface' => 'Superficie no permitida (portal, admin, email).',
];
