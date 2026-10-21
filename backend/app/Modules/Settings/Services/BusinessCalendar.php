<?php

declare(strict_types=1);

namespace App\Modules\Settings\Services;

use App\Modules\Settings\Models\BusinessHour;
use App\Modules\Settings\Models\Holiday;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use RuntimeException;

/**
 * Días hábiles y horario de atención (M-CFG §4.7). Un día es hábil si su día
 * de la semana tiene al menos un tramo en `business_hours` del calendario y
 * no es feriado del país (fecha exacta o feriado recurrente del mismo día y mes).
 * Lo usan el SLA (M-HLP) y la cobranza (M-BIL: la suspensión que cae en
 * feriado pasa al siguiente día hábil).
 *
 * Sin horario configurado para el calendario no se asume ninguno: se lanza
 * una excepción (el horario inicial lo define el negocio, no el código).
 */
final class BusinessCalendar
{
    private const MAX_SCAN_DAYS = 366;

    /** @var array<string, array<int, list<array{0: string, 1: string}>>> */
    private array $hours = [];

    /** @var array<string, string> */
    private array $timezones = [];

    /** @var array<string, array{exact: array<string, true>, recurring: array<string, true>}> */
    private array $holidays = [];

    public function isHoliday(CarbonInterface $date, string $country = 'PE'): bool
    {
        $set = $this->holidaySet($country);

        return isset($set['exact'][$date->format('Y-m-d')]) || isset($set['recurring'][$date->format('m-d')]);
    }

    public function isBusinessDay(CarbonInterface $date, string $country = 'PE', string $calendar = 'default'): bool
    {
        return ($this->weekHours($calendar)[$date->isoWeekday()] ?? []) !== [] && ! $this->isHoliday($date, $country);
    }

    /** El mismo día si es hábil; si no, el siguiente día hábil. */
    public function nextBusinessDay(CarbonInterface $date, string $country = 'PE', string $calendar = 'default'): CarbonImmutable
    {
        $day = CarbonImmutable::instance($date)->startOfDay();
        for ($i = 0; $i <= self::MAX_SCAN_DAYS; $i++, $day = $day->addDay()) {
            if ($this->isBusinessDay($day, $country, $calendar)) {
                return $day;
            }
        }

        throw new RuntimeException('No hay días hábiles en el próximo año: revise el horario y los feriados.');
    }

    /** Suma $days días hábiles (0 = el mismo día si es hábil o el siguiente hábil). */
    public function addBusinessDays(CarbonInterface $date, int $days, string $country = 'PE', string $calendar = 'default'): CarbonImmutable
    {
        $day = $this->nextBusinessDay($date, $country, $calendar);
        for ($i = 0; $i < $days; $i++) {
            $day = $this->nextBusinessDay($day->addDay(), $country, $calendar);
        }

        return $day;
    }

    /** ¿El instante cae dentro del horario de atención (en la zona horaria del calendario)? */
    public function isOpenAt(CarbonInterface $instant, string $country = 'PE', string $calendar = 'default'): bool
    {
        $week = $this->weekHours($calendar);
        $local = CarbonImmutable::instance($instant)->setTimezone($this->timezones[$calendar]);
        if ($this->isHoliday($local, $country)) {
            return false;
        }
        $time = $local->format('H:i:s');
        foreach ($week[$local->isoWeekday()] ?? [] as [$opens, $closes]) {
            if ($time >= $opens && $time < $closes) {
                return true;
            }
        }

        return false;
    }

    /** @return array<int, list<array{0: string, 1: string}>> */
    private function weekHours(string $calendar): array
    {
        if (! isset($this->hours[$calendar])) {
            $rows = BusinessHour::query()->where('calendar', $calendar)->orderBy('weekday')->orderBy('opens_at')->get();
            if ($rows->isEmpty()) {
                throw new RuntimeException("El calendario [{$calendar}] no tiene horario de atención configurado (business_hours).");
            }
            $week = [];
            foreach ($rows as $row) {
                $week[$row->weekday][] = [self::time($row->opens_at), self::time($row->closes_at)];
            }
            $this->hours[$calendar] = $week;
            $this->timezones[$calendar] = (string) $rows->first()->timezone;
        }

        return $this->hours[$calendar];
    }

    /** @return array{exact: array<string, true>, recurring: array<string, true>} */
    private function holidaySet(string $country): array
    {
        if (! isset($this->holidays[$country])) {
            $set = ['exact' => [], 'recurring' => []];
            foreach (Holiday::query()->where('country', $country)->get(['date', 'recurring']) as $holiday) {
                $set['exact'][$holiday->date->format('Y-m-d')] = true;
                if ($holiday->recurring) {
                    $set['recurring'][$holiday->date->format('m-d')] = true;
                }
            }
            $this->holidays[$country] = $set;
        }

        return $this->holidays[$country];
    }

    private static function time(string $value): string
    {
        return strlen($value) === 5 ? $value.':00' : substr($value, 0, 8);
    }
}
