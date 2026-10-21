<?php

declare(strict_types=1);

namespace App\Shared\Http\Controllers;

use App\Shared\Audit\AuditLogger;
use App\Shared\Concurrency\VersionGuard;
use App\Shared\Http\Resources\ModelResource;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;

/**
 * CRUD administrativo estándar sobre un modelo con organización y `version`:
 * listado por cursor con filtros `filter[x]`, alta, detalle, PATCH con
 * VersionGuard (409 version_conflict) y borrado, todo auditado
 * (`<entidad>.created|updated|deleted`). Los permisos van en la ruta.
 * Las subclases declaran el modelo, las reglas y los ganchos de negocio.
 */
abstract class ResourceController
{
    public function __construct(protected readonly AuditLogger $audit) {}

    /** @return class-string<Model> */
    abstract protected function model(): string;

    /** Tipo de entidad para audit_events (p. ej. `brand`). */
    abstract protected function entity(): string;

    /** Reglas de validación; $model es null en el alta. */
    abstract protected function rules(Request $request, ?Model $model): array;

    /** @return list<string> */
    protected function sortable(): array
    {
        return ['created_at'];
    }

    protected function defaultSort(): string
    {
        return '-created_at';
    }

    /** @return array<string, string> filtro (filter[x]) => columna */
    protected function filters(): array
    {
        return [];
    }

    /** @return list<string> */
    protected function with(): array
    {
        return [];
    }

    /** Validaciones de negocio antes de guardar ($model ya trae los cambios sin persistir). */
    protected function beforeSave(Model $model, array $data, bool $creating): void {}

    protected function afterSave(Model $model, bool $creating, ?array $before): void {}

    protected function beforeDelete(Model $model): void {}

    protected function afterDelete(Model $model): void {}

    protected function query(): Builder
    {
        return $this->model()::query()->with($this->with());
    }

    public function index(Request $request): JsonResponse
    {
        $query = $this->query();
        foreach ($this->filters() as $filter => $column) {
            $value = $request->input("filter.{$filter}");
            if ($value !== null && $value !== '') {
                $query->where($column, is_string($value) && in_array(strtolower($value), ['true', 'false'], true) ? strtolower($value) === 'true' : $value);
            }
        }

        return CursorPagination::respond($query, $request, $this->sortable(), ModelResource::class, $this->defaultSort());
    }

    public function show(string $id): ModelResource
    {
        return new ModelResource($this->query()->findOrFail($id));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules($request, null));
        $model = DB::transaction(function () use ($data): Model {
            $class = $this->model();
            /** @var Model $model */
            $model = new $class;
            $model->forceFill(Arr::only($data, $model->getFillable()));
            $this->beforeSave($model, $data, true);
            $model->save();
            $this->audit->record($this->entity().'.created', $this->entity(), $model->getKey(), null, $model->refresh()->attributesToArray());
            $this->afterSave($model, true, null);

            return $model;
        });

        return (new ModelResource($model->load($this->with())))->response()->setStatusCode(201);
    }

    public function update(Request $request, string $id): ModelResource
    {
        $model = $this->query()->findOrFail($id);
        $data = $request->validate(['version' => ['required', 'integer']] + $this->rules($request, $model));

        DB::transaction(function () use ($model, $data): void {
            VersionGuard::check($model, $data['version']);
            $before = $model->attributesToArray();
            $model->forceFill(Arr::only($data, $model->getFillable()));
            $this->beforeSave($model, $data, false);
            $model->save();
            $this->audit->record($this->entity().'.updated', $this->entity(), $model->getKey(), $before, $model->refresh()->attributesToArray());
            $this->afterSave($model, false, $before);
        });

        return new ModelResource($model->load($this->with()));
    }

    public function destroy(string $id): Response
    {
        $model = $this->query()->findOrFail($id);
        DB::transaction(function () use ($model): void {
            $this->beforeDelete($model);
            $before = $model->attributesToArray();
            $model->delete();
            $this->audit->record($this->entity().'.deleted', $this->entity(), $model->getKey(), $before, null);
            $this->afterDelete($model);
        });

        return response()->noContent();
    }
}
