<?php

declare(strict_types=1);

namespace App\Modules\Settings\Http\Controllers;

use App\Modules\Settings\Models\Holiday;
use App\Shared\Http\Controllers\ResourceController;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

/** /api/v1/admin/holidays (settings.holiday.*). Duplicado país+fecha → 409 conflict. */
final class HolidayController extends ResourceController
{
    protected function model(): string
    {
        return Holiday::class;
    }

    protected function entity(): string
    {
        return 'holiday';
    }

    protected function rules(Request $request, ?Model $model): array
    {
        $required = $model === null ? 'required' : 'sometimes';

        return [
            'country' => ['sometimes', 'string', 'size:2', 'regex:/^[A-Z]{2}$/'],
            'date' => [$required, 'date_format:Y-m-d'],
            'name' => [$required, 'string', 'max:200'],
            'recurring' => ['sometimes', 'boolean'],
        ];
    }

    protected function sortable(): array
    {
        return ['date', 'created_at'];
    }

    protected function defaultSort(): string
    {
        return 'date';
    }

    protected function filters(): array
    {
        return ['country' => 'country', 'recurring' => 'recurring'];
    }

    protected function query(): Builder
    {
        $query = parent::query();
        $year = request()->input('filter.year');
        if (is_string($year) && ctype_digit($year)) {
            // Del año pedido más los recurrentes (aplican todos los años).
            $query->where(fn (Builder $q) => $q->whereYear('date', (int) $year)->orWhere('recurring', true));
        }

        return $query;
    }
}
