<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Services;

use App\Modules\Notifications\Models\NotificationTemplate;
use App\Shared\Audit\AuditLogger;
use App\Shared\Concurrency\VersionGuard;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

final class NotificationTemplateService
{
    public function __construct(private readonly AuditLogger $audit, private readonly CurrentOrganization $organization) {}

    public function rules(bool $updating = false): array
    {
        return [
            'code' => [$updating ? 'sometimes' : 'required', 'string', 'max:160'],
            'channel' => [$updating ? 'sometimes' : 'required', Rule::in(['email'])],
            'brand_id' => ['sometimes', 'nullable', 'uuid', Rule::exists('brands', 'id')->where('organization_id', $this->organization->id())],
            'locale' => ['sometimes', 'string', 'max:12'],
            'country' => ['sometimes', 'nullable', 'string', 'size:2'],
            'subject' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'body' => [$updating ? 'sometimes' : 'required', 'string'],
            'variables' => ['sometimes', 'array'],
            'is_active' => ['sometimes', 'boolean'],
            'category' => ['sometimes', Rule::in(['notice', 'canned_reply', 'complaint_response', 'form_confirmation'])],
            'content_format' => ['sometimes', Rule::in(['html', 'plain'])],
        ];
    }

    public function create(array $data): NotificationTemplate
    {
        return DB::transaction(function () use ($data): NotificationTemplate {
            $template = (new NotificationTemplate)->forceFill($this->editable($data) + ['channel' => $data['channel'] ?? 'email', 'locale' => $data['locale'] ?? 'es', 'category' => $data['category'] ?? 'notice', 'content_format' => $data['content_format'] ?? 'html', 'variables' => $data['variables'] ?? [], 'is_active' => $data['is_active'] ?? true]);
            $template->save();
            $this->audit->record('notification_template.created', 'notification_template', $template->id, null, $template->refresh()->attributesToArray());
            return $template;
        });
    }

    public function update(NotificationTemplate $template, array $data): NotificationTemplate
    {
        return DB::transaction(function () use ($template, $data): NotificationTemplate {
            $template = NotificationTemplate::query()->lockForUpdate()->findOrFail($template->id);
            VersionGuard::check($template, $data['version'] ?? null);
            $before = $template->attributesToArray();
            $template->forceFill($this->editable($data))->save();
            $this->audit->record('notification_template.updated', 'notification_template', $template->id, $before, $template->refresh()->attributesToArray());
            return $template;
        });
    }

    public function delete(NotificationTemplate $template, int $version): void
    {
        DB::transaction(function () use ($template, $version): void {
            $template = NotificationTemplate::query()->lockForUpdate()->findOrFail($template->id);
            VersionGuard::check($template, $version);
            $before = $template->attributesToArray();
            $template->delete();
            $this->audit->record('notification_template.deleted', 'notification_template', $template->id, $before, ['deleted' => true]);
        });
    }

    private function editable(array $data): array
    {
        return array_intersect_key($data, array_flip(['code', 'channel', 'brand_id', 'locale', 'country', 'subject', 'body', 'variables', 'is_active', 'category', 'content_format']));
    }
}
