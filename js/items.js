/* items.js — ürün kaydı: ekleme, QR ile sorgulama, düzenleme, silme */
(function (global) {
  'use strict';

  var A = global.App, P = A.P, V = global.V, $ = A.$, $$ = A.$$, state = A.state;

  function findByKod(kod) {
    if (!kod) return null;
    for (var i = 0; i < state.items.length; i++) if (state.items[i].kod === kod) return state.items[i];
    return null;
  }

  /* ---------- ekleme ---------- */
  function addItem(item, opts) {
    opts = opts || {};
    item.id = item.id || A.uid();
    item.zaman = item.zaman || Date.now();
    state.items.unshift(item);
    state.foundId = item.id;
    return A.saveItem(item).then(function () {
      return item.kod ? A.catalogPut(item) : null;
    }).then(function () {
      if (A.renderAll) A.renderAll();
      if (opts.dogrula === false) return item;
      var k = V.kayitKontrol(item, kontrolSecenekleri());
      if (!k.hataSayisi) {
        if (k.uyariSayisi) A.toast('Kayıt edildi', '⚠ ' + k[0].mesaj, 'warn', 3800);
        return item;
      }
      var ilk = k.filter(function (x) { return x.duzey === 'hata'; })[0];
      if (state.settings.tamamlat !== false) {
        A.toast(k.hataSayisi + ' eksik alan var', (V.ALAN[ilk.alan] || ilk.alan) + ': ' + ilk.mesaj + ' — tamamlayın', 'warn', 5200);
        openEditor(item, false);
      } else {
        var t = A.toast('Eklendi ama eksik', (V.ALAN[ilk.alan] || ilk.alan) + ': ' + ilk.mesaj + ' — dokun, tamamla', 'warn', 5200);
        if (t) t.onclick = function () { t.remove(); openEditor(item, false); };
      }
      return item;
    });
  }

  /* QR okuma sonucu: kayıtlı kod → bilgi göster; yeni kod → kayıt */
  function ingest(raw, kaynak) {
    var parsed = P.parse(raw);
    var item = parsed.item;
    if (item.kod && state.catalog[item.kod]) P.mergeCatalog(item, state.catalog[item.kod]);
    if (kaynak) item.kaynak = kaynak;

    if (!item.kod && !item.ad) {
      A.beep('bad'); A.vibe([80, 40, 80]);
      A.toast('Anlaşılamadı', 'QR içinde ürün bilgisi yok: ' + String(raw).slice(0, 40), 'bad');
      return Promise.resolve(null);
    }

    var dup = findByKod(item.kod);
    if (dup) {
      /* sorgulama: mevcut kaydın bilgilerini göster, kayıtta değişiklik yapma */
      state.foundId = dup.id;
      A.beep(); A.vibe(); A.flashCam();
      if (A.renderAll) A.renderAll();
      A.toast('Ürün bulundu', P.baslik(dup), 'ok', 2200);
      return Promise.resolve(dup);
    }

    /* QR zengin içerikliyse (ör. PC'den yazdırılan etiket: ad + kg/m3/varış dolu)
     * amaç bilgiyi göstermektir — form açıp kullanıcıyı bölme, doğrudan kaydet ve paneli aç */
    var zengin = !!(item.ad && (item.kg != null || item.m3 != null || item.varis));

    A.beep(); A.vibe(); A.flashCam();
    return addItem(item, { dogrula: !zengin });
  }

  /* ---------- editör ---------- */
  function setTri(sel, val) {
    var box = $(sel);
    var v = val === true ? '1' : (val === false ? '0' : (val === '1' || val === '0' ? String(val) : ''));
    box.dataset.value = v;
    $$('button', box).forEach(function (b) {
      var on = b.dataset.v === v;
      b.classList.toggle('sel', on);
      b.classList.toggle('no', on && b.dataset.v === '0');
    });
  }
  function getTri(sel) {
    var v = $(sel).dataset.value;
    return v === '1' ? true : (v === '0' ? false : null);
  }

  /* ---------- şablon doğrulaması (js/validate.js) ---------- */
  var ALAN_INPUT = {
    kod: '#fKod', ad: '#fAd', kategori: '#fKategori', kg: '#fKg', m3: '#fM3',
    en: '#fEn', boy: '#fBoy', yukseklik: '#fYuk', adet: '#fAdet',
    varis: '#fVaris', musteri: '#fMusteri', telefon: '#fTelefon', not: '#fNot',
    kirilgan: '#fKirilgan', istifle: '#fIstifle'
  };

  function hataGoster(sel, mesaj, uyari) {
    var el = $(sel);
    if (!el) return;
    var kap = el.closest('label.f') || el.parentNode;
    var mevcut = kap.querySelector(':scope > small.hata');
    if (!mesaj) {
      if (mevcut) mevcut.remove();
      kap.classList.remove('bad');
      return;
    }
    if (!mevcut) {
      mevcut = document.createElement('small');
      mevcut.className = 'hata';
      kap.appendChild(mevcut);
    }
    mevcut.className = 'hata' + (uyari ? ' u' : '');
    mevcut.textContent = mesaj;
    kap.classList.add('bad');
  }

  function kontrolSecenekleri(mod) {
    return {
      kirilganZorunlu: state.settings.kirilganZorunlu !== false,
      mod: mod || 'kayit'
    };
  }

  /* formu denetler; satır içi mesajları basar */
  function dogrula() {
    var it = readEditor();
    var hatalar = V.kayitKontrol(it, kontrolSecenekleri());
    Object.keys(ALAN_INPUT).forEach(function (a) { hataGoster(ALAN_INPUT[a], null); });
    var ilkHata = null, hataSayisi = 0, uyariSayisi = 0;
    hatalar.forEach(function (h) {
      var sel = ALAN_INPUT[h.alan];
      if (!sel) return;
      if (h.duzey === 'hata') { hataSayisi++; if (!ilkHata) ilkHata = sel; } else uyariSayisi++;
      var el = $(sel);
      var yer = el && el.type === 'checkbox' ? el.parentNode : sel;
      hataGoster(yer, (h.duzey === 'uyari' ? '⚠ ' : '') + V.ALAN[h.alan] + ': ' + h.mesaj, h.duzey === 'uyari');
    });
    return { hatalar: hatalar, hataSayisi: hataSayisi, uyariSayisi: uyariSayisi, ilkHata: ilkHata };
  }

  function openEditor(item, isNew) {
    state.editing = item;
    state.editorNew = isNew;
    $('#mItemTitle').textContent = isNew ? 'Ürün ekle' : (P.baslik(item) || 'Ürünü düzenle');
    $('#fKod').value = item.kod || '';
    P.kategoriSecenekleri($('#fKategori'), item.kategori || '');
    $('#fAd').value = item.ad || '';
    $('#fKg').value = item.kg == null ? '' : item.kg;
    $('#fM3').value = item.m3 == null ? '' : item.m3;
    $('#fEn').value = item.en == null ? '' : item.en;
    $('#fBoy').value = item.boy == null ? '' : item.boy;
    $('#fYuk').value = item.yukseklik == null ? '' : item.yukseklik;
    $('#fVaris').value = item.varis || '';
    $('#fMusteri').value = item.musteri || '';
    $('#fTelefon').value = item.telefon ? V.telBicim(item.telefon) : '';
    $('#fAdet').value = item.adet || 1;
    $('#fNot').value = item.not || '';
    $('#fHam').textContent = item.ham || '—';
    $('#btnItemDelete').classList.toggle('hidden', isNew);
    setTri('#fKirilgan', item.kirilgan);
    setTri('#fIstifle', item.istifle);
    Object.keys(ALAN_INPUT).forEach(function (a) { hataGoster(ALAN_INPUT[a], null); });
    if (!isNew) dogrula();
    updateM3Hint();
    /* form açıkken arka planda yeni kayıt eklenmesin */
    if (A.scan && A.scan.isRunning()) A.scan.duraklat('Formu doldur, kaydedince tarama devam eder');
    A.openModal('#mItem');
    setTimeout(function () { $('#fKod').focus(); }, 260);
  }

  function readEditor() {
    var it = state.editing || P.emptyItem();
    it.kod = A.$('#fKod').value.trim();
    it.kategori = $('#fKategori').value.trim();
    it.ad = $('#fAd').value.trim();
    it.kg = P.num($('#fKg').value);
    it.m3 = P.num($('#fM3').value);
    it.en = P.num($('#fEn').value);
    it.boy = P.num($('#fBoy').value);
    it.yukseklik = P.num($('#fYuk').value);
    it.varis = $('#fVaris').value.trim();
    it.musteri = $('#fMusteri').value.trim();
    it.telefon = $('#fTelefon').value.trim();
    it.not = $('#fNot').value.trim();
    it.adet = Math.max(1, Math.round(P.num($('#fAdet').value) || 1));
    it.kirilgan = getTri('#fKirilgan');
    it.istifle = getTri('#fIstifle');
    if (it.kirilgan === true) it.istifle = false;
    return it;
  }

  function updateM3Hint() {
    var en = P.num($('#fEn').value), boy = P.num($('#fBoy').value), yk = P.num($('#fYuk').value);
    var el = $('#fM3Hint');
    if (en && boy && yk) {
      var v = Math.round(en * boy * yk / 1000000 * 10000) / 10000;
      el.textContent = 'Ölçülerden: ' + P.nf(v, 3) + ' m³';
      el.style.color = 'var(--ok)';
    } else {
      el.textContent = 'Ölçüleri girersen otomatik hesaplanır';
      el.style.color = '';
    }
  }

  function saveEditor() {
    var it = readEditor();
    var d = dogrula();
    if (d.hataSayisi) {
      var ilk = d.hatalar.filter(function (x) { return x.duzey === 'hata'; })[0];
      A.beep('bad'); A.vibe([70, 40, 70]);
      A.toast(d.hataSayisi + ' alan hatalı/eksik', (V.ALAN[ilk.alan] || ilk.alan) + ': ' + ilk.mesaj, 'bad', 4200);
      if (d.ilkHata) { var el = $(d.ilkHata); if (el && el.focus) el.focus(); }
      return;
    }
    P.derive(it);
    if (it.m3 == null && it.en && it.boy && it.yukseklik) {
      it.m3 = Math.round(it.en * it.boy * it.yukseklik / 1000000 * 10000) / 10000;
      it.hacimKaynagi = 'hesap';
    }
    V.duzelt(it);
    var isNew = state.editorNew;
    /* aynı koddan iki kayıt olmasın: varsa mevcut kaydı düzenlet */
    var varMi = isNew ? findByKod(it.kod) : null;
    if (varMi && varMi.id !== it.id) {
      A.closeModal('#mItem');
      if (A.scan) A.scan.devam();
      A.beep('warn');
      A.toast('Bu kod zaten kayıtlı', P.baslik(varMi) + ' — mevcut kayıt açıldı', 'warn', 4200);
      openEditor(varMi, false);
      return;
    }
    A.closeModal('#mItem');
    if (A.scan) A.scan.devam();
    if (d.uyariSayisi) {
      var u = d.hatalar.filter(function (x) { return x.duzey === 'uyari'; })[0];
      A.toast('Kaydedildi', '⚠ ' + u.mesaj, 'warn', 4200);
    }
    if (isNew) {
      addItem(it, { dogrula: false });
    } else {
      state.foundId = it.id;
      A.saveItem(it).then(function () { return A.catalogPut(it); }).then(function () {
        if (A.renderAll) A.renderAll();
        A.toast('Güncellendi', P.baslik(it), 'ok');
      });
    }
  }

  function removeItem(it) {
    return A.confirmDlg('Ürünü sil?', P.baslik(it) + ' kayıtlı ürünlerden silinecek.', 'Sil').then(function (ok) {
      if (!ok) return false;
      return A.deleteItem(it).then(function () {
        if (state.foundId === it.id) state.foundId = null;
        if (A.renderAll) A.renderAll();
        A.toast('Silindi', P.baslik(it));
        return true;
      });
    });
  }

  /* satır/kart üzerindeki butonlar (liste + bilgi paneli) */
  function bindCardActions(root) {
    (root || document).addEventListener('click', function (e) {
      if (!e.target || !e.target.closest) return;
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var host = e.target.closest('[data-id]');
      if (!host) return;
      var it = null;
      for (var i = 0; i < state.items.length; i++) if (state.items[i].id === host.dataset.id) it = state.items[i];
      if (!it) return;
      var act = btn.dataset.act;
      if (act === 'edit') openEditor(it, false);
      else if (act === 'del') removeItem(it);
    });
  }

  /* ---------- QR önizleme ---------- */
  function qrGoster(text, kod) {
    if (!global.Qr || !global.Qr.hazir()) {
      A.toast('QR motoru yok', 'vendor/qrcode-generator.js dosyası eksik', 'bad');
      return;
    }
    var host = $('#qrGorsel');
    host.innerHTML = '';
    host.appendChild(global.Qr.canvas(text, 6, 3));
    $('#qrMetin').textContent = text;
    var ad = 'qr-' + (String(kod || 'urun').replace(/[^\w\-]+/g, '_') || 'urun');
    $('#btnQrPng').onclick = function () { global.Qr.download(text, ad, 10, 3); };
    $('#btnQrKopya').onclick = function () {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { A.toast('Kopyalandı', 'ERP/etiket programına yapıştırabilirsin', 'ok'); },
          function () { A.toast('Kopyalanamadı', 'Metni uzun basarak seç', 'warn'); });
      } else A.toast('Panoya kopyala yok', 'Metni elle seç', 'warn');
    };
    A.openModal('#mQr');
  }

  function bindEditor() {
    ['#fKirilgan', '#fIstifle'].forEach(function (sel) {
      $(sel).addEventListener('click', function (e) {
        var b = e.target.closest('button');
        if (!b) return;
        var v = b.dataset.v;
        $(sel).dataset.value = v;
        setTri(sel, v === '' ? null : v === '1');
        if (sel === '#fKirilgan' && v === '1') setTri('#fIstifle', false);
        if (sel === '#fIstifle' && v === '1') setTri('#fKirilgan', false);
      });
    });
    ['#fEn', '#fBoy', '#fYuk'].forEach(function (s) { $(s).addEventListener('input', updateM3Hint); });
    $('#fM3Hint').addEventListener('click', function () {
      var en = P.num($('#fEn').value), boy = P.num($('#fBoy').value), yk = P.num($('#fYuk').value);
      if (en && boy && yk) $('#fM3').value = Math.round(en * boy * yk / 1000000 * 10000) / 10000;
    });
    $('#btnItemSave').onclick = saveEditor;
    $('#btnItemQr').onclick = function () {
      var it = readEditor();
      if (!it.kod && !it.ad) { A.toast('Önce kod veya ad girin', '', 'warn'); return; }
      P.derive(it);
      qrGoster(P.toQrText(it), it.kod);
    };
    $$('#mQr [data-close]').forEach(function (b) {
      b.onclick = function () { A.closeModal('#mQr'); };
    });
    $('#btnItemDelete').onclick = function () {
      var it = state.editing;
      A.closeModal('#mItem');
      if (A.scan) A.scan.devam();
      if (it) removeItem(it);
    };
    $$('[data-close]', $('#mItem')).forEach(function (b) {
      b.onclick = function () { A.closeModal('#mItem'); if (A.scan) A.scan.devam(); };
    });

    /* şablona göre biçimlendirme + canlı denetim */
    $('#fKod').addEventListener('input', function (e) {
      var imlec = e.target.selectionStart;
      e.target.value = V.kodBicim(e.target.value);
      try { e.target.setSelectionRange(imlec, imlec); } catch (err) { }
    });
    $('#fTelefon').addEventListener('input', function (e) {
      var yeni = V.telGiris(e.target.value);
      if (yeni !== e.target.value) {
        e.target.value = yeni;
        try { e.target.setSelectionRange(yeni.length, yeni.length); } catch (err) { }
      }
    });
    $('#fAd').addEventListener('blur', function (e) { e.target.value = V.adBicim(e.target.value); });
    $('#fVaris').addEventListener('blur', function (e) { e.target.value = V.varisBicim(e.target.value); });
    ['#fKod', '#fAd', '#fKategori', '#fKg', '#fM3', '#fEn', '#fBoy', '#fYuk', '#fAdet', '#fVaris', '#fTelefon'].forEach(function (s) {
      $(s).addEventListener('blur', dogrula);
      $(s).addEventListener('change', dogrula);
    });
    $('#fKirilgan').addEventListener('click', function () { setTimeout(dogrula, 40); });

    bindCardActions(document);
  }

  /* son okunan / yeni eklenen ürünün bilgi paneli */
  function renderScanFeed() {
    var host = $('#urunBilgi');
    if (!host) return;
    var it = null;
    if (state.foundId) {
      for (var i = 0; i < state.items.length; i++) if (state.items[i].id === state.foundId) it = state.items[i];
    }
    if (!it) { host.innerHTML = ''; return; }
    host.innerHTML = '<div class="card tight" data-id="' + A.esc(it.id) + '"><h3>🔎 Ürün bilgisi <span class="hint">' + A.saat(it.zaman) + '</span></h3>' +
      A.itemCard(it, { noActions: true }) +
      '<div class="row gap mt8">' +
      '<button class="btn" type="button" id="panelQr">🔳 QR göster</button>' +
      '<button class="btn" type="button" data-act="edit">✏️ Düzenle</button>' +
      '<button class="btn danger" type="button" data-act="del">🗑️ Sil</button>' +
      '</div></div>';
    var pb = A.$('#panelQr', host);
    if (pb) pb.onclick = function () { P.derive(it); qrGoster(P.toQrText(it), it.kod); };
  }

  global.App.items = {
    addItem: addItem, ingest: ingest,
    openEditor: openEditor, bindEditor: bindEditor, renderScanFeed: renderScanFeed,
    removeItem: removeItem, qrGoster: qrGoster, dogrula: dogrula
  };
})(window);
