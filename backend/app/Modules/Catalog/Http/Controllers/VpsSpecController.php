<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Http\Controllers;

use App\Modules\Catalog\Http\Resources\VpsPlanSpecResource;
use App\Modules\Catalog\Models\Product;
use App\Shared\Audit\AuditLogger;
use App\Shared\Concurrency\VersionGuard;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/** Administra la ficha 1-a-1 VPS de cada producto. */
final class VpsSpecController
{
    public function __construct(private readonly AuditLogger $audit) {}

    public function show(string $id): VpsPlanSpecResource
    {
        $product = Product::query()->findOrFail($id);

        return new VpsPlanSpecResource($product->vpsSpec()->firstOrFail());
    }

    public function upsert(Request $request, string $id): JsonResponse|VpsPlanSpecResource
    {
        $product = Product::query()->findOrFail($id);
        $spec = $product->vpsSpec()->first();
        $create = $spec === null;
        $required = $create ? 'required' : 'sometimes';
        $org = app(CurrentOrganization::class)->id();
        $data = $request->validate([
            'version' => [$create ? 'prohibited' : 'required', 'integer', 'min:1'],
            'vcpu' => [$required, 'integer', 'min:1', 'max:32767'],
            'ram_mb' => [$required, 'integer', 'gt:0'],
            'disk_gb' => [$required, 'integer', 'gt:0'],
            'transfer_gb' => ['sometimes', 'nullable', 'integer', 'gt:0'],
            'os_options' => ['sometimes', 'array'], 'os_options.*' => ['string'],
            'is_managed' => ['sometimes', 'boolean'], 'location' => ['sometimes', 'nullable', 'string'],
            'cpu_model' => ['sometimes', 'nullable', 'string'],
            'disk_type' => ['sometimes', 'nullable', Rule::in(['ssd', 'nvme', 'hdd'])],
            'provider_id' => [$required, 'uuid', Rule::exists('providers', 'id')->where('organization_id', $org)],
            'provider_plan_ref' => [$required, 'string', 'regex:/\S/'],
        ]);
        if ($create) {
            $data['os_options'] ??= [];
            $data['is_managed'] ??= false;
        }

        $saved = DB::transaction(function () use ($product, $spec, $data, $create) {
            if ($create) {
                $model = $product->vpsSpec()->create($this->fields($data));
                $this->audit->record('vps_plan_spec.created', 'vps_plan_spec', $model->id, null, $model->attributesToArray());

                return $model;
            }
            VersionGuard::check($spec, $data['version']);
            $before = $spec->attributesToArray();
            $spec->fill($this->fields($data))->save();
            $this->audit->record('vps_plan_spec.updated', 'vps_plan_spec', $spec->id, $before, $spec->refresh()->attributesToArray());

            return $spec;
        });

        return $create
            ? (new VpsPlanSpecResource($saved))->response()->setStatusCode(201)
            : new VpsPlanSpecResource($saved);
    }

    public function destroy(string $id): Response
    {
        $product = Product::query()->findOrFail($id);
        $spec = $product->vpsSpec()->firstOrFail();
        DB::transaction(function () use ($spec): void {
            $before = $spec->attributesToArray();
            $spec->delete();
            $this->audit->record('vps_plan_spec.deleted', 'vps_plan_spec', $spec->id, $before, null);
        });

        return response()->noContent();
    }

    private function fields(array $data): array
    {
        return array_intersect_key($data, array_flip(['vcpu', 'ram_mb', 'disk_gb', 'transfer_gb', 'os_options', 'is_managed', 'location', 'cpu_model', 'disk_type', 'provider_id', 'provider_plan_ref']));
    }
}
