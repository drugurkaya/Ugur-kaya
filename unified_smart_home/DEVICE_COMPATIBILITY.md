# Cihaz Uyumluluk Raporu

Son güncelleme: 2026-10-21 · Home Assistant sürümü (testlerde): 2026.2.3

> **Önemli:** Bu rapordaki bilgiler herkese açık kaynaklardan derlendi. Evinizdeki cihazlara bu
> çalışma ortamından erişim **yoktu**. Gerçek cihazlarla hiçbir test yapılmadı. Aşağıdaki her
> "desteklenir" ifadesi, entegrasyonun var olduğu anlamına gelir; **sizin modelinizle ve
> firmware'inizle çalıştığı doğrulanmamıştır.**

## Durum etiketleri

| Etiket | Anlamı |
|---|---|
| TAMAMLANDI VE TEST EDİLDİ | Yazılım gerçek HA çekirdeğiyle test edildi (simüle cihazlar) |
| TAMAMLANDI, GERÇEK DONANIMDA TEST EDİLMEDİ | Kod hazır, gerçek cihazda denenmedi |
| KISMEN TAMAMLANDI | Bir kısmı çalışıyor |
| KULLANICI İŞLEMİ GEREKİYOR | Sizin bilgi, onay veya kurulum yapmanız gerekiyor |
| DESTEKLENMİYOR | Bilinen bir yol yok |
| ARAŞTIRILMASI GEREKİYOR | Model/uygulama bilgisi olmadan karar verilemiyor |

## Özet tablo

| Marka / sistem | Protokol | HA entegrasyonu | Yerel / bulut | Ek donanım | Durum |
|---|---|---|---|---|---|
| **Xenon Smart** | Wi-Fi, Zigbee (ağ geçidi), BLE | Uygulamanıza bağlı (aşağıya bakın) | Henüz doğrulanmadı | Zigbee için ağ geçidi veya koordinatör | **ARAŞTIRILMASI GEREKİYOR** |
| **Sonoff** (eWeLink) | Wi-Fi, Zigbee, Matter | SonoffLAN (HACS) / eWeLink eklentisi / ZHA / Matter | Wi-Fi: yerel + bulut; Zigbee/Matter: yerel | Zigbee için koordinatör | **KULLANICI İŞLEMİ GEREKİYOR** (model listesi) |
| Tuya / Smart Life | Wi-Fi, Zigbee, BLE | Tuya (çekirdek) / tuya-local (HACS) | Çekirdek: bulut; tuya-local: yerel | — | TAMAMLANDI, GERÇEK DONANIMDA TEST EDİLMEDİ |
| Apple Home (HomeKit) cihazları | HomeKit (Wi-Fi/Thread/BLE) | HomeKit Device (çekirdek) | Yerel | Thread için sınır yönlendirici | KULLANICI İŞLEMİ GEREKİYOR |
| Matter cihazları | Matter (Wi-Fi/Thread) | Matter (çekirdek) + Matter Server | Yerel | Thread için sınır yönlendirici | KULLANICI İŞLEMİ GEREKİYOR |
| Shelly | Wi-Fi, BLE | Shelly (çekirdek) | Yerel | — | TAMAMLANDI, GERÇEK DONANIMDA TEST EDİLMEDİ |
| Philips Hue | Zigbee | Hue (çekirdek) | Yerel | Hue Bridge | TAMAMLANDI, GERÇEK DONANIMDA TEST EDİLMEDİ |
| ESPHome | Wi-Fi | ESPHome (çekirdek) | Yerel | — | TAMAMLANDI, GERÇEK DONANIMDA TEST EDİLMEDİ |
| TP-Link Tapo/Kasa | Wi-Fi | TP-Link (çekirdek) | Yerel | — | TAMAMLANDI, GERÇEK DONANIMDA TEST EDİLMEDİ |
| IKEA, Aqara (Zigbee) | Zigbee / Matter | ZHA / Zigbee2MQTT / Matter | Yerel | Zigbee koordinatörü veya Matter hub | KULLANICI İŞLEMİ GEREKİYOR |
| Meross | Wi-Fi | HomeKit Device (HomeKit modelleri) / topluluk | Model bağımlı | — | ARAŞTIRILMASI GEREKİYOR |
| MQTT cihazları | MQTT | MQTT (çekirdek) | Yerel | MQTT aracısı (Mosquitto) | KULLANICI İŞLEMİ GEREKİYOR |

"TAMAMLANDI, GERÇEK DONANIMDA TEST EDİLMEDİ" bu markalar için şu anlama gelir: uygulama bu
entegrasyonların ürettiği standart HA varlıklarını (ışık, priz, sensör...) markadan bağımsız olarak
gösterip kontrol eder ve bu yol simüle cihazlarla test edildi. Marka entegrasyonunun kendisi HA
tarafından sağlanır ve evinizde denenmedi.

---

## 1. Xenon Smart — ayrıntılı araştırma

### Bulgular

| Soru | Bulgu | Güven |
|---|---|---|
| Üretici / platform | Xenon Smart Teknoloji Ltd. (Türkiye). Ürünler pazar yerlerinde **"Tuya uyumlu"** diye satılıyor (ör. X7014 Wi-Fi röle, X7052 Zigbee anahtar, X7964 ağ geçidi). Bir kullanıcı yorumu prizin "Tuya uygulamasında hemen göründüğünü" söylüyor. | Orta (satıcı beyanı) |
| Uygulama | Android'deki **XenonSmartHome** uygulamasının paket adı `com.lanbon.swit.xenonsmart`. Bu ad, uygulamanın Çinli anahtar üreticisi **Lanbon**'un altyapısına dayandığını gösteriyor. iOS'ta ayrıca "Xenon Smart" ve kablolu sistemler için "Xenon Smart Room Controller" uygulamaları var. | Orta |
| Protokol | Wi-Fi (röle, priz, termostat X7402), Zigbee (anahtarlar; ağ geçidi gerekli), bazı ürünlerde Bluetooth. | Orta |
| Resmî API / SDK | Bulunamadı. | — |
| HA entegrasyonu | Xenon Smart'a özel resmî veya topluluk entegrasyonu **bulunamadı**. Lanbon için de resmî HA entegrasyonu yok; Lanbon L8 için topluluk çözümleri (openHASP, ESPHome) firmware değiştirmeyi gerektiriyor. | Orta |
| Yerel kontrol | Tuya tabanlıysa "tuya-local" ile mümkün (cihaz başına yerel anahtar gerekir). Lanbon tabanlıysa bilinen bir yerel API yok. | Düşük |
| Bulut gereksinimi | Tuya tabanlıysa çekirdek Tuya entegrasyonu buluta bağımlıdır. | Orta |
| Gerçek zamanlı durum | Tuya: bulut push ile evet. Lanbon: bilinmiyor. | Düşük |
| Firmware etkisi | Tuya cihazlarında firmware güncellemeleri yerel protokol sürümünü değiştirip tuya-local uyumluluğunu bozabiliyor. | Orta |
| Sürdürülebilirlik | Tuya çekirdek entegrasyonu Tuya'nın kendisi tarafından bakılıyor. Topluluk raporlarına göre 2026'da Tuya bazı uygulama hesaplarında QR girişini kısıtladı ("Please use designated APP to login"). | Orta |

**Sonuç:** Xenon Smart tek bir platform değil gibi görünüyor. Hangi yolun geçerli olduğu,
**cihazlarınızı hangi uygulamayla kurduğunuza** bağlı. Marka adından platform tahmin etmedim.

Araştırma notu: Bu ortamın ağ politikası xenonsmart.com, Google Play ve App Store sayfalarına doğrudan
erişimi engelledi (proxy 403). Yukarıdaki bilgiler arama motoru sonuçlarından derlendi.

### Entegrasyon yolları (öncelik sırasıyla)

1. **Cihazlar "Smart Life" veya "Tuya Smart" uygulamasında görünüyorsa:**
   HA > Ayarlar > Cihazlar ve Hizmetler > Entegrasyon ekle > **Tuya** > Smart Life'taki "Kullanıcı
   Kodu"nu girin > QR kodu okutun. Bu yol buluta bağımlıdır. Yerel kontrol için **tuya-local** (HACS)
   değerlendirilebilir.
2. **Cihazlar yalnızca "Xenon Smart / XenonSmartHome" uygulamasındaysa:** Doğrudan entegrasyon yolu
   bilinmiyor. İki seçenek var:
   - (a) Uygulamada bir "Alexa / Google / Tuya / Matter / Home Assistant" bağlantısı varsa onu kullanmak.
   - (b) Cihazları Smart Life uygulamasına yeniden eşleştirmek. Bu cihazı Xenon uygulamasından çıkarır,
     oradaki otomasyonları bozar ve her model için çalışacağı garanti değildir. **Onayınız olmadan önerilmez.**
3. **Zigbee modeller:** HA'ya bağlı bir Zigbee koordinatörüyle (ör. USB Zigbee çubuğu) tamamen yerel
   kontrol mümkün olabilir. Cihaz mevcut ağ geçidinden çıkarılıp yeniden eşleştirilmelidir (onay gerekir).
4. **Room Controller (kablolu):** Protokolü kurulum firmasından öğrenmek gerekiyor (KNX/Modbus/özel).

### Sizden gereken bilgiler (karar için)

- Kullandığınız uygulamanın adı (Xenon Smart / XenonSmartHome / Smart Life / Tuya Smart).
- Cihaz modelleri (kutu veya cihazın arkasındaki etiket, ör. X7014).
- Uygulamada Alexa/Google/Tuya bağlantı seçeneği olup olmadığı.

---

## 2. Sonoff

| Cihaz tipi | Önerilen yol | Bağlantı | Notlar |
|---|---|---|---|
| Orijinal firmware Wi-Fi (Mini, Basic, POW, TH, DUAL...) | **SonoffLAN** (AlexxIT, HACS) | Yerel ağ öncelikli, buluta düşer | eWeLink hesabı gerekir. Topluluk raporu: 2026'dan itibaren bazı güç ölçümlü modellerde enerji sensörleri gerçek zamanlı güncellenmeyebilir; gerçek cihazda doğrulanmalı. |
| Aynı cihazlar, HA OS kullanıyorsanız | CoolKit'in resmî **eWeLink Smart Home** eklentisi | Yerel öncelikli, bulut yedek | Yalnızca HA OS/Supervised. |
| Sonoff Zigbee (SNZB-01/02/03/04, ZBMINI...) | **ZHA** veya Zigbee2MQTT | Tamamen yerel | Koordinatör gerekir (ör. Sonoff ZBDongle-E/P). |
| Matter destekli yeni modeller (ör. MINIR4M) | **Matter** | Yerel | Apple Home'dan "eşleştirme modu" ile HA'ya ikinci denetleyici olarak eklenebilir. |
| DIY modu destekleyen modeller | DIY REST API / ESPHome / Tasmota | Yerel | **Firmware değişikliği yalnızca onayınızla.** Garantiyi bozabilir, her modelde geri dönüş yolu yoktur. |

Hedeflenen işlevler: röle/priz aç-kapa, enerji ölçümü (POW/S31/S40), sıcaklık/nem (TH/SNZB-02),
sensörler, çevrim dışı bildirimi. Uygulama tarafı bunların hepsini **standart HA varlıkları üzerinden**
destekliyor ve bu yol simüle cihazlarla test edildi. Sonoff entegrasyonunun kendisi gerçek cihazda denenmedi.

**Sizden gereken:** Sonoff modellerinizin listesi ve eWeLink uygulamasında hangi cihazların "LAN"
modunda göründüğü.

---

## 3. Apple Home, HomeKit ve Matter

- **HomeKit ≠ Matter.** Bir HomeKit cihazı aynı anda yalnızca **bir** HomeKit denetleyicisine
  eşleşebilir. HA'ya "HomeKit Device" ile eklemek için Apple Home'dan **çıkarılması** gerekir; bu da
  Apple Home'daki otomasyonlarından çıkması demektir. Mevcut Apple Home yapılandırmanıza dokunulmadı.
- **Matter** çoklu denetleyiciyi destekler. Ev uygulaması > cihaz > "Eşleştirme Modunu Aç" ile alınan
  kod HA'ya girilir; cihaz iki tarafta da çalışır. HA'da **Matter Server** gerekir. Thread cihazları için
  bir Thread sınır yönlendiricisi gerekir (HomePod mini / Apple TV 4K bu işi Apple tarafında yapar; HA'nın
  Thread ağına katılması için uyumlu bir Thread radyosu gerekebilir).
- **Ters yön:** HA'daki tüm cihazlar (Xenon/Sonoff dahil) **HomeKit Bridge** ile Apple Home'a ve Siri'ye
  açılabilir. Bu, "tek uygulama" hedefine Apple tarafından da ulaşmanın en güvenilir yoludur.
- **Yinelenme riski:** Aynı cihaz hem Tuya hem Matter üzerinden eklenirse HA'da iki varlık oluşur. Birini
  devre dışı bırakın. Uygulama gizlenmiş/devre dışı varlıkları göstermez.

## 4. Yeni bir marka eklerken kontrol listesi

Uygulamanın "Yeni cihaz ekle" sihirbazı her marka için aşağıdakileri gösterir (kaynak: `app/js/core/catalog.js`):
üretici, protokol, desteklenen yol(lar), yerel/bulut bağlantı, ek donanım, güvenlik notu ve HA'nın
yapılandırma akışını (config flow) başlatan düğme. Kurulduktan sonra bağlantı durumu ve son başarılı
güncelleme **Sistem sağlığı** ekranında görülür.

## 5. İnternet kesintisinde ne çalışır?

| Bağlantı türü | İnternet yokken |
|---|---|
| Tamamen yerel (Zigbee/ZHA, Shelly, ESPHome, Hue, Matter, HomeKit Device) | Kontrol ve HA otomasyonları çalışır |
| Yerel + bulut (SonoffLAN LAN modu) | LAN modundaki cihazlar çalışır; LAN'ı olmayanlar çalışmaz |
| Yalnızca bulut (Tuya çekirdek, Xenon yol A) | **Çalışmaz**; uygulama bunları "Yalnızca üretici bulutu" olarak etiketler |
| Ev dışından erişim | Ev interneti kesikse **hiçbir yöntemle** dışarıdan erişilemez |

## Kaynaklar

- Xenon Smart ürün listeleri: [Amazon TR X7052](https://www.amazon.com.tr/Anahtar-%C5%9Ealteri-Uygulama-Denetimli-Destekli/dp/B0FJ2D631X), [Amazon TR X7402](https://www.amazon.com.tr/Xenon-Smart-Termostat-Edilebilen-X7402/dp/B0DMWTTJYX), [Akakçe X7014](https://www.akakce.com/akilli-role/en-ucuz-xenon-smart-x7014-wi-fi-fiyati,975195779.html), [Hepsiburada X7013](https://www.hepsiburada.com/xenon-smart-akilli-akim-korumali-priz-mobil-uygulama-ile-uzaktan-kontrol-edilebilen-wi-fi-bluetooth-priz-16a-x7013-pm-HBC00007AMBEA), [Xenon ağ geçidi](https://shop.xenonsmart.com/products/zigbee-wifi-ag-gecidi)
- XenonSmartHome (Google Play): https://play.google.com/store/apps/details?id=com.lanbon.swit.xenonsmart
- Xenon Smart Room Controller (App Store): https://apps.apple.com/us/app/id1488802361
- Lanbon L8 incelemesi (HA desteği): https://blakadder.com/lanbon-L8/ · ESPHome Lanbon L9: https://devices.esphome.io/devices/lanbon-l9/
- HA Tuya entegrasyonu: https://www.home-assistant.io/integrations/tuya · tuya-local: https://github.com/make-all/tuya-local
- Tuya QR giriş sorunu (topluluk): https://community.home-assistant.io/t/tuya-smart-life-please-use-designated-app-to-login/981251
- Sonoff + HA (üretici): https://sonoff.tech/en-it/blogs/news/how-sonoff-works-with-home-assistant · SonoffLAN çatalı ve 2026 notu: https://github.com/fatihsens/sonofflan
