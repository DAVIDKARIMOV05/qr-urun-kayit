/* views.js — ürün listesi, sekmeler, veri işlemleri, açılış */
(function (global) {
  'use strict';

  var A = global.App, P = A.P, DB = A.DB, V = global.V, $ = A.$, $$ = A.$$, state = A.state;

  /* ---------------- üst bar / sekme rozeti ---------------- */
  function renderTopbar() {
    var badge = $('#tabBadge');
    badge.textContent = String(state.items.length);
    badge.classList.toggle('hidden', !state.items.length);
  }

  /* ---------------- ürün listesi (yalın satırlar) ---------------- */
  var sel = {}; /* id -> true : silme seçimi */

  function seciliAdet() {
    return Object.keys(sel).filter(function (k) { return sel[k]; }).length;
  }
  function selGuncelle() {
    var n = seciliAdet();
    var b = $('#btnSelDel');
    b.disabled = !n;
    b.textContent = n ? '🗑️ Seçilenleri sil (' + n + ')' : '🗑️ Seçilenleri sil';
  }

  function renderUrunler() {
    var host = $('#urunListe');
    var q = P.norm(state.filter.q || '');
    var rows = state.items.slice();
    if (q) {
      rows = rows.filter(function (it) {
        return [it.kod, it.ad, it.kategori, it.musteri, it.varis, it.not].some(function (v) {
          return P.norm(v || '').indexOf(q) > -1;
        });
      });
    }
    rows.sort(function (a, b) { return (b.zaman || 0) - (a.zaman || 0); });

    /* artık var olmayan kayıtların seçimini temizle */
    var varId = {};
    state.items.forEach(function (it) { varId[it.id] = 1; });
    Object.keys(sel).forEach(function (k) { if (!varId[k]) delete sel[k]; });

    if (!state.items.length) {
      host.innerHTML = '<div class="empty">Henüz ürün yok.<br><small>＋ Ürün ekle ile girin veya Tarama sekmesinden QR okutun.</small></div>';
      $('#selTumu').checked = false;
      selGuncelle();
      return;
    }
    if (!rows.length) {
      host.innerHTML = '<div class="empty">Aramaya uyan ürün yok.</div>';
      selGuncelle();
      return;
    }
    host.innerHTML = rows.map(function (it) {
      return '<div class="item" data-id="' + A.esc(it.id) + '">' +
        '<div class="head"><div class="grow">' +
        '<div class="t"><input type="checkbox" data-sel="' + A.esc(it.id) + '"' + (sel[it.id] ? ' checked' : '') +
        ' style="margin-right:8px;transform:scale(1.25);vertical-align:middle">' +
        A.esc(P.baslik(it)) + (it.kirilgan === true ? ' <span class="badge frag">⚠ KIRILACAK</span>' : '') + '</div>' +
        '<div class="c">' + A.esc(it.kod || 'kod yok') + ' · ' + A.esc(P.kg(it)) + ' · ' + A.esc(P.m3(it)) +
        ' · ' + (it.adet || 1) + ' adet' + (it.varis ? ' · 📍 ' + A.esc(it.varis) : '') + '</div>' +
        '</div></div>' +
        '<div class="foot">' +
        '<button class="btn sm" type="button" data-act="edit">✏️ Düzenle</button>' +
        '<button class="btn sm ghost" type="button" data-act="del">🗑️ Sil</button>' +
        '<span class="time">' + A.esc(A.saat(it.zaman)) + '</span>' +
        '</div></div>';
    }).join('');
    $$('#urunListe [data-sel]').forEach(function (cb) {
      cb.onchange = function () {
        sel[cb.dataset.sel] = cb.checked;
        if (!cb.checked) $('#selTumu').checked = false;
        selGuncelle();
      };
    });
    $('#selTumu').checked = rows.every(function (it) { return sel[it.id]; });
    selGuncelle();
  }

  function bindUrunler() {
    $('#q').oninput = function (e) { state.filter.q = e.target.value; renderUrunler(); };
    $('#btnEkle').onclick = function () { A.items.openEditor(P.emptyItem(), true); };
    $('#selTumu').onchange = function (e) {
      var on = e.target.checked;
      var q = P.norm(state.filter.q || '');
      state.items.forEach(function (it) {
        var gorunur = !q || [it.kod, it.ad, it.kategori, it.musteri, it.varis, it.not].some(function (v) {
          return P.norm(v || '').indexOf(q) > -1;
        });
        if (gorunur) sel[it.id] = on;
      });
      renderUrunler();
    };
    $('#btnSelDel').onclick = function () {
      var idler = Object.keys(sel).filter(function (k) { return sel[k]; });
      if (!idler.length) return;
      A.confirmDlg(idler.length + ' ürünü sil?', 'Seçilen ' + idler.length + ' kayıt kalıcı olarak silinecek.', 'Sil')
        .then(function (ok) {
          if (!ok) return;
          var isler = idler.map(function (id) {
            var it = state.items.filter(function (x) { return x.id === id; })[0];
            return it ? A.deleteItem(it) : null;
          }).filter(Boolean);
          return Promise.all(isler).then(function () {
            sel = {};
            if (state.foundId && !state.items.some(function (x) { return x.id === state.foundId; })) state.foundId = null;
            renderAll();
            A.toast(idler.length + ' ürün silindi', '', 'ok');
          });
        });
    };
  }

  /* ---------------- veri işlemleri ---------------- */
  function bindData() {
    $('#btnBackup').onclick = function () {
      DB.dump().then(function (d) {
        A.download('qr-urun-yedek_' + A.todayISO() + '.json', JSON.stringify(d), 'application/json');
        A.toast('Yedek indirildi', 'Tüm ürünler tek JSON dosyasında', 'ok');
      });
    };
    $('#btnRestoreBtn').onclick = function () { $('#restoreInput').click(); };
    $('#restoreInput').onchange = function (e) {
      var f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      f.text().then(function (t) {
        var d;
        try { d = JSON.parse(t); } catch (err) { A.toast('Yedek çözülemedi', '', 'bad'); return; }
        if (d.urunler && (d.tur === 'urunListesi' || d.tur === 'sefer')) {
          /* ürün listesi / eski sefer dosyası: kayıtlar listeye eklenir */
          var items = (d.urunler || []).map(function (r) {
            var it = P.derive(P.fill(P.emptyItem(), r));
            it.id = A.uid(); it.zaman = r.zaman || Date.now();
            return it;
          });
          if (!items.length) { A.toast('Ürün bulunamadı', 'Dosyada kayıtlı ürün yok', 'warn'); return; }
          return DB.putMany('items', items).then(function () {
            return Promise.all([A.loadItems(), A.loadCatalog()]);
          }).then(function () {
            renderAll();
            A.toast(items.length + ' ürün eklendi', '', 'ok');
          });
        }
        A.confirmDlg('Yedeği yükle?', 'Bu yedekteki ürünler mevcut listenin yerine geçer.', 'Yükle').then(function (ok) {
          if (!ok) return;
          var tamYedek = Array.isArray(d.items) || Array.isArray(d.sefers);
          DB.restore(d, { clearFirst: tamYedek }).then(function () {
            return A.loadSettings();
          }).then(function () {
            return Promise.all([A.loadCatalog(), A.loadItems()]);
          }).then(function () { renderAll(); A.toast('Yedek yüklendi', '', 'ok'); });
        });
      });
    };
    /* PC → telefon: aynı sunucudaki urunler.json listesini kod ile birleştir (silme yapmaz) */
    $('#btnSync').onclick = function () {
      var btn = $('#btnSync');
      btn.disabled = true;
      fetch('urunler.json?_=' + Date.now(), { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error('yok');
        return r.json();
      }).then(function (d) {
        var arr = Array.isArray(d) ? d : (d.items || d.urunler || d.products || []);
        var temiz = arr.map(function (r) { return P.derive(P.fill(P.emptyItem(), r)); })
          .filter(function (r) { return r.kod; });
        if (!temiz.length) { A.toast('Dosyada ürün yok', 'urunler.json boş veya biçimi tanınmadı', 'warn'); return; }
        var byKod = {};
        state.items.forEach(function (it) { if (it.kod) byKod[it.kod] = it; });
        var eklenen = 0, guncellenen = 0, isler = [];
        var ALANLAR = ['ad', 'kategori', 'kg', 'm3', 'en', 'boy', 'yukseklik', 'kirilgan', 'istifle', 'varis', 'musteri', 'telefon', 'not'];
        temiz.forEach(function (r) {
          var e = byKod[r.kod];
          if (!e) {
            r.id = A.uid(); r.zaman = r.zaman || Date.now();
            state.items.unshift(r); isler.push(DB.put('items', r)); eklenen++;
            return;
          }
          var degisti = false;
          ALANLAR.forEach(function (k) {
            if ((e[k] == null || e[k] === '') && r[k] != null && r[k] !== '') { e[k] = r[k]; degisti = true; }
          });
          var zaman = Math.max(e.zaman || 0, r.zaman || 0);
          if (zaman > (e.zaman || 0)) { e.zaman = zaman; degisti = true; }
          if (degisti) { isler.push(DB.put('items', e)); guncellenen++; }
        });
        return Promise.all(isler).then(function () {
          return Promise.all([A.loadCatalog(), A.loadItems()]);
        }).then(function () {
          renderAll();
          A.toast('PC listesinden çekildi', eklenen + ' yeni, ' + guncellenen + ' güncel (' + temiz.length + ' kayıt dosyada)', 'ok', 4200);
        });
      }).catch(function () {
        A.toast('urunler.json bulunamadı', 'Etiket ekranındaki ⬇️ urunler.json butonuyla oluşturup uygulamayı baratan klasöre koyun', 'warn', 6000);
      }).then(function () { btn.disabled = false; });
    };
    $('#btnWipe').onclick = function () {
      A.confirmDlg('Her şeyi sil?', 'Tüm ürün kayıtları silinecek. Önce yedek almanız önerilir.', 'Evet, sil')
        .then(function (ok) {
          if (!ok) return;
          return Promise.all([DB.clear('items'), DB.clear('sefers'), DB.clear('products'), DB.clear('kv')])
            .then(function () { return A.loadSettings(); })
            .then(function () { return Promise.all([A.loadCatalog(), A.loadItems()]); })
            .then(function () { state.foundId = null; renderAll(); A.toast('Veriler silindi', '', 'ok'); });
        });
    };
  }

  /* ---------------- editördatalist önerileri ---------------- */
  function fillDatalists() {
    var dests = {};
    state.items.forEach(function (it) { if (it.varis) dests[it.varis] = 1; });
    Object.keys(state.catalog).forEach(function (k) {
      var r = state.catalog[k];
      if (r.varis) dests[r.varis] = 1;
    });
    var opt = function (o) { return Object.keys(o).sort(function (a, b) { return a.localeCompare(b, 'tr'); }).map(function (k) { return '<option value="' + A.esc(k) + '">'; }).join(''); };
    $('#catVaris').innerHTML = opt(dests);
    P.kategoriSecenekleri($('#fKategori'));
  }

  /* ==================== gezinme + açılış ==================== */
  function show(view) {
    state.view = view;
    $$('.view').forEach(function (v) { v.classList.toggle('active', v.id === 'view-' + view); });
    $$('.tabbar button').forEach(function (b) { b.classList.toggle('active', b.dataset.view === view); });
    if (view !== 'scan' && A.scan.isRunning()) A.scan.stop();
    window.scrollTo(0, 0);
  }

  function renderAll() {
    renderTopbar();
    renderUrunler();
    if (A.items.renderScanFeed) A.items.renderScanFeed();
    fillDatalists();
  }
  A.renderAll = renderAll;
  A.showView = show;

  function registerSW() {
    if (!('serviceWorker' in navigator) || !location.protocol.match(/^https?:$/)) return;
    navigator.serviceWorker.register('sw.js').catch(function () { });
  }

  function boot() {
    Promise.all([A.loadSettings()]).then(function () {
      return Promise.all([A.loadCatalog(), A.loadItems()]);
    }).then(function () {
      A.scan.bind();
      A.items.bindEditor();
      bindUrunler();
      bindData();
      $$('.tabbar button').forEach(function (b) { b.onclick = function () { show(b.dataset.view); }; });
      $$('.modal .veil').forEach(function (v) {
        v.onclick = function () { $$('.modal.open').forEach(function (m) { m.classList.remove('open'); }); };
      });
      renderAll();
      registerSW();
      if (!global.isSecureContext) {
        A.toast('Güvenli bağlantı yok', 'Kamera için HTTPS veya localhost gerekiyor — kurulum.html', 'bad', 8000);
      }
    }).catch(function (err) {
      console.error(err);
      A.toast('Açılamadı', String(err && err.message || err), 'bad', 8000);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
