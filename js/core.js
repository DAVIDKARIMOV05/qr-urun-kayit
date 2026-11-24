/* core.js — ortak yardımcılar, durum (state), veri yükleme/kaydetme */
(function (global) {
  'use strict';

  var P = global.Products, DB = global.DB;

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function saat(ts) { return ts ? new Date(ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : ''; }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  var DEFAULTS = {
    sound: true, vibe: true, flash: true, auto: true,
    kirilganZorunlu: true, tamamlat: true
  };

  var state = {
    settings: Object.assign({}, DEFAULTS),
    items: [],
    catalog: {},
    filter: { q: '' },
    editing: null,
    editorNew: false,
    paused: false,
    camWanted: false,
    view: 'scan',
    foundId: null,
    confirmOk: null
  };

  /* ---------------- bildirim / modal ---------------- */
  function toast(title, text, kind, ms) {
    var host = $('#toasts');
    if (!host) return null;
    var el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.innerHTML = '<b>' + esc(title) + '</b>' + esc(text || '');
    host.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .25s, transform .25s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
      setTimeout(function () { if (el.parentNode) el.remove(); }, 260);
    }, ms || 2600);
    return el;
  }

  function openModal(sel) { $(sel).classList.add('open'); }
  function closeModal(sel) { $(sel).classList.remove('open'); }

  function confirmDlg(title, text, okText) {
    return new Promise(function (resolve) {
      $('#cTitle').textContent = title;
      $('#cText').textContent = text || '';
      $('#cOk').textContent = okText || 'Tamam';
      openModal('#mConfirm');
      var done = function (val) {
        closeModal('#mConfirm');
        $('#cOk').onclick = null;
        state.confirmOk = null;
        resolve(val);
      };
      $('#cOk').onclick = function () { done(true); };
      $$('#mConfirm [data-close]').forEach(function (b) {
        b.onclick = function () { if (state.confirmOk) done(false); };
      });
      state.confirmOk = done;
    });
  }

  /* ---------------- ses / titreşim / parlama ---------------- */
  var actx = null;
  function beep(kind) {
    if (!state.settings.sound) return;
    try {
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return;
      actx = actx || new AC();
      if (actx.state === 'suspended') actx.resume();
      var t = actx.currentTime;
      var seq = kind === 'warn' ? [660, 440] : kind === 'bad' ? [300, 240] : [1180, 1560];
      seq.forEach(function (f, i) {
        var o = actx.createOscillator(), g = actx.createGain();
        o.type = 'square';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + i * 0.085);
        g.gain.exponentialRampToValueAtTime(0.16, t + i * 0.085 + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.085 + 0.08);
        o.connect(g); g.connect(actx.destination);
        o.start(t + i * 0.085); o.stop(t + i * 0.085 + 0.09);
      });
    } catch (e) { }
  }
  function vibe(pattern) {
    if (!state.settings.vibe) return;
    try { if (navigator.vibrate) navigator.vibrate(pattern || [35, 25, 45]); } catch (e) { }
  }
  function flashCam() {
    if (!state.settings.flash) return;
    var el = $('#camWrap');
    if (!el) return;
    el.classList.remove('hit');
    void el.offsetWidth;
    el.classList.add('hit');
  }

  /* ---------------- veri: ayar / katalog / ürün ---------------- */
  function loadSettings() {
    return DB.kvGet('settings', {}).then(function (s) {
      state.settings = Object.assign({}, DEFAULTS, s || {});
      return state.settings;
    });
  }
  function saveSettings() { return DB.kvSet('settings', state.settings); }

  function loadCatalog() {
    return DB.all('products').then(function (rows) {
      state.catalog = {};
      rows.forEach(function (r) { if (r.kod) state.catalog[r.kod] = r; });
      return state.catalog;
    });
  }

  function catalogPut(item) {
    if (!item || !item.kod) return Promise.resolve(false);
    /* sadece kod içeren kayıtları katalog yazma (bilgi yok, liste kirlenir) */
    if (!item.ad && item.kg == null && item.m3 == null) return Promise.resolve(false);
    var rec = {};
    ['kod', 'ad', 'kategori', 'kg', 'm3', 'en', 'boy', 'yukseklik', 'kirilgan', 'istifle', 'varis', 'musteri', 'telefon', 'not'].forEach(function (k) {
      if (item[k] != null && item[k] !== '') rec[k] = item[k];
    });
    var old = state.catalog[item.kod] || {};
    Object.keys(rec).forEach(function (k) { old[k] = rec[k]; });
    old.kod = item.kod;
    old.guncelleme = Date.now();
    state.catalog[item.kod] = old;
    return DB.put('products', old);
  }

  function loadItems() {
    /* tek kalıcı ürün listesi: sefer ayrımı yok; aynı koddan mükerrer kayıt varsa birleştirilir */
    return DB.all('items').then(function (rows) {
      rows.sort(function (a, b) { return (b.zaman || 0) - (a.zaman || 0); });
      var byKod = {}, tek = [], silinecek = [], guncellenecek = [];
      rows.forEach(function (r) {
        if (!r.kod) { tek.push(r); return; }
        var e = byKod[r.kod];
        if (!e) { byKod[r.kod] = r; return; }
        /* e daha yeni (rows zaman'a göre azalan); r eski — eksikleri doldur, eskisini sil */
        var degisti = false;
        ['ad', 'kategori', 'kg', 'm3', 'en', 'boy', 'yukseklik', 'kirilgan', 'istifle', 'varis', 'musteri', 'telefon', 'not'].forEach(function (k) {
          if ((e[k] == null || e[k] === '') && r[k] != null && r[k] !== '') { e[k] = r[k]; degisti = true; }
        });
        var a = Math.max(e.adet || 1, r.adet || 1);
        if (a !== (e.adet || 1)) { e.adet = a; degisti = true; }
        if (degisti) guncellenecek.push(e);
        silinecek.push(r);
      });
      Object.keys(byKod).forEach(function (k) { tek.push(byKod[k]); });
      tek.sort(function (a, b) { return (b.zaman || 0) - (a.zaman || 0); });
      state.items = tek;
      if (!silinecek.length) return tek;
      return Promise.all(
        silinecek.map(function (r) { return DB.del('items', r.id); }).concat(
          guncellenecek.map(function (r) { return saveItem(r); })
        )
      ).then(function () {
        toast('Mükerrer kayıtlar birleştirildi', silinecek.length + ' tekrar kayıt temizlendi — her kod artık tek satır', 'warn', 5200);
        return state.items;
      });
    });
  }

  function saveItem(item) {
    item.toplamKg = item.kg == null ? null : Math.round(item.kg * (item.adet || 1) * 100) / 100;
    item.toplamM3 = item.m3 == null ? null : Math.round(item.m3 * (item.adet || 1) * 10000) / 10000;
    return DB.put('items', item);
  }
  function deleteItem(item) {
    var i = state.items.indexOf(item);
    if (i > -1) state.items.splice(i, 1);
    return DB.del('items', item.id);
  }

  /* ---------------- dosya kaydetme / indirme ---------------- */
  function download(name, text, mime) {
    var blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }
  function fileText(input) {
    var f = input.files && input.files[0];
    if (!f) return Promise.resolve(null);
    return f.text();
  }
  function okName(s) { return String(s || '').replace(/[^\w\-]+/g, '_').slice(0, 40) || 'veri'; }

  /* ---------------- ürün kartı ---------------- */
  function itemCard(it, opts) {
    opts = opts || {};
    var eksik = P.eksikler(it);
    var cls = 'item' + (it.kirilgan === true ? ' frag' : '') + (eksik.length ? ' miss' : '');
    var h = '<div class="' + cls + '" data-id="' + esc(it.id) + '">';
    h += '<div class="head"><div class="grow"><div class="t">' + esc(P.baslik(it)) + '</div>';
    h += '<div class="c">' + esc(it.kod || 'kod yok') + (it.kategori ? ' · ' + esc(it.kategori) : '') + '</div></div>';
    h += '<div style="text-align:right">';
    if (it.kirilgan === true) h += '<span class="badge frag">⚠ KIRILACAK</span> ';
    if (it.kirilgan === false && it.istifle === true) h += '<span class="badge stack">İSTİFLENİR</span> ';
    if (it.istifle === false && it.kirilgan !== true) h += '<span class="badge n">ÜSTÜNE KONMAZ</span> ';
    if (eksik.length) h += '<div class="badge miss mt8">EKSİK: ' + esc(eksik.join(', ')) + '</div>';
    h += '</div></div>';

    h += '<div class="params">';
    h += p('Ağırlık', P.kg(it), it.kg == null);
    h += p('Hacim', P.m3(it), it.m3 == null);
    h += p('En×Boy×Yük', P.olcu(it), it.en == null && it.boy == null && it.yukseklik == null);
    h += p('Adet', String(it.adet || 1), false);
    h += '</div>';

    h += '<div class="foot">';
    if (it.varis) h += '<span class="badge dest">📍 ' + esc(it.varis) + '</span>';
    if (it.musteri) h += '<span class="badge n">' + esc(it.musteri) + '</span>';
    if (it.telefon) h += '<span class="badge n">📞 ' + esc(global.V && global.V.telBicim ? global.V.telBicim(it.telefon) : it.telefon) + '</span>';
    if (it.not) h += '<span class="badge n">📝 ' + esc(it.not) + '</span>';
    if (!opts.noActions) {
      h += '<button class="btn sm" type="button" data-act="edit">✏️ Düzenle</button>';
      h += '<button class="btn sm ghost" type="button" data-act="del">🗑️</button>';
    }
    h += '</div></div>';
    return h;
  }
  function p(label, val, alert) {
    return '<div class="p' + (alert ? ' alert' : '') + '"><span>' + esc(label) + '</span><b>' + esc(val) + '</b></div>';
  }

  global.App = {
    P: P, DB: DB, state: state,
    $: $, $$: $$, esc: esc, uid: uid, todayISO: todayISO, saat: saat, clamp: clamp,
    toast: toast, openModal: openModal, closeModal: closeModal, confirmDlg: confirmDlg,
    beep: beep, vibe: vibe, flashCam: flashCam,
    loadSettings: loadSettings, saveSettings: saveSettings,
    loadCatalog: loadCatalog, catalogPut: catalogPut,
    loadItems: loadItems, saveItem: saveItem, deleteItem: deleteItem,
    download: download, fileText: fileText, okName: okName,
    itemCard: itemCard
  };
})(window);
