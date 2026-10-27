<?php
/**
 * Tarjeta de un plan. Sobreescribible en <tema>/hub-connector/plan-card.php.
 *
 * @var array $data plan (modelo de vista), visible_currency, heading_tag
 */
if (!defined('ABSPATH')) {
    exit;
}
$plan = $data['plan'];
$heading = in_array($data['heading_tag'] ?? 'h3', ['h2', 'h3', 'h4'], true) ? $data['heading_tag'] ?? 'h3' : 'h3';
?>
<article class="hub-plan<?php echo $plan['featured'] ? ' hub-plan--featured' : ''; ?>" data-plan="<?php echo esc_attr($plan['code']); ?>">
    <?php if ($plan['featured']) : ?>
        <p class="hub-plan__badge"><?php echo esc_html__('Destacado', 'hub-connector'); ?></p>
    <?php endif; ?>
    <<?php echo $heading; ?> class="hub-plan__name"><?php echo esc_html($plan['name']); ?></<?php echo $heading; ?>>
    <?php $specs = $plan['specs'] ?? ($plan['tagline'] !== '' ? [$plan['tagline']] : []); ?>
    <ul class="hub-plan__specs">
        <?php foreach ($specs as $spec) : ?>
            <li><?php echo esc_html($spec); ?></li>
        <?php endforeach; ?>
    </ul>
    <div class="hub-plan__price">
        <?php foreach ($plan['prices'] as $currency => $price) : ?>
            <p class="hub-price" data-currency="<?php echo esc_attr($currency); ?>"<?php echo $currency === $data['visible_currency'] ? '' : ' hidden'; ?>>
                <span class="hub-price__symbol" aria-hidden="true"><?php echo esc_html($price['symbol']); ?></span>
                <span class="hub-price__amount"><?php echo esc_html($price['amount']); ?></span>
                <span class="screen-reader-text"><?php echo esc_html($price['currency_text']); ?></span>
                <span class="hub-price__cycle"><?php echo esc_html($plan['cycle_label']); ?></span>
                <?php if ($price['setup'] !== '') : ?>
                    <span class="hub-price__setup"><?php echo esc_html(sprintf(__('+ %1$s %2$s de instalación', 'hub-connector'), $price['symbol'], $price['setup'])); ?></span>
                <?php endif; ?>
            </p>
        <?php endforeach; ?>
    </div>
    <?php if ($plan['highlights'] !== []) : ?>
        <ul class="hub-plan__features">
            <?php foreach ($plan['highlights'] as $feature) : ?>
                <li><?php echo esc_html($feature); ?></li>
            <?php endforeach; ?>
        </ul>
    <?php else : ?>
        <div class="hub-plan__features" aria-hidden="true"></div><?php // fila reservada para alinear el botón ?>
    <?php endif; ?>
    <?php if ($plan['action'] !== null) : ?>
        <a class="hub-button" href="<?php echo esc_url($plan['action']['url']); ?>" aria-label="<?php echo esc_attr($plan['action']['aria']); ?>"><?php echo esc_html($plan['action']['text']); ?></a>
    <?php endif; ?>
</article>
