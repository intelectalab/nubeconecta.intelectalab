<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Mail;

use App\Modules\Notifications\Models\NotificationDeliveryEvent;
use App\Shared\Audit\AuditLogger;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;
use Throwable;

final class NotificationMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly string $subjectLine,
        public readonly string $body,
        public readonly bool $isHtml,
        public readonly string $deliveryId,
        public readonly string $organizationId,
    ) {
        $this->onQueue('notifications');
        $this->afterCommit();
    }

    public function envelope(): Envelope { return new Envelope(subject: $this->subjectLine); }

    public function content(): Content
    {
        return $this->isHtml ? new Content(htmlString: $this->body) : new Content(text: 'mail.notifications-plain', with: ['body' => $this->body]);
    }

    public function failed(Throwable $exception): void
    {
        $this->record('failed', ['error' => mb_substr($exception->getMessage(), 0, 1000)]);
    }

    public function send($mailer)
    {
        $result = parent::send($mailer);
        $this->record('sent');
        app(AuditLogger::class)->record('notification.sent', 'notification_delivery', $this->deliveryId, null, ['channel' => 'email'], organizationId: $this->organizationId);
        return $result;
    }

    private function record(string $status, array $detail = []): void
    {
        NotificationDeliveryEvent::withoutGlobalScopes()->forceCreate([
            'organization_id' => $this->organizationId,
            'notification_delivery_id' => $this->deliveryId,
            'status' => $status,
            'detail' => $detail,
            'occurred_at' => now(),
        ]);
    }
}
