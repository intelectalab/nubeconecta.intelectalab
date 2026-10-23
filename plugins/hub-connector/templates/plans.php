<?php
/**
 * Lista de planes de [hub_planes]. Sobreescribible en <tema>/hub-connector/plans.php.
 *
 * @var array $data plans, columns, currencies, visible_currency
 */
if (!defined('ABSPATH')) {
    exit;
}
?>
<ul class="hub-connector hub-plans hub-plans--cols-<?php echo (int) $data['columns']; ?>" aria-live="polite">
    <?php foreach ($data['plans'] as $plan) : ?>
        <li class="hub-plans__item">
            <?php echo HubConnector\Plugin::getInstance()->templates()->render('plan-card', ['plan' => $plan, 'visible_currency' => $data['visible_currency']]); // phpcs:ignore WordPress.Security.EscapeOutput -- plantilla ya escapada ?>
        </li>
    <?php endforeach; ?>
</ul>
