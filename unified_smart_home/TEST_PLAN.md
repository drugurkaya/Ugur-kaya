# Test Planı ve Sonuçları

Tek komut: `USH_HA_VENV=<homeassistant kurulu venv> scripts/run_tests.sh`.
Bu komut geçici bir dizinde **gerçek bir Home Assistant 2026.2.3 çekirdeği** başlatır (yalnızca
127.0.0.1), ilk kurulumu otomatik yapar, testleri çalıştırır ve dizini siler.

> **Gerçek donanım:** Tüm cihazlar HA'nın resmî `demo` entegrasyonundan gelir ve **simüle**dir.
> Arayüzde de "SİMÜLASYON" olarak etiketlenirler. Aşağıdaki sonuçların hiçbiri gerçek bir Xenon
> Smart, Sonoff veya başka bir fiziksel cihazla yapılmadı.

## Son çalıştırma — 2026-10-21 (temiz geçici HA ile)

| Grup | Ne ile | Sonuç |
|---|---|---|
| Statik analiz (eslint) | `app/js`, `tests` | Hata yok |
| Birim testleri | Node test çalıştırıcısı, sahte WebSocket/zamanlayıcı, gerçek HA'dan alınmış veri | **68 / 68 geçti** |
| Entegrasyon + güvenlik | Gerçek HA çekirdeği, uygulamanın kendi `core` kodu | **22 / 22 geçti** |
| Arayüz (uçtan uca) | Chromium + iPhone emülasyonu + gerçek HA | **17 / 17 geçti** |

## Birim testleri (`tests/unit`)

- **Cihaz modeli:** gerçek HA verisinden model; yetenek çıkarımı (ışık renk modları, panjur konumu,
  kilit mandalı, alarm kodu); bilinmeyen/eksik durumlar; gizli/devre dışı varlıklar; `entity/source` ile
  kayıt dışı varlıkların simülasyon etiketi; hassas cihaz tespiti; iot_class → yerel/bulut.
- **Komut yaşam döngüsü:** doğrulandı, zaman aşımı (başarılı sayılmaz), yanıttan önce gelen durum,
  HA hatası, çevrim dışı cihaz (komut gönderilmez), assumed_state, panjur ara durumu, toleranslı parlaklık.
- **Otomasyon:** model ↔ HA yapılandırması gidiş-dönüş, örnek A/B (akşam ışığı, hareket), Türkçe doğrulama
  mesajları, güvenlik engelleri, test modu (gece yarısını aşan aralık dahil), Türkçe açıklamalar.
- **Senaryo:** kısmi başarısızlığın cihaz bazında raporu, çevrim dışı cihaz, script hatası, kilit açma engeli.
- **WebSocket:** kimlik doğrulama, token yenileyip yeniden deneme, kalıcı yetki hatasında döngüye girmeme,
  zaman aşımı, kopmada bekleyen isteklerin reddi, **komutun yeniden gönderilmemesi**, abonelik yenileme,
  kalp atışı.
- **Kimlik doğrulama:** giriş, hatalı parola, MFA (yanlış kodla yeniden sorma), iptal edilmiş token,
  eşzamanlı yenileme, güvensiz bağlamda saklamama, çıkışta iptal, HA erişilemez.
- **Hata mesajları:** Türkçe metinler, token/parola/JWT temizleme.
- **Enerji/sağlık:** yalnızca gerçek ölçüm sensörleri, birim dönüşümü, tarife yoksa maliyet yok, bağlantı
  yokken hiçbir şeyin yeşil gösterilmemesi, yedek yoksa hata.

## Entegrasyon testleri (`tests/integration`, gerçek HA)

HA bağlantısı ve sürümü · cihaz listesinin kayıtlardan oluşması · ışığı aç/kapa ve **gerçek
state_changed ile doğrulama** · parlaklık · assumed_state → doğrulanamaz · kilit · geçersiz komutun
başarısız gösterilmesi · otomasyon oluşturma, geri okuma, pasif kaydetme, elle ve **gerçek tetikleyiciyle
çalışması**, iz kaydı, silme · hatalı otomasyonun reddi · senaryo (script) oluşturma, çalıştırma, cihaz
bazında doğrulama · oda oluşturma, cihaz atama, silme · search/related · enerji istatistikleri · sağlık
raporu · config flow başlatma/iptal.

Güvenlik: geçersiz token (WS), token'sız REST (401), yanlış parola, çıkış sonrası token'ın reddi, süresi
dolmuş token'ın yenilenmesi, **yönetici olmayan kullanıcının otomasyon yazamaması ve kullanıcı
oluşturamaması** (HA tarafında), hata metinlerinde token sızmaması.

## Arayüz testleri (`tests/ui`, gerçek HA + Chromium)

Yanlış parola mesajı · ana ekran gerçek sayılar ve konsol hatası olmaması · **localStorage'da token/parola
olmaması, IndexedDB'de yalnızca şifreli veri**, yenilemede oturumun geri gelmesi · döşemeden aç/kapa ve
HA'daki durumun gerçekten değişmesi · parlaklık kaydırıcısı + "doğrulandı" göstergesi · **kilit açmada kısa
dokunuşun işe yaramaması, basılı tutmanın gerekmesi** · alarmda yanlış kodun reddi · arayüzden otomasyon
oluşturma, test modu, pasif kaydetme ve HA'da doğrulama · oluşturucuda kilit açmanın seçilememesi ·
arayüzden senaryo oluşturma ve cihaz bazında sonuç · **XSS denemesi** ve uzun adla yatay taşma ·
WebSocket kurulamazsa Türkçe hata · bağlantı koparsa uyarı şeridi ve otomatik yeniden bağlanma · çıkış ·
iPhone SE (açık), iPhone 13 (koyu), iPhone 15 Pro Max (koyu) için 7 ekranda yatay taşma olmaması ve
dokunma alanlarının ≥32 px (hedef 44 px) olması.

Test sırasında bulunup düzeltilen gerçek hatalar: canlı güncelleme kayıtlarının ekran çiziminden sonra
silinmesi; `replaceChildren(null)` ile ekranda "null" yazması; liste ikonlarının boyutsuz kalması;
kayıt defteri dışı demo kilidin simülasyon etiketsiz görünmesi; boşluksuz uzun adların sayfayı yatayda
taşırması; enerji verisi yokken "0 kWh" gösterilmesi.

## HENÜZ TEST EDİLMEYENLER (yapılması gerekenler)

| Test | Neden yapılmadı | Nasıl yapılır |
|---|---|---|
| Gerçek Xenon Smart / Sonoff cihazları | Ev ağına ve cihazlara erişim yok | Aşağıdaki gerçek cihaz prosedürü |
| Gerçek iPhone Safari (WebKit) | Bu ortamda yalnızca Chromium var | iPhone'da kurup kontrol listesini uygulayın |
| iOS "Ana Ekrana Ekle" + service worker + IndexedDB kalıcılığı | Gerçek cihaz gerekir | Kurulumdan sonra uygulamayı kapatıp açın |
| HTTPS (Nabu Casa / VPN) üzerinden uzaktan erişim | Ağ/hesap yok | Ev dışında mobil veriyle açın |
| Push bildirimleri (Companion) | iPhone ve Companion uygulaması gerekir | Paket otomasyonu + `notify.mobile_app_*` |
| Paketin çevrim dışı bildirimi gerçek kopmada | Demo cihazlar çevrim dışı yapılamıyor | Bir prizi fişten çekip ayarlanan süreyi bekleyin |
| MFA'lı gerçek giriş | Birim testi var, gerçek TOTP ile denenmedi | HA profilinde TOTP açıp giriş yapın |
| HA yeniden başlatma sonrası otomasyonların sürmesi | HA'nın kendi davranışı; ayrıca denenmedi | Otomasyon oluştur → HA'yı yeniden başlat → durumunu kontrol et |

## Gerçek cihaz test prosedürü (her üretici için)

Her adımı uygulamada **ve** HA'nın kendi arayüzünde kontrol edin; sonucu IMPLEMENTATION_STATUS.md'ye yazın.

1. Cihazın mevcut durumunu okuyun (uygulama = HA = fiziksel cihaz mı?).
2. Açma komutu gönderin → "Cihaz durumu doğrulandı" çıktı mı ve cihaz fiziksel olarak açıldı mı?
3. Kapama komutu gönderin → aynı kontrol.
4. Cihazın fişini çekin → uygulamada "Çevrim dışı" ne kadar sürede göründü? Komut göndermeyi deneyin:
   "başarısız" görünmeli.
5. Fişi takın → kendiliğinden "çevrim içi" oldu mu?
6. Ev internetini (modem WAN) kesin → yerel cihazlar çalışıyor mu, bulut cihazları "Yalnızca üretici
   bulutu" uyarısıyla erişilemez mi görünüyor?
7. HA'yı yeniden başlatın → entegrasyon "Bağlı" oldu mu, otomasyonlar etkin mi?

## Gerçek iPhone kontrol listesi

- [ ] Safari'de adres açılıyor, giriş yapılıyor (HTTPS adresi ile "oturumu açık tut" seçilebiliyor)
- [ ] Paylaş > Ana Ekrana Ekle → simge "Evim" adıyla geliyor, tam ekran açılıyor
- [ ] Uygulamayı kapatıp açınca yeniden giriş istemiyor (HTTPS'te)
- [ ] Açık/koyu mod iOS ayarını izliyor; Dinamik Ada / çentik içeriği kapatmıyor
- [ ] Kilit açma basılı tutma ile çalışıyor, kısa dokunuşla çalışmıyor
- [ ] Wi-Fi'yi kapatıp mobil veriye geçince (uzaktan erişim varsa) yeniden bağlanıyor
