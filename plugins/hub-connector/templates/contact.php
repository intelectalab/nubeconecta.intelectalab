<?php
/**
 * Datos de contacto de [hub_contacto]. Sobreescribible en <tema>/hub-connector/contact.php.
 *
 * @var array $data items (kind, label, value, href), format (texto|enlace|boton|lista)
 */
if (!defined('ABSPATH')) {
    exit;
}
$names = [
    'phone' => __('Teléfono', 'hub-connector'),
    'email' => __('Correo', 'hub-connector'),
    'whatsapp' => __('WhatsApp', 'hub-connector'),
    'address' => __('Dirección', 'hub-connector'),
    'hours' => __('Horario', 'hub-connector'),
];
$format = in_array($data['format'], ['texto', 'enlace', 'boton', 'lista'], true) ? $data['format'] : 'texto';
$wrap = $format === 'lista' ? 'ul' : 'div';
$row = $format === 'lista' ? 'li' : 'span';
?>
<<?php echo $wrap; ?> class="hub-connector hub-contact hub-contact--<?php echo esc_attr($format); ?>">
    <?php foreach ($data['items'] as $item) :
        $label = $item['label'] !== '' ? $item['label'] : ($names[$item['kind']] ?? '');
        $link = $format !== 'texto' && $item['href'] !== '';
        ?>
        <<?php echo $row; ?> class="hub-contact__item hub-contact__item--<?php echo esc_attr($item['kind']); ?>">
            <?php if ($link) : ?>
                <a class="<?php echo $format === 'boton' ? 'hub-button' : 'hub-contact__link'; ?>" href="<?php echo esc_url($item['href'], ['tel', 'mailto', 'https']); ?>"<?php echo $item['kind'] === 'whatsapp' ? ' rel="noopener" target="_blank"' : ''; ?>>
                    <span class="hub-contact__label"><?php echo esc_html($label); ?>:</span> <?php echo esc_html($item['value']); ?>
                </a>
            <?php else : ?>
                <span class="hub-contact__label"><?php echo esc_html($label); ?>:</span> <?php echo esc_html($item['value']); ?>
            <?php endif; ?>
        </<?php echo $row; ?>>
    <?php endforeach; ?>
</<?php echo $wrap; ?>>
