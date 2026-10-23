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
