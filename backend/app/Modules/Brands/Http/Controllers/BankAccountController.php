<?php

declare(strict_types=1);

namespace App\Modules\Brands\Http\Controllers;

use App\Modules\Brands\Models\BankAccount;
use App\Shared\Http\Controllers\ResourceController;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** /api/v1/admin/bank-accounts (brands.bank_account.*), incluida la cuenta de detracciones (Banco de la Nación). */
final class BankAccountController extends ResourceController
{
    protected function model(): string
    {
        return BankAccount::class;
    }

    protected function entity(): string
    {
        return 'bank_account';
    }

    protected function rules(Request $request, ?Model $model): array
    {
        $required = $model === null ? 'required' : 'sometimes';
        $org = app(CurrentOrganization::class)->id();

        return [
            'legal_entity_id' => [$required, 'uuid', Rule::exists('legal_entities', 'id')->where('organization_id', $org)],
            'brand_id' => ['sometimes', 'nullable', 'uuid', Rule::exists('brands', 'id')->where('organization_id', $org)->whereNull('deleted_at')],
            'bank_name' => [$required, 'string', 'max:200'],
            'account_type' => [$required, Rule::in(['checking', 'savings', 'detraction'])],
            'account_number' => [$required, 'string', 'max:40', 'regex:/^[0-9-]+$/'],
            'cci' => ['sometimes', 'nullable', 'string', 'regex:/^[0-9]{20}$/'],
            'currency' => [$required, Rule::in(['PEN', 'USD'])],
            'show_on_invoice' => ['sometimes', 'boolean'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }

    protected function sortable(): array
    {
        return ['bank_name', 'created_at'];
    }

    protected function filters(): array
    {
        return ['legal_entity_id' => 'legal_entity_id', 'brand_id' => 'brand_id', 'currency' => 'currency', 'account_type' => 'account_type', 'is_active' => 'is_active'];
    }
}
