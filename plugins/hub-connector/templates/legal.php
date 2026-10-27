<?php
/**
 * Documento legal de [hub_legal] / [hub_documento_legal]. Sobreescribible en
 * <tema>/hub-connector/legal.php. El cuerpo llega saneado del sistema y se
 * imprime además con wp_kses_post (docs/13 §8 y §13).
 *
 * @var array $data title, show_title, slug, version, effective, effective_iso, body
 */
if (!defined('ABSPATH')) {
    exit;
}
?>
<article class="hub-connector hub-legal" data-legal="<?php echo esc_attr($data['slug']); ?>">
    <?php if ($data['show_title'] && $data['title'] !== '') : ?>
        <h2 class="hub-legal__title"><?php echo esc_html($data['title']); ?></h2>
    <?php endif; ?>
    <?php if ($data['version'] !== '' || $data['effective'] !== '') : ?>
        <p class="hub-legal__meta">
            <?php if ($data['version'] !== '') : ?>
                <span><?php echo esc_html(sprintf(__('Versión %s', 'hub-connector'), $data['version'])); ?></span>
            <?php endif; ?>
            <?php if ($data['effective'] !== '') : ?>
                <span><?php echo esc_html__('Vigente desde', 'hub-connector'); ?> <time datetime="<?php echo esc_attr($data['effective_iso']); ?>"><?php echo esc_html($data['effective']); ?></time></span>
            <?php endif; ?>
        </p>
    <?php endif; ?>
    <div class="hub-legal__body">
        <?php echo wp_kses_post($data['body']); ?>
    </div>
</article>
