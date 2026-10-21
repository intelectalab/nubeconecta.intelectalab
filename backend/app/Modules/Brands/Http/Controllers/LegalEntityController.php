<?php

declare(strict_types=1);

namespace App\Modules\Brands\Http\Controllers;

use App\Modules\Brands\Models\LegalEntity;
use App\Shared\Http\Controllers\ResourceController;
use App\Shared\Http\Problem\ProblemException;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/** /api/v1/admin/legal-entities (brands.legal_entity.*). Hoy una sola entidad emisora (un RUC). */
final class LegalEntityController extends ResourceController
{
    protected function model(): string
    {
        return LegalEntity::class;
    }

    protected function entity(): string
    {
        return 'legal_entity';
    }

    protected function rules(Request $request, ?Model $model): array
    {
        $required = $model === null ? 'required' : 'sometimes';

        return [
            'legal_name' => [$required, 'string', 'max:300'],
            'tax_id_type' => ['sometimes', 'string', 'max:20'],
            'tax_id' => [$required, 'string', 'max:20', 'regex:/^[0-9A-Za-z-]+$/'],
            'country' => ['sometimes', 'string', 'regex:/^[A-Z]{2}$/'],
            'currency' => ['sometimes', Rule::in(['PEN', 'USD'])],
            'fiscal_address' => ['sometimes', 'nullable', 'string', 'max:500'],
            'is_services_exporter' => ['sometimes', 'boolean'],
            'einvoice_provider_ref' => ['sometimes', 'nullable', 'string', 'max:200'],
        ];
    }

    protected function sortable(): array
    {
        return ['legal_name', 'created_at'];
    }

    protected function defaultSort(): string
    {
        return 'legal_name';
    }

    protected function beforeDelete(Model $model): void
    {
        $uses = ['brands' => 'default_legal_entity_id', 'bank_accounts' => 'legal_entity_id', 'document_series' => 'legal_entity_id', 'invoices' => 'legal_entity_id'];
        foreach ($uses as $table => $column) {
            if (DB::table($table)->where($column, $model->getKey())->exists()) {
                throw new ProblemException(409, 'conflict', "La entidad emisora está en uso ({$table}).");
            }
        }
    }
}
