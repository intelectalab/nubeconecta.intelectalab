<?php

declare(strict_types=1);

namespace App\Modules\Customers\Services;

use App\Modules\Customers\Events\CustomerCreated;
use App\Modules\Customers\Events\CustomerFiscalDataChanged;
use App\Modules\Customers\Events\CustomerUpdated;
use App\Modules\Customers\Models\Customer;
use App\Modules\Customers\Support\TaxIdValidator;
use App\Shared\Audit\AuditLogger;
use App\Shared\Concurrency\VersionGuard;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Casos de uso de clientes (M-CUS §4): alta con detección de duplicados y
 * correlativo `CLI-000123`, edición con auditoría de datos fiscales (valor
 * anterior y nuevo, venga del panel o del portal), etiquetas y campos
 * personalizados. Interfaz pública para SAL (`createFromLead`) e importación.
 */
final class CustomerService
{
    public function __construct(
        private readonly AuditLogger $audit,
        private readonly CurrentOrganization $organization,
    ) {}

    /** Reglas del formulario P-CUS-02; $customer null = alta. */
    public function rules(?Customer $customer): array
    {
        $org = $this->organization->id();
        $req = $customer === null ? 'required' : 'sometimes';

        return [
            'type' => [$req, Rule::in(['company', 'individual'])],
            'legal_name' => [$req, 'string', 'min:2', 'max:300'],
            'trade_name' => ['sometimes', 'nullable', 'string', 'max:300'],
            'tax_id_type' => ['sometimes', 'nullable', Rule::in(TaxIdValidator::TYPES), 'required_with:tax_id'],
            'tax_id' => ['sometimes', 'nullable', 'string', 'max:30', 'required_with:tax_id_type'],
            'country' => [$req, 'string', 'size:2', 'alpha'],
            'currency' => [$req, Rule::in(['PEN', 'USD'])],
            'locale' => ['sometimes', Rule::in(['es', 'en'])],
            'timezone' => ['sometimes', 'timezone:all'],
            'email' => ['sometimes', 'nullable', 'email', 'max:255'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:50'],
            'address' => ['sometimes', 'nullable', 'string', 'max:500'],
            'status' => ['sometimes', Rule::in(['active', 'inactive'])],
            'tax_treatment' => ['sometimes', Rule::in(['taxed', 'export'])],
            'is_withholding_agent' => ['sometimes', 'boolean'],
            'invoice_consolidation' => ['sometimes', Rule::in(['consolidated', 'per_service'])],
            'origin_brand_id' => [$req, 'uuid', Rule::exists('brands', 'id')->where('organization_id', $org)->whereNull('deleted_at')],
            'account_manager_id' => ['sometimes', 'nullable', 'uuid', Rule::exists('users', 'id')->where('organization_id', $org)->where('type', 'staff')->whereNull('deleted_at')],
            'custom' => ['sometimes', 'array'],
            'tag_ids' => ['sometimes', 'array', 'max:50'],
            'tag_ids.*' => ['uuid', Rule::exists('tags', 'id')->where('organization_id', $org)],
            'confirm_duplicates' => ['sometimes', 'boolean'],
        ];
    }

    /**
     * Alta. Con el mismo documento ya registrado responde 409 `duplicate_customer`
     * (no se puede forzar: el documento es único); con correo o nombre parecidos,
     * 409 `possible_duplicate` salvo `confirm_duplicates: true`.
     *
     * @param  array<string, mixed>  $data
     * @param  array<string, mixed>  $auditMeta
     */
    public function create(array $data, array $auditMeta = []): Customer
    {
        $customer = new Customer;
        $customer->forceFill(Arr::only($data, $customer->getFillable()));
        $this->normalize($customer);
        $this->assertBusinessRules($customer);
        $this->assertNoDuplicates($customer, (bool) ($data['confirm_duplicates'] ?? false));

        return DB::transaction(function () use ($customer, $data, $auditMeta): Customer {
            $customer->code = $this->nextCode();
            $customer->save();
            if (array_key_exists('tag_ids', $data)) {
                $this->syncTags($customer, (array) $data['tag_ids']);
            }
            $this->audit->record('customer.created', 'customer', $customer->id, null, $customer->refresh()->attributesToArray(), $auditMeta, $customer->id);
            CustomerCreated::dispatch($customer->organization_id, $customer->id);

            return $customer;
        });
    }

    /**
     * Edición con versión optimista. $origin: `admin` o `portal`.
     *
     * @param  array<string, mixed>  $data
     */
    public function update(Customer $customer, array $data, string $origin = 'admin'): Customer
    {
        return DB::transaction(function () use ($customer, $data, $origin): Customer {
            VersionGuard::check($customer, (int) $data['version']);
            $before = $customer->attributesToArray();
            $customer->forceFill(Arr::only($data, $customer->getFillable()));
            $this->normalize($customer);
            $this->assertBusinessRules($customer);
            if ($customer->isDirty(['tax_id_type', 'tax_id', 'email', 'legal_name'])) {
                $this->assertNoDuplicates($customer, (bool) ($data['confirm_duplicates'] ?? false) || ! $customer->isDirty(['tax_id_type', 'tax_id']));
            }
            $fiscal = [];
            foreach (Customer::FISCAL as $field) {
                if ($customer->isDirty($field)) {
                    $fiscal[$field] = ['before' => $customer->getOriginal($field), 'after' => $customer->getAttribute($field)];
                }
            }
            $customer->save();
            if (array_key_exists('tag_ids', $data)) {
                $this->syncTags($customer, (array) $data['tag_ids']);
            }
            $after = $customer->refresh()->attributesToArray();
            $this->audit->record('customer.updated', 'customer', $customer->id, $before, $after, ['origin' => $origin], $customer->id);
            if ($fiscal !== []) {
                $this->audit->record(
                    'customer.fiscal_data_changed', 'customer', $customer->id,
                    array_map(fn (array $c) => $c['before'], $fiscal),
                    array_map(fn (array $c) => $c['after'], $fiscal),
                    ['origin' => $origin], $customer->id,
                );
                CustomerFiscalDataChanged::dispatch($customer->organization_id, $customer->id, $fiscal, $origin);
            }
            CustomerUpdated::dispatch($customer->organization_id, $customer->id);

            return $customer;
        });
    }

    /**
     * Interfaz para SAL: un prospecto ganado se convierte en cliente (M-CUS §2).
     * Si el documento ya existe devuelve ese cliente en lugar de duplicarlo.
     *
     * @param  array<string, mixed>  $data  mismos campos del alta
     */
    public function createFromLead(string $leadId, array $data): Customer
    {
        if (! empty($data['tax_id_type']) && ! empty($data['tax_id'])) {
            $existing = Customer::query()->where('tax_id_type', $data['tax_id_type'])
                ->where('tax_id', TaxIdValidator::normalize((string) $data['tax_id_type'], (string) $data['tax_id']))->first();
            if ($existing !== null) {
                return $existing;
            }
        }

        return $this->create(['confirm_duplicates' => true] + $data, ['lead_id' => $leadId]);
    }

    /**
     * Posibles duplicados por documento, correo y nombre normalizado (RN-CUS-002).
     *
     * @return list<array{id: string, code: string, legal_name: string, tax_id_type: ?string, tax_id: ?string, email: ?string, matches: list<string>}>
     */
    public function findDuplicates(?string $taxIdType, ?string $taxId, ?string $email, ?string $legalName, ?string $exceptId = null): array
    {
        $taxId = $taxIdType && $taxId ? TaxIdValidator::normalize($taxIdType, $taxId) : null;
        $email = $email ? mb_strtolower(trim($email)) : null;
        $name = $legalName ? Customer::normalizeName($legalName) : null;
        if ($taxId === null && $email === null && ($name === null || $name === '')) {
            return [];
        }

        $rows = Customer::query()->whereNull('merged_into_id')
            ->when($exceptId, fn ($q) => $q->whereKeyNot($exceptId))
            ->where(function ($q) use ($taxIdType, $taxId, $email, $name): void {
                if ($taxId !== null) {
                    $q->orWhere(fn ($w) => $w->where('tax_id_type', $taxIdType)->where('tax_id', $taxId));
                }
                if ($email !== null) {
                    $q->orWhereRaw('lower(email) = ?', [$email]);
                }
                if ($name !== null && $name !== '') {
                    $q->orWhere('normalized_name', $name);
                }
            })
            ->limit(20)->get();

        return $rows->map(function (Customer $c) use ($taxIdType, $taxId, $email, $name): array {
            $matches = [];
            if ($taxId !== null && $c->tax_id_type === $taxIdType && $c->tax_id === $taxId) {
                $matches[] = 'tax_id';
            }
            if ($email !== null && mb_strtolower((string) $c->email) === $email) {
                $matches[] = 'email';
            }
            if ($name !== null && $c->normalized_name === $name) {
                $matches[] = 'name';
            }

            return ['id' => $c->id, 'code' => $c->code, 'legal_name' => $c->legal_name, 'tax_id_type' => $c->tax_id_type, 'tax_id' => $c->tax_id, 'email' => $c->email, 'matches' => $matches];
        })->values()->all();
    }

    /** @param list<string> $tagIds */
    public function syncTags(Customer $customer, array $tagIds): void
    {
        $tagIds = array_values(array_unique($tagIds));
        DB::table('taggables')->where('taggable_type', Customer::MORPH)->where('taggable_id', $customer->id)
            ->whereNotIn('tag_id', $tagIds)->delete();
        foreach ($tagIds as $tagId) {
            DB::table('taggables')->insertOrIgnore([
                'organization_id' => $customer->organization_id, 'tag_id' => $tagId,
                'taggable_type' => Customer::MORPH, 'taggable_id' => $customer->id,
                'created_by' => auth()->id(), 'updated_by' => auth()->id(),
            ]);
        }
    }

    private function normalize(Customer $customer): void
    {
        $customer->country = strtoupper((string) $customer->country);
        if ($customer->tax_id_type !== null && $customer->tax_id !== null) {
            $customer->tax_id = TaxIdValidator::normalize($customer->tax_id_type, (string) $customer->tax_id);
        }
        if ($customer->email !== null) {
            $customer->email = mb_strtolower(trim((string) $customer->email));
        }
    }

    private function assertBusinessRules(Customer $customer): void
    {
        $errors = [];
        if ($customer->tax_id_type !== null && $customer->tax_id !== null
            && ($message = TaxIdValidator::error($customer->tax_id_type, (string) $customer->tax_id, $customer->country)) !== null) {
            $errors['tax_id'][] = $message;
        }
        foreach ($this->customFieldErrors((array) ($customer->custom ?? [])) as $key => $message) {
            $errors["custom.{$key}"][] = $message;
        }
        if ($errors !== []) {
            throw ProblemException::validation($errors);
        }
    }

    /**
     * Valores de `custom` contra custom_field_definitions (entity_type customers):
     * claves conocidas, obligatorios y tipo. Las definiciones las administra IDN.
     *
     * @param  array<string, mixed>  $custom
     * @return array<string, string>
     */
    private function customFieldErrors(array $custom): array
    {
        $defs = DB::table('custom_field_definitions')->where('organization_id', $this->organization->id())
            ->where('entity_type', Customer::MORPH)->get()->keyBy('key');
        $errors = [];
        foreach (array_keys($custom) as $key) {
            if (! $defs->has($key)) {
                $errors[$key] = 'Campo personalizado desconocido.';
            }
        }
        foreach ($defs as $key => $def) {
            $value = $custom[$key] ?? null;
            if ($value === null || $value === '') {
                if ($def->is_required) {
                    $errors[$key] = 'Este campo es obligatorio.';
                }

                continue;
            }
            $options = array_map(fn ($o) => is_array($o) ? ($o['value'] ?? null) : $o, (array) json_decode((string) $def->options, true));
            $ok = match ($def->field_type) {
                'number' => is_numeric($value),
                'boolean' => is_bool($value),
                'date' => is_string($value) && strtotime($value) !== false,
                'url' => is_string($value) && filter_var($value, FILTER_VALIDATE_URL) !== false,
                'select' => in_array($value, $options, true),
                'multiselect' => is_array($value) && array_diff($value, $options) === [],
                default => is_string($value) && mb_strlen($value) <= 1000,
            };
            if (! $ok) {
                $errors[$key] = 'Valor inválido para el campo.';
            }
        }

        return $errors;
    }

    private function assertNoDuplicates(Customer $customer, bool $confirmed): void
    {
        $dups = $this->findDuplicates($customer->tax_id_type, $customer->tax_id, $customer->email, $customer->legal_name, $customer->exists ? $customer->id : null);
        $byTax = array_values(array_filter($dups, fn (array $d) => in_array('tax_id', $d['matches'], true)));
        if ($byTax !== []) {
            throw new ProblemException(409, 'duplicate_customer', 'Ya existe un cliente con ese documento.', ['duplicates' => $byTax]);
        }
        if ($dups !== [] && ! $confirmed) {
            throw new ProblemException(409, 'possible_duplicate', 'Hay clientes parecidos; confirme para crear de todos modos.', ['duplicates' => $dups]);
        }
    }

    private function nextCode(): string
    {
        $org = $this->organization->id();
        DB::table('code_sequences')->insertOrIgnore(['organization_id' => $org, 'entity' => 'customer', 'prefix' => 'CLI', 'padding' => 6, 'next_value' => 1]);

        return (string) DB::selectOne('select hub_next_code(?, ?) as code', [$org, 'customer'])->code;
    }
}
