# QR Ürün Kayıt 📦

**Telefon kamerasıyla QR okuyarak** ürün kaydeden/sorgulayan, tamamen bilgisayarda/telefonda çalışan (sunucusuz),
en sade hâliyle tasarlanmış arayüz. Ürün ekle → QR üret → ürüne yapıştır → gerektiğinde QR’ı okut, bilgileri
(kod, ağırlık, hacim, ölçü, kırılganlık, varış, müşteri, telefon, not, adet) anında gelsin. Liste/özet/ayarlar
kalabalığı yok; veriler cihazda kalır, kendi koduna entegrasyon için IndexedDB (`qr-yukleme` → `items`) veya JSON yedek yeterlidir.

## Dosyalar

```
index.html            Tarama + Ürünler (ana uygulama — iki ekran)
etiket.html           Ürün kataloğu + QR etiket üretimi / A4 yazdırma
kurulum.html          Telefonda çalıştırma, QR formatı, sorun giderme
css/app.css           Arayüz (mobil öncelikli, koyu tema, çevrimdışı)
js/storage.js         IndexedDB veri katmanı (items / products / kv + legacy sefers)
js/products.js        QR metnini ürün kaydına çevirme, alan eşleştirme, CSV
js/validate.js        Veri şablonu: alan kuralları, otomatik biçimlendirme, denetim raporu
js/scanner.js         Kamera + QR motoru (BarcodeDetector, yedek jsQR), fotoğraftan okuma
js/qrmake.js          QR üretimi (ürün kaydından otomatik QR: önizleme, PNG, etiket)
js/core.js            Ortak yardımcılar, durum (state), kayıt kaydetme
js/items.js           Ürün ekleme / QR ile sorgulama / düzenleme / silme, editör
js/scan.js            Kamera kontrolü, okuma akışı, el terminali girişi
js/views.js           Ürün listesi, veri işlemleri (yedek/geri yükle/sil), açılış
js/labels.js          Etiket üreticisi mantığı
vendor/jsQR.js        QR çözücü (çevrimdışı, lisans: Apache-2.0)
vendor/qrcode-generator.js  QR üretici (etiketler için, MIT)
ornek-veri/           Örnek ürün kataloğu (CSV/JSON) + QR metin örnekleri
```

## Hızlı başlangıç

1. **Telefonlarda çalıştırma (kamera için HTTPS şart):** klasörü [Netlify Drop](https://app.netlify.com/drop)
   sayfasına sürükleyin ya da GitHub Pages ile yayınlayın, çıkan `https://…` linkini telefonda açın →
   *Ana ekrana ekle*. Ayrıntı: `kurulum.html`.
2. **Etiketler (QR otomatik oluşur):** `etiket.html` → ürün bilgilerini yazdığın an QR önizlemesi hazır olur;
   *Kataloğa kaydet* → *Etiketleri hazırla / yazdır* ile A4 etiket. Tek ürün için PNG indirme de var.
   Ana uygulamada da (ürün bilgisi → *🔳 QR göster*) ürünün QR’ını anında görüp PNG indirebilirsin.
   Excel’den toplu kayıt için `ornek-veri/urunler.csv` şablonunu içe aktar.
3. **Kullanım:** `index.html` → **Tarama** → kamerayı başlat → QR okut. Kayıtlı ürünse bilgileri açılır,
   yeni kodsa form dolur ve kaydedersin. Ürünleri **Ürünler** sekmesinden yönetirsin (ekle / ara / sil).

Bilgisayarda sadece arayüzü görmek isterseniz: `baslat.bat` (veya `python -m http.server 8080`) →
<http://localhost:8080>. Not: `localhost` dışında `http://` ile açıldığında tarayıcı kamera izni vermez.

## QR formatı

Uygulama 4 tür içeriği tanır (ayrıntı `kurulum.html` ve `ornek-veri/qr-ornekleri.txt`):

| Tür | Örnek |
| --- | --- |
| JSON | `{"v":1,"kod":"URN-2001","ad":"Cam masa","kg":45,"m3":0.65,"en":120,"boy":80,"yukseklik":75,"kirilgan":1,"varis":"Ankara / Çankaya"}` |
| Kısa satır | `QRV1\|URN-2001\|Cam masa\|Mobilya\|45\|0.65\|120\|80\|75\|1\|0\|Ankara\|Ali\|0505…\|dikkat\|1` |
| URL | `https://firmam.com/urun/URN-2001?kg=45&varis=Ankara` |
| Sadece kod | `URN-2001` → telefon kataloğundaki kayıttan tamamlanır |

Esnek alan eşleştirme: `agirlik/ağırlık/kg`, `hacim/m3`, `en/genişlik/width`, `boy/uzunluk/length`,
`yükseklik/height`, `kırılgan/kirilgan/EVET/1`, `istifle/istiflenebilir/stackable`,
`varış/varisNoktasi/hedef/şehir`, `müşteri/alıcı`, `koli/adet`.
Hacim boşsa ölçülerden hesaplanır; **kırılacak = true** ise “üstüne istiflenir” otomatik kapatılır.

## Veri modeli

- **items** – kalıcı ürün listesi (tek liste, sefer ayrımı yok): kod, ad, kategori, kg, m³, en/boy/yükseklik,
  kırılgan, istiflenebilir, varış, müşteri, telefon, not, adet, zaman, ham QR metni
- **products** – ürün kataloğu (yalnızca kod okuyan QR’ları tamamlamak için)
- **kv** – ayarlar
- **sefers** – eski sürüm yedeklerinde kaldığı için duran boş store; yeni kayıt yazılmaz

## Veri şablonu (hatalı giriş engellenir)

Kuralların tek kaynağı `js/validate.js`; kurala uymayan kayıt **kaydedilmez** ve hata alanın altında gösterilir.

| Alan | Kural |
|---|---|
| Ürün kodu * | 3–30 karakter, büyük harf, boşluksuz; `A-Z 0-9 - _ . /` + Türkçe harf (otomatik büyütülür) |
| Ürün adı * | 3–70 karakter, salt rakam olamaz, CSV bozan işaretler temizlenir |
| Ağırlık (kg) * | 0,05 – 5.000 (`12,75` veya `1.240` kabul edilir) |
| Hacim (m³) * | 0,0005 – 120; boşsa ölçülerden hesaplanır, ölçü de yoksa kayıt yok |
| En/Boy/Yükseklik | 1 – 600 cm; üçü birlikte girilir |
| Adet | 1 – 999 tam sayı |
| Kırılacak mı? * | Kırılacak / kırılmaz seçilmeden kayıt yapılamaz |
| Varış noktası * | `Şehir / İlçe` biçimine otomatik çevrilir (ör. `ankara cantay` → `Ankara / Çankaya`) |
| Telefon | Yazarken maske: sadece rakam, en fazla 11 hane (**12. hane yazılamaz**), başa 0 otomatik; `+90 532 111 22 33` → `0532 111 22 33` |
| Müşteri / Not | ≤ 50 / ≤ 120 karakter |

**Uyarılar (kayıt engellenmez):** yoğunluk 8 kg/m³ altı veya 2.600 kg/m³ üstü (kg↔m³ karışması / gram yazılmış),
hacmin ölçülerden %15 büyük olması, kırılgan + istiflenir çelişkisi.

**Denetim noktaları:** formda her alan satır içi denetlenir, hatalıysa **kaydetmez** · taramada eksik QR gelirse form
açılır (tarama durur, tamamlanınca devam) · içe aktarmada kurala uymayan satırlar alınmaz ve nedeni raporlanır ·
aynı kodla ikinci kayıt açılamaz (kayıtlı kod taranınca bilgi gösterilir, elle eklenirse mevcut kayıt açılır).

## Ekipçe kullanım / entegrasyon

- **Ürünler → Yedek al**: tüm veriyi (`items` dizisi) tek JSON dosyası indirir; **Yedekten yükle** başka
  telefonda geri yükler/ekler. Koduna entegrasyon için bu JSON’u veya doğrudan IndexedDB `qr-yukleme` → `items`
  store’unu okuyabilirsin — kayıt şeması düzdür (yukarıdaki alanlar).
- Etiket üreticisinin CSV’si (etiketten eklenen/içe aktarılan ürünler **aynı listeye** düşer) Türkçe Excel
  uyumludur (`;` ayraç, BOM, **virgüllü ondalık** – `0,0017`; nokta bırakılsaydı
  Excel sayıları tarih/metne çevirirdi).
- Liste kalıcıdır. Sıfırdan başlamak için önce **Yedek al**, sonra **Tümünü sil**.
- **PC → telefon:** PC’de ürünleri *etiket.html*’de hazırla (elle veya Excel CSV’siyle içe aktar),
  *⬇️ urunler.json (PC→telefon)* ile indirip uygulamanın çalıştığı klasöre koy; telefonda
  **Ürünler → 🔄 PC’den çek** tek dokunuşla listeyi alır (kod ile birleştirir, telefondaki yeni
  kayıtlara dokunmaz, dosya önbelleğe takılmaz). Uzak senaryoda *⬆️ JSON dışa aktar* dosyasını
  WhatsApp/USB ile telefona atıp **Yedekten yükle** de kullanılabilir.

## Kendi koduna entegrasyon

Her ürün kaydı; ağırlık, hacim, üç eksen ölçüsü, kırılganlık (≠ üstüne konulmaz), istiflenebilirlik ve varış
noktası içerir. `Ürünler → Yedek al` JSON’undaki `items` dizisi veya cihazdaki IndexedDB
(`qr-yukleme` veritabanı → `items` store) kendi yerleşim/planlama/ERP koduna doğrudan beslenebilir.

**Tüm entegrasyon parametreleri (şema, QR formatları, urunler.json, CSV, alias'lar, kurallar):
👉 [ENTEGRASYON.md](ENTEGRASYON.md)**

## Lisanslar

- `vendor/jsQR.js` — Apache-2.0 (coinabout)
- `vendor/qrcode-generator.js` — MIT (Kazuhiko Arase)
