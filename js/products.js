/* products.js — QR içeriğini ürün kaydına çevirme, doğrulama, biçimlendirme
 *
 * Desteklenen QR içerikleri:
 *  1) JSON           {"v":1,"kod":"...","ad":"...","kg":85,"m3":0.42,"en":60,"boy":60,"yukseklik":85,
 *                     "kirilgan":1,"istifle":0,"varis":"İstanbul","musteri":"...","telefon":"...","not":"...","adet":1}
 *  2) Kısa satır     QRV1|URUN-1042|Buzdolabi|85|0.42|60|60|180|1|0|Istanbul|Ali Veli|0532...|kirma
 *  3) URL            https://site/urun?kod=URUN-1042&kg=85&varis=Istanbul
 *  4) Düz metin/kod  sadece ürün kodu -> katalogdan tamamlanır
 */
(function (global) {
  'use strict';

  var FIELDS = ['kod', 'ad', 'kategori', 'kg', 'm3', 'en', 'boy', 'yukseklik', 'kirilgan', 'istifle', 'varis', 'musteri', 'telefon', 'not', 'adet'];

  /* farklı etiket isimlerini tek kanonik alana bağlar */
  var ALIAS = {
    kod: ['kod', 'urun_kodu', 'urunkodu', 'barkod', 'stok', 'stokkod', 'sku', 'kode', 'id', 'no', 'kod_no'],
    ad: ['ad', 'ad_adi', 'isim', 'urun', 'urunadi', 'malzeme', 'malzemeadi', 'name', 'title', 'desc', 'aciklama'],
    kategori: ['kategori', 'tip', 'cins', 'group', 'kategoriadi'],
    kg: ['kg', 'agirlik', 'agirlikkg', 'netagirlik', 'tukag', 'tuku', 'agurluk', 'weight', 'mass'],
    m3: ['m3', 'hacim', 'hacimm3', 'hacim_m3', 'metrekup', 'volume', 'vol'],
    en: ['en', 'en_cm', 'genislik', 'genislik_cm', 'width', 'w_cm', 'derinlik'],
    boy: ['boy', 'boy_cm', 'uzunluk', 'uzunluk_cm', 'length', 'l_cm'],
    yukseklik: ['yukseklik', 'yukseklik_cm', 'height', 'yks', 'yuk'],
    kirilgan: ['kirilgan', 'kirilan', 'kirilganmi', 'kirpilan', 'dikkat', 'fragile', 'kink', 'kirilgan_uyarisi'],
    istifle: ['istifle', 'istanif', 'ustunebiner', 'stackable', 'binilebilir', 'istif'],
    varis: ['varis', 'varisnoktasi', 'hedef', 'sehir', 'il', 'ilce', 'gonderilecek', 'destination', 'to', 'lokasyon', 'lokasyonkod'],
    musteri: ['musteri', 'alici', 'musteki', 'customer', 'client', 'sube', 'bayi'],
    telefon: ['telefon', 'tel', 'gsm', 'phone', 'mtel'],
    not: ['not', 'aciklama_not', 'notlar', 'remark', 'comment', 'seyahatnot'],
    adet: ['adet', 'qty', 'quantity', 'count', 'koli']
  };

  function norm(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .replace(/[ıİ]/g, 'i').replace(/[İ]/g, 'i')
      .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
      .replace(/ö/g, 'o').replace(/ç/g, 'c')
      .replace(/[^a-z0-9]/g, '');
  }

  /* Türkçe/İngilizce sayı ayrımı: "1.240,50" -> 1240.5 | "0.42" -> 0.42 | "12,5" -> 12.5
   * thousandsFirst=true: "1.240" -> 1240 (ağırlık gibi büyük değerlerde nokta binlik ayıracıdır) */
  function num(v, thousandsFirst) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s = String(v).replace(/[^\d.,\-]/g, '').trim();
    if (!s) return null;
    var lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
    if (lastComma > -1 && lastDot > -1) {
      if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (lastComma > -1) {
      var dec = s.length - lastComma - 1;
      if (dec === 3 && /^\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, '');
      else s = s.replace(',', '.');
    } else if (lastDot > -1 && thousandsFirst && /^\d{1,3}(\.\d{3})+$/.test(s)) {
      s = s.replace(/\./g, '');
    }
    var n = parseFloat(s);
    return isFinite(n) ? n : null;
  }

  var EVET = ['1', 'e', 'evet', 'y', 'yes', 'true', 'k', 'kirilgan', 'kirilgan', 'dikkat', '-break', 'breakable'];
  var HAYIR = ['0', 'h', 'hayir', 'n', 'no', 'false', 'yok', 'istiflenebilir', '-'];

  function tri(v) { // evet / hayır / bilinmiyor
    if (v == null || v === '') return null;
    if (typeof v === 'boolean') return v;
    var s = norm(v);
    if (HAYIR.indexOf(s) > -1) return false;
    if (EVET.indexOf(s) > -1) return true;
    if (s.indexOf('hayir') > -1) return false;
    if (s.indexOf('kirilgan') > -1 || s.indexOf('kink') > -1 || s.indexOf('dikkat') > -1) return true;
    var n = num(v);
    if (n != null) return n > 0;
    return null;
  }

  function txt(v) {
    if (v == null) return '';
    return String(v).replace(/\s+/g, ' ').trim();
  }

  /* alias listelerini de normalize et (ör. "en_cm" -> "encm", "ağırlık" -> "agirlik") */
  var NALIAS = {};
  Object.keys(ALIAS).forEach(function (k) { NALIAS[k] = ALIAS[k].map(norm); });

  function pick(obj, field) {
    var keys = NALIAS[field] || [norm(field)];
    for (var k in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
      var nk = norm(k);
      if (keys.indexOf(nk) > -1) {
        var val = obj[k];
        if (val === '' || val == null) continue;
        return val;
      }
    }
    /* içinde geçen varyantlar (ör. "agirlik_kg") */
    for (var k2 in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, k2)) continue;
      var nk2 = norm(k2);
      for (var i = 0; i < keys.length; i++) {
        if (keys[i].length > 2 && nk2.indexOf(keys[i]) > -1) {
          if (obj[k2] === '' || obj[k2] == null) continue;
          return obj[k2];
        }
      }
    }
    return null;
  }

  function emptyItem() {
    return {
      id: '', kod: '', ad: '', kategori: '', kg: null, m3: null,
      en: null, boy: null, yukseklik: null, kirilgan: null, istifle: null,
      varis: '', musteri: '', telefon: '', not: '', adet: 1,
      hacimKaynagi: '', kaynak: '', ham: '', zaman: 0
    };
  }

  function fill(item, obj) {
    item.kod = txt(pick(obj, 'kod')) || item.kod;
    item.ad = txt(pick(obj, 'ad')) || item.ad;
    item.kategori = txt(pick(obj, 'kategori')) || item.kategori;
    var kg = num(pick(obj, 'kg'), true); if (kg != null) item.kg = kg;
    var m3 = num(pick(obj, 'm3')); if (m3 != null) item.m3 = m3;
    var en = num(pick(obj, 'en')); if (en != null) item.en = en;
    var boy = num(pick(obj, 'boy')); if (boy != null) item.boy = boy;
    var yk = num(pick(obj, 'yukseklik')); if (yk != null) item.yukseklik = yk;
    var kr = tri(pick(obj, 'kirilgan')); if (kr != null) item.kirilgan = kr;
    var st = tri(pick(obj, 'istifle')); if (st != null) item.istifle = st;
    item.varis = txt(pick(obj, 'varis')) || item.varis;
    item.musteri = txt(pick(obj, 'musteri')) || item.musteri;
    item.telefon = txt(pick(obj, 'telefon')) || item.telefon;
    item.not = txt(pick(obj, 'not')) || item.not;
    var ad = num(pick(obj, 'adet')); if (ad != null && ad >= 1) item.adet = Math.round(ad);
    return item;
  }

  function derive(item) {
    if (item.m3 == null && item.en != null && item.boy != null && item.yukseklik != null) {
      var v = item.en * item.boy * item.yukseklik / 1000000;
      if (v > 0) { item.m3 = Math.round(v * 10000) / 10000; item.hacimKaynagi = 'hesap'; }
    }
    if (!item.hacimKaynagi) item.hacimKaynagi = 'qr';
    if (item.kirilgan === true) item.istifle = false;
    if (item.istifle === true) item.kirilgan = false;
    if (!item.adet || item.adet < 1) item.adet = 1;
    return item;
  }

  /* zorunlu alan kontrolü -> eksik alan etiketleri */
  function eksikler(item) {
    var e = [];
    if (!item.kod) e.push('kod');
    if (!item.ad) e.push('ürün adı');
    if (item.kg == null) e.push('ağırlık');
    if (item.m3 == null) e.push('hacim');
    if (!item.varis) e.push('varış noktası');
    return e;
  }

  /* QRV1|kod|ad|kategori|kg|m3|en|boy|yukseklik|kirilgan|istifle|varis|musteri|telefon|not|adet */
  var PIPE_ORDER = ['tur', 'kod', 'ad', 'kategori', 'kg', 'm3', 'en', 'boy', 'yukseklik', 'kirilgan', 'istifle', 'varis', 'musteri', 'telefon', 'not', 'adet'];

  function fromPipe(text) {
    var parts = String(text).split('|').map(function (p) { return p.trim(); });
    var obj = {};
    if (norm(parts[0]).indexOf('qrv') === 0) parts.shift();
    /* kısaltılmış sıra (kategori yoksa) da çalışsın: 9+ alan varsa tam sırayı kullan */
    if (parts.length <= 9) {
      var short = ['kod', 'ad', 'kg', 'm3', 'en', 'boy', 'yukseklik', 'kirilgan', 'varis'];
      short.forEach(function (k, i) { if (parts[i] !== '' && parts[i] != null) obj[k] = parts[i]; });
    } else {
      PIPE_ORDER.forEach(function (k, i) {
        if (k === 'tur') return;
        var idx = i - 1;
        if (parts[idx] !== '' && parts[idx] != null) obj[k] = parts[idx];
      });
    }
    return obj;
  }

  function fromUrl(url) {
    var obj = {};
    var base = (typeof location !== 'undefined' && location.href) ? location.href : 'http://localhost/';
    try {
      var u = new URL(url, base);
      u.searchParams.forEach(function (v, k) { obj[k] = v; });
      var seg = u.pathname.split('/').filter(Boolean);
      if (!obj.kod && seg.length) obj.kod = decodeURIComponent(seg[seg.length - 1]);
      if (!obj.kod && u.hash) obj.kod = u.hash.replace(/[#/?]/g, '');
    } catch (e) { return null; }
    return obj;
  }

  /* ham QR metnini ürüne çevirir */
  function parse(raw) {
    var text = String(raw == null ? '' : raw).trim();
    var item = emptyItem();
    var notlar = [];
    var bulundu = false;
    if (!text) return { item: item, not: 'bos' };
    item.ham = text.length > 1200 ? text.slice(0, 1200) : text;

    if (text.charAt(0) === '{' || text.charAt(0) === '[') {
      try {
        var data = JSON.parse(text);
        if (Array.isArray(data)) data = data[0];
        fill(item, data || {});
        bulundu = true;
        item.kaynak = 'qr-json';
      } catch (e) {
        notlar.push('JSON bozuk');
        item.kaynak = 'qr-metin';
      }
    } else if (/^[A-Za-z]{2,5}\d{0,2}\|/.test(text) || (text.match(/\|/g) || []).length >= 3) {
      fill(item, fromPipe(text));
      bulundu = true;
      item.kaynak = 'qr-satir';
    } else if (/^https?:\/\//i.test(text)) {
      var o = fromUrl(text);
      if (o) { fill(item, o); bulundu = true; }
      item.kaynak = 'qr-url';
    } else {
      item.kod = text.slice(0, 120);
      item.kaynak = 'qr-kod';
    }

    derive(item);
    return { item: item, not: notlar, bulundu: bulundu };
  }

  /* kataloğa göre eksikleri tamamla */
  function mergeCatalog(item, rec) {
    if (!rec) return item;
    if (!item.ad && rec.ad) item.ad = rec.ad;
    if (!item.kategori && rec.kategori) item.kategori = rec.kategori;
    if (item.kg == null && rec.kg != null) item.kg = rec.kg;
    if (item.m3 == null && rec.m3 != null) item.m3 = rec.m3;
    if (item.en == null && rec.en != null) item.en = rec.en;
    if (item.boy == null && rec.boy != null) item.boy = rec.boy;
    if (item.yukseklik == null && rec.yukseklik != null) item.yukseklik = rec.yukseklik;
    if (item.kirilgan == null && rec.kirilgan != null) item.kirilgan = rec.kirilgan;
    if (item.istifle == null && rec.istifle != null) item.istifle = rec.istifle;
    if (!item.varis && rec.varis) item.varis = rec.varis;
    if (!item.musteri && rec.musteri) item.musteri = rec.musteri;
    if (!item.telefon && rec.telefon) item.telefon = rec.telefon;
    derive(item);
    return item;
  }

  /* ---------- biçimlendirme ---------- */
  function nf(n, d) {
    if (n == null || !isFinite(n)) return '—';
    return n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: d == null ? 2 : d });
  }
  function kg(item) { return item.kg == null ? '—' : nf(item.kg * (item.adet || 1), 1) + ' kg'; }
  function m3(item) { return item.m3 == null ? '—' : nf(item.m3 * (item.adet || 1), 3) + ' m³'; }
  function olcu(item) {
    if (item.en == null && item.boy == null && item.yukseklik == null) return '—';
    return nf(item.en, 0) + ' × ' + nf(item.boy, 0) + ' × ' + nf(item.yukseklik, 0) + ' cm';
  }
  function baslik(item) { return item.ad || item.kod || 'Adsız ürün'; }
  function etiket(item) {
    if (item.kirilgan === true) return 'KIRILGAN';
    if (item.kirilgan === false) return 'İSTİFLENEBİLİR';
    return '';
  }

  /* ---------- dışa aktarma ---------- */
  var CSV_HEAD = ['kod', 'urun', 'kategori', 'agirlikKg', 'adet', 'toplamKg', 'hacimM3', 'toplamM3', 'en_cm', 'boy_cm', 'yukseklik_cm', 'kirilgan', 'istiflenebilir', 'varisNoktasi', 'musteri', 'telefon', 'not', 'yuklemeSaati', 'veriDurumu'];

  function csvCell(v) {
    var s = v == null ? '' : String(v);
    if (/[;"\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  /* Türkçe Excel: ondalık ayraç virgül olmalı; nokta bırakılan "1.83" gibi
   * değerler tarih (Oca.83) veya metin olarak anlaşılıp toplam kolonları kayıyor */
  function sayiCsv(n) {
    if (n == null || n === '' || !isFinite(n)) return '';
    return String(n).replace('.', ',');
  }
  /* durumFn(item) -> metin verilirse "veriDurumu" kolonu doldurulur (merkez planlama filtresi) */
  function itemsToCsv(items, durumFn) {
    var lines = [CSV_HEAD.join(';')];
    items.forEach(function (it) {
      var a = it.adet || 1;
      lines.push([
        it.kod, it.ad, it.kategori,
        sayiCsv(it.kg), a,
        sayiCsv(it.kg == null ? null : Math.round(it.kg * a * 100) / 100),
        sayiCsv(it.m3),
        sayiCsv(it.m3 == null ? null : Math.round(it.m3 * a * 10000) / 10000),
        sayiCsv(it.en), sayiCsv(it.boy), sayiCsv(it.yukseklik),
        it.kirilgan === true ? 'EVET' : (it.kirilgan === false ? 'HAYIR' : ''),
        it.istifle === true ? 'EVET' : (it.istifle === false ? 'HAYIR' : ''),
        it.varis, it.musteri, it.telefon ? (global.V ? global.V.telBicim(it.telefon) : it.telefon) : '', it.not,
        it.zaman ? new Date(it.zaman).toLocaleString('tr-TR') : '',
        durumFn ? durumFn(it) : ''
      ].map(csvCell).join(';'));
    });
    return '\uFEFF' + lines.join('\r\n');
  }

  function csvParse(text) {
    text = String(text || '').replace(/^\uFEFF/, '');
    var delim = (text.split('\n')[0].match(/;/g) || []).length >= (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
    var rows = [], row = [], val = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { val += '"'; i++; } else q = false; }
        else val += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(val); val = ''; }
      else if (c === '\n') { row.push(val); rows.push(row); row = []; val = ''; }
      else if (c !== '\r') val += c;
    }
    if (val !== '' || row.length) { row.push(val); rows.push(row); }
    return rows.filter(function (r) { return r.join('').trim() !== ''; });
  }

  /* CSV satırlarını ürün kayıtlarına çevirir (katalog içe aktarma) */
  function rowsToProducts(rows) {
    if (!rows.length) return [];
    var head = rows[0].map(norm);
    var out = [];
    for (var i = 1; i < rows.length; i++) {
      var obj = {};
      head.forEach(function (h, j) { obj[h] = rows[i][j]; });
      var it = fill(emptyItem(), obj);
      derive(it);
      if (it.kod) out.push(it);
    }
    return out;
  }

  /* SmartPack-3D'nin 16 sabit sınıfı (Modül 2). Değerler SmartPack köprüsündeki
     eşleme tablosuyla BİREBİR aynı olmalıdır — köprü bunları doğrudan enum'a çevirir. */
  var KATEGORILER = [
    'Elektronik', 'Cam / Seramik', 'Mobilya', 'Metal / Mekanik',
    'Plastik Eşya', 'Ahşap Eşya', 'Tekstil / Yumuşak', 'Kitap / Kağıt',
    'Mutfak / Ev Gereci', 'Sanat / Müzik Aleti', 'Uzun / Düzensiz Yük',
    'Sıvı / Sızıntı Riski', 'Isı / Nem / Hijyen', 'Pil / Batarya',
    'Tıbbi / Laboratuvar', 'Beyaz Eşya / Makine'
  ];

  /* Bir <select>'e 16 sabit kategoriyi yazar. Liste dışı eski bir değer varsa
     "(eski)" etiketiyle korunur ki düzenlemede veri kaybı olmasın. */
  function kategoriSecenekleri(sel, mevcut) {
    if (!sel) return;
    var cur = (mevcut != null ? mevcut : sel.value) || '';
    var h = '<option value="">— Seçiniz —</option>';
    KATEGORILER.forEach(function (k) { h += '<option value="' + k + '">' + k + '</option>'; });
    if (cur && KATEGORILER.indexOf(cur) === -1) h += '<option value="' + k2g(cur) + '">' + k2g(cur) + ' (eski)</option>';
    sel.innerHTML = h;
    sel.value = cur;
  }
  function k2g(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  var Products = {
    FIELDS: FIELDS, ALIAS: ALIAS, KATEGORILER: KATEGORILER,
    kategoriSecenekleri: kategoriSecenekleri,
    num: num, tri: tri, txt: txt, norm: norm,
    emptyItem: emptyItem, fill: fill, derive: derive, eksikler: eksikler,
    parse: parse, mergeCatalog: mergeCatalog,
    nf: nf, kg: kg, m3: m3, olcu: olcu, baslik: baslik, etiket: etiket,
    itemsToCsv: itemsToCsv, csvParse: csvParse, rowsToProducts: rowsToProducts,
    /* katalog/ürün için QR metni üretir (kompakt JSON) */
    toQrText: function (p) {
      var o = { v: 1, tur: 'urun' };
      ['kod', 'ad', 'kategori', 'kg', 'm3', 'en', 'boy', 'yukseklik', 'varis', 'musteri', 'telefon', 'not'].forEach(function (k) {
        if (p[k] != null && p[k] !== '') o[k] = p[k];
      });
      if (p.kirilgan != null) o.kirilgan = p.kirilgan ? 1 : 0;
      if (p.istifle != null) o.istifle = p.istifle ? 1 : 0;
      return JSON.stringify(o);
    }
  };

  global.Products = Products;
})(typeof window !== 'undefined' ? window : globalThis);
