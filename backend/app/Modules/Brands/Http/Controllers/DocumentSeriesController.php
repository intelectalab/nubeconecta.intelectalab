<?php

declare(strict_types=1);

namespace App\Modules\Brands\Http\Controllers;

use App\Modules\Brands\Events\DocumentSeriesChanged;
use App\Modules\Brands\Models\DocumentSeries;
use App\Shared\Http\Controllers\ResourceController;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * /api/v1/admin/document-series (brands.document_series.*). `next_number` solo
 * se fija al crear (para continuar una numeración previa); después lo mueve
 * DocumentNumberAllocator. Una serie con documentos emitidos no se borra ni
 * cambia de tipo (409 series_in_use); solo se desactiva.
 */
final class DocumentSeriesController extends ResourceController
{
    protected function model(): string
    {
        return DocumentSeries::class;
    }

    protected function entity(): string
    {
        return 'document_series';
    }

    protected function rules(Request $request, ?Model $model): array
    {
        $types = Rule::in(['invoice', 'receipt', 'credit_note', 'debit_note']);
        if ($model !== null) {
            return ['document_type' => ['sometimes', $types], 'is_active' => ['sometimes', 'boolean']];
        }

        return [
            'legal_entity_id' => ['required', 'uuid', Rule::exists('legal_entities', 'id')->where('organization_id', app(CurrentOrganization::class)->id())],
            'document_type' => ['required', $types],
            'series' => ['required', 'string', 'regex:/^[A-Z0-9]{4}$/'],
            'next_number' => ['sometimes', 'integer', 'min:1'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }

    protected function sortable(): array
    {
        return ['series', 'created_at'];
    }

    protected function defaultSort(): string
    {
        return 'series';
    }

    protected function filters(): array
    {
        return ['legal_entity_id' => 'legal_entity_id', 'document_type' => 'document_type', 'is_active' => 'is_active'];
    }

    protected function beforeSave(Model $model, array $data, bool $creating): void
    {
        if (! $creating && $model->isDirty('document_type') && $this->inUse($model)) {
            throw new ProblemException(409, 'series_in_use');
        }
    }

    protected function afterSave(Model $model, bool $creating, ?array $before): void
    {
        DocumentSeriesChanged::dispatch($model->organization_id, $model->getKey(), $creating ? 'created' : 'updated');
    }

    protected function beforeDelete(Model $model): void
    {
        if ($this->inUse($model)) {
            throw new ProblemException(409, 'series_in_use');
        }
    }

    protected function afterDelete(Model $model): void
    {
        DocumentSeriesChanged::dispatch($model->organization_id, $model->getKey(), 'deleted');
    }

    /** Con documentos: algún comprobante la referencia o ya se tomó algún número desde que se creó. */
    private function inUse(Model $series): bool
    {
        $created = DB::table('audit_events')->where('entity_type', 'document_series')->where('entity_id', $series->getKey())
            ->where('action', 'document_series.created')->value('after');
        $initial = $created !== null ? (int) (json_decode((string) $created, true)['next_number'] ?? 1) : 1;

        return (int) $series->getOriginal('next_number') > $initial
            || DB::table('invoices')->where('document_series_id', $series->getKey())->exists();
    }
}
