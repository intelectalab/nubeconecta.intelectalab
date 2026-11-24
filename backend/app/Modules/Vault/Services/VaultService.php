<?php

declare(strict_types=1);

namespace App\Modules\Vault\Services;

use App\Models\User;
use App\Modules\Vault\Models\OneTimeLink;
use App\Modules\Vault\Models\Secret;
use App\Modules\Vault\Models\SecretAccessLog;
use App\Modules\Vault\Models\SecretGrant;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Organization\CurrentOrganization;
use App\Shared\Settings\SettingsReader;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;

/**
 * Lógica de la bóveda (M-VLT): cifra al guardar, revela con concesión vigente,
 * MFA reciente (la exige el middleware mfa.recent de la ruta), límite por hora y
 * bitácora. El valor nunca se registra ni sale en listados.
 */
final class VaultService
{
    public function __construct(
        private readonly VaultCipher $cipher,
        private readonly SettingsReader $settings,
        private readonly CurrentOrganization $organization,
    ) {}

    /** @param array<string, mixed> $data */
    public function create(array $data, string $plaintext): Secret
    {
        $id = (string) Str::uuid();
        $orgId = $this->organization->id();
        $enc = $this->cipher->encrypt($id, $orgId, $plaintext);

        DB::table('secrets')->insert([
            'id' => $id,
            'organization_id' => $orgId,
            'kind' => $data['kind'],
            'name' => $data['name'],
            'owner_type' => $data['owner_type'],
            'owner_id' => $data['owner_id'],
            'customer_id' => $data['customer_id'] ?? null,
            'is_connector_credential' => $data['is_connector_credential'] ?? false,
            'username' => $data['username'] ?? null,
            'host' => $data['host'] ?? null,
            'port' => $data['port'] ?? null,
            'ciphertext' => $this->bytea($enc['ciphertext']),
            'nonce' => $this->bytea($enc['nonce']),
            'key_version' => $enc['key_version'],
            'metadata' => json_encode($data['metadata'] ?? new \stdClass, JSON_THROW_ON_ERROR),
            'rotates_at' => $data['rotates_at'] ?? null,
            'expires_at' => $data['expires_at'] ?? null,
            'last_rotated_at' => now(),
            'created_by' => Auth::id(),
            'updated_by' => Auth::id(),
        ]);

        return Secret::query()->findOrFail($id);
    }

    public function updateValue(Secret $secret, string $plaintext): void
    {
        $enc = $this->cipher->encrypt($secret->id, $secret->organization_id, $plaintext);
        DB::table('secrets')->where('id', $secret->id)->update([
            'ciphertext' => $this->bytea($enc['ciphertext']),
            'nonce' => $this->bytea($enc['nonce']),
            'key_version' => $enc['key_version'],
            'last_rotated_at' => now(),
            'updated_at' => now(),
            'updated_by' => Auth::id(),
            'version' => DB::raw('version + 1'),
        ]);
    }

    /** ¿El usuario tiene una concesión vigente (por usuario o por uno de sus roles) sobre el secreto? */
    public function canReveal(string $secretId, User $user): bool
    {
        $roleIds = DB::table('user_roles')->where('user_id', $user->id)
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            ->pluck('role_id');

        return SecretGrant::query()->where('secret_id', $secretId)
            ->whereNull('revoked_at')
            ->where('starts_at', '<=', now())
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            ->where(fn ($q) => $q->where('user_id', $user->id)->orWhereIn('role_id', $roleIds))
            ->exists();
    }

    public function reveal(Secret $secret, User $user, string $reason, Request $request): string
    {
        $limit = max(1, $this->settings->int('security.vault.reveal_limit_per_hour', 30));
        $key = 'vault:reveal:'.$user->id;

        if (RateLimiter::tooManyAttempts($key, $limit)) {
            $this->log($secret, $user, 'reveal_denied', $reason, $request);
            throw new ProblemException(429, 'too_many_reveals', 'Alcanzó el límite de revelaciones por hora.');
        }
        if (! $this->canReveal($secret->id, $user)) {
            $this->log($secret, $user, 'reveal_denied', $reason, $request);
            throw ProblemException::forbidden('No tiene una concesión vigente sobre este secreto.');
        }

        RateLimiter::hit($key, 3600);

        $row = DB::table('secrets')->where('id', $secret->id)->whereNull('deleted_at')
            ->selectRaw("encode(ciphertext, 'base64') as ct, encode(nonce, 'base64') as nonce")
            ->first();
        $plain = $this->cipher->decrypt(
            $secret->id,
            $secret->organization_id,
            (string) base64_decode(str_replace(["\n", "\r"], '', (string) $row->ct), true),
            (string) base64_decode(str_replace(["\n", "\r"], '', (string) $row->nonce), true),
        );

        $this->log($secret, $user, 'reveal', $reason, $request);

        return $plain;
    }

    public function log(Secret $secret, ?User $user, string $action, ?string $reason, Request $request): void
    {
        SecretAccessLog::query()->create([
            'secret_id' => $secret->id,
            'user_id' => $user?->id,
            'action' => $action,
            'reason' => $reason,
            'ip' => $request->ip(),
            'user_agent' => Str::limit((string) $request->userAgent(), 500, '') ?: null,
        ]);
    }

    /**
     * Crea un enlace de un solo uso (para un secreto existente o un texto libre).
     * Devuelve el token EN CLARO una sola vez (nunca se guarda; solo su sha256).
     *
     * @param  array<string, mixed>  $data
     * @return array{link: OneTimeLink, token: string}
     */
    public function createOneTimeLink(array $data): array
    {
        $orgId = $this->organization->id();
        $id = (string) Str::uuid();
        $token = bin2hex(random_bytes(32));

        $row = [
            'id' => $id,
            'organization_id' => $orgId,
            'purpose' => $data['purpose'],
            'secret_id' => $data['secret_id'] ?? null,
            'recipient_email' => $data['recipient_email'] ?? null,
            'contact_id' => $data['contact_id'] ?? null,
            'max_views' => $data['max_views'] ?? 1,
            'token_hash' => hash('sha256', $token),
            'expires_at' => $data['expires_at'],
            'created_by' => Auth::id(),
            'updated_by' => Auth::id(),
        ];
        if (empty($data['secret_id'])) {
            $enc = $this->cipher->encrypt($id, $orgId, (string) $data['payload']);
            $row['payload_ciphertext'] = $this->bytea($enc['ciphertext']);
            $row['payload_nonce'] = $this->bytea($enc['nonce']);
            $row['key_version'] = $enc['key_version'];
        }
        DB::table('one_time_links')->insert($row);

        if (! empty($data['secret_id'])) {
            DB::table('secret_access_logs')->insert([
                'id' => (string) Str::uuid(), 'organization_id' => $orgId, 'secret_id' => $data['secret_id'],
                'user_id' => Auth::id(), 'action' => 'one_time_link', 'reason' => 'crea enlace', 'created_at' => now(),
            ]);
        }

        return ['link' => OneTimeLink::query()->findOrFail($id), 'token' => $token];
    }

    /**
     * Consume un enlace público (sin sesión): valida, entrega el valor una vez,
     * cuenta la vista y lo marca consumido al alcanzar el máximo.
     *
     * @return array{value: string, purpose: string, expires_at: ?string}
     */
    public function consumeOneTimeLink(string $token, Request $request): array
    {
        $link = OneTimeLink::query()->withoutGlobalScope('organization')->where('token_hash', hash('sha256', $token))->first();
        if ($link === null || ! $link->isUsable()) {
            throw new ProblemException(404, 'link_unusable', 'El enlace no existe, ya se usó o venció.');
        }

        if ($link->secret_id !== null) {
            $row = DB::table('secrets')->where('id', $link->secret_id)->whereNull('deleted_at')
                ->selectRaw("organization_id, encode(ciphertext, 'base64') as ct, encode(nonce, 'base64') as nonce")->first();
            if ($row === null) {
                throw new ProblemException(404, 'link_unusable', 'El acceso ya no está disponible.');
            }
            $value = $this->cipher->decrypt($link->secret_id, (string) $row->organization_id, $this->unbase64($row->ct), $this->unbase64($row->nonce));
        } else {
            $row = DB::table('one_time_links')->where('id', $link->id)
                ->selectRaw("encode(payload_ciphertext, 'base64') as ct, encode(payload_nonce, 'base64') as nonce")->first();
            $value = $this->cipher->decrypt($link->id, $link->organization_id, $this->unbase64($row->ct), $this->unbase64($row->nonce));
        }

        $views = $link->views_count + 1;
        DB::table('one_time_links')->where('id', $link->id)->update([
            'views_count' => $views,
            'consumed_at' => $views >= $link->max_views ? now() : null,
            'updated_at' => now(),
            'version' => DB::raw('version + 1'),
        ]);

        if ($link->secret_id !== null) {
            DB::table('secret_access_logs')->insert([
                'id' => (string) Str::uuid(), 'organization_id' => $link->organization_id, 'secret_id' => $link->secret_id,
                'user_id' => null, 'action' => 'one_time_link', 'reason' => 'apertura',
                'ip' => $request->ip(), 'user_agent' => Str::limit((string) $request->userAgent(), 500, '') ?: null, 'created_at' => now(),
            ]);
        }

        return ['value' => $value, 'purpose' => $link->purpose, 'expires_at' => $link->expires_at?->toIso8601String()];
    }

    private function unbase64(mixed $v): string
    {
        return (string) base64_decode(str_replace(["\n", "\r"], '', (string) $v), true);
    }

    private function bytea(string $binary): \Illuminate\Contracts\Database\Query\Expression
    {
        return DB::raw("decode('".base64_encode($binary)."', 'base64')");
    }
}
