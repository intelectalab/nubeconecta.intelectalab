<?php
/**
 * Botón de [hub_boton_contratar]. Sobreescribible en <tema>/hub-connector/buy-button.php.
 *
 * @var array $data action (url, text, aria)
 */
if (!defined('ABSPATH')) {
    exit;
}
?>
<a class="hub-connector hub-button" href="<?php echo esc_url($data['action']['url']); ?>" aria-label="<?php echo esc_attr($data['action']['aria']); ?>"><?php echo esc_html($data['action']['text']); ?></a>
