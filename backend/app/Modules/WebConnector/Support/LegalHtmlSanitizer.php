<?php

declare(strict_types=1);

namespace App\Modules\WebConnector\Support;

use DOMDocument;
use DOMElement;
use DOMNode;

/**
 * Sanea el HTML del cuerpo de un documento legal antes de guardarlo. El cuerpo
 * se sirve tal cual en la web pública (WordPress) con [hub_documento_legal], así
 * que es un límite de confianza: solo deja un subconjunto de etiquetas de texto,
 * quita todo atributo salvo `href` en enlaces (y solo http/https/mailto), y
 * elimina cualquier manejador `on*`, `style` o esquema peligroso.
 */
final class LegalHtmlSanitizer
{
    /** Etiquetas permitidas → atributos permitidos de cada una. */
    private const ALLOWED = [
        'p' => [], 'br' => [], 'strong' => [], 'b' => [], 'em' => [], 'i' => [], 'u' => [],
        'ul' => [], 'ol' => [], 'li' => [], 'a' => ['href'], 'blockquote' => [], 'hr' => [],
        'h1' => [], 'h2' => [], 'h3' => [], 'h4' => [], 'span' => [], 'small' => [], 'sub' => [], 'sup' => [],
        'table' => [], 'thead' => [], 'tbody' => [], 'tr' => [], 'th' => [], 'td' => [],
    ];

    public static function clean(string $html): string
    {
        $html = trim($html);
        if ($html === '') {
            return '';
        }

        $dom = new DOMDocument;
        $prev = libxml_use_internal_errors(true);
        // Envoltorio con charset para preservar UTF-8; LIBXML_* evita agregar <html>/<body>.
        $dom->loadHTML(
            '<?xml encoding="UTF-8"><div id="__root">'.$html.'</div>',
            LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD | LIBXML_NOERROR | LIBXML_NOWARNING
        );
        libxml_clear_errors();
        libxml_use_internal_errors($prev);

        $root = $dom->getElementById('__root');
        if (! $root instanceof DOMElement) {
            return '';
        }

        self::walk($root, $dom);

        $out = '';
        foreach (iterator_to_array($root->childNodes) as $child) {
            $out .= $dom->saveHTML($child);
        }

        return trim($out);
    }

    private static function walk(DOMNode $node, DOMDocument $dom): void
    {
        // Copia: vamos a mover/eliminar nodos durante el recorrido.
        foreach (iterator_to_array($node->childNodes) as $child) {
            if (! $child instanceof DOMElement) {
                continue; // texto y comentarios: el texto se conserva, los comentarios saveHTML los re-emite seguros.
            }

            $tag = strtolower($child->nodeName);
            if (! array_key_exists($tag, self::ALLOWED)) {
                // Etiqueta no permitida: la desenvuelve (conserva su contenido ya saneado).
                self::walk($child, $dom);
                while ($child->firstChild) {
                    $node->insertBefore($child->firstChild, $child);
                }
                $node->removeChild($child);

                continue;
            }

            // Limpia atributos.
            foreach (iterator_to_array($child->attributes ?? []) as $attr) {
                $name = strtolower($attr->nodeName);
                if (! in_array($name, self::ALLOWED[$tag], true)) {
                    $child->removeAttribute($attr->nodeName);

                    continue;
                }
                if ($name === 'href' && ! self::safeHref($attr->nodeValue ?? '')) {
                    $child->removeAttribute($attr->nodeName);
                }
            }

            self::walk($child, $dom);
        }
    }

    private static function safeHref(string $href): bool
    {
        $href = trim($href);
        if ($href === '') {
            return false;
        }
        // Relativos o anclas: permitidos. Absolutos: solo http/https/mailto.
        if (str_starts_with($href, '#') || str_starts_with($href, '/')) {
            return true;
        }
        $scheme = strtolower((string) parse_url($href, PHP_URL_SCHEME));

        return in_array($scheme, ['http', 'https', 'mailto'], true);
    }
}
