<?php

declare(strict_types=1);

namespace App\Modules\Settings\Http\Controllers;

use App\Modules\Settings\Models\BusinessHour;
use App\Shared\Audit\AuditLogger;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Http\Resources\ModelResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * /api/v1/admin/business-hours/{calendar}: horario semanal de un calendario
 * (settings.business_hours.*). PUT reemplaza la semana completa en una
 * transacción; `version` es la mayor de las filas actuales (0 si no hay) para
 * detectar ediciones simultáneas (409 version_conflict).
 */
final class BusinessHourController
{
    public function __construct(private readonly AuditLogger $audit) {}

    public function show(string $calendar = 'default'): JsonResponse
    {
        return response()->json(['data' => $this->present($calendar)]);
    }

    public function replace(Request $request, string $calendar = 'default'): JsonResponse
    {
        $data = $request->validate([
            'version' => ['required', 'integer', 'min:0'],
            'timezone' => ['required', 'timezone:all'],
            'intervals' => ['present', 'array', 'max:50'],
            'intervals.*.weekday' => ['required', 'integer', 'between:1,7'],
            'intervals.*.opens_at' => ['required', 'date_format:H:i'],
            'intervals.*.closes_at' => ['required', 'date_format:H:i', 'after:intervals.*.opens_at'],
        ]);
        $this->assertNoOverlap($data['intervals']);

        DB::transaction(function () use ($calendar, $data): void {
            $current = BusinessHour::query()->where('calendar', $calendar)->lockForUpdate()->get();
            $currentVersion = (int) $current->max('version');
            if ($currentVersion !== (int) $data['version']) {
                throw ProblemException::versionConflict($currentVersion);
            }
            $before = $current->map->only(['weekday', 'opens_at', 'closes_at', 'timezone'])->all();
            BusinessHour::query()->where('calendar', $calendar)->delete();
            foreach ($data['intervals'] as $interval) {
                (new BusinessHour([
                    'calendar' => $calendar,
                    'timezone' => $data['timezone'],
                    'weekday' => $interval['weekday'],
                    'opens_at' => $interval['opens_at'],
                    'closes_at' => $interval['closes_at'],
                ]))->forceFill(['version' => $currentVersion + 1])->save();
            }
            $this->audit->record('business_hours.replaced', 'business_hours', null, ['calendar' => $calendar, 'intervals' => $before], ['calendar' => $calendar, 'timezone' => $data['timezone'], 'intervals' => $data['intervals']]);
        });

        return response()->json(['data' => $this->present($calendar)]);
    }

    /** @param list<array{weekday: int, opens_at: string, closes_at: string}> $intervals */
    private function assertNoOverlap(array $intervals): void
    {
        $byDay = [];
        foreach ($intervals as $i => $interval) {
            foreach ($byDay[$interval['weekday']] ?? [] as [$opens, $closes]) {
                if ($interval['opens_at'] < $closes && $opens < $interval['closes_at']) {
                    throw ProblemException::validation(["intervals.{$i}" => [__('settings.overlapping_hours')]]);
                }
            }
            $byDay[$interval['weekday']][] = [$interval['opens_at'], $interval['closes_at']];
        }
    }

    /** @return array<string, mixed> */
    private function present(string $calendar): array
    {
        $rows = BusinessHour::query()->where('calendar', $calendar)->orderBy('weekday')->orderBy('opens_at')->get();

        return [
            'calendar' => $calendar,
            'timezone' => $rows->first()?->timezone,
            'version' => (int) $rows->max('version'),
            'intervals' => ModelResource::collection($rows)->resolve(),
        ];
    }
}
