<?php
/**
 * Buscador de [hub_precios_dominios vista="buscador" resultados="si|no"]. Mientras no haya
 * consulta de disponibilidad (D-35) lleva a /dominios/?q= y allí muestra el nombre con el
 * precio de cada extensión. Sobreescribible en <tema>/hub-connector/domain-search.php.
 *
 * @var array $data action, query, searched, quote_url, chips (rows), rows (tld, name,
 *                  prices[moneda][register]), visible_currency
 */
if (!defined('ABSPATH')) {
    exit;
}
$uid = 'hubdq-' . substr(md5($data['action'] . count($data['rows']) . count($data['chips'])), 0, 6);
$price_html = static function (array $row, string $visible): string {
    $out = '';
    foreach ($row['prices'] as $currency => $prices) {
        $price = $prices['register'] ?? null;
        if ($price === null) {
            continue;
        }
        $out .= '<span class="hub-price hub-price--inline" data-currency="' . esc_attr($currency) . '"' . ($currency === $visible ? '' : ' hidden') . '>'
            . '<span class="hub-price__symbol" aria-hidden="true">' . esc_html($price['symbol']) . '</span> '
            . '<span class="hub-price__amount">' . esc_html($price['amount']) . '</span>'
            . '<span class="screen-reader-text"> ' . esc_html($price['currency_text'] . ' ' . __('al año', 'hub-connector')) . '</span>'
            . '<span class="hub-dsearch__cycle" aria-hidden="true">' . esc_html__('/año', 'hub-connector') . '</span>'
            . '</span>';
    }

    return $out;
};
?>
<div class="hub-connector hub-dsearch">
    <form class="hub-dsearch__form" role="search" method="get" action="<?php echo esc_url($data['action']); ?>">
        <label class="hub-dsearch__label" for="<?php echo esc_attr($uid); ?>"><?php echo esc_html__('Busca tu dominio', 'hub-connector'); ?></label>
        <div class="hub-dsearch__row">
            <input class="hub-dsearch__input" id="<?php echo esc_attr($uid); ?>" type="text" name="q" value="<?php echo esc_attr($data['query']); ?>" placeholder="<?php echo esc_attr__('tuempresa', 'hub-connector'); ?>" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="80" required>
            <button class="hub-button hub-dsearch__submit" type="submit"><?php echo esc_html__('Buscar', 'hub-connector'); ?></button>
        </div>
    </form>
    <?php if ($data['chips'] !== []) : ?>
        <ul class="hub-dsearch__chips" aria-label="<?php echo esc_attr__('Precio de registro por año', 'hub-connector'); ?>">
            <?php foreach ($data['chips'] as $row) : ?>
                <li class="hub-dsearch__chip"><span class="hub-dsearch__tld"><?php echo esc_html($row['name']); ?></span> <?php echo $price_html($row, $data['visible_currency']); // phpcs:ignore WordPress.Security.EscapeOutput -- escapado arriba ?></li>
            <?php endforeach; ?>
        </ul>
    <?php endif; ?>
    <?php if ($data['searched']) : ?>
        <div class="hub-dsearch__results" role="region" aria-labelledby="<?php echo esc_attr($uid . '-r'); ?>">
            <?php if ($data['query'] === '') : ?>
                <p class="hub-dsearch__error" id="<?php echo esc_attr($uid . '-r'); ?>" role="alert"><?php echo esc_html__('Escribe un nombre con letras, números o guiones, sin espacios.', 'hub-connector'); ?></p>
            <?php else : ?>
                <h2 class="hub-dsearch__title" id="<?php echo esc_attr($uid . '-r'); ?>"><?php echo esc_html(sprintf(__('Extensiones para «%s»', 'hub-connector'), $data['query'])); ?></h2>
                <p class="hub-dsearch__note"><?php echo esc_html__('Aún no comprobamos la disponibilidad en línea. Elige y te confirmamos si el dominio está libre.', 'hub-connector'); ?></p>
                <ul class="hub-dsearch__list">
                    <?php foreach ($data['rows'] as $row) : ?>
                        <li><span class="hub-dsearch__domain"><?php echo esc_html($data['query']); ?><strong><?php echo esc_html($row['name']); ?></strong></span> <?php echo $price_html($row, $data['visible_currency']); // phpcs:ignore WordPress.Security.EscapeOutput -- escapado arriba ?></li>
                    <?php endforeach; ?>
                </ul>
                <a class="hub-button" href="<?php echo esc_url($data['quote_url']); ?>"><?php echo esc_html__('Consultar disponibilidad', 'hub-connector'); ?></a>
            <?php endif; ?>
        </div>
    <?php endif; ?>
</div>
