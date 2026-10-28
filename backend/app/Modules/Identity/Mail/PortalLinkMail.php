<?php

declare(strict_types=1);

namespace App\Modules\Identity\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Correo con enlace de un solo uso al portal: invitación (#/activar) o
 * restablecimiento de contraseña (#/restablecer). Sin contraseñas ni datos sensibles.
 */
final class PortalLinkMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly string $kind,        // invitation | password_reset
        public readonly string $recipientName,
        public readonly string $url,
        public readonly string $expiresIn,   // "72 horas", "60 minutos"
    ) {
        $this->onQueue('notifications');
        $this->afterCommit();
    }

    public static function link(string $kind, string $token): string
    {
        $route = $kind === 'invitation' ? 'activar' : 'restablecer';

        return rtrim((string) config('hub.portal.url'), '/').'/#/'.$route.'?token='.urlencode($token);
    }

    public function envelope(): Envelope
    {
        $brand = (string) config('hub.portal.brand');

        return new Envelope(subject: $this->kind === 'invitation'
            ? "Activa tu cuenta en el portal de {$brand}"
            : "Restablece tu contraseña de {$brand}");
    }

    public function content(): Content
    {
        return new Content(view: 'mail.portal-link', text: 'mail.portal-link-text', with: ['brand' => (string) config('hub.portal.brand')]);
    }
}
