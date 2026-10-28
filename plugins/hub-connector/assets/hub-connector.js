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
        prices.forEach(function (el) { el.hidden = el.getAttribute('data-currency') !== currency; });
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
        document.querySelectorAll('form[data-hub-form] textarea[name="message"]').forEach(function (box) {
            if (box.value.trim() === '') {
                box.value = 'Quiero cotizar el plan ' + (name ? name + ' (código ' + plan + ')' : plan) + '.';
            }
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
