<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Http\Controllers;

use App\Modules\Catalog\Http\Resources\HostingPackageSpecResource;
use App\Modules\Catalog\Models\Product;
use App\Shared\Audit\AuditLogger;
use App\Shared\Concurrency\VersionGuard;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/** Administra la ficha 1-a-1 de hosting compartido de cada producto. */
final class HostingSpecController
{
    public function __construct(private readonly AuditLogger $audit) {}

    public function show(string $id): HostingPackageSpecResource
    {
        $product = Product::query()->findOrFail($id);

        return new HostingPackageSpecResource($product->hostingSpec()->firstOrFail());
    }

    public function upsert(Request $request, string $id): JsonResponse|HostingPackageSpecResource
    {
        $product = Product::query()->findOrFail($id);
        $spec = $product->hostingSpec()->first();
        $create = $spec === null;
        $org = app(CurrentOrganization::class)->id();
        $data = $request->validate([
            'version' => [$create ? 'prohibited' : 'required', 'integer', 'min:1'],
            'disk_mb' => ['sometimes', 'nullable', 'integer', 'gt:0'],
            'bandwidth_mb' => ['sometimes', 'nullable', 'integer', 'gt:0'],
            'email_accounts' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'databases' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'websites' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'whm_package' => [$create ? 'required' : 'sometimes', 'string', 'regex:/\S/'],
            'preferred_node_id' => ['sometimes', 'nullable', 'uuid', Rule::exists('hosting_nodes', 'id')->where('organization_id', $org)],
            'extra_resources' => ['sometimes', 'array'],
        ]);
        $saved = DB::transaction(function () use ($product, $spec, $data, $create) {
            if ($create) {
                $model = $product->hostingSpec()->create($this->fields($data));
                $this->audit->record('hosting_package_spec.created', 'hosting_package_spec', $model->id, null, $model->attributesToArray());

                return $model;
            }
            VersionGuard::check($spec, $data['version']);
            $before = $spec->attributesToArray();
            $spec->fill($this->fields($data))->save();
            $this->audit->record('hosting_package_spec.updated', 'hosting_package_spec', $spec->id, $before, $spec->refresh()->attributesToArray());

            return $spec;
        });

        return $create
            ? (new HostingPackageSpecResource($saved))->response()->setStatusCode(201)
            : new HostingPackageSpecResource($saved);
    }

    public function destroy(string $id): Response
    {
        $product = Product::query()->findOrFail($id);
        $spec = $product->hostingSpec()->firstOrFail();
        DB::transaction(function () use ($spec): void {
            $before = $spec->attributesToArray();
            $spec->delete();
            $this->audit->record('hosting_package_spec.deleted', 'hosting_package_spec', $spec->id, $before, null);
        });

        return response()->noContent();
    }

    private function fields(array $data): array
    {
        return array_intersect_key($data, array_flip(['disk_mb', 'bandwidth_mb', 'email_accounts', 'databases', 'websites', 'whm_package', 'preferred_node_id', 'extra_resources']));
    }
}
