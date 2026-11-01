/* Hub Connector: selector de moneda (docs/13 §8). Solo cambia qué precio se ve;
   la elección se guarda en localStorage, sin cookie ni dato personal. */
(function () {
    'use strict';
    var KEY = 'hubConnectorCurrency';

    function read() {
        try { return window.localStorage.getItem(KEY); } catch (e) { return null; }
    }

    function write(value) {
        try { window.localStorage.setItem(KEY, value); } catch (e) { /* sin almacenamiento */ }
    }

    function apply(currency, announce) {
        var prices = document.querySelectorAll('.hub-price[data-currency]');
        var available = false;
        prices.forEach(function (el) { if (el.getAttribute('data-currency') === currency) { available = true; } });
        if (!available) { return; }
        // Por grupo (los precios hermanos de un mismo plan): si el plan no tiene
        // precio en la moneda elegida, sigue mostrando el suyo en vez de quedar vacío.
        var groups = [];
        prices.forEach(function (el) {
            var parent = el.parentNode;
            if (groups.indexOf(parent) === -1) { groups.push(parent); }
        });
        groups.forEach(function (parent) {
            var own = [];
            prices.forEach(function (el) { if (el.parentNode === parent) { own.push(el); } });
            var has = own.some(function (el) { return el.getAttribute('data-currency') === currency; });
            var show = has ? currency : own[0].getAttribute('data-currency');
            own.forEach(function (el) { el.hidden = el.getAttribute('data-currency') !== show; });
        });
        document.querySelectorAll('[data-hub-currency]').forEach(function (btn) {
            btn.setAttribute('aria-pressed', btn.getAttribute('data-hub-currency') === currency ? 'true' : 'false');
        });
        if (announce) {
            document.querySelectorAll('[data-hub-currency-status]').forEach(function (el) { el.textContent = currency; });
        }
    }

    document.addEventListener('click', function (event) {
        var btn = event.target.closest ? event.target.closest('[data-hub-currency]') : null;
        if (!btn) { return; }
        var currency = btn.getAttribute('data-hub-currency');
        if (currency !== 'PEN' && currency !== 'USD') { return; }
        write(currency);
        apply(currency, true);
    });

    function init() {
        var saved = read();
        if (saved === 'PEN' || saved === 'USD') { apply(saved, false); }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

/* Hub Connector: [hub_formulario] (docs/13 §9). Envía sin recargar a la ruta de
   reenvío del plugin, con Idempotency-Key por intento (un doble clic no duplica);
   errores 422 junto a cada campo, 429 con aviso de esperar. */
(function () {
    'use strict';
    var FIELDS = ['name', 'email', 'phone', 'company', 'message', 'consent'];
    var MSG = {
        required: 'Completa este campo.',
        email: 'Escribe un correo válido.',
        consent: 'Debes aceptar para continuar.',
        summary: 'Revisa los campos marcados.',
        sending: 'Enviando…',
        error: 'No pudimos enviar tu mensaje. Inténtalo más tarde.'
    };

    function uid() {
        if (window.crypto && window.crypto.randomUUID) { return window.crypto.randomUUID(); }
        return 'hub-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
    }

    function setError(form, name, message) {
        var input = form.querySelector('[name="' + name + '"]');
        if (!input) { return; }
        var box = document.getElementById(input.id + '-error');
        if (message) { input.setAttribute('aria-invalid', 'true'); } else { input.removeAttribute('aria-invalid'); }
        if (box) { box.textContent = message || ''; }
    }

    function localErrors(form) {
        var errors = {};
        FIELDS.forEach(function (name) {
            var input = form.querySelector('[name="' + name + '"]');
            if (!input) { return; }
            if (input.type === 'checkbox') {
                if (input.required && !input.checked) { errors[name] = MSG.consent; }
            } else if (input.required && input.value.trim() === '') {
                errors[name] = MSG.required;
            } else if (name === 'email' && input.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim())) {
                errors[name] = MSG.email;
            }
        });
        return errors;
    }

    function show(form, errors) {
        var summary = form.querySelector('.hub-form__summary');
        var first = null;
        FIELDS.forEach(function (name) {
            setError(form, name, errors[name] || '');
            if (errors[name] && !first) { first = form.querySelector('[name="' + name + '"]'); }
        });
        if (summary) {
            summary.hidden = !first;
            summary.textContent = first ? MSG.summary : '';
        }
        if (first) { first.focus(); }
    }

    function utm() {
        var out = {};
        try {
            var params = new URLSearchParams(window.location.search);
            ['source', 'medium', 'campaign', 'term', 'content'].forEach(function (k) {
                var v = params.get('utm_' + k);
                if (v) { out[k] = v.slice(0, 120); }
            });
        } catch (e) { /* sin URLSearchParams */ }
        return out;
    }

    /* «Elegir plan» llega con ?plan=<código>&nombre=<plan>: se escribe en el mensaje
       de cotización (si está vacío) para que el asesor sepa qué plan se eligió. */
    function prefillPlan() {
        var plan = '', name = '';
        try {
            var params = new URLSearchParams(window.location.search);
            plan = (params.get('plan') || '').slice(0, 80);
            name = (params.get('nombre') || '').slice(0, 120);
        } catch (e) { return; }
        if (!/^[A-Za-z0-9_-]+$/.test(plan)) { return; }
        var action = '';
        try { action = new URLSearchParams(window.location.search).get('accion') || ''; } catch (e) { /* sin URLSearchParams */ }
        var text;
        if (plan === 'dominio') {
            /* Buscador de dominios: el nombre es el dominio (miempresa.pe) o solo el nombre buscado. */
            if (!/^[a-z0-9][a-z0-9.-]{0,130}$/.test(name)) { return; }
            text = action === 'transferir' ? 'Quiero transferir el dominio ' + name + ' a su servicio.'
                : action === 'consultar' ? 'Quiero consultar la disponibilidad del dominio ' + name + '.'
                : 'Quiero registrar el dominio ' + name + '.';
        } else {
            text = 'Quiero cotizar el plan ' + (name ? name + ' (código ' + plan + ')' : plan) + '.';
        }
        document.querySelectorAll('form[data-hub-form] textarea[name="message"]').forEach(function (box) {
            if (box.value.trim() === '') { box.value = text; }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', prefillPlan);
    } else {
        prefillPlan();
    }

    document.addEventListener('submit', function (event) {
        var form = event.target;
        if (!form || !form.matches || !form.matches('form[data-hub-form]')) { return; }
        event.preventDefault();
        if (form.getAttribute('aria-busy') === 'true') { return; }
        var status = form.querySelector('.hub-form__status');
        var errors = localErrors(form);
        show(form, errors);
        if (Object.keys(errors).length) { return; }

        var body = { page_url: window.location.href.split('#')[0], utm: utm() };
        ['name', 'email', 'phone', 'company', 'message', 'source', 'website'].forEach(function (name) {
            var input = form.querySelector('[name="' + name + '"]');
            if (input) { body[name] = input.value; }
        });
        var consent = form.querySelector('[name="consent"]');
        body.consent = !!(consent && consent.checked);
        if (!form.dataset.idempotency) { form.dataset.idempotency = uid(); }

        var button = form.querySelector('button[type="submit"]');
        form.setAttribute('aria-busy', 'true');
        if (button) { button.disabled = true; }
        if (status) { status.textContent = MSG.sending; status.className = 'hub-form__status'; }

        fetch(form.getAttribute('data-action'), {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Hub-Form-Nonce': form.getAttribute('data-nonce') || '',
                'Idempotency-Key': form.dataset.idempotency
            },
            body: JSON.stringify(body)
        }).then(function (response) {
            return response.json().catch(function () { return {}; }).then(function (json) { return { status: response.status, json: json }; });
        }).then(function (result) {
            var json = result.json || {};
            if (result.status === 202) {
                var redirect = json.redirect_url || form.getAttribute('data-redirect');
                if (redirect && /^https:\/\//.test(redirect)) { window.location.assign(redirect); return; }
                form.reset();
                delete form.dataset.idempotency;
                if (status) { status.textContent = json.message || form.getAttribute('data-success'); status.className = 'hub-form__status hub-form__status--ok'; }
                return;
            }
            if (result.status === 422 && json.errors) {
                var mapped = {};
                Object.keys(json.errors).forEach(function (k) { mapped[k] = (json.errors[k] || [])[0] || MSG.required; });
                show(form, mapped);
                if (status) { status.textContent = ''; }
                return;
            }
            if (status) { status.textContent = json.message || MSG.error; status.className = 'hub-form__status hub-form__status--error'; }
        }).catch(function () {
            if (status) { status.textContent = MSG.error; status.className = 'hub-form__status hub-form__status--error'; }
        }).then(function () {
            form.removeAttribute('aria-busy');
            if (button) { button.disabled = false; }
        });
    });
})();

/* Hub Connector: pestañas de [hub_planes vista="hero"] (patrón WAI-ARIA tabs con
   activación automática: flechas, Inicio y Fin mueven el foco y muestran el panel). */
(function () {
    'use strict';

    function select(tab, focus) {
        var list = tab.closest('[role="tablist"]');
        var root = tab.closest('[data-hub-tabs]');
        if (!list || !root) { return; }
        list.querySelectorAll('[role="tab"]').forEach(function (t) {
            var on = t === tab;
            t.setAttribute('aria-selected', on ? 'true' : 'false');
            if (on) { t.removeAttribute('tabindex'); } else { t.setAttribute('tabindex', '-1'); }
            var panel = document.getElementById(t.getAttribute('aria-controls'));
            if (panel) { panel.hidden = !on; }
        });
        if (focus) { tab.focus(); }
        if (tab.scrollIntoView && list.scrollWidth > list.clientWidth) {
            tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
    }

    document.addEventListener('click', function (event) {
        var tab = event.target.closest ? event.target.closest('[data-hub-tabs] [role="tab"]') : null;
        if (tab) { select(tab, false); }
    });

    document.addEventListener('keydown', function (event) {
        var tab = event.target.closest ? event.target.closest('[data-hub-tabs] [role="tab"]') : null;
        if (!tab) { return; }
        var tabs = Array.prototype.slice.call(tab.closest('[role="tablist"]').querySelectorAll('[role="tab"]'));
        var i = tabs.indexOf(tab);
        var next = null;
        if (event.key === 'ArrowRight') { next = tabs[(i + 1) % tabs.length]; }
        if (event.key === 'ArrowLeft') { next = tabs[(i - 1 + tabs.length) % tabs.length]; }
        if (event.key === 'Home') { next = tabs[0]; }
        if (event.key === 'End') { next = tabs[tabs.length - 1]; }
        if (next) {
            event.preventDefault();
            select(next, true);
        }
    });
})();

/* Hub Connector: disponibilidad en /dominios/?q= (D-35). La página es cacheable; el navegador
   pregunta a la ruta REST del plugin (con nonce) y rellena estado y botón de cada extensión.
   Sin JavaScript, o si falla la consulta, quedan los precios y el botón a cotización. */
(function () {
    'use strict';
    var MAX = 8;
    var MSG = {
        checking: 'Comprobando disponibilidad…',
        done: 'Disponibilidad actualizada.',
        failed: 'No pudimos comprobar la disponibilidad ahora. Estos son los precios; te confirmamos al cotizar.',
        limited: 'Hiciste muchas consultas seguidas. Intenta de nuevo en unos minutos.',
        available: 'Disponible', registered: 'Registrado', unknown: 'No pudimos verificar',
        want: 'Lo quiero', transfer: '¿Es tuyo? Transfiérelo', consult: 'Consultar'
    };

    function link(url, text, aria, cls) {
        var a = document.createElement('a');
        a.href = url;
        a.className = cls;
        a.textContent = text;
        a.setAttribute('aria-label', aria);
        return a;
    }

    function setFallback(root, show) {
        root.querySelectorAll('[data-hub-fallback]').forEach(function (el) { el.hidden = !show; });
    }

    function apply(root, row, item) {
        var domain = item.domain || (root.getAttribute('data-name') + '.' + item.tld);
        var state = row.querySelector('[data-hub-state]');
        var price = row.querySelector('[data-hub-price]');
        var action = row.querySelector('[data-hub-action]');
        var quote = root.getAttribute('data-quote') || '';
        var contact = root.getAttribute('data-contact') || '';
        var q = '?plan=dominio&nombre=' + encodeURIComponent(domain);
        state.textContent = '';
        action.textContent = '';
        row.setAttribute('data-status', item.status);
        var badge = document.createElement('span');
        badge.className = 'hub-dsearch__badge hub-dsearch__badge--' + item.status;
        badge.textContent = MSG[item.status] || MSG.unknown;
        state.appendChild(badge);
        if (price) { price.hidden = item.status !== 'available'; }
        if (item.status === 'available') {
            action.appendChild(link(quote + q + '&accion=registrar', MSG.want, MSG.want + ' ' + domain, 'hub-button hub-dsearch__want'));
        } else if (item.status === 'registered') {
            if (item.allows_transfer_in) {
                action.appendChild(link(contact + q + '&accion=transferir', MSG.transfer, MSG.transfer + ' ' + domain, 'hub-dsearch__link'));
            }
        } else {
            action.appendChild(link(contact + q + '&accion=consultar', MSG.consult, MSG.consult + ' ' + domain, 'hub-button hub-dsearch__ask'));
        }
    }

    function request(root, tlds, signal) {
        var base = root.getAttribute('data-endpoint');
        var url = base + (base.indexOf('?') < 0 ? '?' : '&')
            + 'name=' + encodeURIComponent(root.getAttribute('data-name')) + '&tlds=' + encodeURIComponent(tlds.join(','));
        return fetch(url, {
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { 'Accept': 'application/json', 'X-Hub-Domain-Nonce': root.getAttribute('data-nonce') || '' },
            signal: signal
        }).then(function (response) {
            return response.json().catch(function () { return {}; }).then(function (json) { return { status: response.status, json: json }; });
        });
    }

    function run(root) {
        var rows = {};
        var order = [];
        root.querySelectorAll('[data-hub-row]').forEach(function (row) {
            var tld = row.getAttribute('data-tld');
            if (tld) { rows[tld] = row; order.push(tld); }
        });
        var live = root.querySelector('[data-hub-live]');
        if (!order.length || !root.getAttribute('data-endpoint') || !window.fetch) { return; }
        var controller = window.AbortController ? new AbortController() : null;
        var timer = controller ? window.setTimeout(function () { controller.abort(); }, 25000) : null;
        var chunks = [];
        for (var i = 0; i < order.length; i += MAX) { chunks.push(order.slice(i, i + MAX)); }
        root.setAttribute('aria-busy', 'true');
        if (live) { live.textContent = MSG.checking; }
        var applied = 0;
        var problem = '';

        chunks.reduce(function (chain, chunk) {
            return chain.then(function () {
                if (problem) { return null; }
                return request(root, chunk, controller ? controller.signal : undefined).then(function (result) {
                    if (result.status !== 200 || !result.json || !result.json.results) {
                        problem = result.status === 429 ? 'limited' : 'failed';
                        return;
                    }
                    result.json.results.forEach(function (item) {
                        if (item && rows[item.tld]) { apply(root, rows[item.tld], item); applied++; }
                    });
                });
            });
        }, Promise.resolve()).catch(function () {
            problem = 'failed';
        }).then(function () {
            if (timer) { window.clearTimeout(timer); }
            root.removeAttribute('aria-busy');
            if (applied > 0) { setFallback(root, false); }
            if (live) {
                live.textContent = problem ? MSG[problem] : MSG.done;
                if (problem) { live.classList.add('hub-dsearch__status--error'); }
            }
        });
    }

    function init() {
        document.querySelectorAll('[data-hub-availability]').forEach(run);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
