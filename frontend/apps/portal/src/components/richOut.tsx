/** Renderiza contenido HTML de solo lectura después de aplicar la whitelist del editor. */
const RT_OK = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'H2', 'H3', 'H4', 'UL', 'OL', 'LI', 'A', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'IMG', 'BLOCKQUOTE', 'DIV', 'SPAN', 'HR', 'MARK']);
const RT_DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'TITLE', 'FORM', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'SVG', 'MATH', 'NOSCRIPT', 'TEMPLATE', 'VIDEO', 'AUDIO', 'CANVAS', 'BASE']);

export function sanitize(html: string): string {
  const template = document.createElement('template');
  template.innerHTML = String(html || '');
  const walk = (node: Node) => {
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType === 8) {
        child.remove();
        return;
      }
      if (child.nodeType !== 1) return;
      const element = child as Element;
      const tag = element.tagName;
      if (RT_DROP.has(tag)) {
        element.remove();
        return;
      }
      walk(element);
      if (!RT_OK.has(tag)) {
        element.replaceWith(...Array.from(element.childNodes));
        return;
      }
      Array.from(element.attributes).forEach((attribute) => {
        const name = attribute.name.toLowerCase();
        const value = attribute.value.trim();
        let keep = false;
        // `\/(?!\/)` permite rutas relativas (/x) pero NO protocolo-relativas (//evil.com → redirección abierta).
        if (tag === 'A' && name === 'href') keep = /^(https?:|mailto:|#|\/(?!\/))/i.test(value);
        else if (tag === 'IMG' && name === 'src') keep = /^(https?:|data:image\/(png|jpe?g|gif|webp);)/i.test(value);
        else if (tag === 'IMG' && name === 'alt') keep = true;
        else if ((tag === 'TD' || tag === 'TH') && name === 'colspan') keep = /^\d{1,2}$/.test(value);
        else if (tag === 'MARK' && name === 'class') keep = value === 'var';
        if (!keep) element.removeAttribute(attribute.name);
      });
      if (tag === 'A') {
        element.setAttribute('rel', 'noopener noreferrer');
        element.setAttribute('target', '_blank');
      }
    });
  };
  walk(template.content);
  template.content.querySelectorAll('p').forEach((paragraph) => {
    if (paragraph.querySelector('ul,ol,table,h2,h3,h4,div,blockquote,p')) paragraph.replaceWith(...Array.from(paragraph.childNodes));
  });
  return template.innerHTML;
}

export function RichOut({ html }: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: sanitize(html) }} />;
}
