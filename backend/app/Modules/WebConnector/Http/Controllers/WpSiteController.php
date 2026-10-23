<?php

declare(strict_types=1);

namespace App\Modules\WebConnector\Http\Controllers;

use App\Modules\WebConnector\Events\WpSiteCreated;
use App\Modules\WebConnector\Models\WpSite;
use App\Modules\WebConnector\Services\WpSiteService;
use App\Shared\Audit\AuditLogger;
use App\Shared\Concurrency\VersionGuard;
use App\Shared\Http\Controllers\ResourceController;
use App\Shared\Http\Resources\ModelResource;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * /api/v1/admin/web-connector/sites (web_connector.site.*): CRUD de sitios
 * WordPress conectados, secreto de firma, prueba de webhook, activar/desactivar.
 */
final class WpSiteController extends ResourceController
{
    public function __construct(AuditLogger $audit, private readonly WpSiteService $sites)
    {
        parent::__construct($audit);
    }

    protected function model(): string
    {
        return WpSite::class;
    }

    protected function entity(): string
    {
        return 'wp_site';
    }

    protected function rules(Request $request, ?Model $model): array
    {
        $required = $model === null ? 'required' : 'sometimes';
        $org = app(CurrentOrganization::class)->id();
        $https = 'regex:/^https:\/\/[a-z0-9.-]+(:[0-9]+)?(\/.*)?$/';

        return [
            'brand_id' => [$required, 'uuid', Rule::exists('brands', 'id')->where('organization_id', $org)->whereNull('deleted_at')],
            'name' => [$required, 'string', 'max:200'],
            'base_url' => [$required, 'string', 'max:500', $https],
            'network_site_id' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'webhook_url' => ['sometimes', 'nullable', 'string', 'max:500', $https, static function (string $attribute, mixed $value, \Closure $fail): void {
                // SSRF: el destino no puede ser ni resolver a una red privada, local o de metadatos.
                if (is_string($value) && ($error = app(\App\Shared\Http\OutboundUrlGuard::class)->error($value)) !== null) {
                    $fail($error);
                }
            }],
            'allowed_origins' => ['sometimes', 'array', 'max:20'],
            'allowed_origins.*' => ['string', 'max:255', 'regex:/^https:\/\/[a-z0-9.-]+(:[0-9]+)?$/'],
            'thank_you_url' => ['sometimes', 'nullable', 'string', 'max:500', $https],
        ];
    }

    protected function sortable(): array
    {
        return ['name', 'created_at', 'last_seen_at'];
    }

    protected function filters(): array
    {
        return ['brand_id' => 'brand_id', 'status' => 'status'];
    }

    protected function beforeSave(Model $model, array $data, bool $creating): void
    {
        if (isset($data['base_url'])) {
            $model->base_url = rtrim($data['base_url'], '/');
        }
        if ($model->status === 'active' && $model->webhook_url === null) {
            throw \App\Shared\Http\Problem\ProblemException::validation(['webhook_url' => ['Un sitio activo necesita la ruta del plugin.']]);
        }
    }

    protected function afterSave(Model $model, bool $creating, ?array $before): void
    {
        if ($creating) {
            WpSiteCreated::dispatch($model->organization_id, $model->getKey());
        }
    }

    protected function afterDelete(Model $model): void
    {
        /** @var WpSite $model */
        $this->sites->retire($model);
    }

    /** POST …/sites/{id}/webhook-secret: el secreto se muestra una sola vez. */
    public function rotateSecret(string $id): JsonResponse
    {
        $result = $this->sites->rotateSecret(WpSite::query()->findOrFail($id));

        return response()->json(['data' => [
            'webhook_secret' => $result['secret'],
            'previous_secret_valid_until' => $result['previous_valid_until'],
        ]], 201)->header('Cache-Control', 'no-store');
    }

    public function testWebhook(string $id): JsonResponse
    {
        $invalidation = $this->sites->testWebhook(WpSite::query()->findOrFail($id));

        // 200 siempre: el resultado (status, response_status, last_error) es el de la prueba.
        return (new ModelResource($invalidation))->response()->setStatusCode(200);
    }

    public function activate(Request $request, string $id): ModelResource
    {
        $site = WpSite::query()->findOrFail($id);
        VersionGuard::check($site, (int) $request->validate(['version' => ['required', 'integer']])['version']);

        return new ModelResource($this->sites->activate($site));
    }

    public function disable(Request $request, string $id): ModelResource
    {
        $data = $request->validate(['version' => ['required', 'integer'], 'reason' => ['required', 'string', 'max:500']]);
        $site = WpSite::query()->findOrFail($id);
        VersionGuard::check($site, (int) $data['version']);

        return new ModelResource($this->sites->disable($site, $data['reason']));
    }
}
