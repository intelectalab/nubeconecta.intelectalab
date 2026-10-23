<?php

declare(strict_types=1);

namespace App\Modules\Customers\Services;

use App\Modules\Customers\Models\Contact;
use App\Modules\Customers\Models\Customer;
use App\Shared\Http\Problem\ProblemException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Throwable;

/**
 * Plantillas CSV de clientes y contactos con validación fila por fila y
 * deduplicación (M-CUS §4.7). El asistente genérico (vista previa por lotes,
 * aprobación) es de AUT; aquí se procesa el archivo de forma síncrona: cada
 * fila válida se guarda en su propio punto de guardado y las inválidas van al
 * reporte descargable (CSV fila,campo,error).
 */
final class CustomerImporter
{
    public const CUSTOMER_COLUMNS = ['type', 'legal_name', 'trade_name', 'tax_id_type', 'tax_id', 'country', 'currency', 'email', 'phone', 'address', 'tax_treatment', 'invoice_consolidation'];

    public const CONTACT_COLUMNS = ['customer_code', 'name', 'email', 'phone', 'whatsapp', 'roles', 'is_primary'];

    public const MAX_ROWS = 5000;

    public function __construct(private readonly CustomerService $customers) {}

    public static function template(string $kind): string
    {
        return implode(',', $kind === 'contacts' ? self::CONTACT_COLUMNS : self::CUSTOMER_COLUMNS)."\n";
    }

    /**
     * @return array{kind: string, dry_run: bool, total: int, imported: int, failed: int, errors: list<array{row: int, field: string, message: string}>, error_report_csv: string}
     */
    public function import(string $kind, string $csv, ?string $originBrandId, bool $dryRun): array
    {
        $rows = $this->parse($csv, $kind === 'contacts' ? self::CONTACT_COLUMNS : self::CUSTOMER_COLUMNS);
        $errors = [];
        $imported = 0;
        $seen = [];

        foreach ($rows as $line => $row) {
            try {
                $rowErrors = $kind === 'contacts'
                    ? $this->contactRow($row, $dryRun)
                    : $this->customerRow($row, $originBrandId, $dryRun, $seen, $line);
            } catch (ProblemException $e) {
                $rowErrors = [];
                foreach ((array) ($e->extra['errors'] ?? []) as $field => $messages) {
                    $rowErrors[] = [$field, (string) ($messages[0] ?? $e->getMessage())];
                }
                if ($rowErrors === []) {
                    $dup = $e->extra['duplicates'][0]['code'] ?? null;
                    $rowErrors[] = ['tax_id', $dup ? "Documento ya registrado en {$dup}." : ($e->getMessage() ?: $e->problemCode)];
                }
            } catch (Throwable $e) {
                report($e);
                $rowErrors = [['row', 'Error inesperado al guardar la fila.']];
            }
            if ($rowErrors === []) {
                $imported++;
            }
            foreach ($rowErrors as [$field, $message]) {
                $errors[] = ['row' => $line, 'field' => $field, 'message' => $message];
            }
        }

        $failed = count(array_unique(array_column($errors, 'row')));
        $report = "fila,campo,error\n";
        foreach ($errors as $e) {
            $report .= $e['row'].','.$this->csvCell($e['field']).','.$this->csvCell($e['message'])."\n";
        }

        return ['kind' => $kind, 'dry_run' => $dryRun, 'total' => count($rows), 'imported' => $dryRun ? 0 : $imported, 'valid' => $imported, 'failed' => $failed, 'errors' => $errors, 'error_report_csv' => $report];
    }

    /**
     * @param  array<string, string>  $row
     * @param  array<string, int>  $seen
     * @return list<array{string, string}>
     */
    private function customerRow(array $row, ?string $originBrandId, bool $dryRun, array &$seen, int $line): array
    {
        $data = array_filter($row, fn ($v) => $v !== '');
        $data['origin_brand_id'] = $originBrandId;
        $data['country'] = strtoupper($data['country'] ?? '');
        $data['currency'] = strtoupper($data['currency'] ?? '');
        $data['tax_id_type'] = isset($data['tax_id_type']) ? strtolower($data['tax_id_type']) : null;
        $validator = Validator::make($data, array_intersect_key($this->customers->rules(null), array_flip([...self::CUSTOMER_COLUMNS, 'origin_brand_id'])));
        if ($validator->fails()) {
            return array_map(fn (string $field, array $messages) => [$field, $messages[0]], array_keys($validator->errors()->messages()), $validator->errors()->messages());
        }
        $key = ($data['tax_id_type'] ?? '').':'.strtoupper(preg_replace('/[\s.\-]+/', '', (string) ($data['tax_id'] ?? '')) ?? '');
        if ($key !== ':' && isset($seen[$key])) {
            return [['tax_id', "Documento repetido en el archivo (fila {$seen[$key]})."]];
        }
        if ($key !== ':') {
            $seen[$key] = $line;
        }

        // Importación: el nombre o correo parecido no detiene la fila (se propone fusión manual luego).
        $data['confirm_duplicates'] = true;
        if ($dryRun) {
            DB::beginTransaction();
            try {
                $this->customers->create($data, ['source' => 'import']);
            } finally {
                DB::rollBack();
            }
        } else {
            DB::transaction(fn () => $this->customers->create($data, ['source' => 'import']));
        }

        return [];
    }

    /**
     * @param  array<string, string>  $row
     * @return list<array{string, string}>
     */
    private function contactRow(array $row, bool $dryRun): array
    {
        $data = array_filter($row, fn ($v) => $v !== '');
        $data['roles'] = isset($data['roles']) ? array_values(array_filter(array_map('trim', explode('|', strtolower($data['roles']))))) : [];
        $data['is_primary'] = in_array(strtolower($data['is_primary'] ?? ''), ['1', 'true', 'si', 'sí'], true);
        $validator = Validator::make($data, [
            'customer_code' => ['required', 'string'],
            'name' => ['required', 'string', 'max:200'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'whatsapp' => ['nullable', 'string', 'max:50'],
            'roles' => ['array'],
            'roles.*' => [Rule::in(Contact::ROLES)],
        ]);
        if ($validator->fails()) {
            return array_map(fn (string $field, array $messages) => [$field, $messages[0]], array_keys($validator->errors()->messages()), $validator->errors()->messages());
        }
        $customer = Customer::query()->where('code', $data['customer_code'])->first();
        if ($customer === null) {
            return [['customer_code', 'No existe un cliente con ese código.']];
        }
        if (! $dryRun) {
            DB::transaction(function () use ($customer, $data): void {
                $contact = new Contact;
                $contact->forceFill(['customer_id' => $customer->id] + array_intersect_key($data, array_flip($contact->getFillable())))->save();
            });
        }

        return [];
    }

    /**
     * @param  list<string>  $columns
     * @return array<int, array<string, string>> número de línea (1 = encabezado) => fila
     */
    private function parse(string $csv, array $columns): array
    {
        $csv = (string) preg_replace('/^\xEF\xBB\xBF/', '', $csv);
        $lines = preg_split('/\r\n|\n|\r/', trim($csv)) ?: [];
        $header = array_map(fn ($h) => strtolower(trim($h)), str_getcsv((string) array_shift($lines), ',', '"', '\\'));
        $unknown = array_diff($header, $columns);
        if ($header === [''] || $unknown !== []) {
            throw ProblemException::validation(['file' => ['Encabezado inválido; use la plantilla. Columnas desconocidas: '.implode(', ', $unknown)]]);
        }
        if (count($lines) > self::MAX_ROWS) {
            throw ProblemException::validation(['file' => ['Máximo '.self::MAX_ROWS.' filas por archivo.']]);
        }
        $out = [];
        foreach ($lines as $i => $line) {
            if (trim($line) === '') {
                continue;
            }
            $cells = str_getcsv($line, ',', '"', '\\');
            $out[$i + 2] = array_combine($header, array_map('trim', array_pad(array_slice($cells, 0, count($header)), count($header), '')));
        }

        return $out;
    }

    private function csvCell(string $value): string
    {
        // Evita inyección de fórmulas al abrir el reporte en una hoja de cálculo.
        if ($value !== '' && in_array($value[0], ['=', '+', '-', '@'], true)) {
            $value = "'".$value;
        }

        return '"'.str_replace('"', '""', $value).'"';
    }
}
