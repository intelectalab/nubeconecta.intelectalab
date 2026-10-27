<?php
/**
 * Tabla de [hub_comparador]. Sobreescribible en <tema>/hub-connector/compare.php.
 *
 * @var array $data caption, plans (modelo de vista + values), rows (clave => etiqueta), visible_currency
 */
if (!defined('ABSPATH')) {
    exit;
}
?>
<div class="hub-connector hub-compare" role="region" aria-label="<?php echo esc_attr($data['caption']); ?>" tabindex="0">
    <table class="hub-compare__table">
        <caption class="screen-reader-text"><?php echo esc_html($data['caption']); ?></caption>
        <thead>
            <tr>
                <td></td>
                <?php foreach ($data['plans'] as $plan) : ?>
                    <th scope="col" class="<?php echo $plan['featured'] ? 'hub-compare__plan hub-compare__plan--featured' : 'hub-compare__plan'; ?>">
                        <?php if ($plan['featured']) : ?>
                            <span class="hub-plan__badge"><?php echo esc_html__('Destacado', 'hub-connector'); ?></span>
                        <?php endif; ?>
                        <span class="hub-compare__name"><?php echo esc_html($plan['name']); ?></span>
                        <?php foreach ($plan['prices'] as $currency => $price) : ?>
                            <span class="hub-price" data-currency="<?php echo esc_attr($currency); ?>"<?php echo $currency === $data['visible_currency'] ? '' : ' hidden'; ?>>
                                <span class="hub-price__symbol" aria-hidden="true"><?php echo esc_html($price['symbol']); ?></span>
                                <span class="hub-price__amount"><?php echo esc_html($price['amount']); ?></span>
                                <span class="screen-reader-text"><?php echo esc_html($price['currency_text']); ?></span>
                                <span class="hub-price__cycle"><?php echo esc_html($plan['cycle_label']); ?></span>
                            </span>
                        <?php endforeach; ?>
                    </th>
                <?php endforeach; ?>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($data['rows'] as $key => $label) : ?>
                <tr>
                    <th scope="row"><?php echo esc_html($label); ?></th>
                    <?php foreach ($data['plans'] as $plan) : ?>
                        <td><?php echo esc_html($plan['values'][$key] ?? ''); ?></td>
                    <?php endforeach; ?>
                </tr>
            <?php endforeach; ?>
        </tbody>
        <tfoot>
            <tr>
                <td></td>
                <?php foreach ($data['plans'] as $plan) : ?>
                    <td>
                        <?php if ($plan['action'] !== null) : ?>
                            <a class="hub-button" href="<?php echo esc_url($plan['action']['url']); ?>" aria-label="<?php echo esc_attr($plan['action']['aria']); ?>"><?php echo esc_html($plan['action']['text']); ?></a>
                        <?php endif; ?>
                    </td>
                <?php endforeach; ?>
            </tr>
        </tfoot>
    </table>
</div>
