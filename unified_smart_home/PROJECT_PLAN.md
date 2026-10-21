# Proje Planı — Unified Smart Home

## 1. Ortam incelemesi (2026-10-21)

| Soru | Bulgu |
|---|---|
| İşletim sistemi | Ubuntu 24.04 (Linux), bulut tabanlı geçici geliştirme kapsayıcısı. **Evinizdeki bilgisayar değil.** |
| Python / Node / Git | Python 3.13.16, Node 22.22, Git 2.43 kurulu |
| Docker | İstemci var, **servis (daemon) çalışmıyor** → Docker kullanılamadı |
| Home Assistant | Bu ortamda kurulu bir HA **yoktu**. Sizin HA kurulumunuz bu ortamdan **görünmüyor**. Testler için HA 2026.2.3 çekirdeği Python sanal ortamına kuruldu (yalnızca 127.0.0.1) |
| Xcode | **Yok** (Linux; Swift derleyicisi de yok) → yerel SwiftUI uygulaması derlenip test edilemez |
| Apple geliştirici hesabı | Bilinmiyor; PWA yolu hesap gerektirmez. SwiftUI'ye geçilirse kendi iPhone'unuza kurmak için ücretsiz Apple ID yeterli (7 günlük imza), kalıcı/TestFlight için yıllık Developer Program gerekir |
| Mevcut proje | Depoda bağımsız küçük uygulamalar var (randevu, oyunlar, ödeme takip). Hiçbirine dokunulmadı; proje `unified_smart_home/` klasöründe |
| Yerel ağ erişimi | **Yok.** Cihaz keşfi ve gerçek cihaz testleri ev ağınızda, HA üzerinden yapılmalı |
| İnternet | Kısıtlı vekil sunucu üzerinden; bazı üretici siteleri engelli (xenonsmart.com, Play Store, App Store) |

Sonuç: Gerçek cihazlarla çalışma bu ortamdan **mümkün değil**. Yazılım, gerçek bir HA çekirdeğine karşı
simüle cihazlarla geliştirilip test edildi; evinizdeki HA'ya kurulmaya hazırdır.

## 2. Seçilen mimari

Home Assistant merkezli; HA'nın kendi `www` klasöründen sunulan, derleme adımı ve çalışma zamanı
bağımlılığı olmayan bir PWA (ayrıntı: ARCHITECTURE.md). Gerekçe: Xcode yok; PWA gerçek tarayıcıda gerçek
HA ile uçtan uca test edilebiliyor; aynı köken CORS/karışık içerik sorunlarını ortadan kaldırıyor; HA
otomasyon/kayıt/yetki altyapısı yeniden yazılmıyor.

## 3. Aşamalar ve durum

| Aşama | İçerik | Durum |
|---|---|---|
| 1 Keşif | Ortam, HA, üretici araştırması, uyumluluk raporu, mimari | Tamamlandı (Xenon için sizden bilgi gerekiyor) |
| 2 Temel sistem | HA bağlantısı, cihaz listesi, gerçek durum, komut + doğrulama, hata yönetimi | Tamamlandı, gerçek HA ile test edildi |
| 3 iPhone arayüzü | Ana ekran, odalar, cihaz, gerçek zamanlı durum, Türkçe | Tamamlandı (gerçek iPhone'da denenmedi) |
| 4 Otomasyonlar | Senaryolar, oluşturucu, zamanlama, sensör tetikleyicileri, test modu, geçmiş | Tamamlandı, test edildi |
| 5 Güvenlik / uzaktan erişim | OAuth+MFA, şifreli oturum, hassas cihaz kuralları, yetki, uzaktan erişim planı | Tamamlandı; uzaktan erişim kurulumu sizde |
| 6 Testler | Birim, entegrasyon, arayüz, güvenlik | 107/107 geçti; gerçek donanım testi yapılamadı |
| 7 Son ürün | Kurulum, dağıtım, yedekleme, bilinen sorunlar, rapor | Tamamlandı |

## 4. Sizin yapmanız gerekenler (sırasıyla)

1. **HA kurulumu:** Evde HA yoksa Home Assistant Green veya Raspberry Pi + HA OS önerilir.
   Kurulum: https://www.home-assistant.io/installation/
2. **Xenon Smart bilgisi:** Kullandığınız uygulama adı ve cihaz modelleri (DEVICE_COMPATIBILITY.md §1).
3. **Sonoff model listesi** ve eWeLink hesabı; HACS + SonoffLAN kurulumu.
4. **Uzaktan erişim:** Nabu Casa veya Tailscale/WireGuard (SECURITY.md).
5. Uygulamayı kurun (README.md), iPhone'a ekleyin, TEST_PLAN.md'deki gerçek cihaz prosedürünü uygulayın.

## 5. Kurallar

Mevcut akıllı ev sistemleri, Apple Home yapılandırması ve cihaz eşleşmeleri değiştirilmez. Firmware
değişikliği, yeniden eşleştirme veya fabrika ayarı yalnızca açık onayınızla, faydası/riski/geri dönüşü
anlatıldıktan sonra yapılır. Yeni sistem mevcut yapının **yanında** çalışır: HA'ya bir entegrasyon
eklemek, üreticinin kendi uygulamasının çalışmasını durdurmaz (HomeKit Device istisnası belgelendi).
