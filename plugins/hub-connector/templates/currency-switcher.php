<?php
/**
 * Selector de moneda de [hub_selector_moneda]. Sobreescribible en <tema>/hub-connector/currency-switcher.php.
 *
 * @var array $data currencies, visible_currency
 */
if (!defined('ABSPATH')) {
    exit;
}
?>
<div class="hub-connector hub-currency" role="group" aria-label="<?php echo esc_attr__('Moneda de los precios', 'hub-connector'); ?>">
    <?php foreach ($data['currencies'] as $currency) : ?>
        <button type="button" class="hub-currency__option" data-hub-currency="<?php echo esc_attr($currency); ?>" aria-pressed="<?php echo $currency === $data['visible_currency'] ? 'true' : 'false'; ?>"><?php echo esc_html($currency); ?></button>
    <?php endforeach; ?>
    <span class="screen-reader-text" aria-live="polite" data-hub-currency-status></span>
</div>
