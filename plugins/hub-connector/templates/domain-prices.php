<?php
/**
 * Tabla de [hub_precios_dominios] / [hub_dominios]. Sobreescribible en
 * <tema>/hub-connector/domain-prices.php.
 *
 * @var array $data caption, rows (tld, name, featured, prices[moneda][register|renew|transfer]), visible_currency
 */
if (!defined('ABSPATH')) {
    exit;
}
$columns = [
    'register' => __('Registro', 'hub-connector'),
    'renew' => __('Renovación', 'hub-connector'),
    'transfer' => __('Transferencia', 'hub-connector'),
];
?>
<div class="hub-connector hub-domains" role="region" aria-label="<?php echo esc_attr($data['caption']); ?>" tabindex="0">
    <table class="hub-domains__table">
        <caption><?php echo esc_html($data['caption']); ?></caption>
        <thead>
            <tr>
                <th scope="col"><?php echo esc_html__('Extensión', 'hub-connector'); ?></th>
                <?php foreach ($columns as $label) : ?>
                    <th scope="col"><?php echo esc_html($label); ?></th>
                <?php endforeach; ?>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($data['rows'] as $row) : ?>
                <tr<?php echo $row['featured'] ? ' class="hub-domains__row--featured"' : ''; ?>>
                    <th scope="row"><?php echo esc_html($row['name']); ?></th>
                    <?php foreach (array_keys($columns) as $operation) : ?>
                        <td>
                            <?php foreach ($row['prices'] as $currency => $prices) :
                                $price = $prices[$operation] ?? null;
                                ?>
                                <span class="hub-price hub-price--inline" data-currency="<?php echo esc_attr($currency); ?>"<?php echo $currency === $data['visible_currency'] ? '' : ' hidden'; ?>>
                                    <?php if ($price === null) : ?>
                                        <span aria-label="<?php echo esc_attr__('No disponible', 'hub-connector'); ?>">—</span>
                                    <?php else : ?>
                                        <span class="hub-price__symbol" aria-hidden="true"><?php echo esc_html($price['symbol']); ?></span>
                                        <span class="hub-price__amount"><?php echo esc_html($price['amount']); ?></span>
                                        <span class="screen-reader-text"><?php echo esc_html($price['currency_text']); ?></span>
                                    <?php endif; ?>
                                </span>
                            <?php endforeach; ?>
                        </td>
                    <?php endforeach; ?>
                </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
</div>
