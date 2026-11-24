/* labels.js — ürün kataloğu yönetimi + QR etiket üretimi/yazdırma */
(function (global) {
  'use strict';

  var P = global.Products, DB = global.DB, V = global.V;
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  var catalog = {}; /* ana uygulamayla AYNI liste: items store, kod ile indeksli */
  var secim = {};
  var editingKod = null;

  function yeniId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /* ---------------- QR (üretim: js/qrmake.js) ---------------- */
  function qrCanvas(text, cell, margin) {
    return global.Qr.canvas(text, cell, margin);
  }

  /* ---------------- form ---------------- */
  function setTri(sel, val) {
    var box = $(sel);
    box.dataset.value = val == null ? '' : String(val ? 1 : 0);
    Array.prototype.forEach.call(box.querySelectorAll('button'), function (b) {
      var on = b.dataset.v === box.dataset.value;
      b.classList.toggle('sel', on);
      b.classList.toggle('no', on && b.dataset.v === '0');
    });
  }
  function getTri(sel) {
    var v = $(sel).dataset.value;
    return v === '1' ? true : v === '0' ? false : null;
  }

  /* ---------------- şablon doğrulaması (js/validate.js) ---------------- */
  var ALAN_INPUT = {
    kod: '#pKod', ad: '#pAd', kategori: '#pKategori', kg: '#pKg', m3: '#pM3',
    en: '#pEn', boy: '#pBoy', yukseklik: '#pYuk', varis: '#pVaris',
    musteri: '#pMusteri', telefon: '#pTelefon', not: '#pNot',
    kirilgan: '#pKirilgan', istifle: '#pIstifle'
  };

  function hataGoster(sel, mesaj, uyari) {
    var el = $(sel);
    if (!el) return;
    var kap = el.closest('label.f') || el.parentNode;
    if (!kap) return;
    var tri = el.classList.contains('tri');
    var mevcut = kap.querySelector(':scope > small.hata');
    if (!mesaj) {
      if (mevcut) mevcut.remove();
      kap.classList.remove('bad', 'alan-bad');
      return;
    }
    if (!mevcut) {
      mevcut = document.createElement('small');
      mevcut.className = 'hata';
      kap.appendChild(mevcut);
    }
    mevcut.className = 'hata' + (uyari ? ' u' : '');
    mevcut.textContent = mesaj;
    kap.classList.add(tri ? 'alan-bad' : 'bad');
  }

  var KATALOG_OPTS = { kirilganZorunlu: false, mod: 'katalog' };

  /* formu denetler, satır içi mesajları basar */
  function dogrula() {
    var it = readForm();
    var hatalar = V.kayitKontrol(it, KATALOG_OPTS);
    Object.keys(ALAN_INPUT).forEach(function (a) { hataGoster(ALAN_INPUT[a], null); });
    var hataSayisi = 0, uyariSayisi = 0, ilkHata = null;
    hatalar.forEach(function (h) {
      var sel = ALAN_INPUT[h.alan];
      if (!sel) return;
      if (h.duzey === 'hata') { hataSayisi++; if (!ilkHata) ilkHata = sel; } else uyariSayisi++;
      hataGoster(sel, (h.duzey === 'uyari' ? '⚠ ' : '') + V.ALAN[h.alan] + ': ' + h.mesaj, h.duzey === 'uyari');
    });
    return { hatalar: hatalar, hataSayisi: hataSayisi, uyariSayisi: uyariSayisi, ilkHata: ilkHata };
  }

  function uyariMetni(d) {
    return d.hatalar.filter(function (x) { return x.duzey === 'uyari'; })
      .map(function (x) { return x.mesaj; }).join(' • ');
  }

  function readForm() {
    var it = P.emptyItem();
    it.kod = $('#pKod').value.trim();
    it.kategori = $('#pKategori').value.trim();
    it.ad = $('#pAd').value.trim();
    it.kg = P.num($('#pKg').value, true);
    it.m3 = P.num($('#pM3').value);
    it.en = P.num($('#pEn').value);
    it.boy = P.num($('#pBoy').value);
    it.yukseklik = P.num($('#pYuk').value);
    it.kirilgan = getTri('#pKirilgan');
    it.istifle = getTri('#pIstifle');
    it.varis = $('#pVaris').value.trim();
    it.musteri = $('#pMusteri').value.trim();
    it.telefon = $('#pTelefon').value.trim();
    it.not = $('#pNot').value.trim();
    P.derive(it);
    if (it.m3 == null && it.en && it.boy && it.yukseklik) it.m3 = Math.round(it.en * it.boy * it.yukseklik / 1000000 * 10000) / 10000;
    return it;
  }

  function writeForm(r) {
    r = r || P.emptyItem();
    $('#pKod').value = r.kod || '';
    P.kategoriSecenekleri($('#pKategori'), r.kategori || '');
    $('#pAd').value = r.ad || '';
    $('#pKg').value = r.kg == null ? '' : r.kg;
    $('#pM3').value = r.m3 == null ? '' : r.m3;
    $('#pEn').value = r.en == null ? '' : r.en;
    $('#pBoy').value = r.boy == null ? '' : r.boy;
    $('#pYuk').value = r.yukseklik == null ? '' : r.yukseklik;
    $('#pVaris').value = r.varis || '';
    $('#pMusteri').value = r.musteri || '';
    $('#pTelefon').value = r.telefon ? V.telBicim(r.telefon) : '';
    $('#pNot').value = r.not || '';
    setTri('#pKirilgan', r.kirilgan);
    setTri('#pIstifle', r.istifle);
    Object.keys(ALAN_INPUT).forEach(function (a) { hataGoster(ALAN_INPUT[a], null); });
    editingKod = r.kod || null;
    if (r.kod) dogrula();
    renderPreview();
  }

  function renderPreview() {
    var it = readForm();
    var text = P.toQrText(it);
    $('#qrText').textContent = text;
    var host = $('#qrPreview');
    host.innerHTML = '';
    host.appendChild(qrCanvas(text, 5, 3));
  }

  /* ---------------- katalog listesi ---------------- */
  function renderTable() {
    var q = P.norm($('#ara').value);
    var rows = Object.keys(catalog).map(function (k) { return catalog[k]; })
      .sort(function (a, b) { return String(a.kod).localeCompare(String(b.kod), 'tr'); });
    if (q) rows = rows.filter(function (r) {
      return [r.kod, r.ad, r.kategori, r.varis].some(function (v) { return P.norm(v || '').indexOf(q) > -1; });
    });
    $('#catSayac').textContent = Object.keys(catalog).length + ' kayıt';
    if (!rows.length) {
      $('#tablo').innerHTML = '<tr><td class="muted">Ürün listesi boş. Yukarıdan ürün ekleyin veya CSV içe aktarın.</td></tr>';
      return;
    }
    $('#tablo').innerHTML = '<tr><th></th><th>Kod</th><th>Ürün</th><th>kg</th><th>m³</th><th>Ölçü (cm)</th><th>⚠</th><th>Varış</th><th></th></tr>' +
      rows.map(function (r) {
        return '<tr><td><input type="checkbox" data-sel="' + esc(r.kod) + '"' + (secim[r.kod] ? ' checked' : '') + '></td>' +
          '<td class="mono">' + esc(r.kod) + '</td>' +
          '<td>' + esc(r.ad || '—') + '<br><small>' + esc(r.kategori || '') + '</small></td>' +
          '<td>' + P.nf(r.kg, 1) + '</td><td>' + P.nf(r.m3, 3) + '</td>' +
          '<td>' + P.nf(r.en, 0) + '×' + P.nf(r.boy, 0) + '×' + P.nf(r.yukseklik, 0) + '</td>' +
          '<td>' + (r.kirilgan === true ? '⚠' : r.kirilgan === false ? '·' : '?') + '</td>' +
          '<td><small>' + esc(r.varis || '—') + '</small></td>' +
          '<td class="right nowrap"><button class="btn sm" data-duzenle="' + esc(r.kod) + '">✏️</button> ' +
          '<button class="btn sm ghost" data-sil="' + esc(r.kod) + '">🗑️</button></td></tr>';
      }).join('');

    $$('#tablo [data-sel]').forEach(function (b) {
      b.onchange = function () { secim[b.dataset.sel] = b.checked; };
    });
    $$('#tablo [data-duzenle]').forEach(function (b) {
      b.onclick = function () { writeForm(catalog[b.dataset.duzenle]); window.scrollTo(0, 0); };
    });
    $$('#tablo [data-sil]').forEach(function (b) {
      b.onclick = function () {
        var kod = b.dataset.sil, r = catalog[kod];
        if (!confirm(kod + ' ürün listesinden silinsin mi?')) return;
        delete catalog[kod]; delete secim[kod];
        DB.del('items', r && r.id).then(renderTable);
      };
    });
    fillDatalists();
  }

  function fillDatalists() {
    var kats = {}, vars = {};
    Object.keys(catalog).forEach(function (k) {
      if (catalog[k].kategori) kats[catalog[k].kategori] = 1;
      if (catalog[k].varis) vars[catalog[k].varis] = 1;
    });
    var opt = function (o) {
      return Object.keys(o).sort(function (a, b) { return a.localeCompare(b, 'tr'); })
        .map(function (k) { return '<option value="' + esc(k) + '">'; }).join('');
    };
    P.kategoriSecenekleri($('#pKategori'));
    $('#vars').innerHTML = opt(vars);
  }

  /* ---------------- etiket yazdırma ---------------- */
  function buildLabels() {
    var kodlar = Object.keys(secim).filter(function (k) { return secim[k] && catalog[k]; });
    if (!kodlar.length) kodlar = Object.keys(catalog);
    if (!kodlar.length) { alert('Önce ürün ekleyin veya listeden seçin.'); return; }
    var kopya = Math.max(1, Math.min(50, parseInt($('#kopya').value, 10) || 1));
    var html = '<div class="label-grid">';
    var sayi = 0;
    kodlar.forEach(function (kod) {
      for (var i = 0; i < kopya; i++) {
        var r = catalog[kod];
        html += '<div class="label" data-kod="' + esc(kod) + '"><div class="qr"></div><div class="txt">' +
          '<b>' + esc(r.ad || kod) + '</b>' +
          '<div class="mono">' + esc(kod) + '</div>' +
          '<div>' + (r.kg != null ? P.nf(r.kg, 1) + ' kg' : '— kg') + ' · ' + (r.m3 != null ? P.nf(r.m3, 3) + ' m³' : '— m³') + '</div>' +
          (r.en != null || r.boy != null ? '<div>' + P.nf(r.en, 0) + '×' + P.nf(r.boy, 0) + '×' + P.nf(r.yukseklik, 0) + ' cm</div>' : '') +
          (r.kirilgan === true ? '<div class="frag">⚠ KIRILACAK — ÜSTÜNE KOYMAYIN</div>' : (r.istifle === true ? '<div>İstiflenebilir</div>' : '')) +
          '<span class="dest">VARIŞ: ' + esc(r.varis || '—') + '</span>' +
          (r.musteri ? '<div>' + esc(r.musteri) + (r.telefon ? ' · ' + esc(V.telBicim(r.telefon)) : '') + '</div>' : '') +
          (r.not ? '<div><i>' + esc(r.not) + '</i></div>' : '') +
          '</div></div>';
        sayi++;
      }
    });
    html += '</div>';
    var area = $('#printArea');
    area.innerHTML = html;
    $$('#printArea .label').forEach(function (el) {
      var r = catalog[el.dataset.kod];
      el.querySelector('.qr').appendChild(qrCanvas(P.toQrText(r), 4, 2));
    });
    $('#printBilgi').style.display = '';
    $('#printOzet').textContent = sayi + ' etiket hazır (' + kodlar.length + ' ürün × ' + kopya + ' kopya). Yazdırma penceresinde “Arka plan grafikleri” seçeneğini açabilirsiniz.';
    window.print();
  }

  /* ---------------- içe / dışa aktarma ---------------- */
  function importRows(arr, kaynak) {
    var temiz = [], hatali = [];
    arr.forEach(function (r) {
      if (!r.kod && !r.ad) return;
      var k = V.kayitKontrol(r, KATALOG_OPTS);
      if (k.hataSayisi) {
        hatali.push((r.kod || '(kodsuz)') + ': ' + k.filter(function (x) { return x.duzey === 'hata'; })
          .map(function (x) { return (V.ALAN[x.alan] || x.alan) + ' ' + x.mesaj; }).join(', '));
        return;
      }
      V.duzelt(r);
      temiz.push(r);
    });
    if (!temiz.length) {
      alert(hatali.length
        ? hatali.length + ' kayıt şablona uymadığı için alınmadı:\n\n' + hatali.slice(0, 8).join('\n')
        : 'Kayıt bulunamadı. CSV başlık satırında en az "kod" sütunu olmalı.');
      return;
    }
    temiz.forEach(function (r) {
      var eski = catalog[r.kod];
      catalog[r.kod] = Object.assign({}, eski, r, {
        id: (eski && eski.id) || yeniId(),
        zaman: (eski && eski.zaman) || Date.now(),
        guncelleme: Date.now()
      });
    });
    DB.putMany('items', temiz.map(function (r) { return catalog[r.kod]; })).then(function () {
      renderTable();
      alert(temiz.length + ' ürün listeye aktarıldı (' + kaynak + ').' +
        (hatali.length ? '\n\n' + hatali.length + ' kayıt şablona uymadı:\n' + hatali.slice(0, 8).join('\n') : ''));
    });
  }

  var SAPLON = 'kod;ad;kategori;agirlikKg;hacimM3;en_cm;boy_cm;yukseklik_cm;kirilgan;istiflenebilir;varisNoktasi;musteri;telefon;not\r\n' +
    'URN-1001;Çamaşır makinesi 8 kg;Beyaz Eşya / Makine;68;0,31;60;60;85;HAYIR;EVET;İstanbul / Kadıköy;Ayşe Yılmaz;0532 000 00 00;Hortum arka tarafta\r\n' +
    'URN-1002;Cam yemek masası;Mobilya;45;0,65;120;80;75;EVET;HAYIR;Ankara / Çankaya;Mehmet Demir;0505 000 00 00;Cam köşeleri koru\r\n';

  function download(name, text, mime) {
    var blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 600);
  }

  /* ---------------- başlangıç ---------------- */
  function bindTri(sel) {    $(sel).addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null;
      if (!b) return;
      var v = b.dataset.v;
      $(sel).dataset.value = v;
      setTri(sel, v === '' ? null : v === '1');
      if (sel === '#pKirilgan' && v === '1') setTri('#pIstifle', false);
      if (sel === '#pIstifle' && v === '1') setTri('#pKirilgan', false);
      renderPreview();
    });
  }

  function bind() {
    ['#pKod', '#pKategori', '#pAd', '#pKg', '#pM3', '#pEn', '#pBoy', '#pYuk', '#pVaris', '#pMusteri', '#pTelefon', '#pNot'].forEach(function (id) {
      $(id).addEventListener('input', renderPreview);
    });
    /* şablona göre otomatik biçimlendirme */
    $('#pKod').addEventListener('input', function (e) {
      var imlec = e.target.selectionStart;
      e.target.value = V.kodBicim(e.target.value);
      try { e.target.setSelectionRange(imlec, imlec); } catch (err) { }
    });
    $('#pTelefon').addEventListener('input', function (e) {
      var yeni = V.telGiris(e.target.value);
      if (yeni !== e.target.value) {
        e.target.value = yeni;
        try { e.target.setSelectionRange(yeni.length, yeni.length); } catch (err) { }
      }
      renderPreview();
    });
    $('#pAd').addEventListener('blur', function (e) { e.target.value = V.adBicim(e.target.value); });
    $('#pVaris').addEventListener('blur', function (e) { e.target.value = V.varisBicim(e.target.value); renderPreview(); });
    ['#pKod', '#pAd', '#pKategori', '#pKg', '#pM3', '#pEn', '#pBoy', '#pYuk', '#pVaris', '#pTelefon'].forEach(function (s) {
      $(s).addEventListener('blur', dogrula);
      $(s).addEventListener('change', dogrula);
    });
    bindTri('#pKirilgan'); bindTri('#pIstifle');
    $('#btnSave').onclick = function () {
      var d = dogrula();
      if (d.hataSayisi) {
        var ilk = d.hatalar.filter(function (x) { return x.duzey === 'hata'; })[0];
        alert('Kaydedilemedi — ' + d.hataSayisi + ' alan kurala uymuyor:\n\n' +
          d.hatalar.filter(function (x) { return x.duzey === 'hata'; })
            .map(function (x) { return '• ' + (V.ALAN[x.alan] || x.alan) + ': ' + x.mesaj; }).join('\n'));
        if (d.ilkHata && $(d.ilkHata)) $(d.ilkHata).focus();
        return;
      }
      var it = readForm();
      V.duzelt(it);
      var eski = catalog[it.kod];
      if (eski && editingKod !== it.kod && !confirm(it.kod + ' listede zaten var — mevcut kaydın üzerine yazılsın mı?')) return;
      writeForm(it);
      catalog[it.kod] = Object.assign({}, eski, it, {
        id: (eski && eski.id) || yeniId(),
        zaman: (eski && eski.zaman) || Date.now(),
        guncelleme: Date.now()
      });
      DB.put('items', catalog[it.kod]).then(function () {
        editingKod = it.kod;
        renderTable();
        if (d.uyariSayisi) alert('Kaydedildi ⚠ ' + uyariMetni(d));
        $('#btnSave').textContent = '💾 Kaydedildi ✓';
        setTimeout(function () { $('#btnSave').textContent = '💾 Listeye kaydet'; }, 1400);
      });
    };
    $('#btnNew').onclick = function () { writeForm(P.emptyItem()); $('#pKod').focus(); };
    $('#btnPng').onclick = function () {
      var it = readForm();
      var c = qrCanvas(P.toQrText(it), 8, 3);
      var a = document.createElement('a');
      a.href = c.toDataURL('image/png');
      a.download = 'qr-' + (it.kod || 'urun') + '.png';
      a.click();
    };
    $('#ara').oninput = renderTable;
    $('#selAll').onchange = function (e) {
      secim = {};
      if (e.target.checked) Object.keys(catalog).forEach(function (k) { secim[k] = true; });
      renderTable();
    };
    $('#btnPrint').onclick = buildLabels;
    $('#btnPrintNow').onclick = function () { window.print(); };
    $('#btnImpCsv').onclick = function () { $('#fCsv').click(); };
    $('#fCsv').onchange = function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      f.text().then(function (t) { e.target.value = ''; importRows(P.rowsToProducts(P.csvParse(t)), 'CSV'); });
    };
    $('#btnImpJson').onclick = function () { $('#fJson').click(); };
    $('#fJson').onchange = function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      f.text().then(function (t) {
        e.target.value = '';
        try {
          var d = JSON.parse(t);
          var arr = Array.isArray(d) ? d : (d.urunler || d.products || []);
          importRows(arr.map(function (r) { return P.derive(P.fill(P.emptyItem(), r)); }).filter(function (r) { return r.kod; }), 'JSON');
        } catch (err) { alert('JSON çözülemedi: ' + err.message); }
      });
    };
    $('#btnExpCsv').onclick = function () {
      var rows = Object.keys(catalog).map(function (k) { return catalog[k]; });
      if (!rows.length) { alert('Liste boş.'); return; }
      download('urun-listesi.csv', P.itemsToCsv(rows, function (r) {
        var k = V.kayitKontrol(r, KATALOG_OPTS);
        var h = k.filter(function (x) { return x.duzey === 'hata'; });
        var u = k.filter(function (x) { return x.duzey === 'uyari'; });
        return h.length ? 'HATALI: ' + h.map(function (x) { return x.alan; }).join('+')
          : (u.length ? 'UYARI: ' + u.map(function (x) { return x.alan; }).join('+') : 'OK');
      }), 'text/csv');
    };
    $('#btnExpJson').onclick = function () {
      var rows = Object.keys(catalog).map(function (k) { return catalog[k]; });
      if (!rows.length) { alert('Liste boş.'); return; }
      download('urun-listesi.json', JSON.stringify(rows, null, 2), 'application/json');
    };
    $('#btnSyncFile').onclick = function () {
      var rows = Object.keys(catalog).map(function (k) { return catalog[k]; });
      if (!rows.length) { alert('Liste boş.'); return; }
      /* sabit ad: telefonda "PC'den çek" bu dosyayı okur; WhatsApp/e-posta ile de atılabilir */
      download('urunler.json', JSON.stringify({ tur: 'urunListesi', tarih: new Date().toISOString(), urunler: rows }, null, 2), 'application/json');
    };
    $('#btnTemplate').onclick = function () { download('urun-sablonu.csv', '\uFEFF' + SAPLON, 'text/csv'); };
  }

  function boot() {
    bind();
    DB.all('items').then(function (rows) {
      /* zaman'a göre azalan sırala: aynı kod varsa en yeni kayıt esas alınır */
      rows.sort(function (a, b) { return (b.zaman || 0) - (a.zaman || 0); });
      rows.forEach(function (r) {
        if (!r.kod) return;
        if (!r.id) { r.id = yeniId(); DB.put('items', r); } /* eski kayıtlara id kazandır */
        if (!catalog[r.kod]) catalog[r.kod] = r;
      });
      var kod = new URLSearchParams(location.search).get('kod');
      if (kod && catalog[kod]) writeForm(catalog[kod]); else writeForm(P.emptyItem());
      renderTable();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
