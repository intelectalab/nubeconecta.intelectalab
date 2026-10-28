<?php

declare(strict_types=1);

return [
    'bad_request' => ['title' => 'Petición inválida'],
    'unauthenticated' => ['title' => 'No autenticado', 'detail' => 'Inicie sesión para continuar.'],
    'forbidden' => ['title' => 'Sin permiso', 'detail' => 'No tiene permiso para realizar esta acción.'],
    'password_change_required' => ['title' => 'Debe cambiar su contraseña', 'detail' => 'Cambie su contraseña para continuar.'],
    'mfa_required' => ['title' => 'Se requiere segundo factor', 'detail' => 'Confirme su identidad con el segundo factor para continuar.'],
    'not_found' => ['title' => 'No encontrado', 'detail' => 'El recurso no existe.'],
    'method_not_allowed' => ['title' => 'Método no permitido'],
    'conflict' => ['title' => 'Conflicto', 'detail' => 'La operación no es compatible con el estado actual del recurso.'],
    'version_conflict' => ['title' => 'Versión desactualizada', 'detail' => 'El registro cambió desde que lo abrió. Recárguelo y vuelva a intentar.'],
    'system_role_protected' => ['title' => 'Rol del sistema', 'detail' => 'Los roles del sistema no se borran ni cambian de código o audiencia.'],
    'idempotency_in_progress' => ['title' => 'Operación en curso', 'detail' => 'Una petición con la misma Idempotency-Key aún se está procesando.'],
    'idempotency_key_reused' => ['title' => 'Clave de idempotencia reutilizada', 'detail' => 'La Idempotency-Key ya se usó con otro contenido.'],
    'csrf_token_mismatch' => ['title' => 'Sesión vencida', 'detail' => 'Recargue la página e intente de nuevo.'],
    'validation_failed' => ['title' => 'Datos inválidos', 'detail' => 'Revise los campos marcados.'],
    'rate_limited' => ['title' => 'Demasiadas peticiones', 'detail' => 'Espere un momento antes de reintentar.'],
    'server_error' => ['title' => 'Error interno', 'detail' => 'Ocurrió un error inesperado.'],
    'service_unavailable' => ['title' => 'Servicio no disponible'],
    'token_expired' => ['title' => 'Enlace vencido', 'detail' => 'El enlace venció. Pide uno nuevo.'],
    'token_invalid' => ['title' => 'Enlace no válido', 'detail' => 'El enlace no es válido o ya se usó. Pide uno nuevo.'],
    'already_activated' => ['title' => 'Cuenta ya activada', 'detail' => 'El contacto ya activó su cuenta; puede restablecer su contraseña desde el acceso al portal.'],
    'invalid_credentials' => 'Las credenciales no son válidas.',
    'invalid_mfa_code' => 'El código no es válido.',
    'password_reused' => 'No puede reutilizar una contraseña reciente.',
    'invalid_transition' => ['title' => 'Transición no permitida', 'detail' => 'El estado actual del recurso no admite esta acción.'],
    'contrast_not_verified' => ['title' => 'Contraste sin verificar', 'detail' => 'Verifique el contraste del tema con el mínimo vigente antes de publicarlo.'],
    'contrast_below_minimum' => ['title' => 'Contraste insuficiente', 'detail' => 'Algún par texto/fondo del tema no alcanza el contraste mínimo; la versión quedó como borrador.'],
    'series_in_use' => ['title' => 'Serie con documentos', 'detail' => 'La serie ya tiene documentos emitidos: no se borra ni cambia de tipo; solo se desactiva.'],
];
