<?php
/**
 * Formulario de [hub_formulario]. Sobreescribible en <tema>/hub-connector/form.php
 * (conservar los name de los campos, data-hub-form y el campo trampa `website`).
 * Sin JS el formulario no se envía (no hay acción por defecto): el envío es solo
 * por la ruta de reenvío, para que WordPress no guarde nada.
 *
 * @var array $data uid, code, source, action, nonce, consent_required, consent_text,
 *                  success_message, redirect_url, button
 */
if (!defined('ABSPATH')) {
    exit;
}
$id = $data['uid'];
$fields = [
    ['name', __('Nombre y apellidos', 'hub-connector'), 'text', true, 'name'],
    ['email', __('Correo electrónico', 'hub-connector'), 'email', true, 'email'],
    ['phone', __('Teléfono', 'hub-connector'), 'tel', false, 'tel'],
    ['company', __('Empresa', 'hub-connector'), 'text', false, 'organization'],
];
?>
<form class="hub-connector hub-form" id="<?php echo esc_attr($id); ?>" novalidate
      data-hub-form="<?php echo esc_attr($data['code']); ?>"
      data-action="<?php echo esc_url($data['action']); ?>"
      data-nonce="<?php echo esc_attr($data['nonce']); ?>"
      data-success="<?php echo esc_attr($data['success_message']); ?>"
      data-redirect="<?php echo esc_url($data['redirect_url']); ?>">
    <div class="hub-form__summary" role="alert" tabindex="-1" hidden></div>
    <input type="hidden" name="source" value="<?php echo esc_attr($data['source']); ?>">
    <div class="hub-form__trap" aria-hidden="true">
        <label for="<?php echo esc_attr($id); ?>-website"><?php echo esc_html__('No llenes este campo', 'hub-connector'); ?></label>
        <input type="text" id="<?php echo esc_attr($id); ?>-website" name="website" tabindex="-1" autocomplete="off">
    </div>
    <div class="hub-form__grid">
        <?php foreach ($fields as [$name, $label, $type, $required, $autocomplete]) : ?>
            <p class="hub-form__field">
                <label for="<?php echo esc_attr($id . '-' . $name); ?>"><?php echo esc_html($label); ?><?php echo $required ? ' <span aria-hidden="true">*</span>' : ''; ?></label>
                <input type="<?php echo esc_attr($type); ?>" id="<?php echo esc_attr($id . '-' . $name); ?>" name="<?php echo esc_attr($name); ?>" autocomplete="<?php echo esc_attr($autocomplete); ?>"<?php echo $required ? ' required aria-required="true"' : ''; ?> maxlength="<?php echo $name === 'phone' ? 30 : 160; ?>" aria-describedby="<?php echo esc_attr($id . '-' . $name); ?>-error">
                <span class="hub-form__error" id="<?php echo esc_attr($id . '-' . $name); ?>-error"></span>
            </p>
        <?php endforeach; ?>
    </div>
    <p class="hub-form__field">
        <label for="<?php echo esc_attr($id); ?>-message"><?php echo esc_html__('Mensaje', 'hub-connector'); ?> <span aria-hidden="true">*</span></label>
        <textarea id="<?php echo esc_attr($id); ?>-message" name="message" rows="5" required aria-required="true" minlength="10" maxlength="5000" aria-describedby="<?php echo esc_attr($id); ?>-message-error"></textarea>
        <span class="hub-form__error" id="<?php echo esc_attr($id); ?>-message-error"></span>
    </p>
    <p class="hub-form__field hub-form__consent">
        <input type="checkbox" id="<?php echo esc_attr($id); ?>-consent" name="consent" value="1"<?php echo $data['consent_required'] ? ' required aria-required="true"' : ''; ?> aria-describedby="<?php echo esc_attr($id); ?>-consent-error">
        <?php
        // «política de privacidad» del texto pasa a ser un enlace a la política (sin la ruta cruda).
        $consent = esc_html($data['consent_text']);
        if (($data['consent_url'] ?? '') !== '') {
            $consent = (string) preg_replace('/política de privacidad/iu', '<a href="' . esc_url($data['consent_url']) . '" target="_blank" rel="noopener">$0</a>', $consent, 1);
        }
        ?>
        <label for="<?php echo esc_attr($id); ?>-consent"><?php echo $consent; // phpcs:ignore WordPress.Security.EscapeOutput -- texto escapado arriba ?></label>
        <span class="hub-form__error" id="<?php echo esc_attr($id); ?>-consent-error"></span>
    </p>
    <p class="hub-form__actions">
        <button type="submit" class="hub-button"><?php echo esc_html($data['button']); ?></button>
    </p>
    <p class="hub-form__status" role="status" aria-live="polite"></p>
</form>
