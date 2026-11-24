# QR Ürün Kayıt — Özet ve Entegrasyon Parametreleri

> Bu doküman, yapılan işin özetini ve sistemi kendi koduna/ERP'ne bağlamak için
> gereken **tüm parametreleri** (veri şeması, QR formatları, dosya biçimleri, kurallar) içerir.

---

## 1) Özet — ne yapıldı

- **İki ekranlı sade uygulama** (`index.html`):
  - **Tarama** — QR okut: kayıtlı ürünse bilgileri anında gelir (kayıt değişmez), yeni kodsa kayıt olur.
  - **Ürünler** — elle ekle, ara, tekli/toplu sil, yedek al/yükle, **PC'den çek**, tümünü sil.
- **Etiket üreticisi** (`etiket.html`) ayrı katalog değil; ana uygulama ile **aynı listeyi** (`items` store) kullanır.
  CSV/JSON içe-dışa aktarma, A4 etiket yazdırma, `urunler.json` üretme.
- **"Silince geri geliyor" çözüldü:** eski sürümlerden kalan aynı kodlu tekrarlar açılışta otomatik birleşir;
  örnek veri tohumlaması kaldırıldı. Silme kalıcı (IndexedDB'den düşer).
- **PC → telefon:** PC'de `urunler.json` üret → telefon "PC'den çek" ile tek dokunuşla alır
  (kod ile birleştirir, telefondaki daha yeni kaydın üstüne yazmaz, önbelleğe takılmaz).
- **Bilgi erişimi:** etiket QR'ı tüm ürün bilgilerini taşır; internet/senkronizasyon gerekmez.
  QR yalnız kod içeriyorsa telefon kendi kaydından tamamlar.
- Sunucu yok, veriler cihazda (IndexedDB). PWA — çevrimdışı açılır. Sürüm: `qr-yukleme-v12`.

### Dosyalar

| Dosya | Görev |
|---|---|
| `index.html` | Ana uygulama (Tarama + Ürünler) |
| `etiket.html` | Ürün listesi yönetimi + QR etiket yazdırma |
| `kurulum.html` | Kullanım kılavuzu (telefonda çalıştırma, formatlar, sorun giderme) |
| `js/products.js` | **Alan şeması, alias'lar, QR ayrıştırma/üretme, CSV** |
| `js/validate.js` | Doğrulama kurallarının tek kaynağı |
| `js/storage.js` | IndexedDB katmanı (`qr-yukleme`) |
| `js/views.js` | Ürün listesi, seçim/toplu silme, yedek, PC'den çek |
| `js/items.js` | Kayıt/QR sorgulama akışı, editör |
| `urunler.json` | *(opsiyonel)* PC→telefon senkron dosyası (kök klasörde aranır) |

---

## 2) Ürün kayıt şeması (entegrasyonun çekirdeği)

Her ürün düz bir JSON nesnesidir:

| Alan | Tip | Zorunlu | Açıklama / kural |
|---|---|:-:|---|
| `kod` | string | ✅ | Ürün kodu (anahtar gibi kullan; tekilleştirme buna göre yapılır). Boşluk kabul etmez, otomatik büyük harfe çevrilir |
| `ad` | string | ✅ | Ürün adı |
| `kategori` | string | | **16 sabit değerden biri** (açılır liste, `js/products.js → KATEGORILER`): Elektronik · Cam / Seramik · Mobilya · Metal / Mekanik · Plastik Eşya · Ahşap Eşya · Tekstil / Yumuşak · Kitap / Kağıt · Mutfak / Ev Gereci · Sanat / Müzik Aleti · Uzun / Düzensiz Yük · Sıvı / Sızıntı Riski · Isı / Nem / Hijyen · Pil / Batarya · Tıbbi / Laboratuvar · Beyaz Eşya / Makine. Eski/serbest metinler okunabilir ama kayıtta listeden seçim istenir |
| `kg` | sayı | ✅* | Ağırlık (kg). Ondalık kabul edilir (12,75 / 12.75) |
| `m3` | sayı | ✅* | Hacim (m³). Boşsa en×boy×yükseklik'ten otomatik hesaplanır |
| `en` | sayı | | Genişlik (cm) |
| `boy` | sayı | | Uzunluk (cm) |
| `yukseklik` | sayı | | Yükseklik (cm) |
| `kirilgan` | `true/false/null` | ✅ | Kırılır mı? `null` = bilinmiyor. `true` ise `istifle` otomatik `false` olur |
| `istifle` | `true/false/null` | | Üstüne istiflenir mi? |
| `varis` | string | ✅ | Varış noktası. `Şehir / İlçe` biçimine normalize edilir (örn. `ankara cantay` → `Ankara / Çankaya`) |
| `musteri` | string | | Müşteri/alıcı |
| `telefon` | string | | `0` + 10 hane, kompakt saklanır (`05321112233`); gösterim gruplu (`0532 111 22 33`) |
| `not` | string | | Serbest not |
| `adet` | sayı (1–999) | | Varsayılan 1 |
| `id` | string | (otomatik) | Kayıt kimliği — uygulamada üretilir, dışarıdan verilmesine gerek yok |
| `zaman` | sayı (ms) | (otomatik) | Kayıt/güncelleme zaman damgası (`Date.now()`). Birleştirmede "hangisi yeni" kıyası bundan yapılır |
| `kaynak` | string | (otomatik) | `qr` / `manuel` vb. — iç bilgi |
| `ham` | string | (otomatik) | Okunan ham QR metni (en fazla 1200 karakter) — iç bilgi |
| `hacimKaynagi` | string | (otomatik) | `qr` / `hesap` — iç bilgi |

\* `m3` ölçülerden hesaplanabildiği için, üç ölçüden biri verilmişse zorunlu değildir.
Zorunlu alanlar: **kod, ad, kg, varis** (+ kırılganlık seçimi kayıt formunda zorunludur).

---

## 3) Depolama (IndexedDB) — telefondan veri okuma

```
veritabanı : qr-yukleme   (sürüm 1)
store      : items        keyPath: "id"   indexler: kod, zaman, seferId (legacy)
```

Kendi kodundan okuma örneği:

```js
const db = await new Promise((res, rej) => {
  const r = indexedDB.open('qr-yukleme', 1);
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const urunler = await new Promise(res => {
  const q = db.transaction('items', 'readonly').objectStore('items').getAll();
  q.onsuccess = () => res(q.result);
});
// urunler: §2'deki şemada düz nesneler dizisi
```

Diğer store'lar: `products` (legacy katalog aynası, keyPath `kod`), `kv` (ayarlar, keyPath `k`),
`sefers` (legacy). Entegrasyon için yalnız **`items`** yeterlidir.

---

## 4) QR kod formatları (okunan her biçim)

Uygulama 4 QR biçimini tanır. Kendi ERP'n QR basıyorsa bunlardan birine uydurman yeterli.

### a) JSON (önerilen — tüm bilgi QR içinde)

```json
{"v":1,"tur":"urun","kod":"URN-7001","ad":"Buzdolabı NoFrost","kg":85,"m3":0.94,
 "en":70,"boy":70,"yukseklik":192,"kirilgan":1,"istifle":0,
 "varis":"İstanbul / Kadıköy","musteri":"Mehmet Demir","telefon":"05321112233","not":"..."}
```

- `tur:"urun"` ve `v:1` ön koşuldur; diğer alanların tamamı opsiyoneldir (boş olan yazılmaz).
- `kirilgan` / `istifle`: `1 | 0` (veya `true/false`).
- Alan adları §6 alias tablosundan tanınır (`agirlikKg` de olur, `kg` de).
- Uygulamanın ürettiği biçim: `Products.toQrText(urun)` (`js/products.js`).

### b) Boru ayrımlı kısa satır

```
QRV1|URN-7001|Cam yemek masası|Mobilya|45|0.65|120|80|75|1|0|Ankara / Çankaya|Mehmet Demir|05052223344|Cam köşeleri koru|1
```

Sıra: `tur|kod|ad|kategori|kg|m3|en|boy|yukseklik|kirilgan|istifle|varis|musteri|telefon|not|adet`
(son alanlar kısaltılabilir; en azından `kod` dolmalı).

### c) Bağlantı (URL)

```
https://firmam.com/urun/URN-2001?kg=45&m3=0.65&kirilgan=1&varis=Ankara
```

Sorgu parametreleri alias tablosundan tanınır; `kod` hem yoldan hem parametreden alınır.

### d) Yalnız kod

```
URN-2001
```

Telefon ürünü daha önce gördüyse (etiket okuttuysa veya `urunler.json`'dan çektiyse)
bilgileri kendi kaydından getirir. Görmediyse kayıt formu açılır.

**Okuma davranışı:** kod listede varsa → yalnız **bilgi gösterilir** (kayıt değişmez, kopya olmaz).
QR zengin içerikliyse (ad + kg/m3/varis dolu) → sessizce kaydedilip bilgi gösterilir.
QR yoksulsa (yalnız kod) ve tanımsızsa → form açılır.

---

## 5) Dosya formatları (PC ↔ telefon)

### JSON tam yedek — `Ürünler → Yedek al`

```json
{
  "app": "qr-yukleme",
  "surum": 1,
  "tarih": "2026-10-27T20:00:00.000Z",
  "items":    [ { ...§2 şemasında ürünler... } ],
  "products": [ ... ],
  "kv":       [ { "k": "settings", "v": { ... } } ],
  "sefers":   [ ... ]
}
```

`Yedekten yükle` bu dosyayı kabul eder (`items` dizisi varsa mevcut listenin yerine geçer).
Eski `{"tur":"urunListesi"|"sefer","urunler":[...]}` dosyaları da desteklenir → ürünlere **eklenir**.

### Senkron dosyası — `urunler.json` (PC → telefon, "🔄 PC'den çek")

Kendi kodun bu dosyayı üretip uygulamanın servis edildiği klasöre koysan yeter;
telefon `GET urunler.json` ile çeker (önbellek devre dışı, her zaman taze):

```json
{
  "tur": "urunListesi",
  "tarih": "2026-10-27T00:00:00.000Z",
  "urunler": [
    { "kod": "PC-9001", "ad": "Buzdolabı", "kg": 85, "m3": 0.94,
      "en_cm": 70, "boy_cm": 70, "yukseklik_cm": 192,
      "kirilgan": "HAYIR", "istiflenebilir": "HAYIR",
      "varisNoktasi": "İstanbul / Kadıköy", "musteri": "...", "telefon": "0532 111 22 33", "not": "..." }
  ]
}
```

- Üst düzey anahtar fark etmez: `urunler` / `items` / `products` ya da doğrudan dizi.
- Birleştirme **kod** ile: yeni kod → eklenir; mevcut kod → yalnız **boş alanlar** doldurulur,
  kayıt seninkinden yeni ise zamanı güncellenir. **Asla silme yapmaz, telefondaki dolu alanı bozmaz.**
- Örnek: `ornek-veri/urunler-ornek-senkron.json`

### CSV (Excel uyumlu) — etiket ekranı içe/dışa aktarma

- Ayraç **`;`**, kodlama **UTF-8 BOM'lu**, ondalık **virgül** (`0,0017`) — Türkçe Excel çift tıkla açar.
- Başlık satırı serbest sırada olabilir; kolon adları alias'tan tanınır (§6).
- Şablon: etiket ekranı → 📄 CSV şablonu (`urun-sablonu.csv`).

```csv
kod;ad;kategori;agirlikKg;hacimM3;en_cm;boy_cm;yukseklik_cm;kirilgan;istiflenebilir;varisNoktasi;musteri;telefon;not
URN-1001;Çamaşır makinesi 8 kg;Beyaz eşya;68;0,31;60;60;85;HAYIR;EVET;İstanbul / Kadıköy;Ayşe Yılmaz;0532 000 00 00;Hortum arka tarafta
```

---

## 6) Alan adı esnekliği (alias tablosu)

Dış sistemden gelen JSON/CSV/QR'da aşağıdaki adların **herhangi biri** kullanılabilir
(küçük harf, Türkçe karakter toleranslı; `js/products.js → ALIAS`):

| Hedef alan | Kabul edilen adlar (başlıcaları) |
|---|---|
| `kod` | kod, urun_kodu, barkod, stok, sku, id, no |
| `ad` | ad, isim, urun, urunadi, malzeme, name, title, desc |
| `kategori` | kategori, tip, cins, grup |
| `kg` | kg, agirlik, agirlikKg, netagirlik, weight |
| `m3` | m3, hacim, hacimM3, metrekup, volume |
| `en` | en, en_cm, genislik, genislik_cm, width |
| `boy` | boy, boy_cm, uzunluk, uzunluk_cm, length |
| `yukseklik` | yukseklik, yukseklik_cm, height, yuk |
| `kirilgan` | kirilgan, kirilganmi, dikkat, fragile, KINK |
| `istifle` | istifle, istiflenebilir, ustunebiner, stackable |
| `varis` | varis, varisNoktasi, hedef, sehir, ilce, destination, lokasyon |
| `musteri` | musteri, alici, customer, client, sube, bayi |
| `telefon` | telefon, tel, gsm, phone |
| `not` | not, notlar, remark, comment |
| `adet` | adet, qty, quantity, koli |

**Evrensel değer dönüşümleri:**
- Üç durumlu alanlar: `EVET/E/e/1/true/kırılgen` → `true` · `HAYIR/H/n/0/false/yok` → `false` · boş → `null`
- Sayılar: `12,75` ve `12.75` ikisi de; binlik ayraç tanınır
- `m3` yoksa üç ölçüden hesaplanır: `en×boy×yukseklik / 1.000.000`

---

## 7) Doğrulama kuralları (kayda kabul için)

| Kural | Davranış |
|---|---|
| kod/ad/varış/kg zorunlu | formda satır içi hata, kaydetmez; QR'dan gelen zengin kayıt sessiz kaydedilir |
| telefon | `0` + 10 hane (11 hane), 2. hane 2/3/4/5; `+90…` otomatik `0…`'a çevrilir |
| adet | 1–999 tam sayı |
| varış | `Şehir / İlçe` biçimine otomatik çevrilir |
| kırılacak + istiflenir | aynı anda `true` olamaz; biri seçilince diğeri kapanır |
| uyarılar (kaydı engellemez) | yoğunluk < 8 kg/m³ veya > 2600 kg/m³; girilen m³, ölçü hesabından %15 büyükse |

Tek kaynak: `js/validate.js` (`kayitKontrol(item, opts)` → `{alan, duzey:'hata'|'uyari', mesaj}[]`).

---

## 8) Tipik entegrasyon senaryoları

**A. ERP'den ürünleri telefona akıt**
ERP raporu §5 `urunler.json` biçiminde yazsın → klasöre koy → telefonda "PC'den çek".

**B. ERP kendi QR'ını basıyor**
QR içeriğini §4a JSON yap (yalnız `kod` bile yeter — telefon listesi senkronsa bilgi oradan gelir).

**C. Telefonda biriken veriyi merkeze döndür**
`Ürünler → Yedek al` JSON'unu (`items` dizisi) merkeze gönder, ya da §3'teki gibi
doğrudan IndexedDB'den okuyan bir ekran ekle.

**D. Uygulamayı tamamen kendi arayüzüne göm**
`index.html` + `js/*` bağımsız çalışır (sunucu/library yok). Sayfayı iframe/yeni sekme ile çağır;
veri aynı cihazda `items` store'unda seni bekler.

### Dağıtım notları

- Kamera izni yalnız **HTTPS/localhost**'ta: klasörü [Netlify Drop](https://app.netlify.com/drop)'a sürükle, `https://…` adresini telefonlara ver.
- `urunler.json` güncellemek için dosyayı sunucuya tekrar koy (Netlify'da klasörü yeniden sürükle).
- Kod değişikliğinden sonra telefondaki PWA önbelleği: `sw.js → SURUM` **ve** `index.html` +
  `etiket.html` içindeki script `?v=` parametresi **birlikte** artırılır (örn. v13 → ?v=13).
  Sayfalardaki self-heal bekçisi, karışık sürüm tespit ederse önbelleği kendi temizler.
- Geliştirici testi yaparken önce SW unregister + `caches.clear` + `indexedDB.deleteDatabase('qr-yukleme')` (aksi hâlde eski JS servis edilebilir).
