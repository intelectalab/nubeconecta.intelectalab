<?php

declare(strict_types=1);

namespace App\Shared\Pagination;

use App\Shared\Http\Problem\ProblemException;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Pagination\Cursor;

/**
 * Paginación por cursor del contrato (docs/06 §3):
 * `sort=-created_at,name`, `page[size]` (25 por defecto, 100 máx.), `page[cursor]`.
 * Respuesta `{data, meta: {next_cursor, prev_cursor, has_more, page_size}, links: {next, prev}}`.
 * Siempre se agrega la clave primaria como desempate para que el orden sea total.
 */
final class CursorPagination
{
    public const DEFAULT_SIZE = 25;

    public const MAX_SIZE = 100;

    /**
     * @param  list<string>  $sortable  columnas que admite `sort`
     * @param  class-string<JsonResource>  $resource
     */
    public static function respond(Builder $query, Request $request, array $sortable, string $resource, string $defaultSort = '-created_at'): JsonResponse
    {
        $size = self::size($request);

        foreach (self::sorts($request, $sortable, $defaultSort) as [$column, $direction]) {
            $query->orderBy($column, $direction);
        }
        $query->orderBy($query->getModel()->getQualifiedKeyName(), 'asc');

        $cursor = $request->input('page.cursor');
        $decoded = is_string($cursor) && $cursor !== '' ? Cursor::fromEncoded($cursor) : null;
        if ($cursor !== null && $decoded === null) {
            throw ProblemException::badRequest('page[cursor] inválido.');
        }

        $page = $query->cursorPaginate($size, ['*'], 'cursor', $decoded);
        $next = $page->nextCursor()?->encode();
        $prev = $page->previousCursor()?->encode();

        return response()->json([
            'data' => $resource::collection($page->items())->resolve($request),
            'meta' => [
                'next_cursor' => $next,
                'prev_cursor' => $prev,
                'has_more' => $page->hasMorePages(),
                'page_size' => $size,
            ],
            'links' => [
                'next' => $next === null ? null : self::link($request, $next),
                'prev' => $prev === null ? null : self::link($request, $prev),
            ],
        ]);
    }

    private static function size(Request $request): int
    {
        $raw = $request->input('page.size', self::DEFAULT_SIZE);
        if (! is_numeric($raw) || (int) $raw < 1) {
            throw ProblemException::badRequest('page[size] debe ser un entero positivo.');
        }

        return min((int) $raw, self::MAX_SIZE);
    }

    /** @return list<array{string, 'asc'|'desc'}> */
    private static function sorts(Request $request, array $sortable, string $default): array
    {
        $out = [];
        foreach (explode(',', (string) $request->input('sort', $default)) as $field) {
            $field = trim($field);
            if ($field === '') {
                continue;
            }
            $direction = str_starts_with($field, '-') ? 'desc' : 'asc';
            $column = ltrim($field, '-');
            if (! in_array($column, $sortable, true)) {
                throw ProblemException::badRequest("No se puede ordenar por [{$column}].");
            }
            $out[] = [$column, $direction];
        }

        return $out;
    }

    private static function link(Request $request, string $cursor): string
    {
        $query = $request->query();
        $query['page'] = array_merge((array) ($query['page'] ?? []), ['cursor' => $cursor]);

        return $request->url().'?'.http_build_query($query);
    }
}
