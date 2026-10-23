<?php
/**
 * Aviso amable cuando el sistema no responde y ya no hay última copia (docs/13 §7).
 * Nunca muestra errores técnicos ni la URL del sistema.
 *
 * @var array $data contact (items de contacto de la última copia)
 */
if (!defined('ABSPATH')) {
    exit;
}
?>
<div class="hub-connector hub-unavailable" role="status">
    <p><?php echo esc_html__('No pudimos cargar esta información. Escríbenos o llámanos:', 'hub-connector'); ?></p>
    <?php echo HubConnector\Plugin::getInstance()->templates()->render('contact', ['items' => $data['contact'], 'format' => 'lista']); // phpcs:ignore WordPress.Security.EscapeOutput -- plantilla ya escapada ?>
</div>
