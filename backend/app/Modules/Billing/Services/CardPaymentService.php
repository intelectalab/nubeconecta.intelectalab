<?php

declare(strict_types=1);

namespace App\Modules\Billing\Services;

use App\Modules\Billing\Contracts\CardGatewayConnector;
use App\Modules\Billing\Models\Invoice;
use App\Modules\Billing\Models\PaymentCheckout;
use App\Modules\Billing\Models\PaymentMethod;
use App\Shared\Audit\AuditLogger;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Settings\SettingsReader;
use Illuminate\Support\Facades\DB;

/**
 * Pago con tarjeta desde el portal (M-BIL §10, D-18 = Mercado Pago Checkout Pro).
 * 1) start(): intento en payment_checkouts por el saldo (más recargo si
 *    billing.card_gateway.pass_to_customer = true) y preferencia en la pasarela.
 * 2) confirm(): con el id de pago (retorno del portal o webhook) se CONSULTA la
 *    pasarela; aprobado y con referencia, importe y moneda coincidentes → pago
 *    validado y aplicado. Rechazado/pendiente → solo el intento. Idempotente.
 */
final class CardPaymentService
{
    private PaymentMethod|false|null $method = false;

    public function __construct(
        private readonly CardGatewayConnector $gateway,
        private readonly PaymentService $payments,
        private readonly AuditLogger $audit,
        private readonly SettingsReader $settings,
    ) {}

    public function enabled(): bool
    {
        // El ajuste billing.card_gateway.provider, si se definió, debe ser mercado_pago (vacío = lo decide el driver de config).
        $provider = $this->settings->get('billing.card_gateway.provider');

        return config('hub.billing.card_gateway.driver') === 'mercadopago' && in_array($provider, [null, '', 'mercado_pago'], true)
            && $this->gateway->isConfigured() && $this->method() !== null;
    }

    /** Medio card_gateway del portal (la fila la crea BillingSeeder; el driver configurado lo habilita). */
    public function method(): ?PaymentMethod
    {
        if ($this->method === false) {
            $this->method = PaymentMethod::query()->where('kind', 'card_gateway')->where('available_in_portal', true)->orderBy('code')->first();
        }

        return $this->method;
    }

    /** @return list<string> */
    public function currencies(): array
    {
        $allowed = (array) ($this->settings->get('billing.card_gateway.currencies', ['PEN', 'USD']) ?? ['PEN', 'USD']);

        return array_values(array_intersect($this->gateway->currencies(), array_map('strval', $allowed)));
    }

    public function availableFor(Invoice $invoice): bool
    {
        return in_array($invoice->status, PaymentService::OPEN_STATUSES, true) && $invoice->balance_minor > 0
            && $this->enabled() && in_array(trim((string) $invoice->currency), $this->currencies(), true);
    }

    /** Recargo trasladado al cliente: solo si pass_to_customer es true (null o false → sin comisión). */
    public function surcharge(int $balance, string $currency): int
    {
        if ($this->settings->get('billing.card_gateway.pass_to_customer') !== true) {
            return 0;
        }
        $percent = (float) ($this->settings->get('billing.card_gateway.fee_percent') ?? 0);
        $fixed = (array) ($this->settings->get('billing.card_gateway.fee_fixed') ?? []);
        $fixedMinor = ($fixed['currency'] ?? null) === $currency ? (int) ($fixed['amount_minor'] ?? 0) : 0;

        return max(0, (int) ceil($balance * $percent / 100) + $fixedMinor);
    }

    public function start(Invoice $invoice, string $customerId, string $idempotencyKey, ?string $payerEmail = null): array
    {
        if (! $this->enabled()) {
            throw new ProblemException(409, 'card_payment_unavailable', 'El pago con tarjeta no está disponible en este momento.');
        }
        if (! in_array($invoice->status, PaymentService::OPEN_STATUSES, true) || $invoice->balance_minor < 1) {
            throw new ProblemException(409, 'invoice_not_payable', 'El comprobante no tiene saldo pendiente.');
        }
        $currency = trim((string) $invoice->currency);
        if (! in_array($currency, $this->currencies(), true)) {
            throw new ProblemException(422, 'currency_not_supported', "La cuenta de Mercado Pago no cobra en {$currency}. Pague por transferencia o consulte a finanzas.", ['currency' => $currency]);
        }
        $surcharge = $this->surcharge($invoice->balance_minor, $currency);
        $minutes = $this->settings->get('billing.card_gateway.checkout_expiry_minutes') ?? config('hub.billing.card_gateway.checkout_expiry_minutes', 60);
        $checkout = new PaymentCheckout;
        $checkout->forceFill([
            'customer_id' => $customerId, 'payment_method_id' => $this->method()->id, 'invoice_ids' => [$invoice->id],
            'amount_minor' => $invoice->balance_minor + $surcharge, 'surcharge_minor' => $surcharge, 'currency' => $currency,
            'status' => 'created', 'expires_at' => now()->addMinutes(max(5, (int) $minutes)),
        ])->save();
        $returnUrl = rtrim((string) config('hub.billing.card_gateway.portal_url'), '/').'/?card_return='.$checkout->id;
        try {
            $session = $this->gateway->createCheckout($checkout->id, [$invoice->id], $checkout->amount_minor, $currency, $idempotencyKey, [
                'title' => 'Comprobante '.($invoice->fullNumber() ?? $invoice->id), 'external_reference' => $checkout->externalReference(),
                'return_url' => $returnUrl, 'expires_at' => $checkout->expires_at, 'payer_email' => $payerEmail,
            ]);
        } catch (\Throwable $e) {
            $checkout->forceFill(['status' => 'cancelled'])->save();
            throw $e;
        }
        $checkout->forceFill(['external_session_id' => $session['session_id']])->save();
        $this->audit->record('payment_checkout.created', 'payment_checkout', $checkout->id, null,
            $checkout->only(['invoice_ids', 'amount_minor', 'surcharge_minor', 'currency', 'status', 'external_session_id', 'expires_at']),
            ['provider' => 'mercadopago', 'sandbox' => $this->gateway->sandbox()], $customerId);

        return ['checkout' => $checkout, 'redirect_url' => $session['redirect_url']];
    }

    /**
     * Consulta el pago en la pasarela y lo refleja. $customerId (portal) limita a
     * intentos propios: lo ajeno o desconocido → 404. Sin cliente (webhook):
     * referencia ajena → null (se ignora).
     */
    public function confirm(string $gatewayPaymentId, ?string $customerId, string $source, ?string $expectedCheckoutId = null): ?PaymentCheckout
    {
        $tx = $this->gateway->getTransaction($gatewayPaymentId);
        $ref = PaymentCheckout::parseReference($tx['external_reference']);
        $foreign = static function () use ($customerId): ?PaymentCheckout {
            if ($customerId !== null) {
                throw ProblemException::notFound();
            }

            return null;
        };
        if ($ref === null || ($expectedCheckoutId !== null && $ref[1] !== $expectedCheckoutId)) {
            $this->audit->record('payment_checkout.unmatched', 'payment_checkout', $expectedCheckoutId, null, null,
                ['source' => $source, 'gateway_payment_id' => $tx['external_id'], 'external_reference' => mb_substr((string) $tx['external_reference'], 0, 120)]);

            return $foreign();
        }

        return DB::transaction(function () use ($tx, $ref, $customerId, $source, $foreign): ?PaymentCheckout {
            $checkout = PaymentCheckout::query()->lockForUpdate()->find($ref[1]);
            if ($checkout === null || ($customerId !== null && $checkout->customer_id !== $customerId) || ($checkout->invoice_ids[0] ?? null) !== $ref[0]) {
                return $foreign();
            }
            if ($checkout->status === 'approved') {
                // Una preferencia de Checkout Pro admite más de un pago: un segundo pago aprobado distinto queda auditado para revisión/reembolso manual.
                if ($tx['status'] === 'approved' && (string) $tx['external_id'] !== (string) $checkout->external_transaction_id) {
                    $this->audit->record('payment_checkout.duplicate', 'payment_checkout', $checkout->id, null, null,
                        ['source' => $source, 'gateway_payment_id' => $tx['external_id'], 'amount_minor' => $tx['amount_minor'], 'currency' => $tx['currency']], $checkout->customer_id);
                }

                return $checkout; // ya registrado: retorno + webhook o reintentos
            }
            $before = $checkout->only(['status', 'external_transaction_id', 'decline_reason', 'payment_id']);
            $mp = (string) $tx['external_id'];
            $meta = ['source' => $source, 'gateway_payment_id' => $mp, 'gateway_status' => $tx['raw_status'], 'status_detail' => $tx['status_detail']];

            if ($tx['status'] === 'approved') {
                if ($tx['amount_minor'] !== $checkout->amount_minor || $tx['currency'] !== trim((string) $checkout->currency)) {
                    $checkout->forceFill(['status' => 'declined', 'external_transaction_id' => $mp,
                        'decline_reason' => "amount_mismatch: MP {$tx['amount_minor']} {$tx['currency']} ≠ {$checkout->amount_minor} {$checkout->currency}; revisión manual"])->save();
                    $this->audit->record('payment_checkout.mismatch', 'payment_checkout', $checkout->id, $before, $checkout->only(array_keys($before)), $meta + ['amount_minor' => $tx['amount_minor'], 'currency' => $tx['currency']], $checkout->customer_id);

                    return $checkout;
                }
                $invoice = Invoice::query()->find($ref[0]);
                $applicable = $invoice !== null && in_array($invoice->status, PaymentService::OPEN_STATUSES, true)
                    ? min($checkout->amount_minor - $checkout->surcharge_minor, $invoice->balance_minor) : 0;
                $payment = $this->payments->recordGatewayPayment(
                    PaymentMethod::query()->findOrFail($checkout->payment_method_id), $checkout->customer_id, $tx['amount_minor'], $tx['currency'], $mp, $tx['fee_minor'],
                    $applicable > 0 ? [['invoice_id' => $ref[0], 'amount_minor' => $applicable]] : [],
                    'Mercado Pago '.$mp.($checkout->surcharge_minor > 0 ? " (incluye recargo {$checkout->surcharge_minor})" : ''),
                );
                $checkout->forceFill(['status' => 'approved', 'external_transaction_id' => $mp, 'payment_id' => $payment->id, 'decline_reason' => null, 'completed_at' => now()])->save();
            } elseif ($tx['status'] === 'declined') {
                $checkout->forceFill(['status' => 'declined', 'external_transaction_id' => $mp, 'decline_reason' => mb_substr($tx['raw_status'].': '.($tx['status_detail'] ?? ''), 0, 200), 'completed_at' => now()])->save();
            } elseif ($tx['status'] === 'pending') {
                $checkout->forceFill(['status' => 'created', 'external_transaction_id' => $mp, 'decline_reason' => null])->save();
            } else {
                $this->audit->record('payment_checkout.ignored', 'payment_checkout', $checkout->id, null, null, $meta, $checkout->customer_id);

                return $checkout;
            }
            $this->audit->record('payment_checkout.'.$checkout->outcome(), 'payment_checkout', $checkout->id, $before, $checkout->only(array_keys($before)), $meta, $checkout->customer_id);

            return $checkout;
        });
    }

    /** Texto en español del motivo de rechazo de Mercado Pago (status_detail). */
    public static function declineMessage(?string $reason): ?string
    {
        if ($reason === null) {
            return null;
        }
        if (str_starts_with($reason, 'amount_mismatch')) {
            return 'No pudimos confirmar el pago automáticamente. Finanzas lo revisará; no vuelva a pagar.';
        }
        $detail = trim((string) substr($reason, (int) strpos($reason, ':') + 1));

        return match ($detail) {
            'cc_rejected_insufficient_amount' => 'Fondos insuficientes.',
            'cc_rejected_bad_filled_security_code' => 'Código de seguridad incorrecto.',
            'cc_rejected_bad_filled_date' => 'Fecha de vencimiento incorrecta.',
            'cc_rejected_bad_filled_card_number', 'cc_rejected_bad_filled_other' => 'Revise los datos de la tarjeta.',
            'cc_rejected_call_for_authorize' => 'Debe autorizar el pago con su banco.',
            'cc_rejected_card_disabled' => 'La tarjeta no está activa.',
            'cc_rejected_duplicated_payment' => 'Ya hizo un pago por ese importe.',
            'cc_rejected_high_risk', 'rejected_high_risk' => 'El pago fue rechazado por seguridad.',
            'expired' => 'El pago venció.',
            default => 'El pago fue rechazado. Pruebe con otra tarjeta u otro medio.',
        };
    }
}
