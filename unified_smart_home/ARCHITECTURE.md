# Mimari

## Temel karar: Home Assistant merkezli, ince bir istemci

Cihaz entegrasyonu, otomasyon motoru, zamanlama, kayıt/istatistik ve yetkilendirme işlerini
**Home Assistant** (HA) yapar. Bu proje bunları yeniden yazmaz. Projenin kendi yazdığı kısımlar şunlar:

1. **iPhone uygulaması (PWA):** markadan bağımsız, Türkçe, komut sonucunu doğrulayan arayüz.
2. **Ortak cihaz modeli ve servis katmanı:** HA kayıtlarını tek bir modele çevirir; arayüz yalnızca
   bu katmanı kullanır.
3. **HA paketi:** çevrim dışı cihaz bildirimi (`ha-config/packages/unified_smart_home.yaml`).
4. **Dağıtım, yedekleme ve test araçları.**

Ayrı bir sunucu veya veritabanı **yoktur**. Cihaz, alan, otomasyon ve senaryo verilerinin tek kaynağı
HA'dır. Böylece aynı veri iki yerde tutulmaz ve aynı cihaz için iki ayrı kontrol yolu oluşmaz.

```
┌───────────────────────────── iPhone (Safari / Ana Ekran uygulaması) ─────────────────────────────┐
│  KATMAN 5  Arayüz        app/js/ui/  (ekranlar, bileşenler; yalnızca store'u kullanır)            │
│  KATMAN 3  Ortak model   app/js/core/model.js, commands.js, automations.js, scenarios.js,         │
│                          energy.js, health.js  (saf mantık, DOM'suz, birim testli)                 │
│            Veri katmanı  app/js/core/store.js  (yükleme, gerçek zamanlı olaylar, API sarmalayıcı)  │
│            Haberleşme    app/js/core/ha-socket.js (WebSocket), auth.js (OAuth2 + MFA)              │
└───────────────────────────────────┬──────────────────────────────────────────────────────────────┘
                                    │ HTTPS + WSS (aynı köken: /local/unified-smart-home/)
┌───────────────────────────────────▼──────────── Home Assistant ──────────────────────────────────┐
│  KATMAN 4  Otomasyon motoru  automation / script / scene, trace, recorder, logbook                │
│  KATMAN 2  Entegrasyonlar    Tuya, SonoffLAN, ZHA, Matter, HomeKit Device, Shelly, ESPHome, MQTT… │
└───────────────────────────────────┬──────────────────────────────────────────────────────────────┘
                                    │ Wi-Fi / Zigbee / Thread / Bluetooth / üretici bulutu
                     KATMAN 1  Fiziksel cihazlar (Xenon Smart, Sonoff, Apple Home uyumlu…)
```

## Neden PWA, neden SwiftUI değil?

| Seçenek | Bu ortamda | Değerlendirme |
|---|---|---|
| SwiftUI yerel uygulama | Xcode/macOS **yok**; derlenemez, test edilemez | Derlenip test edilmemiş Swift kodu teslim etmek "çalışıyor" iddiasıyla çelişirdi. |
| HA Companion uygulaması + dashboard | Kullanılabilir | Resmî, push bildirimi var, ama özelleştirme, komut doğrulama ve Türkçe sadeleştirme sınırlı. **Bildirimler için birlikte kullanılması öneriliyor.** |
| **PWA (seçilen)** | Gerçek tarayıcıda, gerçek HA ile uçtan uca test edildi | iPhone'da Safari > "Ana Ekrana Ekle" ile tam ekran açılır. Kod HA tarafından sunulur; App Store gerekmez. |
| Capacitor | Xcode gerektirir | Şu an gereksiz karmaşıklık. |

PWA, Companion uygulamasının yerine değil **yanına** konumlanır: Push bildirimleri ve konum gibi yerel
özellikler Companion'da kalır. Çekirdek katman (`app/js/core`) DOM'dan bağımsız olduğu için ileride bir
SwiftUI uygulaması aynı mantığı (model, komut doğrulama kuralları, otomasyon dönüşümü) referans alabilir.

## Neden uygulama HA'nın kendisinden sunuluyor?

Uygulama `/config/www/unified-smart-home/` klasörüne konur ve HA tarafından
`https://<ha>/local/unified-smart-home/` adresinde sunulur. Bunun sonuçları:

- **Aynı köken:** CORS açmaya gerek yok. HA adresi ayrıca yapılandırılmıyor; sahte bir sunucuya
  yönlendirme riski azalıyor.
- **HTTPS kendiliğinden gelir:** HA Cloud (Nabu Casa) veya HA'nın kendi TLS ayarı ile uygulama da HTTPS olur.
  GitHub Pages gibi başka bir adresten sunulsaydı, HTTPS sayfa yerel `http://` HA'ya karışık içerik
  kuralı nedeniyle bağlanamazdı.
- **Uzaktan erişim** HA'nın uzaktan erişimi neyse odur (bkz. SECURITY.md).

`/local/` yolu kimlik doğrulaması olmadan sunulur. Bu yüzden uygulama dosyalarında hiçbir gizli bilgi
**bulunmaz**: kod herkese açık olabilir, veriler ise yalnızca giriş yapınca gelir.

## Ortak cihaz modeli

`model.js > buildHome()` şu HA kaynaklarını birleştirir:

| Kaynak (WebSocket) | Kullanım |
|---|---|
| `get_states` | Anlık durum ve özellikler |
| `config/device_registry/list` | Marka, model, yazılım sürümü, alan |
| `config/entity_registry/list` | Varlık adı, alanı, gizli/devre dışı, kategori |
| `entity/source` | Kayıt defterinde olmayan varlıkların gerçek entegrasyonu |
| `config/area_registry/list` | Odalar ve oda sıcaklık/nem sensörü |
| `config_entries/get` + `config_entries/subscribe` | Entegrasyon durumu (bağlı, yeniden deneniyor, kimlik doğrulama...) |
| `manifest/list` | Entegrasyonun `iot_class` değeri → yerel/bulut sınıflandırması |

Örnek çıktı (gerçek HA 2026.2.3 demo verisinden):

```json
{
  "id": "light.bed_light",
  "domain": "light",
  "name": "Bed Light",
  "deviceId": "…",
  "areaId": null,
  "integration": "demo",
  "connectivity": "simulated",
  "simulated": true,
  "state": "off",
  "availability": "online",
  "capabilities": ["on_off", "brightness", "color_temp", "color", "effect"],
  "assumedState": false,
  "sensitive": false,
  "controllable": true
}
```

- `capabilities` yalnızca HA'nın bildirdiği `supported_features` ve `supported_color_modes` değerlerinden
  çıkarılır. Arayüz desteklenmeyen bir özellik için **düğme üretmez**.
- Üreticiye özgü bütün özellikler kaybolmaz: `attributes` ham olarak saklanır, cihazın diğer varlıkları
  (enerji, pil, sıcaklık) cihaz ekranında listelenir.
- `connectivity` değerleri: `local`, `hybrid`, `cloud`, `calculated`, `simulated`, `unverified`.
  Manifest yanlış sınıflandırıyorsa (ör. SonoffLAN) `CONNECTIVITY_OVERRIDES` tablosu belgelenmiş
  davranışa göre düzeltir. Bilinmeyen değer **"Henüz doğrulanmadı"** olarak gösterilir.
- Kavramlar ayrı tutulur: Device, Entity, Integration, Area (model.js); Automation (automations.js);
  Scene/Senaryo (scenarios.js); Event (store.events + HA logbook); User/Permission (HA `auth/current_user`,
  `is_admin`); Notification (HA persistent_notification / Companion); Connection status (HaSocket.status).

## Komut yaşam döngüsü (commands.js)

```
GÖNDERİLİYOR ──HA servis yanıtı──▶ MERKEZ KABUL ETTİ ──state_changed beklenen değer──▶ DOĞRULANDI
     │                                   │  (ara durum: açılıyor/kilitleniyor → İŞLEMDE)
     │                                   └──süre doldu──▶ DOĞRULANAMADI (başarısız sayılır)
     └──hata──▶ BAŞARISIZ                assumed_state / durumsuz komut ──▶ DOĞRULANAMAZ (sarı)
```

- Arayüzdeki animasyon yalnızca "gönderildi/kabul edildi" durumunu gösterir. Döşeme, **cihazın
  bildirdiği gerçek durum** gelene kadar "açık" rengine geçmez.
- Bekleme süreleri domain'e göre değişir: panjur 90 sn, kilit/alarm 30 sn, diğerleri 8 sn.
- Bağlantı koparsa bekleyen komut **yeniden gönderilmez**. "Aç/kapa" gibi bir komutun iki kez uygulanması
  istenmeyen sonuç doğurabilir; kullanıcı açık bir hata görür.

## Otomasyon ve senaryolar

- Oluşturucu modeli (`automations.js`) ↔ HA otomasyon yapılandırması (`triggers/conditions/actions`).
  Kayıt HA'nın yapılandırma API'si (`/api/config/automation/config/<id>`) ile yapılır. Otomasyonu HA
  çalıştırır: telefon kapalıyken, internet yokken (yerel cihazlarla) ve yeniden başlatmadan sonra da çalışır.
- Tekrarlayan tetikleme kontrolü: `mode: single` + `max_exceeded: silent` (varsayılan) veya `restart`
  (hareket sensörü gibi durumlarda süreyi uzatmak için).
- Bir cihaz yanıt vermezse diğer adımlar sürsün diye her cihaz adımına `continue_on_error: true` eklenir.
  Hata HA iz kaydına (trace) düşer ve uygulamadaki "Çalışma geçmişi" ile Sistem sağlığı ekranında görünür.
- **Test modu:** Koşullar *şu anki gerçek durumlara* göre değerlendirilir ve hangi işlemlerin yapılacağı
  listelenir. Hiçbir cihaza komut gönderilmez. Yeni otomasyonlar varsayılan olarak **pasif** kaydedilir.
- Oluşturucunun ifade edemediği (elle YAML ile yazılmış) otomasyonlar **düzenlenemez** olarak açılır.
  Böylece veri kaybı olmaz; açma/kapama, çalıştırma ve geçmiş yine kullanılabilir.
- Sürüm: Her kayıtta `variables.ush_revision` artar. Yedekleme: HA yedekleri + `scripts/export_ha_config.py`
  + uygulama içi JSON dışa aktarma.
- **Senaryolar** HA `script` olarak saklanır (`mode: single`, adım başına `continue_on_error`). Uygulama
  senaryoyu HA'ya çalıştırtır ve her hedef cihazın sonucunu ayrı ayrı doğrular. Kısmi başarı açıkça
  raporlanır: "Salon ışığı: Başarılı · Bahçe rölesi: Yanıt alınamadı".

## Gerçek zamanlılık ve yeniden bağlanma

`HaSocket` kimlik doğrulama, artan mesaj kimlikleri, istek başına zaman aşımı (10 sn), 30 sn'de bir
ping/pong ve 1 sn → 30 sn arası rastgele dağıtılmış üstel bekleme ile yeniden bağlanma sağlar. Yeniden
bağlanınca abonelikler yenilenir ve kaçırılan değişiklikler için tüm veri yeniden yüklenir. Erişim
token'ının süresi dolduysa HA `auth_invalid` döner; uygulama token'ı bir kez yenileyip yeniden dener.
İkinci başarısızlıkta sonsuz döngüye girmez, giriş ekranını gösterir.

## Dizin yapısı

```
unified_smart_home/
├── app/                      # HA'nın www klasörüne kopyalanan PWA (derleme adımı yok)
│   ├── index.html, manifest.webmanifest, sw.js, css/, icons/
│   └── js/core/              # DOM'suz mantık (birim testli)
│       js/ui/                # ekranlar ve bileşenler
├── ha-config/packages/       # HA paketi (çevrim dışı bildirimi)
├── deployment/               # install_to_ha.sh, docker-compose.yml
├── scripts/                  # run_tests.sh, export_ha_config.py
├── dev/                      # geliştirme/test HA yapılandırması (demo cihazlar)
└── tests/  unit/ integration/ ui/ fixtures/
```

Bağımlılık: çalışma zamanında **sıfır** üçüncü taraf kitaplık. Geliştirmede Node 22 (yerleşik test
çalıştırıcısı ve WebSocket), Playwright (arayüz testleri), eslint/prettier ve Python'da `homeassistant`
(yalnızca testlerde) kullanılır.
