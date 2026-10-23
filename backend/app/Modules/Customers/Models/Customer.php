<?php

declare(strict_types=1);

namespace App\Modules\Customers\Models;

use App\Modules\Brands\Models\Brand;
use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Tabla canónica `customers` (M-CUS §3). `code` lo asigna CustomerService con
 * hub_next_code(); `normalized_name` se recalcula al guardar para la deduplicación.
 */
class Customer extends Model
{
    use BelongsToOrganization, HasUuids, SoftDeletes, TracksVersionAndActor;

    /** Campos fiscales: su cambio emite CustomerFiscalDataChanged con valor anterior y nuevo (M-CUS §5). */
    public const FISCAL = ['legal_name', 'tax_id_type', 'tax_id', 'address', 'tax_treatment'];

    /** Tipo de entidad en taggables y custom_field_definitions. */
    public const MORPH = 'customers';

    protected $table = 'customers';

    protected $fillable = [
        'type', 'legal_name', 'trade_name', 'tax_id_type', 'tax_id', 'country', 'currency', 'locale', 'timezone',
        'email', 'phone', 'address', 'status', 'tax_treatment', 'is_withholding_agent', 'invoice_consolidation',
        'origin_brand_id', 'account_manager_id', 'custom',
    ];

    protected $attributes = [
        'version' => 1, 'status' => 'active', 'custom' => '{}', 'locale' => 'es', 'timezone' => 'America/Lima',
        'tax_treatment' => 'taxed', 'invoice_consolidation' => 'consolidated', 'is_withholding_agent' => false,
    ];

    protected function casts(): array
    {
        return [
            'custom' => 'array',
            'is_withholding_agent' => 'boolean',
            'version' => 'integer',
        ];
    }

    protected static function booted(): void
    {
        static::saving(static function (Customer $customer): void {
            $customer->normalized_name = self::normalizeName((string) $customer->legal_name);
        });
    }

    /** Minúsculas, sin tildes ni puntuación y sin la forma societaria final (SAC, SA, EIRL, SRL...). */
    public static function normalizeName(string $name): string
    {
        $ascii = strtolower(Str::ascii($name));
        $ascii = trim((string) preg_replace('/[^a-z0-9]+/', ' ', $ascii));
        $ascii = (string) preg_replace('/(\s(s a c|sac|s a a|saa|s a|sa|e i r l|eirl|s r l|srl|sl|inc|llc|ltda|ltd))+$/', '', $ascii);

        return trim((string) preg_replace('/\s+/', ' ', $ascii));
    }

    public function contacts(): HasMany
    {
        return $this->hasMany(Contact::class);
    }

    public function notes(): HasMany
    {
        return $this->hasMany(CustomerNote::class);
    }

    public function originBrand(): BelongsTo
    {
        return $this->belongsTo(Brand::class, 'origin_brand_id');
    }

    /** @return list<array{id: string, name: string, slug: string, color: ?string}> */
    public function tagList(): array
    {
        return DB::table('taggables as tg')->join('tags as t', 't.id', '=', 'tg.tag_id')
            ->where('tg.taggable_type', self::MORPH)->where('tg.taggable_id', $this->getKey())
            ->orderBy('t.name')->get(['t.id', 't.name', 't.slug', 't.color'])
            ->map(fn ($r): array => (array) $r)->all();
    }
}
