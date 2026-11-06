<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Services;

use App\Modules\Notifications\Mail\NotificationMail;
use App\Modules\Notifications\Models\NotificationDelivery;
use App\Modules\Notifications\Models\NotificationDeliveryEvent;
use App\Modules\Notifications\Models\NotificationTemplate;
use App\Shared\Audit\AuditLogger;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Database\QueryException;

final class NotificationService
{
    public function __construct(private readonly AuditLogger $audit, private readonly CurrentOrganization $organization) {}

    public function send(array $params): NotificationDelivery
    {
        $orgId = $this->organization->id();
        $recipient = trim((string) ($params['recipient_address'] ?? ''));
        $template = $this->resolveTemplate((string) $params['template_code'], $params['brand_id'] ?? null, (string) ($params['locale'] ?? 'es'));
        $dedupeKey = (string) ($params['dedupe_key'] ?? hash('sha256', implode('|', [(string) $params['event'], mb_strtolower($recipient), (string) ($params['entity_type'] ?? ''), (string) ($params['entity_id'] ?? '')])));
        $resendOfId = $params['resend_of_id'] ?? null;
        if ($resendOfId !== null) $dedupeKey .= ':resend:'.Str::uuid();

        $existing = NotificationDelivery::query()->where('dedupe_key', $dedupeKey)->first();
        if ($existing) return $existing;

        $variables = is_array($params['variables'] ?? null) ? $params['variables'] : [];
        $subject = $this->render((string) ($template->subject ?? ''), $variables, false);
        $body = $this->render($template->body, $variables, $template->content_format === 'html');

        try {
            return DB::transaction(function () use ($params, $orgId, $template, $recipient, $dedupeKey, $resendOfId, $subject, $body): NotificationDelivery {
            $existing = NotificationDelivery::query()->where('dedupe_key', $dedupeKey)->first();
            if ($existing) return $existing;

            $delivery = new NotificationDelivery;
            $delivery->forceFill([
                'organization_id' => $orgId,
                'dedupe_key' => $dedupeKey,
                'event' => $params['event'],
                'notification_template_id' => $template->id,
                'channel' => 'email',
                'customer_id' => $params['customer_id'] ?? null,
                'recipient_contact_id' => $params['recipient_contact_id'] ?? null,
                'recipient_user_id' => $params['recipient_user_id'] ?? null,
                'recipient_address' => $recipient,
                'entity_type' => $params['entity_type'] ?? null,
                'entity_id' => $params['entity_id'] ?? null,
                'subject' => $subject,
                'body_snapshot' => $body,
                'resend_of_id' => $resendOfId,
                'is_manual' => $resendOfId !== null || (bool) ($params['is_manual'] ?? false),
                'created_by' => auth()->id(),
            ])->save();
            $delivery = NotificationDelivery::query()->where('dedupe_key', $dedupeKey)->firstOrFail();
            $this->recordEvent($delivery, 'queued');
            Mail::to($recipient)->queue(new NotificationMail($subject, $body, $template->content_format === 'html', $delivery->id, $orgId));
            return $delivery;
            });
        } catch (QueryException $exception) {
            if (($exception->errorInfo[0] ?? null) !== '23505') throw $exception;
            return NotificationDelivery::query()->where('dedupe_key', $dedupeKey)->firstOrFail();
        }
    }

    public function recordEvent(NotificationDelivery $delivery, string $status, array $detail = []): NotificationDeliveryEvent
    {
        return (new NotificationDeliveryEvent)->forceFill([
            'organization_id' => $delivery->organization_id,
            'notification_delivery_id' => $delivery->id,
            'status' => $status,
            'detail' => $detail,
            'occurred_at' => now(),
            'created_by' => auth()->id(),
        ])->save() ? NotificationDeliveryEvent::query()->where('notification_delivery_id', $delivery->id)->latest('created_at')->firstOrFail() : throw new \RuntimeException('No se pudo registrar el evento de notificación.');
    }

    private function resolveTemplate(string $code, ?string $brandId, string $locale): NotificationTemplate
    {
        $templates = NotificationTemplate::query()->where('code', $code)->where('channel', 'email')->where('is_active', true)->where(function ($query) use ($brandId): void {
            if ($brandId) $query->where('brand_id', $brandId)->orWhereNull('brand_id'); else $query->whereNull('brand_id');
        })->whereIn('locale', array_values(array_unique([$locale, 'es'])))->get();
        $template = $templates->sortBy(fn (NotificationTemplate $candidate): int => ($candidate->brand_id === $brandId && $candidate->locale === $locale ? 0 : ($candidate->brand_id === null && $candidate->locale === $locale ? 1 : ($candidate->brand_id === $brandId && $candidate->locale === 'es' ? 2 : 3))))->first();
        return $template ?? throw ProblemException::validation(['template_code' => ["No existe una plantilla email activa para [{$code}]."]]);
    }

    private function render(string $text, array $variables, bool $html): string
    {
        $rendered = preg_replace_callback('/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/', static function (array $match) use ($variables, $html): string {
            $value = data_get($variables, $match[1], '');
            if (! is_scalar($value) && $value !== null) return '';
            $value = (string) ($value ?? '');
            return $html ? e($value, false) : $value;
        }, $text) ?? $text;
        return $html ? $this->sanitizeHtml($rendered) : strip_tags($rendered);
    }

    private function sanitizeHtml(string $html): string
    {
        $html = preg_replace('~<(script|style|iframe|object|embed)\b[^>]*>.*?</\1\s*>~is', '', $html) ?? $html;
        $allowedTags = (array) config('editor.html.allowed_tags', ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3']);
        $tags = '<'.implode('><', array_intersect($allowedTags, ['p','br','strong','em','ul','ol','li','a','h1','h2','h3'])).'>';
        $html = strip_tags($html, $tags);
        return preg_replace_callback('/<a\b([^>]*)>/i', static function (array $match): string {
            if (preg_match('/\bhref\s*=\s*(["\'])(.*?)\1/i', $match[1], $href) !== 1) return '<a>';
            $url = trim(html_entity_decode($href[2], ENT_QUOTES | ENT_HTML5, 'UTF-8'));
            if (preg_match('/^(https?:|mailto:)/i', $url) !== 1) return '<a>';
            return '<a href="'.e($url, false).'" rel="noopener noreferrer">';
        }, $html) ?? $html;
    }
}
