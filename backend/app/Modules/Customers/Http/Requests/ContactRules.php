<?php

declare(strict_types=1);

namespace App\Modules\Customers\Http\Requests;

use App\Modules\Customers\Models\Contact;
use Illuminate\Validation\Rule;

/** Reglas de contacto compartidas por el panel y el portal. */
final class ContactRules
{
    public static function rules(bool $creating): array
    {
        $req = $creating ? 'required' : 'sometimes';

        return [
            'name' => [$req, 'string', 'min:2', 'max:200'],
            'email' => ['sometimes', 'nullable', 'email', 'max:255'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:50'],
            'whatsapp' => ['sometimes', 'nullable', 'string', 'max:50'],
            'roles' => ['sometimes', 'array'],
            'roles.*' => [Rule::in(Contact::ROLES)],
            'is_primary' => ['sometimes', 'boolean'],
            'locale' => ['sometimes', 'nullable', Rule::in(['es', 'en'])],
        ];
    }
}
