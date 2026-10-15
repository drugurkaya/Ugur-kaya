# Akıllı Ev – iPhone ortak paneli

eWeLink (Sonoff), Xenon Smart (Tuya altyapısı; Smart Life ve Tuya Smart dahil) ve Samsung SmartThings
cihazlarını **tek ekranda** gösterip yöneten iPhone uygulaması (SwiftUI, iOS 17+).

## Özellikler
- Üç platformdaki tüm cihazlar tek panelde: ışık, priz, çok gözlü anahtar, sıcaklık/nem sensörü
- Tek dokunuşla aç/kapat, çok kanallı anahtarlarda her kanal ayrı, ışıklarda parlaklık ayarı
- Sıcaklık, nem ve anlık güç (W) gösterimi; üst kısımda özet (açık cihaz, ortalama sıcaklık)
- **Odalar:** Her cihaza oda atayın; farklı platformlardaki cihazlar aynı odada toplanır
- **Favoriler** (cihaza basılı tutun), arama, platforma göre filtre
- **Sahneler:** "Gece", "Eve geldim" gibi; farklı platformlardaki cihazları birlikte açıp kapatır
- "Her şeyi kapat" düğmesi
- **Demo modu:** Hesap bağlamadan uygulamayı denemek için örnek cihazlar
- API anahtarları yalnızca telefonun Keychain'inde saklanır; arada başka sunucu yoktur

## iPhone'a kurulum
Gerekenler: Mac, **Xcode 16** veya üstü (App Store'dan ücretsiz), Apple ID.

1. `AkilliEv/AkilliEv.xcodeproj` dosyasını Xcode ile açın.
2. Sol tarafta **AkilliEv** projesi › **Signing & Capabilities** › *Team* kısmından Apple ID'nizi seçin.
   Bundle Identifier çakışırsa sonuna bir şey ekleyin (ör. `com.ugurkaya.AkilliEv2`).
3. iPhone'u kabloyla bağlayın, üst menüden iPhone'unuzu seçip ▶ (Run) düğmesine basın.
4. iPhone'da ilk açılışta: *Ayarlar › Genel › VPN ve Aygıt Yönetimi* bölümünden geliştiriciye güvenin.
   iOS 16+ için *Ayarlar › Gizlilik ve Güvenlik › Geliştirici Modu*'nu açmanız gerekebilir.

> Ücretsiz Apple ID ile yüklenen uygulama 7 günde bir Xcode'dan yeniden yüklenmelidir.
> Ücretli Apple Developer hesabı (yıllık) ile bu süre 1 yıldır ve TestFlight kullanılabilir.

Proje dosyası açılmazsa: `brew install xcodegen` ardından bu klasörde `xcodegen` çalıştırın.

## Hesapları bağlama
Uygulamada **Ayarlar** sekmesinden her platformu ayrı ayrı bağlayın. Her platform kendi bulut
API'sini kullandığı için bir kereye mahsus "geliştirici anahtarı" almanız gerekir (hepsi ücretsiz).

### 1. eWeLink (Sonoff)
1. <https://dev.ewelink.cc> adresinde eWeLink hesabınızla giriş yapıp geliştirici olun.
2. Yeni uygulama (*Create App*) oluşturun. **Redirect URL** olarak şunu girin:
   `https://127.0.0.1/ewelink-callback` (uygulamadaki varsayılan; değiştirirseniz iki yerde aynı olmalı).
3. Size verilen **APPID** ve **APP SECRET**'ı uygulamadaki eWeLink ayarlarına yazın.
4. **eWeLink hesabıyla giriş yap**'a basın, açılan eWeLink sayfasında normal hesabınızla giriş yapın.

### 2. Xenon Smart / Tuya / Smart Life
Xenon Smart cihazları Tuya modülü kullanır ve Tuya bulutu üzerinden yönetilir.
1. <https://platform.tuya.com> adresinde ücretsiz hesap açın.
2. *Cloud › Development › Create Cloud Project*: Data Center olarak **Central Europe** seçin
   (Türkiye hesapları genellikle buradadır).
3. Projede *Devices › Link App Account* (Link Tuya App Account) › *Add App Account* ile çıkan QR kodu
   telefondaki **Smart Life** veya **Tuya Smart** uygulamasıyla okutun (Ben › sağ üst tarama).
4. Projenin *Overview* sayfasındaki **Access ID/Client ID** ve **Access Secret/Client Secret**'ı
   uygulamadaki Xenon/Tuya ayarlarına yazın, **Kaydet ve bağlantıyı test et**'e basın.

> **Xenon Smart uygulaması hakkında:** Xenon kendi markalı (OEM) uygulamasını kullanır ve bu hesap
> Tuya projesine doğrudan bağlanamayabilir. Bu durumda Xenon cihazlarınızı **Smart Life** uygulamasına
> ekleyin (aynı Tuya altyapısı olduğu için çalışır) ve yukarıdaki adımlarla Smart Life hesabını bağlayın.
>
> Tuya'nın ücretsiz deneme sürümü (Trial Edition) belirli aralıklarla platform üzerinden uzatılmalıdır.

### 3. Samsung SmartThings
**Kolay yol – Kişisel token:** <https://account.smartthings.com/tokens> adresinde token oluşturun
(Devices ve Locations izinlerini işaretleyin), uygulamaya yapıştırın.
Not: Samsung'un yeni kişisel token'ları **24 saat** geçerlidir; her gün yenilemek gerekir.

**Kalıcı yol – OAuth:** SmartThings CLI ile (`smartthings apps:create`, *OAuth-In App*)
bir uygulama oluşturun; Redirect URI: `https://127.0.0.1/smartthings-callback`,
kapsamlar: `r:devices:* x:devices:* r:locations:*`. Verilen Client ID/Secret'ı uygulamaya girip
**SmartThings hesabıyla giriş yap**'a basın. Oturum otomatik yenilenir.

## Teknik notlar
| Platform | API | Kimlik doğrulama |
|---|---|---|
| eWeLink | CoolKit API v2 (`/v2/device/thing`) | OAuth 2.0 + HMAC-SHA256 imza |
| Tuya / Xenon | Tuya Cloud OpenAPI (`/v1.0/iot-01/associated-users/devices`) | HMAC-SHA256 imzalı istek |
| SmartThings | SmartThings REST API v1 | Kişisel token veya OAuth 2.0 |

Kod yapısı:
- `Providers/` – her platformun istemcisi, ortak `SmartHomeProvider` arayüzünü uygular
- `Store/HomeStore.swift` – tüm cihazları birleştiren panel durumu, odalar, favoriler, sahneler
- `Views/` – SwiftUI ekranları

Yeni bir platform eklemek için `SmartHomeProvider` arayüzünü uygulayan bir sınıf yazıp
`HomeStore.reloadProviders()` içine eklemek yeterlidir.

Bilinen sınırlamalar: Cihaz durumu açılışta, uygulamaya dönüşte ve aşağı çekince yenilenir (anlık
bildirim yok). Perde, klima, RGB renk gibi özel kontroller şimdilik yok; bu cihazlar aç/kapa ve
ölçüm değerleriyle görünür. Tuya sensörlerinde ölçek cihaza göre değişebilir.
