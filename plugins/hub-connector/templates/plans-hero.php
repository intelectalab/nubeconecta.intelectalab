<?php
/**
 * Tarjeta del hero de [hub_planes vista="hero" tipos="..."]: una pestaña por tipo con su
 * plan de entrada. Sobreescribible en <tema>/hub-connector/plans-hero.php.
 *
 * @var array $data id, tabs (type, label, plan: name, code, monthly[moneda], prices[moneda],
 *                  yearly, features, action), visible_currency
 */
if (!defined('ABSPATH')) {
    exit;
}
$id = $data['id'];
?>
<div class="hub-connector hub-hplans" data-hub-tabs>
    <div class="hub-hplans__tabs" role="tablist" aria-label="<?php echo esc_attr__('Tipo de servicio', 'hub-connector'); ?>">
        <?php foreach ($data['tabs'] as $i => $tab) : ?>
            <button type="button" class="hub-hplans__tab" role="tab" id="<?php echo esc_attr($id . '-t' . $i); ?>" aria-controls="<?php echo esc_attr($id . '-p' . $i); ?>" aria-selected="<?php echo $i === 0 ? 'true' : 'false'; ?>"<?php echo $i === 0 ? '' : ' tabindex="-1"'; ?>><?php echo esc_html($tab['label']); ?></button>
        <?php endforeach; ?>
    </div>
    <?php foreach ($data['tabs'] as $i => $tab) :
        $plan = $tab['plan'];
        ?>
        <div class="hub-hplans__panel" role="tabpanel" id="<?php echo esc_attr($id . '-p' . $i); ?>" aria-labelledby="<?php echo esc_attr($id . '-t' . $i); ?>" tabindex="0" data-plan="<?php echo esc_attr($plan['code']); ?>"<?php echo $i === 0 ? '' : ' hidden'; ?>>
            <p class="hub-hplans__name"><?php echo esc_html($plan['name']); ?></p>
            <?php foreach ($plan['monthly'] as $currency => $price) : ?>
                <p class="hub-price hub-hplans__price" data-currency="<?php echo esc_attr($currency); ?>"<?php echo $currency === $data['visible_currency'] ? '' : ' hidden'; ?>>
                    <span class="hub-hplans__from"><?php echo esc_html__('desde', 'hub-connector'); ?></span>
                    <span class="hub-hplans__figure">
                        <span class="hub-price__symbol" aria-hidden="true"><?php echo esc_html($price['symbol']); ?></span>
                        <span class="hub-price__amount"><?php echo esc_html($price['amount']); ?></span>
                        <span class="screen-reader-text"><?php echo esc_html($price['currency_text']); ?></span>
                    </span>
                    <span class="hub-price__cycle"><?php echo esc_html__('al mes', 'hub-connector'); ?></span>
                </p>
                <?php if ($plan['yearly'] && isset($plan['prices'][$currency])) : ?>
                    <p class="hub-price hub-hplans__year" data-currency="<?php echo esc_attr($currency); ?>"<?php echo $currency === $data['visible_currency'] ? '' : ' hidden'; ?>>
                        <?php echo esc_html(sprintf(__('%1$s %2$s al año', 'hub-connector'), $plan['prices'][$currency]['symbol'], $plan['prices'][$currency]['amount'])); ?>
                    </p>
                <?php endif; ?>
            <?php endforeach; ?>
            <?php if ($plan['features'] !== []) : ?>
                <ul class="hub-hplans__features">
                    <?php foreach ($plan['features'] as $feature) : ?>
                        <li><?php echo esc_html($feature); ?></li>
                    <?php endforeach; ?>
                </ul>
            <?php endif; ?>
            <?php if (!empty($plan['action']['url'])) : ?>
                <a class="hub-button hub-hplans__cta" href="<?php echo esc_url($plan['action']['url']); ?>" aria-label="<?php echo esc_attr($plan['action']['aria']); ?>"><?php echo esc_html($plan['action']['text']); ?></a>
            <?php endif; ?>
        </div>
    <?php endforeach; ?>
</div>
