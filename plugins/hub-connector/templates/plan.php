<?php
/**
 * Un plan de [hub_plan]. Sobreescribible en <tema>/hub-connector/plan.php.
 *
 * @var array $data plan, currencies, visible_currency
 */
if (!defined('ABSPATH')) {
    exit;
}
?>
<div class="hub-connector hub-plan-single" aria-live="polite">
    <?php echo HubConnector\Plugin::getInstance()->templates()->render('plan-card', ['plan' => $data['plan'], 'visible_currency' => $data['visible_currency'], 'heading_tag' => 'h2']); // phpcs:ignore WordPress.Security.EscapeOutput -- plantilla ya escapada ?>
</div>
