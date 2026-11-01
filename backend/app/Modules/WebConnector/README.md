# WebConnector (M-WEB)

Sitios WordPress conectados: tokens del plugin, webhooks firmados, invalidaciones. Doc: `docs/modulos/M-WEB.md`.

## Pendientes de la revisión del 22-10

Corregido: `SecretStore` ya no deriva la clave de la bóveda de `APP_KEY` en producción (lanza excepción si falta `HUB_VAULT_KEY`); `OutboundUrlGuard::isPublicIp` evalúa la IPv4 embebida también en notación hexadecimal (`::ffff:7f00:1`, `64:ff9b::7f00:1`, `64:ff9b:1::/48`); se documenta `HUB_VAULT_KEY` en `.env.example` y se expone su chequeo en `php artisan about`.
