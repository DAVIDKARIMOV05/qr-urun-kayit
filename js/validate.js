/* validate.js — veri şablonu ve doğrulama kuralları
 * Amaç: hatalı/eksik veri girişini engellemek (telefon, plaka, kod, sayı aralıkları, varış biçimi)
 * kullanim: V.kayitKontrol(item) -> [{alan, duzey:'hata'|'uyari', mesaj}]
 */
(function (global) {
  'use strict';

  var P = global.Products;

  /* ---------- şablon sınırları (tek yerden yönetilir) ---------- */
  var SINIR = {
    kod: { min: 3, max: 30 },
    ad: { min: 3, max: 70 },
    kategori: { min: 2, max: 30 },
    kg: { min: 0.05, max: 5000, basamak: 2 },
    m3: { min: 0.0005, max: 120, basamak: 4 },
    cm: { min: 1, max: 600, basamak: 1 },
    adet: { min: 1, max: 999 },
    varis: { min: 3, max: 60 },
    musteri: { max: 50 },
    not: { max: 120 },
    yogunlukMin: 8,      /* kg/m3 - bundan küçükse kg/m3 karışmış şüphesi */
    yogunlukMax: 2600    /* kg/m3 - bundan büyükse gram yazılmış şüphesi */
  };

  var ALAN = {
    kod: 'Ürün kodu', ad: 'Ürün adı', kategori: 'Kategori', kg: 'Ağırlık (kg)',
    m3: 'Hacim (m³)', en: 'En (cm)', boy: 'Boy (cm)', yukseklik: 'Yükseklik (cm)',
    adet: 'Adet', varis: 'Varış noktası', musteri: 'Müşteri', telefon: 'Telefon',
    plaka: 'Plaka', kirilgan: 'Kırılacak mı?', not: 'Not'
  };

  /* ---------- biçimlendirme ---------- */
  function rakam(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }

  /* 0532 111 22 33 / +90 532 ... / 5321112233 -> 05321112233 */
  function telBicim(v) {
    var d = rakam(v);
    if (d.length === 12 && d.indexOf('90') === 0) d = '0' + d.slice(2);
    if (d.length === 10) d = '0' + d;
    if (d.length !== 11) return String(v || '').trim();
    return d.slice(0, 4) + ' ' + d.slice(4, 7) + ' ' + d.slice(7, 9) + ' ' + d.slice(9, 11);
  }

  /* yazarken maske: sadece rakam, en fazla 11 hane (12. hane yazılamaz),
   * başa 0 otomatik eklenir (+90/90 ile başlanırsa ülkesel kod sadeleşir),
   * 0'dan sonra 2/3/4/5 dışı rakam girilemez, gruplama 0532 111 22 33 */
  var TEL_ILK = '2345';
  function telGiris(v) {
    var s = String(v == null ? '' : v);
    var d = rakam(s);
    if (/^\s*\+?\s*90/.test(s) && d.indexOf('90') === 0) d = d.slice(2);
    if (!d.length) return '';
    if (d.charAt(0) === '0') {
      if (d.length > 1 && TEL_ILK.indexOf(d.charAt(1)) < 0) d = '0' + d.slice(2);
    } else {
      if (TEL_ILK.indexOf(d.charAt(0)) < 0) return '';
      d = '0' + d;
    }
    if (d.length > 11) d = d.slice(0, 11);
    var out = d.slice(0, 4);
    if (d.length > 4) out += ' ' + d.slice(4, 7);
    if (d.length > 7) out += ' ' + d.slice(7, 9);
    if (d.length > 9) out += ' ' + d.slice(9, 11);
    return out;
  }

  function plakaBicim(v) {
    var s = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    var m = s.match(/^(\d{2})([A-Z]{1,3})(\d{1,4})$/);
    if (!m) return String(v || '').toUpperCase().trim();
    return m[1] + ' ' + m[2] + ' ' + m[3];
  }

  /* kod: Türkçe harfli büyük harf, boşluksuz (şişe -> ŞİŞE, küçük Türkçe harfler de kabul edilir) */
  var KOD_DESEN = /^[A-Za-z0-9ÇĞÖŞÜİçğöşüı\-_.\/]*$/;
  function kodBicim(v) {
    return String(v || '').toLocaleUpperCase('tr-TR').replace(/\s+/g, '')
      .replace(/[^A-Z0-9ÇĞÖŞÜİçğöşüı\-_.\/]/g, '').slice(0, SINIR.kod.max);
  }

  /* Türkçe karakterleri düzelterek "istanbul/kadikoy" -> "İstanbul / Kadıköy" */
  var IL_DUZELTME = {
    'adana': 'Adana', 'adiyaman': 'Adıyaman', 'afyon': 'Afyonkarahisar', 'agri': 'Ağrı', 'aksaray': 'Aksaray',
    'amasya': 'Amasya', 'ankara': 'Ankara', 'antalya': 'Antalya', 'ardahan': 'Ardahan', 'artvin': 'Artvin',
    'aydin': 'Aydın', 'balikesir': 'Balıkesir', 'bartin': 'Bartın', 'batman': 'Batman', 'bayburt': 'Bayburt',
    'bilecik': 'Bilecik', 'bingol': 'Bingöl', 'bitlis': 'Bitlis', 'bolu': 'Bolu', 'burdur': 'Burdur',
    'bursa': 'Bursa', 'canakkale': 'Çanakkale', 'cankiri': 'Çankırı', 'corum': 'Çorum', 'denizli': 'Denizli',
    'diyarbakir': 'Diyarbakır', 'duzce': 'Düzce', 'edirne': 'Edirne', 'elazig': 'Elazığ', 'erzincan': 'Erzincan',
    'erzurum': 'Erzurum', 'eskisehir': 'Eskişehir', 'gaziantep': 'Gaziantep', 'giresun': 'Giresun',
    'gumushane': 'Gümüşhane', 'hakkari': 'Hakkâri', 'hatay': 'Hatay', 'igdir': 'Iğdır', 'isparta': 'Isparta',
    'istanbul': 'İstanbul', 'izmir': 'İzmir', 'kahramanmaras': 'Kahramanmaraş', 'karabuk': 'Karabük',
    'karaman': 'Karaman', 'kars': 'Kars', 'kastamonu': 'Kastamonu', 'Kayseri': 'Kayseri', 'kilis': 'Kilis',
    'kirikkale': 'Kırıkkale', 'kirklareli': 'Kırklareli', 'kirsehir': 'Kırşehir', 'kocaeli': 'Kocaeli',
    'konya': 'Konya', 'kutahya': 'Kütahya', 'malatya': 'Malatya', 'manisa': 'Manisa', 'mardin': 'Mardin',
    'mersin': 'Mersin', 'mugla': 'Muğla', 'mus': 'Muş', 'nevsehir': 'Nevşehir', 'nigde': 'Niğde',
    'ordu': 'Ordu', 'osmaniye': 'Osmaniye', 'rize': 'Rize', 'sakarya': 'Sakarya', 'samsun': 'Samsun',
    'sanliurfa': 'Şanlıurfa', 'siirt': 'Siirt', 'sinop': 'Sinop', 'sirnak': 'Şırnak', 'sivas': 'Sivas',
    'tekirdag': 'Tekirdağ', 'tokat': 'Tokat', 'trabzon': 'Trabzon', 'tunceli': 'Tunceli', 'usak': 'Uşak',
    'van': 'Van', 'yalova': 'Yalova', 'yozgat': 'Yozgat', 'zonguldak': 'Zonguldak'
  };

  function basHarf(s) {
    s = String(s || '').trim();
    if (!s) return '';
    return s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1).toLocaleLowerCase('tr-TR');
  }

  function varisBicim(v) {
    var s = String(v || '').replace(/\//g, ' / ').replace(/\s{2,}/g, ' ').trim();
    if (!s) return '';
    var parca = s.split('/').map(function (x) { return x.trim(); }).filter(Boolean);
    if (!parca.length) return '';
    /* "ankara cantay" gibi: ayraç yoksa ve birden çok kelime varsa ikinci kelime ilçedir */
    if (parca.length === 1) {
      var kelime = parca[0].split(/\s+/);
      if (kelime.length > 1) parca = [kelime[0], kelime.slice(1).join(' ')];
    }
    var duz = IL_DUZELTME[P.norm(parca[0])];
    var out = [duz || basHarf(parca[0])];
    for (var i = 1; i < parca.length; i++) out.push(basHarf(parca[i]));
    return out.join(' / ');
  }

  function adBicim(v) {
    return String(v || '').replace(/\s+/g, ' ').replace(/[;,\t]/g, ' ').trim().slice(0, SINIR.ad.max);
  }

  /* ---------- tek alan kontrolleri -> {ok, deger, mesaj} ---------- */
  function telKontrol(v) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return { ok: true, deger: '' };
    var d = rakam(s);
    if (d.length === 12 && d.indexOf('90') === 0) d = '0' + d.slice(2);
    if (d.length === 10) d = '0' + d;
    if (d.length !== 11) return { ok: false, deger: s, mesaj: '11 hane olmalı (0 ile başlayan cep telefonu)' };
    if (d.charAt(0) !== '0' || (d.charAt(1) !== '5' && d.charAt(1) !== '2' && d.charAt(1) !== '3' && d.charAt(1) !== '4')) {
      return { ok: false, deger: s, mesaj: '0 ile ve sonra 2/3/4/5 ile başlamalı (örn. 0532 111 22 33)' };
    }
    return { ok: true, deger: d, goster: telBicim(d) };
  }

  function plakaKontrol(v) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return { ok: true, deger: '' };
    var d = s.toUpperCase().replace(/[^A-Z0-9]/g, '');
    var m = d.match(/^(\d{2})([A-Z]{1,3})(\d{2,4})$/);
    if (!m) return { ok: false, deger: s, mesaj: 'Plaka biçimi: 34 ABC 123' };
    return { ok: true, deger: plakaBicim(s) };
  }

  function kodKontrol(v) {
    var s = kodBicim(v);
    if (!s) return { ok: false, deger: '', mesaj: 'Zorunlu' };
    if (s.length < SINIR.kod.min) return { ok: false, deger: s, mesaj: 'En az ' + SINIR.kod.min + ' karakter' };
    if (!KOD_DESEN.test(s)) return { ok: false, deger: s, mesaj: 'Sadece harf, rakam, - _ . / olabilir' };
    return { ok: true, deger: s };
  }

  function adKontrol(v) {
    var s = adBicim(v);
    if (!s) return { ok: false, deger: '', mesaj: 'Zorunlu' };
    if (s.length < SINIR.ad.min) return { ok: false, deger: s, mesaj: 'En az ' + SINIR.ad.min + ' karakter' };
    if (/^\d+$/.test(s)) return { ok: false, deger: s, mesaj: 'Sadece rakam olamaz' };
    return { ok: true, deger: s };
  }

  function varisKontrol(v, liste) {
    var s = varisBicim(v);
    if (!s) return { ok: false, deger: '', mesaj: 'Zorunlu' };
    if (s.length < SINIR.varis.min) return { ok: false, deger: s, mesaj: 'Şehir (varsa ilçe) yazın' };
    if (liste && liste.length && liste.indexOf(s) < 0 && liste.indexOf(s.toLocaleLowerCase('tr-TR')) < 0) {
      var bul = false;
      for (var i = 0; i < liste.length; i++) if (P.norm(liste[i]) === P.norm(s)) { bul = true; s = liste[i]; break; }
      if (!bul) return { ok: false, deger: s, mesaj: 'Kayıtlı varış noktalarından seçin (liste dışı engellendi)' };
    }
    return { ok: true, deger: s };
  }

  function kategoriKontrol(v) {
    var s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
    if (!s) return { ok: true, deger: '' };
    if (!P.KATEGORILER || P.KATEGORILER.indexOf(s) === -1)
      return { ok: false, deger: s, mesaj: 'Listeden seçim yapın (16 sabit kategori)' };
    return { ok: true, deger: s };
  }

  function sayiKontrol(v, alan) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return { ok: false, deger: null, mesaj: 'Zorunlu' };
    var n = P.num(s, alan === 'kg');
    if (n == null) return { ok: false, deger: null, mesaj: 'Sayı yazın (örn. 12,75)' };
    var lim = alan === 'en' || alan === 'boy' || alan === 'yukseklik' ? SINIR.cm
      : alan === 'kg' ? SINIR.kg
        : alan === 'm3' ? SINIR.m3
          : alan === 'adet' ? SINIR.adet : null;
    if (lim) {
      if (n < lim.min) return { ok: false, deger: n, mesaj: 'En az ' + P.nf(lim.min, 2) + ' olmalı' };
      if (n > lim.max) return { ok: false, deger: n, mesaj: 'En fazla ' + P.nf(lim.max, 0) + ' olabilir' };
    }
    if (alan === 'adet') {
      if (Math.round(n) !== n) return { ok: false, deger: n, mesaj: 'Tam sayı olmalı' };
    }
    return { ok: true, deger: n };
  }

  /* ---------- kayıt bazlı kontrol: hata + uyarı ---------- */
  function kayitKontrol(item, opts) {
    opts = opts || {};
    var out = [];
    function e(alan, mesaj) { out.push({ alan: alan, duzey: 'hata', mesaj: mesaj }); }
    function w(alan, mesaj) { out.push({ alan: alan, duzey: 'uyari', mesaj: mesaj }); }

    var r;
    r = kodKontrol(item.kod); if (!r.ok) e('kod', r.mesaj);
    r = adKontrol(item.ad); if (!r.ok) e('ad', r.mesaj);

    if (item.kg == null || item.kg === '') e('kg', 'Zorunlu');
    else { r = sayiKontrol(item.kg, 'kg'); if (!r.ok) e('kg', r.mesaj); }

    var olcuVar = item.en != null && item.boy != null && item.yukseklik != null;
    if (item.m3 == null || item.m3 === '') {
      if (!olcuVar) e('m3', 'Zorunlu (hacim veya ölçü girin)');
    } else { r = sayiKontrol(item.m3, 'm3'); if (!r.ok) e('m3', r.mesaj); }

    ['en', 'boy', 'yukseklik'].forEach(function (a) {
      if (item[a] != null && item[a] !== '') {
        var k = sayiKontrol(item[a], a);
        if (!k.ok) e(a, k.mesaj);
      }
    });
    if ((item.en != null) + (item.boy != null) + (item.yukseklik != null) === 2) {
      e('yukseklik', 'Ölçüler ya hepsi girilmeli ya hiçbiri');
    }

    if (item.adet != null) { r = sayiKontrol(item.adet, 'adet'); if (!r.ok) e('adet', r.mesaj); }

    if (item.kirilgan == null && opts.kirilganZorunlu !== false) {
      e('kirilgan', 'Kırılacak / kırılmaz seçilmeli');
    }

    r = varisKontrol(item.varis, opts.varisListesi);
    /* katalog kayıtlarında varış zorunlu değil (ürün kartı), yazıldıysa biçim denetlenir */
    if (!r.ok && !(opts.mod === 'katalog' && !String(item.varis || '').trim())) e('varis', r.mesaj);

    r = telKontrol(item.telefon); if (!r.ok) e('telefon', r.mesaj);
    r = kategoriKontrol(item.kategori); if (!r.ok) e('kategori', r.mesaj);
    if (item.musteri && String(item.musteri).length > SINIR.musteri) e('musteri', 'En fazla ' + SINIR.musteri + ' karakter');
    if (item.not && String(item.not).length > SINIR.not) e('not', 'En fazla ' + SINIR.not + ' karakter');

    /* tutarlılık uyarıları (veri kalitesi) */
    var kg = P.num(item.kg), m3 = P.num(item.m3);
    if (kg != null && m3 != null && kg > 0 && m3 > 0) {
      var yogun = kg / m3;
      if (yogun < SINIR.yogunlukMin) w('kg', 'Yoğunluk çok düşük (' + P.nf(yogun, 0) + ' kg/m³) — kg ile m³ yer değiştirmiş olabilir');
      else if (yogun > SINIR.yogunlukMax) w('kg', 'Yoğunluk çok yüksek (' + P.nf(yogun, 0) + ' kg/m³) — gram yazılmış olabilir');
      if (olcuVar) {
        var kutu = item.en * item.boy * item.yukseklik / 1000000;
        if (kutu > 0 && m3 > kutu * 1.15) w('m3', 'Hacim, ölçülerden büyük (' + P.nf(kutu, 3) + ' m³ sığar) — kontrol edin');
      }
    }
    if (item.kirilgan === true && item.istifle === true) w('istifle', 'Kırılacak ürün istiflenemez olarak işaretli olmalı');
    if (item.kirilgan == null && opts.kirilganZorunlu === false) w('kirilgan', 'Kırılganlık bilgisi boş — yerleşim planı için gerekli');

    out.hataSayisi = out.filter(function (x) { return x.duzey === 'hata'; }).length;
    out.uyariSayisi = out.length - out.hataSayisi;
    return out;
  }

  /* temizlik: alanları şablona göre düzeltir, {item, hatalar} */
  function duzelt(item, opts) {
    var r;
    item.kod = kodKontrol(item.kod).deger || item.kod;
    item.ad = adKontrol(item.ad).deger || item.ad;
    item.kategori = kategoriKontrol(item.kategori).deger;
    item.varis = varisBicim(item.varis);
    r = telKontrol(item.telefon); item.telefon = r.ok ? r.deger : String(item.telefon || '').trim();
    item.musteri = String(item.musteri || '').replace(/\s+/g, ' ').trim();
    item.not = String(item.not || '').replace(/\s+/g, ' ').trim();
    if (item.telefon) item.telefonGoster = telBicim(item.telefon);
    return item;
  }

  /* toplu rapor (CSV/JSON içe aktarma + veri kontrolü ekranı) */
  function listeRaporu(items, opts) {
    var r = { gecerli: 0, hatali: 0, uyari: 0, satirlar: [] };
    items.forEach(function (it) {
      var k = kayitKontrol(it, opts);
      if (k.hataSayisi) { r.hatali++; } else { r.gecerli++; if (k.uyariSayisi) r.uyari++; }
      if (k.length) r.satirlar.push({ id: it.id, kod: it.kod || '(kodsuz)', ad: it.ad || '', hatalar: k });
    });
    return r;
  }

  global.V = {
    SINIR: SINIR, ALAN: ALAN,
    telBicim: telBicim, telGiris: telGiris, plakaBicim: plakaBicim, kodBicim: kodBicim,
    varisBicim: varisBicim, adBicim: adBicim,
    telKontrol: telKontrol, plakaKontrol: plakaKontrol, kodKontrol: kodKontrol,
    adKontrol: adKontrol, varisKontrol: varisKontrol, kategoriKontrol: kategoriKontrol,
    sayiKontrol: sayiKontrol, kayitKontrol: kayitKontrol, duzelt: duzelt, listeRaporu: listeRaporu
  };
})(typeof window !== 'undefined' ? window : globalThis);
