<?php

declare(strict_types=1);

namespace App\Shared\Audit;

use App\Models\User;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Auditoría de solo inserción encadenada por hash (audit_events, docs/00 §4 y §8).
 *
 * El trigger hub_audit_chain() asigna chain_seq, prev_hash y hash dentro de la
 * transacción, así que el evento se confirma o se descarta junto con el cambio
 * que registra. La integridad se verifica con `php artisan hub:audit:verify`.
 */
final class AuditLogger
{
    public function __construct(private readonly CurrentOrganization $organization) {}

    /**
     * @param  array<string, mixed>|null  $before
     * @param  array<string, mixed>|null  $after
     * @param  array<string, mixed>  $metadata
     * @param  array{type?: 'user'|'system'|'connector'|'api', id?: ?string}|null  $actor  null = usuario autenticado o system
     */
    public function record(
        string $action,
        string $entityType,
        ?string $entityId = null,
        ?array $before = null,
        ?array $after = null,
        array $metadata = [],
        ?string $customerId = null,
        ?array $actor = null,
        ?string $organizationId = null,
    ): string {
        $user = Auth::user();
        $actorType = $actor['type'] ?? ($user instanceof Authenticatable ? 'user' : 'system');
        $actorId = array_key_exists('id', $actor ?? []) ? $actor['id'] : ($actorType === 'user' ? $user?->getAuthIdentifier() : null);
        if ($actorType === 'user' && $user instanceof User && in_array('superadmin', $user->activeRoleCodes(), true)
            && ! array_key_exists('actor_privileged', $metadata)) {
            $metadata['actor_privileged'] = true;
        }
        $id = (string) Str::uuid7();
        $fromHttp = ! app()->runningInConsole() || app()->runningUnitTests();
        $request = request();

        DB::table('audit_events')->insert([
            'id' => $id,
            'organization_id' => $organizationId ?? $this->organization->id(),
            'actor_type' => $actorType,
            'actor_id' => $actorId,
            'action' => $action,
            'entity_type' => $entityType,
            'entity_id' => $entityId,
            'customer_id' => $customerId,
            'ip' => $fromHttp ? $request->ip() : null,
            'user_agent' => $fromHttp ? Str::limit((string) $request->userAgent(), 500, '') ?: null : null,
            'request_id' => $request->attributes->get('request_id'),
            'before' => $before === null ? null : json_encode($this->redact($before), JSON_THROW_ON_ERROR),
            'after' => $after === null ? null : json_encode($this->redact($after), JSON_THROW_ON_ERROR),
            'metadata' => json_encode($this->redact($metadata) ?: new \stdClass, JSON_THROW_ON_ERROR),
            'created_by' => $actorType === 'user' ? $actorId : null,
            // chain_seq, prev_hash y hash los asigna el trigger; se envían vacíos para el NOT NULL de PHP.
            'chain_seq' => 0,
            'hash' => '',
        ]);

        return $id;
    }

    /** Devuelve el primer chain_seq alterado de la organización, o null si la cadena está íntegra. */
    public function verify(?string $organizationId = null): ?int
    {
        $row = DB::selectOne('select hub_audit_verify(?) as broken', [$organizationId ?? $this->organization->id()]);

        return $row->broken === null ? null : (int) $row->broken;
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function redact(array $data): array
    {
        $keys = config('hub.audit.redact', []);
        foreach ($data as $key => $value) {
            if (in_array($key, $keys, true)) {
                $data[$key] = '[redacted]';
            } elseif (is_array($value)) {
                $data[$key] = $this->redact($value);
            }
        }

        return $data;
    }
}
