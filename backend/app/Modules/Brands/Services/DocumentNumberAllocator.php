<?php

declare(strict_types=1);

namespace App\Modules\Brands\Services;

use App\Shared\Http\Problem\ProblemException;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use LogicException;

/**
 * Interfaz pública de BRD para BIL (M-BRD §4.3): toma el siguiente número de
 * una serie con hub_take_document_number(), que bloquea la fila de
 * document_series hasta el fin de la transacción de emisión. Dos emisiones
 * simultáneas nunca obtienen el mismo número y, si la emisión falla y se
 * revierte, el número vuelve a quedar libre (sin saltos).
 */
final class DocumentNumberAllocator
{
    public function __construct(private readonly CurrentOrganization $organization) {}

    public function take(string $seriesId): int
    {
        if (DB::transactionLevel() === 0) {
            throw new LogicException('El número de comprobante se toma dentro de la transacción de emisión.');
        }
        $owned = DB::table('document_series')->where('id', $seriesId)->where('organization_id', $this->organization->id())->exists();
        if (! $owned) {
            throw ProblemException::notFound();
        }

        try {
            return (int) DB::selectOne('select hub_take_document_number(?) as n', [$seriesId])->n;
        } catch (QueryException $e) {
            if ($e->getCode() === 'P0001') {
                throw new ProblemException(409, 'conflict', 'La serie está inactiva.');
            }
            throw $e;
        }
    }
}
