<?php
/**
 * Franja compacta de [hub_precios_dominios vista="franja"]: extensión y precio de
 * registro por año. Sobreescribible en <tema>/hub-connector/domain-strip.php.
 *
 * @var array $data caption, rows (tld, name, prices[moneda][register]), visible_currency
 */
if (!defined('ABSPATH')) {
    exit;
}
$heading = 'hubds-' . substr(md5(wp_json_encode(array_column($data['rows'], 'tld'))), 0, 8);
?>
<div class="hub-connector hub-domstrip" role="group" aria-labelledby="<?php echo esc_attr($heading); ?>">
    <p class="hub-domstrip__title" id="<?php echo esc_attr($heading); ?>"><?php echo esc_html($data['caption']); ?></p>
    <ul class="hub-domstrip__list">
        <?php foreach ($data['rows'] as $row) : ?>
            <li class="hub-domstrip__item">
                <span class="hub-domstrip__tld"><?php echo esc_html($row['name']); ?></span>
                <?php foreach ($row['prices'] as $currency => $prices) :
                    $price = $prices['register'] ?? null;
                    if ($price === null) {
                        continue;
                    }
                    ?>
                    <span class="hub-price hub-price--inline" data-currency="<?php echo esc_attr($currency); ?>"<?php echo $currency === $data['visible_currency'] ? '' : ' hidden'; ?>>
                        <span class="hub-price__symbol" aria-hidden="true"><?php echo esc_html($price['symbol']); ?></span>
                        <span class="hub-price__amount"><?php echo esc_html($price['amount']); ?></span>
                        <span class="screen-reader-text"><?php echo esc_html($price['currency_text'] . ' ' . __('al año', 'hub-connector')); ?></span>
                        <span class="hub-domstrip__cycle" aria-hidden="true"><?php echo esc_html__('/año', 'hub-connector'); ?></span>
                    </span>
                <?php endforeach; ?>
            </li>
        <?php endforeach; ?>
    </ul>
</div>
