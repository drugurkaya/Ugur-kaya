# Güvenlik

Bu sistem evdeki fiziksel cihazları (kilit, alarm, garaj kapısı, ısıtma) kontrol edebilir. Aşağıdaki
önlemler kodda uygulanmış ve test edilmiştir. "Kalan riskler" bölümü, bu önlemlerin korumadığı durumları
açıkça listeler.

## Kimlik doğrulama ve oturum

| Önlem | Uygulama | Test |
|---|---|---|
| Kullanıcı adı/parola yalnızca HA'ya gider | HA `login_flow` API'si (OAuth2 yetkilendirme kodu) | entegrasyon + arayüz |
| Çok faktörlü doğrulama (TOTP) | Giriş akışı MFA adımını destekler; yanlış kodda yeniden sorar | birim |
| Parola saklanmaz | Form gönderildikten sonra alan temizlenir; hiçbir depolamaya yazılmaz | arayüz (localStorage taraması) |
| Erişim token'ı (30 dk) yalnızca bellekte | `Session.tokens` | birim |
| Yenileme token'ı **şifreli** | "Oturumu açık tut" seçilirse Web Crypto ile **dışa aktarılamayan** AES-GCM-256 anahtarıyla şifrelenip IndexedDB'ye yazılır. **localStorage kullanılmaz.** | arayüz |
| HTTPS yoksa kalıcı oturum yok | Güvenli bağlam yoksa token hiç saklanmaz; kullanıcı her açılışta giriş yapar ve bu ekranda açıklanır | birim |
| Süresi dolan token otomatik yenilenir; eşzamanlı yenilemeler tek isteğe indirgenir | `Session.refresh()` | birim + entegrasyon |
| İptal edilmiş token kabul edilmez | Çıkışta `/auth/revoke`; Ayarlar > Açık oturumlar'dan diğer cihazlar sonlandırılabilir | entegrasyon |
| Geçersiz token → anlaşılır hata, sonsuz yeniden deneme yok | `HaSocket` AUTH_FAILED | birim + entegrasyon |

Uzun ömürlü erişim token'ları uygulamada **kullanılmaz**. Yalnızca `scripts/export_ha_config.py`
bir ortam değişkeninden okur; dosyaya veya günlüğe yazmaz.

## Yetkilendirme

Yetki kararlarını HA verir; uygulama bunları atlatamaz:

- Yönetici olmayan kullanıcı cihazları kontrol edebilir, ancak otomasyon/senaryo/oda düzenleyemez,
  entegrasyon ekleyemez, kullanıcı oluşturamaz. Bu durum gerçek HA'ya karşı test edildi (HA 401/403
  döner). Arayüz de bu ekranları açıklamalı uyarıyla gizler.
- Aile üyeleri için HA'da **ayrı, yönetici olmayan** hesaplar açın.

## Hassas cihazlar (kilit, alarm, garaj/kapı)

| Kural | Uygulama |
|---|---|
| Açık kullanıcı eylemi | Kilit açma, mandal açma, alarm devre dışı bırakma, garaj/kapı açma için onay penceresinde düğmenin **0,9 sn basılı tutulması** gerekir. Kısa dokunuş işlem yapmaz (arayüz testiyle doğrulandı). |
| Kod doğrulaması | Cihaz kod istiyorsa (`code_format`) kod HA'ya gönderilir ve **HA tarafında** doğrulanır. Uygulama kodu saklamaz. Yanlış kod başarısız gösterilir (test edildi). |
| Otomasyon/senaryoda yasak | `lock.unlock`, `lock.open`, `alarm_control_panel.alarm_disarm` ve garaj/kapı/bahçe kapısı açma otomasyon ve senaryolara **eklenemez** (doğrulama + arayüzde seçenek devre dışı; test edildi). Kilitlemek ve kurmak serbesttir. |
| Gereksiz bulut bağımlılığı yok | Uygulama yalnızca HA ile konuşur. Kilit gibi cihazlar için yerel entegrasyonlar (Matter/HomeKit/Zigbee) önerilir. |

## Uygulama güvenliği

- **XSS:** Cihaz/oda/otomasyon adları her zaman metin düğümü olarak eklenir; `innerHTML` yalnızca
  koddaki sabit SVG ikonlar için kullanılır. Cihaz adına `<img onerror>` ve `<script>` gömülerek yapılan
  test, betiğin çalışmadığını doğruladı.
- **CSP:** `script-src 'self'; style-src 'self'; connect-src 'self' ws: wss:; object-src 'none'`. Üçüncü
  taraf betik, CDN veya analitik yoktur.
- **Hata mesajları ve günlükler:** `errors.js > redact()` Bearer başlıkları, `access_token`,
  `refresh_token`, `password` alanları ve JWT'leri teknik ayrıntılardan temizler (birim testli).
- **Service worker** yalnızca uygulama dosyalarını önbelleğe alır. `/api` ve `/auth` yanıtları
  **asla** önbelleğe alınmaz.
- **Girdi doğrulama:** Otomasyon/senaryo/oda girdileri istemcide doğrulanır (saat biçimi, sınırlar,
  varlık varlığı, uzunluk), ardından HA kendi şemasıyla tekrar doğrular (hatalı yapılandırma testi var).
- **Cihaz keşfi:** Yalnızca HA'nın standart keşif sonuçları (mDNS/SSDP/DHCP/Bluetooth) gösterilir. Ağ
  taraması, parola denemesi veya güvenlik önlemi atlatma **yapılmaz**.

## Uzaktan erişim

Yönlendiricide port açmayın. Önerilen yollar:

1. **Home Assistant Cloud (Nabu Casa)** — en kolayı. Uçtan uca TLS, port açmak gerekmez, Companion
   uygulamasıyla uyumlu. Uygulama adresi: `https://<id>.ui.nabu.casa/local/unified-smart-home/`.
2. **VPN (Tailscale veya WireGuard)** — HA yalnızca VPN içinde erişilebilir kalır. Telefonda VPN açıkken
   ev içi adres kullanılır. "Oturumu açık tut" için yine HTTPS gerekir (ör. Tailscale HTTPS sertifikası).
3. Ters vekil (reverse proxy) + Let's Encrypt — yalnızca deneyimliyseniz. HA'da
   `http: use_x_forwarded_for/trusted_proxies` doğru yapılandırılmalı, `ip_ban_enabled: true` ve
   `login_attempts_threshold` açılmalıdır.

Ev interneti kesildiğinde **hiçbir yöntemle** dışarıdan erişilemez. Yerel ağdan kontrol yerel
entegrasyonlarla sürer.

## Önerilen HA ayarları (sizin yapmanız gerekir)

```yaml
# configuration.yaml — yalnızca HA'ya doğrudan internetten erişiliyorsa (Nabu Casa/VPN'de gerekmez)
http:
  ip_ban_enabled: true
  login_attempts_threshold: 5
```

- HA Profil > Çok faktörlü kimlik doğrulama > **Kimlik Doğrulayıcı Uygulama**'yı açın.
- Yönetici hesabını günlük kullanımda kullanmayın; aile için ayrı hesap açın.
- Otomatik yedeklemeyi açın (Ayarlar > Sistem > Yedeklemeler) ve yedekleri şifreli tutun.
- Bağımlılık güvenliği: uygulamanın çalışma zamanı bağımlılığı yoktur. HA ve entegrasyonları için HA
  güncellemelerini takip edin (Sistem sağlığı ekranı bekleyen güncellemeleri listeler).

## Kalan riskler (açıkça)

- **Aynı köken:** Uygulama HA ile aynı kökende çalışır. HA'nın kendi arayüzünde bir XSS açığı olursa,
  saldırgan kod bu kökende çalışacağından uygulamanın şifreli kasasını *kullanabilir*: şifreli token
  dışarı kopyalanamaz ama aynı sayfa içinde çözülebilir. Web tarayıcısında Apple Keychain'in tam karşılığı
  yoktur. Yerel bir SwiftUI uygulaması Keychain kullanabilirdi; bu, gelecek adımlarda belirtildi.
- HA'nın kendi arayüzü "beni hatırla" seçildiğinde token'larını localStorage'da tutar. Bu, bu projenin
  kontrolünde değildir.
- `/local/` dosyaları kimlik doğrulamasız sunulur. Uygulama kodu gizli değildir ve gizli bilgi içermez.
- Basılı tutarak onay, telefonu ele geçirmiş birine karşı değil, **yanlışlıkla dokunmaya** karşı
  korumadır. Gerçek koruma telefon kilidi + HA'daki kilit/alarm kodudur.
- CSP `connect-src` WebSocket için `ws:`/`wss:` şemalarına izin verir (Safari uyumluluğu). Betik
  yükleme yine yalnızca aynı kökenden yapılabilir.
