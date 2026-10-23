<?php

namespace HubConnector\Render;

/**
 * Plantillas sobreescribibles por el tema (docs/13 §3): primero
 * <tema>/hub-connector/<nombre>.php, luego templates/<nombre>.php del plugin.
 * El filtro hub_connector_template_path permite cambiar la ruta final.
 * Las plantillas reciben $data y deben escapar toda salida.
 */
final class Templates
{
    public function __construct(private string $dir)
    {
    }

    /** @param array<string, mixed> $data */
    public function render(string $name, array $data): string
    {
        if (!preg_match('/^[a-z0-9-]+$/', $name)) {
            return '';
        }
        $path = function_exists('locate_template') ? (string) locate_template('hub-connector/' . $name . '.php') : '';
        if ($path === '') {
            $path = $this->dir . $name . '.php';
        }
        $path = (string) apply_filters('hub_connector_template_path', $path, $name, $data);
        if (!is_readable($path)) {
            return '';
        }

        ob_start();
        (static function (string $__path, array $data): void {
            include $__path;
        })($path, $data);

        return (string) ob_get_clean();
    }
}
