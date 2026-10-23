<?php

declare(strict_types=1);

namespace App\Modules\Customers\Services;

use App\Modules\Customers\Events\CustomersMerged;
use App\Modules\Customers\Models\Customer;
use App\Shared\Audit\AuditLogger;
use App\Shared\Concurrency\VersionGuard;
use App\Shared\Http\Problem\ProblemException;
use Illuminate\Support\Facades\DB;

/**
 * Fusión manual de duplicados (M-CUS §4.3, P-CUS-05). Todo lo que apunta al
 * absorbido (servicios, facturas, tickets, contactos, documentos...) pasa al
 * sobreviviente; el absorbido queda con `merged_into_id` y baja lógica. La
 * auditoría de ambos se conserva y el historial del sobreviviente la incluye.
 * No se deshace automáticamente: exige escribir el código del absorbido.
 */
final class MergeService
{
    /** Campos que se pueden elegir del absorbido. */
    public const FIELDS = [
        'type', 'legal_name', 'trade_name', 'tax_id_type', 'tax_id', 'country', 'currency', 'locale', 'timezone',
        'email', 'phone', 'address', 'tax_treatment', 'is_withholding_agent', 'invoice_consolidation',
        'origin_brand_id', 'account_manager_id',
    ];

    private const OPEN_INVOICE = ['issued', 'partially_paid', 'overdue'];

    public function __construct(private readonly AuditLogger $audit, private readonly RelatedRecords $related) {}

    /** Conteos que se moverán (vista previa de P-CUS-05). */
    public function preview(Customer $survivor, Customer $absorbed): array
    {
        return ['survivor' => $this->related->counts($survivor->id), 'absorbed' => $this->related->counts($absorbed->id)];
    }

    /**
     * @param  array<string, 'survivor'|'absorbed'>  $fields
     * @return array{survivor: Customer, moved: array<string, int>}
     */
    public function merge(string $survivorId, string $absorbedId, string $confirmCode, array $fields, int $survivorVersion, int $absorbedVersion): array
    {
        if ($survivorId === $absorbedId) {
            throw ProblemException::validation(['absorbed_id' => ['Elija dos clientes distintos.']]);
        }

        return DB::transaction(function () use ($survivorId, $absorbedId, $confirmCode, $fields, $survivorVersion, $absorbedVersion): array {
            /** @var Customer|null $survivor */
            $survivor = Customer::withTrashed()->lockForUpdate()->find($survivorId);
            /** @var Customer|null $absorbed */
            $absorbed = Customer::withTrashed()->lockForUpdate()->find($absorbedId);
            if ($survivor === null || $absorbed === null) {
                throw ProblemException::notFound();
            }
            if ($survivor->merged_into_id !== null || $absorbed->merged_into_id !== null || $survivor->trashed() || $absorbed->trashed()) {
                throw new ProblemException(409, 'already_merged', 'Uno de los clientes ya fue fusionado o dado de baja.');
            }
            VersionGuard::check($survivor, $survivorVersion);
            VersionGuard::check($absorbed, $absorbedVersion);
            if (trim($confirmCode) !== $absorbed->code) {
                throw ProblemException::validation(['confirm_code' => ['Escriba el código del cliente absorbido para confirmar.']]);
            }

            $chosen = $survivor->only(self::FIELDS);
            foreach ($fields as $field => $side) {
                if (in_array($field, self::FIELDS, true) && $side === 'absorbed') {
                    $chosen[$field] = $absorbed->getAttribute($field);
                }
            }
            if ($survivor->currency !== $absorbed->currency || $chosen['currency'] !== $survivor->currency) {
                $open = DB::table('invoices')->whereIn('customer_id', [$survivor->id, $absorbed->id])->whereIn('status', self::OPEN_INVOICE)->exists();
                if ($open) {
                    throw new ProblemException(422, 'currency_mismatch', 'Los clientes tienen monedas distintas con facturas abiertas; resuélvalas antes de fusionar.');
                }
            }

            $before = ['survivor' => $survivor->attributesToArray(), 'absorbed' => $absorbed->attributesToArray()];
            $moved = $this->moveReferences($absorbed->id, $survivor->id);

            // Primero se da de baja el absorbido: libera el índice único del documento.
            $absorbed->forceFill(['merged_into_id' => $survivor->id, 'status' => 'inactive'])->save();
            $absorbed->delete();

            $survivor->forceFill($chosen + ['custom' => array_merge((array) $absorbed->custom, (array) $survivor->custom)])->save();

            $metadata = ['survivor_id' => $survivor->id, 'absorbed_id' => $absorbed->id, 'absorbed_code' => $absorbed->code, 'moved' => $moved, 'fields' => $fields];
            $this->audit->record('customer.merged', 'customer', $survivor->id, $before['survivor'], $survivor->refresh()->attributesToArray(), $metadata, $survivor->id);
            $this->audit->record('customer.merged_into', 'customer', $absorbed->id, $before['absorbed'], Customer::withTrashed()->find($absorbed->id)?->attributesToArray(), $metadata, $absorbed->id);
            CustomersMerged::dispatch($survivor->organization_id, $survivor->id, $absorbed->id);

            return ['survivor' => $survivor, 'moved' => $moved];
        });
    }

    /** @return array<string, int> */
    private function moveReferences(string $from, string $to): array
    {
        $moved = [];
        foreach ($this->related->references() as $ref) {
            if (in_array($ref['table'], RelatedRecords::IMMUTABLE, true)) {
                continue; // registros de solo inserción: el historial del sobreviviente incluye al absorbido
            }
            if ($ref['table'] === 'customer_action_flags') {
                // Único por (organización, cliente, acción): prevalece el interruptor del sobreviviente.
                DB::table('customer_action_flags')->where('customer_id', $from)
                    ->whereIn('action', DB::table('customer_action_flags')->where('customer_id', $to)->select('action'))->delete();
            }
            $n = DB::table($ref['table'])->where($ref['column'], $from)->update([$ref['column'] => $to]);
            if ($n > 0) {
                $moved[$ref['column'] === 'customer_id' ? $ref['table'] : $ref['table'].'.'.$ref['column']] = $n;
            }
        }

        // Etiquetas y ajustes por cliente (referencias polimórficas, sin llave foránea).
        $tags = DB::table('taggables')->where('taggable_type', Customer::MORPH)->where('taggable_id', $from)->get();
        foreach ($tags as $tag) {
            DB::table('taggables')->insertOrIgnore(['organization_id' => $tag->organization_id, 'tag_id' => $tag->tag_id, 'taggable_type' => Customer::MORPH, 'taggable_id' => $to]);
        }
        DB::table('taggables')->where('taggable_type', Customer::MORPH)->where('taggable_id', $from)->delete();
        if ($tags->isNotEmpty()) {
            $moved['taggables'] = $tags->count();
        }

        return $moved;
    }
}
