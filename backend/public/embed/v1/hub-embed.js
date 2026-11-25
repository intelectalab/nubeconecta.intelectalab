/*!
 * hub-embed.js — Widget embebible de NubeConecta para webs a medida (docs/15).
 * ES2019, sin dependencias. Dibuja cada <div data-hub-block> en su Shadow DOM,
 * leyendo en vivo los endpoints públicos /api/v1/public/wp/* con la clave
 * publicable (scope embed). Nunca inserta HTML sin sanear: todo se construye con
 * textContent salvo el cuerpo de documentos legales, que el sistema ya sanea.
 */
(function () {
  'use strict';
  var script = document.currentScript || (function () { var s = document.getElementsByTagName('script'); return s[s.length - 1]; })();
  if (!script) return;
  var KEY = script.getAttribute('data-hub-key') || '';
  if (!KEY) { if (window.console) console.warn('[hub-embed] falta data-hub-key en el <script>'); return; }
  var ORIGIN = (function () { try { return new URL(script.src, location.href).origin; } catch (e) { return location.origin; } })();
  var API = ORIGIN + '/api/v1/public/wp';
  var LANG = (script.getAttribute('data-idioma') || 'es').slice(0, 2);
  var state = { currency: (script.getAttribute('data-moneda') || 'PEN').toUpperCase() === 'USD' ? 'USD' : 'PEN' };
  var blocks = [];

  /* -------- utilidades -------- */
  var cache = {};
  function api(path, params) {
    var qs = '';
    if (params) {
      var parts = [];
      for (var k in params) { if (params[k] != null && params[k] !== '') parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k])); }
      if (parts.length) qs = '?' + parts.join('&');
    }
    var url = API + path + qs;
    if (cache[url]) return cache[url];
    var p = fetch(url, { headers: { Authorization: 'Bearer ' + KEY, Accept: 'application/json' }, credentials: 'omit' })
      .then(function (r) {
        if (r.status === 304) return null;
        return r.json().then(function (body) {
          if (!r.ok) throw new Error((body && (body.detail || body.title)) || ('HTTP ' + r.status));
          return body && body.data;
        });
      });
    cache[url] = p;
    return p;
  }
  function parse(r) {
    return r.json().then(function (body) {
      if (!r.ok) { var e = new Error((body && (body.detail || body.title)) || ('HTTP ' + r.status)); e.status = r.status; e.body = body; throw e; }
      return body && body.data;
    });
  }
  function post(path, body, headers) {
    var h = { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', Accept: 'application/json' };
    if (headers) { for (var k in headers) h[k] = headers[k]; }
    return fetch(API + path, { method: 'POST', headers: h, credentials: 'omit', body: JSON.stringify(body) }).then(parse);
  }
  function getFresh(path) {
    return fetch(API + path, { headers: { Authorization: 'Bearer ' + KEY, Accept: 'application/json' }, credentials: 'omit' }).then(parse);
  }
  function uuid() { return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }); }
  function fmtDate(iso) { try { return new Date(iso).toLocaleDateString(LANG === 'en' ? 'en-US' : 'es-PE', { year: 'numeric', month: 'long', day: 'numeric' }); } catch (e) { return String(iso); } }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function money(amountMinor, currency) {
    if (amountMinor == null) return '';
    var sym = (currency || state.currency) === 'USD' ? 'US$ ' : 'S/ ';
    return sym + (amountMinor / 100).toLocaleString(LANG === 'en' ? 'en-US' : 'es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  var CYCLE = { monthly: 'mes', quarterly: 'trimestre', semiannual: 'semestre', annual: 'año', biennial: '2 años', triennial: '3 años', one_time: 'pago único' };
  function cycleLabel(c) { return CYCLE[c] || c || ''; }

  var STYLE = [
    ':host{all:initial;display:block;font-family:var(--hub-fuente,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif);color:var(--hub-color-texto,#1f2430);line-height:1.5;box-sizing:border-box}',
    '*,*::before,*::after{box-sizing:border-box}',
    '.hub-grid{display:grid;gap:16px}',
    '.hub-card{border:1px solid rgba(0,0,0,.12);border-radius:var(--hub-radio,12px);padding:16px;background:#fff;display:flex;flex-direction:column;gap:8px}',
    '.hub-card.feat{border-color:var(--hub-color-primario,#2a6df4);box-shadow:0 0 0 2px var(--hub-color-primario,#2a6df4) inset}',
    '.hub-name{font-size:17px;font-weight:700;margin:0}',
    '.hub-tag{font-size:13px;opacity:.75;margin:0}',
    '.hub-price{font-size:24px;font-weight:800;margin:4px 0}',
    '.hub-price small{font-size:13px;font-weight:600;opacity:.7}',
    '.hub-list{list-style:none;margin:6px 0;padding:0;display:grid;gap:4px;font-size:14px}',
    '.hub-list li::before{content:"✓";color:var(--hub-color-primario,#2a6df4);font-weight:700;margin-right:6px}',
    '.hub-btn{display:inline-block;text-align:center;cursor:pointer;border:0;border-radius:8px;padding:10px 14px;font-weight:700;font-size:14px;background:var(--hub-color-primario,#2a6df4);color:#fff;text-decoration:none;margin-top:auto}',
    '.hub-btn.ghost{background:transparent;border:1px solid var(--hub-color-primario,#2a6df4);color:var(--hub-color-primario,#2a6df4)}',
    '.hub-field{display:grid;gap:4px;font-size:14px;margin-bottom:10px}',
    '.hub-field label{font-weight:600}',
    '.hub-input,.hub-select,.hub-textarea{width:100%;padding:9px 10px;border:1px solid rgba(0,0,0,.25);border-radius:8px;font:inherit;color:inherit;background:#fff}',
    '.hub-row{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end}',
    '.hub-tbl{width:100%;border-collapse:collapse;font-size:14px}',
    '.hub-tbl th,.hub-tbl td{border-bottom:1px solid rgba(0,0,0,.1);padding:8px 10px;text-align:left}',
    '.hub-tbl th{font-weight:700}',
    '.hub-badge{display:inline-block;font-size:12px;font-weight:700;padding:2px 8px;border-radius:999px}',
    '.ok{background:rgba(22,160,90,.14);color:#127245}',
    '.no{background:rgba(214,69,69,.14);color:#a12a2a}',
    '.unk{background:rgba(0,0,0,.08);color:#555}',
    '.hub-msg{font-size:14px;opacity:.8;padding:8px 0}',
    '.hub-err{font-size:13px;color:#a12a2a;padding:8px 0}',
    '.hub-legal h1,.hub-legal h2,.hub-legal h3{line-height:1.25}',
    '.hub-legal{font-size:14px}',
    '.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}'
  ].join('');

  function mount(div) {
    var root = div.shadowRoot || div.attachShadow({ mode: 'open' });
    root.innerHTML = '';
    var st = document.createElement('style'); st.textContent = STYLE; root.appendChild(st);
    var wrap = el('div'); root.appendChild(wrap);
    return wrap;
  }
  function loading(wrap, label) { wrap.appendChild(el('div', 'hub-msg', (label || 'Cargando') + '…')); }
  function fail(wrap, err) {
    wrap.innerHTML = '';
    var box = el('div', 'hub-err', 'No se pudo cargar esta sección.');
    wrap.appendChild(box);
    if (window.console) console.warn('[hub-embed]', err);
  }

  /* -------- bloques -------- */
  var RENDER = {
    planes: function (div, wrap) {
      loading(wrap, 'Cargando planes');
      api('/catalog/plans', { type: div.dataset.tipo, cycle: div.dataset.ciclo, currency: state.currency, featured: div.dataset.destacados, lang: LANG }).then(function (plans) {
        if (!plans) return;
        wrap.innerHTML = '';
        if (!plans.length) { wrap.appendChild(el('div', 'hub-msg', 'No hay planes disponibles.')); return; }
        var cols = Math.max(1, Math.min(4, parseInt(div.dataset.columnas, 10) || 3));
        var grid = el('div', 'hub-grid'); grid.style.gridTemplateColumns = 'repeat(' + cols + ',minmax(0,1fr))';
        plans.forEach(function (p) { grid.appendChild(planCard(p, div.dataset.ciclo)); });
        wrap.appendChild(grid);
      }).catch(function (e) { fail(wrap, e); });
    },
    plan: function (div, wrap) {
      if (!div.dataset.id) { fail(wrap, 'falta data-id'); return; }
      loading(wrap, 'Cargando plan');
      api('/catalog/plans/' + encodeURIComponent(div.dataset.id), { currency: state.currency, lang: LANG }).then(function (p) {
        if (!p) return; wrap.innerHTML = ''; wrap.appendChild(planCard(p, null));
      }).catch(function (e) { fail(wrap, e); });
    },
    comparador: function (div, wrap) {
      if (!div.dataset.tipo) { fail(wrap, 'falta data-tipo'); return; }
      loading(wrap, 'Cargando comparador');
      api('/catalog/compare', { type: div.dataset.tipo, cycle: div.dataset.ciclo, currency: state.currency, lang: LANG }).then(function (d) {
        if (!d) return; wrap.innerHTML = '';
        var tbl = el('table', 'hub-tbl'); var thead = el('thead'); var htr = el('tr'); htr.appendChild(el('th', null, ''));
        d.plans.forEach(function (p) { htr.appendChild(el('th', null, p.name)); });
        thead.appendChild(htr); tbl.appendChild(thead);
        var pr = el('tr'); pr.appendChild(el('th', null, 'Precio'));
        d.plans.forEach(function (p) { pr.appendChild(el('td', null, money(p.price.amount_minor, p.price.currency))); });
        var tb = el('tbody'); tb.appendChild(pr);
        (d.features || []).forEach(function (f) {
          var tr = el('tr'); tr.appendChild(el('th', null, f));
          d.plans.forEach(function (p) { var v = p.limits && p.limits[f]; tr.appendChild(el('td', null, v == null ? '—' : (v === true ? '✓' : v === false ? '—' : String(v)))); });
          tb.appendChild(tr);
        });
        tbl.appendChild(tb); wrap.appendChild(tbl);
      }).catch(function (e) { fail(wrap, e); });
    },
    dominios: function (div, wrap) {
      loading(wrap, 'Cargando precios');
      api('/catalog/domain-prices', { tlds: div.dataset.tlds, currency: state.currency }).then(function (rows) {
        if (!rows) return; wrap.innerHTML = '';
        if (!rows.length) { wrap.appendChild(el('div', 'hub-msg', 'No hay extensiones disponibles.')); return; }
        var tbl = el('table', 'hub-tbl'); var thead = el('thead'); var htr = el('tr');
        ['Extensión', 'Registro', 'Renovación', 'Transferencia'].forEach(function (h) { htr.appendChild(el('th', null, h)); });
        thead.appendChild(htr); tbl.appendChild(thead); var tb = el('tbody');
        rows.forEach(function (r) {
          var tr = el('tr');
          tr.appendChild(el('td', null, r.name || ('.' + r.tld)));
          tr.appendChild(el('td', null, money(r.register_minor, r.currency)));
          tr.appendChild(el('td', null, r.renew_minor != null ? money(r.renew_minor, r.currency) : '—'));
          tr.appendChild(el('td', null, r.transfer_minor != null ? money(r.transfer_minor, r.currency) : '—'));
          tb.appendChild(tr);
        });
        tbl.appendChild(tb); wrap.appendChild(tbl);
      }).catch(function (e) { fail(wrap, e); });
    },
    'buscar-dominio': function (div, wrap) {
      wrap.innerHTML = '';
      var form = el('form'); var row = el('div', 'hub-row');
      var fld = el('div', 'hub-field'); fld.style.flex = '1 1 220px';
      var lab = el('label', null, 'Busca tu dominio'); lab.setAttribute('for', 'hub-dom'); fld.appendChild(lab);
      var input = el('input', 'hub-input'); input.id = 'hub-dom'; input.placeholder = 'miempresa'; input.autocomplete = 'off'; fld.appendChild(input);
      row.appendChild(fld);
      var btn = el('button', 'hub-btn', 'Buscar'); btn.type = 'submit'; row.appendChild(btn);
      form.appendChild(row); wrap.appendChild(form);
      var out = el('div'); out.style.marginTop = '10px'; wrap.appendChild(out);
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var name = input.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
        if (!name) { input.focus(); return; }
        out.innerHTML = ''; out.appendChild(el('div', 'hub-msg', 'Consultando…'));
        fetch(API + '/domains/availability?name=' + encodeURIComponent(name) + (div.dataset.tlds ? '&tlds=' + encodeURIComponent(div.dataset.tlds) : '') + '&currency=' + state.currency, { headers: { Authorization: 'Bearer ' + KEY, Accept: 'application/json' }, credentials: 'omit' })
          .then(function (r) { return r.json().then(function (b) { if (!r.ok) throw new Error((b && (b.detail || b.title)) || ('HTTP ' + r.status)); return b.data; }); })
          .then(function (d) {
            out.innerHTML = '';
            var ul = el('ul', 'hub-list'); ul.style.listStyle = 'none';
            d.results.forEach(function (res) {
              var li = el('li'); li.style.display = 'flex'; li.style.gap = '8px'; li.style.alignItems = 'center'; li.style.padding = '6px 0';
              li.appendChild(el('b', null, res.domain));
              var badge = res.status === 'available' ? el('span', 'hub-badge ok', 'Disponible') : res.status === 'registered' ? el('span', 'hub-badge no', 'Ocupado') : el('span', 'hub-badge unk', 'Sin datos');
              li.appendChild(badge);
              if (res.status === 'available' && res.register_minor != null) { li.appendChild(el('span', null, money(res.register_minor, res.currency) + '/año')); }
              ul.appendChild(li);
            });
            out.appendChild(ul);
          }).catch(function (e) { out.innerHTML = ''; out.appendChild(el('div', 'hub-err', 'No se pudo consultar la disponibilidad.')); if (window.console) console.warn('[hub-embed]', e); });
      });
    },
    contacto: function (div, wrap) {
      loading(wrap, 'Cargando contacto');
      api('/contact', {}).then(function (rows) {
        if (!rows) return; wrap.innerHTML = '';
        if (!rows.length) { wrap.appendChild(el('div', 'hub-msg', 'Sin datos de contacto.')); return; }
        var ul = el('ul', 'hub-list'); ul.style.listStyle = 'none';
        rows.forEach(function (r) {
          var li = el('li'); var lbl = (r.label && (r.label[LANG] || r.label.es)) || r.kind;
          var b = el('b', null, lbl + ': '); li.appendChild(b); li.appendChild(document.createTextNode(r.value)); ul.appendChild(li);
        });
        wrap.appendChild(ul);
      }).catch(function (e) { fail(wrap, e); });
    },
    'documento-legal': function (div, wrap) {
      var slug = div.dataset.slug || div.dataset.tipo;
      if (!slug) { fail(wrap, 'falta data-slug o data-tipo'); return; }
      loading(wrap, 'Cargando documento');
      api('/legal-documents/' + encodeURIComponent(slug), { lang: LANG }).then(function (d) {
        if (!d) return; wrap.innerHTML = '';
        wrap.appendChild(el('h2', 'hub-name', d.title));
        if (d.version_label) wrap.appendChild(el('p', 'hub-tag', d.version_label));
        var body = el('div', 'hub-legal');
        body.innerHTML = d.body || ''; // el sistema entrega el cuerpo ya saneado (RN-WCN-020)
        wrap.appendChild(body);
      }).catch(function (e) { fail(wrap, e); });
    },
    formulario: function (div, wrap) {
      var code = div.dataset.codigo || div.dataset.code;
      if (!code) { fail(wrap, 'falta data-codigo'); return; }
      loading(wrap, 'Cargando formulario');
      api('/forms/' + encodeURIComponent(code), { lang: LANG }).then(function (def) {
        if (!def) return; wrap.innerHTML = '';
        var form = el('form');
        (def.fields || []).forEach(function (f) {
          var fld = el('div', 'hub-field');
          var id = 'hub-f-' + f.key;
          var lab = el('label', null, f.label || f.key); lab.setAttribute('for', id); if (f.required) lab.appendChild(el('span', null, ' *'));
          fld.appendChild(lab);
          var input;
          if (f.type === 'textarea') { input = el('textarea', 'hub-textarea'); input.rows = 4; }
          else if (f.type === 'select') { input = el('select', 'hub-select'); (f.options || []).forEach(function (o) { var op = el('option', null, o.label || o.value); op.value = o.value; input.appendChild(op); }); }
          else { input = el('input', 'hub-input'); input.type = f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : 'text'; }
          input.id = id; input.name = f.key; if (f.required) input.required = true;
          if (f.help_text) { var h = el('small', 'hub-tag', f.help_text); fld.appendChild(input); fld.appendChild(h); }
          else fld.appendChild(input);
          form.appendChild(fld);
        });
        if (def.consent && def.consent.required) {
          var cf = el('div', 'hub-field'); var cl = el('label'); cl.style.display = 'flex'; cl.style.gap = '8px';
          var cb = el('input'); cb.type = 'checkbox'; cb.required = true; cb.name = '_consent'; cl.appendChild(cb);
          cl.appendChild(document.createTextNode(def.consent.text || 'Acepto el tratamiento de mis datos.')); cf.appendChild(cl); form.appendChild(cf);
        }
        var btn = el('button', 'hub-btn', 'Enviar'); btn.type = 'submit'; form.appendChild(btn);
        var note = el('div', 'hub-msg'); form.appendChild(note);
        form.addEventListener('submit', function (ev) {
          ev.preventDefault();
          var payload = {}; (def.fields || []).forEach(function (f) { var i = form.querySelector('[name="' + f.key + '"]'); if (i) payload[f.key] = i.value; });
          if (def.consent && def.consent.required) payload.consent = !!form.querySelector('[name="_consent"]').checked;
          btn.disabled = true; note.className = 'hub-msg'; note.textContent = 'Enviando…';
          fetch(API + '/forms/' + encodeURIComponent(code) + '/submissions', { method: 'POST', headers: { Authorization: 'Bearer ' + KEY, Accept: 'application/json', 'Content-Type': 'application/json' }, credentials: 'omit', body: JSON.stringify(payload) })
            .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, b: b }; }); })
            .then(function (res) {
              btn.disabled = false;
              if (res.ok) { form.reset(); note.className = 'hub-msg'; note.textContent = def.success_message || '¡Gracias! Hemos recibido tu mensaje.'; }
              else { note.className = 'hub-err'; note.textContent = (res.b && (res.b.detail || res.b.title)) || 'No se pudo enviar el formulario.'; }
            }).catch(function (e) { btn.disabled = false; note.className = 'hub-err'; note.textContent = 'No se pudo enviar el formulario.'; if (window.console) console.warn('[hub-embed]', e); });
        });
        wrap.appendChild(form);
      }).catch(function (e) { fail(wrap, e); });
    },
    'boton-contratar': function (div, wrap) {
      wrap.innerHTML = '';
      var plan = div.dataset.plan || div.dataset.id || '';
      var a = el('a', 'hub-btn', div.dataset.texto || 'Contratar');
      a.href = ORIGIN + '/cart?add=' + encodeURIComponent(plan);
      a.target = '_blank'; a.rel = 'noopener';
      wrap.appendChild(a);
    },
    moneda: function (div, wrap) {
      wrap.innerHTML = '';
      var sel = el('select', 'hub-select'); sel.style.width = 'auto';
      [['PEN', 'Soles (S/)'], ['USD', 'Dólares (US$)']].forEach(function (o) { var op = el('option', null, o[1]); op.value = o[0]; if (o[0] === state.currency) op.selected = true; sel.appendChild(op); });
      sel.setAttribute('aria-label', 'Moneda');
      sel.addEventListener('change', function () { state.currency = sel.value === 'USD' ? 'USD' : 'PEN'; cache = {}; renderAll(); });
      wrap.appendChild(sel);
    },
    servidores: function (div, wrap) {
      loading(wrap, 'Cargando servidores');
      api('/catalog/servers', { tipo: div.dataset.tipo, ids: div.dataset.ids, cycle: div.dataset.ciclo, currency: state.currency, lang: LANG }).then(function (rows) {
        if (!rows) return; wrap.innerHTML = '';
        if (!rows.length) { wrap.appendChild(el('div', 'hub-msg', 'No hay servidores disponibles.')); return; }
        var cols = Math.max(1, Math.min(4, parseInt(div.dataset.columnas, 10) || 3));
        var grid = el('div', 'hub-grid'); grid.style.gridTemplateColumns = 'repeat(' + cols + ',minmax(0,1fr))';
        rows.forEach(function (s) { grid.appendChild(serverCard(s)); });
        wrap.appendChild(grid);
      }).catch(function (e) { fail(wrap, e); });
    },
    paquete: function (div, wrap) {
      if (!div.dataset.id) { fail(wrap, 'falta data-id'); return; }
      loading(wrap, 'Cargando paquete');
      api('/catalog/bundles/' + encodeURIComponent(div.dataset.id), { currency: state.currency, lang: LANG }).then(function (b) {
        if (!b) return; wrap.innerHTML = '';
        var card = el('div', 'hub-card' + (b.featured ? ' feat' : ''));
        card.appendChild(el('h3', 'hub-name', b.name));
        if (b.tagline) card.appendChild(el('p', 'hub-tag', b.tagline));
        var price = el('div', 'hub-price'); price.appendChild(document.createTextNode(money(b.price.amount_minor, b.price.currency)));
        var cyc = cycleLabel(b.cycle); if (cyc) price.appendChild(el('small', null, ' / ' + cyc));
        card.appendChild(price);
        if (b.items && b.items.length) {
          card.appendChild(el('p', 'hub-tag', 'Incluye:'));
          var ul = el('ul', 'hub-list');
          b.items.forEach(function (it) { var q = it.quantity && it.quantity !== 1 ? (it.quantity + '× ') : ''; ul.appendChild(el('li', null, q + it.name)); });
          card.appendChild(ul);
        }
        if (b.sellable_online) { var a = el('a', 'hub-btn', div.dataset.texto || 'Contratar'); a.href = ORIGIN + '/cart?add=' + encodeURIComponent(b.id); a.target = '_blank'; a.rel = 'noopener'; card.appendChild(a); }
        wrap.appendChild(card);
      }).catch(function (e) { fail(wrap, e); });
    },
    estado: function (div, wrap) {
      loading(wrap, 'Cargando estado');
      api('/status', {}).then(function (d) {
        if (!d) return; wrap.innerHTML = '';
        var map = { operational: ['ok', 'Todos los servicios operativos'], minor: ['unk', 'Incidencia menor en curso'], major: ['no', 'Incidencia mayor en curso'] };
        var st = map[d.status] || map.operational;
        var head = el('div'); head.style.marginBottom = '10px';
        head.appendChild(el('span', 'hub-badge ' + st[0], st[1]));
        wrap.appendChild(head);
        if (!d.incidents || !d.incidents.length) { wrap.appendChild(el('div', 'hub-msg', 'Sin incidencias reportadas.')); return; }
        var ul = el('ul', 'hub-list'); ul.style.listStyle = 'none';
        d.incidents.forEach(function (i) {
          var li = el('li'); li.style.padding = '8px 0';
          li.appendChild(el('b', null, i.title));
          var badge = i.state === 'resolved' ? el('span', 'hub-badge ok', 'Resuelto') : el('span', 'hub-badge no', i.state === 'monitoring' ? 'En observación' : 'Abierto');
          badge.style.marginLeft = '8px'; li.appendChild(badge);
          if (i.summary) li.appendChild(el('p', 'hub-tag', i.summary));
          ul.appendChild(li);
        });
        wrap.appendChild(ul);
      }).catch(function (e) { fail(wrap, e); });
    },
    promocion: function (div, wrap) {
      loading(wrap, 'Cargando promociones');
      api('/catalog/promotions', {}).then(function (rows) {
        if (!rows) return; wrap.innerHTML = '';
        if (!rows.length) { wrap.appendChild(el('div', 'hub-msg', 'No hay promociones vigentes.')); return; }
        var cols = Math.max(1, Math.min(4, parseInt(div.dataset.columnas, 10) || 2));
        var grid = el('div', 'hub-grid'); grid.style.gridTemplateColumns = 'repeat(' + cols + ',minmax(0,1fr))';
        rows.forEach(function (p) { grid.appendChild(promoCard(p)); });
        wrap.appendChild(grid);
      }).catch(function (e) { fail(wrap, e); });
    },
    'libro-reclamaciones': function (div, wrap) {
      wrap.innerHTML = '';
      function field(labelText, control, hint) {
        var f = el('div', 'hub-field'); var id = 'f' + Math.random().toString(36).slice(2, 8); control.id = id;
        var lab = el('label', null, labelText); lab.setAttribute('for', id); f.appendChild(lab); f.appendChild(control);
        if (hint) f.appendChild(el('small', 'hub-tag', hint)); return f;
      }
      function input(name, type) { var i = el('input', 'hub-input'); i.name = name; i.type = type || 'text'; return i; }
      function select(name, opts) { var s = el('select', 'hub-select'); s.name = name; opts.forEach(function (o) { var op = el('option', null, o[1]); op.value = o[0]; s.appendChild(op); }); return s; }
      function area(name) { var t = el('textarea', 'hub-textarea'); t.name = name; t.rows = 4; return t; }

      var form = el('form'); form.setAttribute('novalidate', 'novalidate');
      var typeSel = select('complaint_type', [['claim', 'Reclamo (disconformidad con el servicio)'], ['grievance', 'Queja (malestar con la atención)']]);
      var docSel = select('consumer_document_type', [['dni', 'DNI'], ['ce', 'Carné de extranjería'], ['passport', 'Pasaporte'], ['ruc', 'RUC']]);
      var name = input('consumer_name'), docNum = input('consumer_document_number'), email = input('consumer_email', 'email');
      var phone = input('consumer_phone', 'tel'), address = input('consumer_address');
      var minor = input('is_minor', 'checkbox'), guardian = input('guardian_name');
      var serviceDesc = input('service_description'), detail = area('detail'), reqText = area('consumer_request');
      var amount = input('amount', 'number'); amount.min = '0'; amount.step = '0.01';
      var currency = select('currency', [['PEN', 'Soles (S/)'], ['USD', 'Dólares (US$)']]);
      var hp = input('website'); hp.className = 'sr'; hp.tabIndex = -1; hp.setAttribute('autocomplete', 'off'); hp.setAttribute('aria-hidden', 'true');

      form.appendChild(field('Tipo', typeSel));
      form.appendChild(field('Nombre completo', name));
      var r1 = el('div', 'hub-row'); r1.appendChild(field('Tipo de documento', docSel)); r1.appendChild(field('Número de documento', docNum)); form.appendChild(r1);
      var r2 = el('div', 'hub-row'); r2.appendChild(field('Correo electrónico', email)); r2.appendChild(field('Teléfono (opcional)', phone)); form.appendChild(r2);
      form.appendChild(field('Dirección', address));
      var mf = el('div', 'hub-field'); var ml = el('label'); ml.style.display = 'flex'; ml.style.gap = '8px'; ml.style.alignItems = 'center'; ml.style.fontWeight = '400';
      ml.appendChild(minor); ml.appendChild(document.createTextNode('El consumidor es menor de edad')); mf.appendChild(ml); form.appendChild(mf);
      var gf = field('Nombre del padre, madre o representante', guardian); gf.style.display = 'none'; form.appendChild(gf);
      minor.addEventListener('change', function () { gf.style.display = minor.checked ? '' : 'none'; });
      form.appendChild(field('Servicio contratado', serviceDesc));
      var r3 = el('div', 'hub-row'); r3.appendChild(field('Monto reclamado (opcional)', amount)); r3.appendChild(field('Moneda', currency)); form.appendChild(r3);
      form.appendChild(field('Detalle de lo ocurrido', detail));
      form.appendChild(field('Lo que pides', reqText));
      form.appendChild(hp);
      form.appendChild(el('p', 'hub-tag', 'Tus datos se usan solo para atender tu solicitud (Ley 29733).'));
      var submit = el('button', 'hub-btn', 'Enviar'); submit.type = 'submit'; form.appendChild(submit);
      var msg = el('div'); form.appendChild(msg);

      function showErrors(e) {
        msg.innerHTML = ''; var errs = e && e.body && e.body.errors;
        if (errs) { for (var k in errs) { (errs[k] || []).forEach(function (m) { msg.appendChild(el('div', 'hub-err', m)); }); } }
        else msg.appendChild(el('div', 'hub-err', (e && e.message) || 'No se pudo enviar la solicitud.'));
      }

      form.addEventListener('submit', function (ev) {
        ev.preventDefault(); msg.innerHTML = '';
        var body = {
          complaint_type: typeSel.value, consumer_name: name.value.trim(), consumer_document_type: docSel.value,
          consumer_document_number: docNum.value.trim(), consumer_email: email.value.trim(), consumer_phone: phone.value.trim() || null,
          consumer_address: address.value.trim(), is_minor: minor.checked, guardian_name: minor.checked ? guardian.value.trim() : null,
          service_description: serviceDesc.value.trim(), detail: detail.value.trim(), consumer_request: reqText.value.trim(), website: hp.value
        };
        var amt = parseFloat(amount.value);
        if (!isNaN(amt) && amt > 0) { body.amount_minor = Math.round(amt * 100); body.currency = currency.value; }
        submit.disabled = true; submit.textContent = 'Enviando…';
        post('/complaints', body, { 'Idempotency-Key': uuid() }).then(function (d) {
          wrap.innerHTML = '';
          var card = el('div', 'hub-card feat');
          card.appendChild(el('h3', 'hub-name', 'Constancia ' + d.code));
          card.appendChild(el('p', null, d.message || 'Hemos recibido tu solicitud.'));
          if (d.due_at) card.appendChild(el('small', 'hub-tag', 'Plazo de respuesta: ' + fmtDate(d.due_at)));
        }).catch(function (e) { submit.disabled = false; submit.textContent = 'Enviar'; showErrors(e); });
      });
      wrap.appendChild(form);

      var sep = el('div'); sep.style.margin = '18px 0 8px'; sep.style.borderTop = '1px solid rgba(0,0,0,.12)'; wrap.appendChild(sep);
      var q = el('div'); q.appendChild(el('p', 'hub-tag', '¿Ya tienes una constancia? Consulta su estado:'));
      var qrow = el('div', 'hub-row'); var qin = input('code'); qin.placeholder = 'Código de la constancia';
      var qf = el('div', 'hub-field'); qf.style.flex = '1'; qf.style.marginBottom = '0'; qf.appendChild(qin);
      var qbtn = el('button', 'hub-btn ghost', 'Consultar'); qbtn.type = 'button';
      qrow.appendChild(qf); qrow.appendChild(qbtn); q.appendChild(qrow);
      var qout = el('div'); qout.style.marginTop = '8px'; q.appendChild(qout); wrap.appendChild(q);
      qbtn.addEventListener('click', function () {
        var code = qin.value.trim(); qout.innerHTML = ''; if (!code) return; qbtn.disabled = true;
        getFresh('/complaints/' + encodeURIComponent(code)).then(function (d) {
          qbtn.disabled = false;
          var map = { received: ['unk', 'Recibida'], in_progress: ['unk', 'En proceso'], answered: ['ok', 'Respondida'], closed: ['ok', 'Cerrada'] };
          var s = map[d.status] || ['unk', d.status];
          qout.appendChild(el('span', 'hub-badge ' + s[0], s[1]));
          if (d.due_at) qout.appendChild(el('small', 'hub-tag', ' · Plazo: ' + fmtDate(d.due_at)));
        }).catch(function (e) {
          qbtn.disabled = false;
          qout.appendChild(el('div', 'hub-err', e && e.status === 404 ? 'No encontramos esa constancia.' : 'No se pudo consultar el estado.'));
        });
      });
    }
  };

  function planCard(p, cycleOverride) {
    var card = el('div', 'hub-card' + (p.featured ? ' feat' : ''));
    card.appendChild(el('h3', 'hub-name', p.name));
    if (p.tagline) card.appendChild(el('p', 'hub-tag', p.tagline));
    var price = el('div', 'hub-price'); price.appendChild(document.createTextNode(money(p.price.amount_minor, p.price.currency)));
    var cyc = cycleLabel(cycleOverride || p.cycle); if (cyc) { var sm = el('small', null, ' / ' + cyc); price.appendChild(sm); }
    card.appendChild(price);
    if (p.highlights && p.highlights.length) {
      var ul = el('ul', 'hub-list');
      p.highlights.forEach(function (h) { ul.appendChild(el('li', null, typeof h === 'string' ? h : (h && (h[LANG] || h.es)) || '')); });
      card.appendChild(ul);
    }
    if (p.sellable_online) {
      var a = el('a', 'hub-btn', 'Contratar'); a.href = ORIGIN + '/cart?add=' + encodeURIComponent(p.id); a.target = '_blank'; a.rel = 'noopener'; card.appendChild(a);
    }
    return card;
  }

  function serverCard(s) {
    var card = el('div', 'hub-card' + (s.featured ? ' feat' : ''));
    card.appendChild(el('h3', 'hub-name', s.name));
    if (s.tagline) card.appendChild(el('p', 'hub-tag', s.tagline));
    var price = el('div', 'hub-price'); price.appendChild(document.createTextNode(money(s.price.amount_minor, s.price.currency)));
    var cyc = cycleLabel(s.cycle); if (cyc) price.appendChild(el('small', null, ' / ' + cyc));
    card.appendChild(price);
    var sp = s.specs || {};
    var ul = el('ul', 'hub-list');
    if (sp.vcpu) ul.appendChild(el('li', null, sp.vcpu + ' vCPU'));
    if (sp.ram_mb) ul.appendChild(el('li', null, (sp.ram_mb >= 1024 ? (sp.ram_mb / 1024) + ' GB' : sp.ram_mb + ' MB') + ' RAM'));
    if (sp.disk_gb) ul.appendChild(el('li', null, sp.disk_gb + ' GB ' + (sp.disk_type ? String(sp.disk_type).toUpperCase() : 'disco')));
    if (sp.transfer_gb) ul.appendChild(el('li', null, sp.transfer_gb + ' GB de tráfico'));
    if (sp.location) ul.appendChild(el('li', null, sp.location));
    if (sp.is_managed) ul.appendChild(el('li', null, 'Administrado'));
    card.appendChild(ul);
    if (s.sellable_online) {
      var a = el('a', 'hub-btn', 'Contratar'); a.href = ORIGIN + '/cart?add=' + encodeURIComponent(s.id); a.target = '_blank'; a.rel = 'noopener'; card.appendChild(a);
    }
    return card;
  }

  function promoCard(p) {
    var card = el('div', 'hub-card feat');
    var disc = p.discount_type === 'percent'
      ? (Number(p.discount_percent) + '% de descuento')
      : (p.discount_minor != null ? money(p.discount_minor, p.currency || 'PEN') + ' de descuento' : 'Promoción');
    var price = el('div', 'hub-price'); price.appendChild(document.createTextNode(disc));
    card.appendChild(price);
    if (p.description) card.appendChild(el('p', 'hub-tag', p.description));
    var code = el('div'); code.style.margin = '8px 0';
    code.appendChild(el('span', 'hub-badge ok', 'Código: ' + p.code));
    card.appendChild(code);
    if (p.product_name) card.appendChild(el('small', 'hub-tag', 'Aplica a ' + p.product_name));
    if (p.valid_until) card.appendChild(el('small', 'hub-tag', 'Válido hasta ' + p.valid_until));
    return card;
  }

  function renderAll() {
    blocks.forEach(function (b) {
      var fn = RENDER[b.name];
      var wrap = mount(b.div);
      if (!fn) { wrap.appendChild(el('div', 'hub-msg', 'Bloque no disponible.')); return; }
      try { fn(b.div, wrap); } catch (e) { fail(wrap, e); }
    });
  }

  function init() {
    var nodes = document.querySelectorAll('[data-hub-block]');
    blocks = [];
    for (var i = 0; i < nodes.length; i++) { blocks.push({ div: nodes[i], name: nodes[i].getAttribute('data-hub-block') }); }
    renderAll();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
