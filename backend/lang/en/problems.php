<?php

declare(strict_types=1);

return [
    'bad_request' => ['title' => 'Bad request'],
    'unauthenticated' => ['title' => 'Unauthenticated', 'detail' => 'Sign in to continue.'],
    'forbidden' => ['title' => 'Forbidden', 'detail' => 'You are not allowed to perform this action.'],
    'password_change_required' => ['title' => 'Password change required', 'detail' => 'Change your password to continue.'],
    'mfa_required' => ['title' => 'Second factor required', 'detail' => 'Confirm your identity with your second factor to continue.'],
    'not_found' => ['title' => 'Not found', 'detail' => 'The resource does not exist.'],
    'method_not_allowed' => ['title' => 'Method not allowed'],
    'conflict' => ['title' => 'Conflict', 'detail' => 'The operation is not compatible with the current state of the resource.'],
    'version_conflict' => ['title' => 'Outdated version', 'detail' => 'The record changed since you opened it. Reload and try again.'],
    'system_role_protected' => ['title' => 'System role', 'detail' => 'System roles cannot be deleted nor change code or audience.'],
    'idempotency_in_progress' => ['title' => 'Operation in progress', 'detail' => 'A request with the same Idempotency-Key is still being processed.'],
    'idempotency_key_reused' => ['title' => 'Idempotency key reused', 'detail' => 'The Idempotency-Key was already used with a different payload.'],
    'csrf_token_mismatch' => ['title' => 'Session expired', 'detail' => 'Reload the page and try again.'],
    'validation_failed' => ['title' => 'Invalid data', 'detail' => 'Check the highlighted fields.'],
    'rate_limited' => ['title' => 'Too many requests', 'detail' => 'Wait a moment before retrying.'],
    'server_error' => ['title' => 'Internal error', 'detail' => 'An unexpected error occurred.'],
    'service_unavailable' => ['title' => 'Service unavailable'],
    'token_expired' => ['title' => 'Link expired', 'detail' => 'The link has expired. Request a new one.'],
    'token_invalid' => ['title' => 'Invalid link', 'detail' => 'The link is invalid or was already used. Request a new one.'],
    'already_activated' => ['title' => 'Account already activated', 'detail' => 'The contact already activated the account; they can reset the password from the portal sign-in.'],
    'invalid_credentials' => 'The credentials are not valid.',
    'invalid_mfa_code' => 'The code is not valid.',
    'password_reused' => 'You cannot reuse a recent password.',
    'invalid_transition' => ['title' => 'Transition not allowed', 'detail' => 'The current state of the resource does not allow this action.'],
    'contrast_not_verified' => ['title' => 'Contrast not verified', 'detail' => 'Check the theme contrast against the current minimum before publishing.'],
    'contrast_below_minimum' => ['title' => 'Insufficient contrast', 'detail' => 'A text/background pair is below the minimum contrast; the version stays as a draft.'],
    'series_in_use' => ['title' => 'Series in use', 'detail' => 'The series already has issued documents: it cannot be deleted or change type, only deactivated.'],
];
