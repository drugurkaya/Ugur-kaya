# Uygulama Durumu

Son güncelleme: 2026-10-21. "Test edildi", gerçek Home Assistant 2026.2.3 çekirdeğinde **simüle
cihazlarla** test edildiği anlamına gelir (bkz. TEST_PLAN.md). Gerçek donanımla hiçbir şey test edilmedi.

## Tamamlanma kriterleri

| Kriter | Durum | Not |
|---|---|---|
| Mimari ve kurulum belgeleri | TAMAMLANDI VE TEST EDİLDİ | Kurulum betiği bir HA yapılandırma kopyası üzerinde denendi |
| Home Assistant bağlantısı | TAMAMLANDI VE TEST EDİLDİ | Sizin HA kurulumunuz bu ortamdan görünmüyor: **KULLANICI İŞLEMİ GEREKİYOR** (kurulum) |
| Cihaz listesi gerçek entegrasyon verisinden | TAMAMLANDI VE TEST EDİLDİ | HA kayıtlarından; sahte cihaz eklenmez |
| Gerçek durumların gösterimi | TAMAMLANDI VE TEST EDİLDİ | Gerçek zamanlı (state_changed) |
| Komut gönderme | TAMAMLANDI VE TEST EDİLDİ | Simüle cihazlarla |
| Komut sonucunun gerçek durumla doğrulanması | TAMAMLANDI VE TEST EDİLDİ | Gönderildi / kabul edildi / doğrulandı ayrımı |
| Odalar ve alanlar | TAMAMLANDI VE TEST EDİLDİ | Oluştur, yeniden adlandır, sil, cihaz ata (yönetici) |
| Otomasyon oluşturma | TAMAMLANDI VE TEST EDİLDİ | Saat, gün doğumu/batımı, durum, sayısal eşik; koşullar; işlemler, bekleme, bildirim |
| Otomasyon çalıştırma ve izleme | TAMAMLANDI VE TEST EDİLDİ | Elle çalıştırma, gerçek tetikleyici, HA iz kayıtları |
| Bağlantı hatalarının bildirilmesi | TAMAMLANDI VE TEST EDİLDİ | Türkçe mesaj + teknik ayrıntı |
| Türkçe arayüz | TAMAMLANDI VE TEST EDİLDİ | Cihaz adları HA'daki adlarıyla görünür |
| iPhone'da kullanım | KISMEN TAMAMLANDI | Chromium'da iPhone emülasyonuyla test edildi; **gerçek iPhone/Safari'de denenmedi** |
| Uzaktan erişim güvenliği | KULLANICI İŞLEMİ GEREKİYOR | Değerlendirildi ve belgelendi (SECURITY.md); Nabu Casa veya VPN kurulumu sizde |
| Yedekleme ve geri yükleme | TAMAMLANDI VE TEST EDİLDİ | Dışa aktarma betiği + uygulama içi JSON; tam yedek HA'nın kendi özelliğiyle |
| Yazılım testleri | TAMAMLANDI VE TEST EDİLDİ | 68 birim + 22 entegrasyon + 17 arayüz testi geçti |
| Xenon Smart entegrasyonu | ARAŞTIRILMASI GEREKİYOR | Platform belirsiz (Tuya mı, Lanbon mı?). Engeller DEVICE_COMPATIBILITY.md'de belgelendi |
| Sonoff entegrasyonu | KULLANICI İŞLEMİ GEREKİYOR | Yollar belgelendi; model listesi ve HACS kurulumu gerekli |
| Üçüncü taraf cihaz koşulları | TAMAMLANDI VE TEST EDİLDİ | Katalog + sihirbaz (config flow) |
| Gerçek / simüle ayrımı | TAMAMLANDI VE TEST EDİLDİ | Arayüzde "SİMÜLASYON" etiketi ve açıklaması |

## Özellik bazında durum

| Özellik | Durum |
|---|---|
| Giriş (HA hesabı, MFA destekli) | TAMAMLANDI VE TEST EDİLDİ (MFA gerçek TOTP ile denenmedi; birim testli) |
| Şifreli kalıcı oturum (HTTPS'te) | TAMAMLANDI VE TEST EDİLDİ (Chromium) |
| Ana ekran: durum, aktif/çevrim dışı/alarm sayıları | TAMAMLANDI VE TEST EDİLDİ |
| Ana ekran: iç/dış ortam değerleri | TAMAMLANDI VE TEST EDİLDİ (iç ortam yalnızca odaya atanmış sensör varsa; dış ortam hava durumu servisinden ve öyle etiketli) |
| Sık kullanılanlar, açık olanlar, son olaylar (HA logbook) | TAMAMLANDI VE TEST EDİLDİ |
| Işık: aç/kapa, parlaklık, renk sıcaklığı, renk tonu | TAMAMLANDI VE TEST EDİLDİ |
| Priz/röle, fan, nemlendirici, siren | TAMAMLANDI VE TEST EDİLDİ |
| Panjur, vana (aç/kapa/durdur/konum) | TAMAMLANDI VE TEST EDİLDİ |
| İklimlendirme, su ısıtıcı | TAMAMLANDI VE TEST EDİLDİ |
| Kilit (basılı tutarak onay, kod) | TAMAMLANDI VE TEST EDİLDİ |
| Alarm (kurma/devre dışı, HA'da doğrulanan kod) | TAMAMLANDI VE TEST EDİLDİ |
| Medya oynatıcı, süpürge, düğme (temel) | TAMAMLANDI, GERÇEK DONANIMDA TEST EDİLMEDİ (yalnızca görsel duman testi) |
| Sensörler (sıcaklık, nem, güç, enerji, pil, hareket, kapı) | TAMAMLANDI VE TEST EDİLDİ |
| Senaryolar ve cihaz bazında sonuç | TAMAMLANDI VE TEST EDİLDİ |
| Otomasyon test (kuru çalıştırma) modu | TAMAMLANDI VE TEST EDİLDİ |
| Otomasyon güvenlik engelleri | TAMAMLANDI VE TEST EDİLDİ |
| Enerji: anlık güç, günlük/haftalık/aylık, cihaz/oda bazında, tarifeyle tahmini maliyet | TAMAMLANDI VE TEST EDİLDİ (demo sensörlerinde geçmiş veri az; grafik gerçek uzun dönem veriyle görülmedi) |
| Enerji eşik bildirimi | TAMAMLANDI VE TEST EDİLDİ (otomasyon ön doldurma); bildirimin telefona ulaşması test edilmedi |
| Sistem sağlığı (basit/teknik) | TAMAMLANDI VE TEST EDİLDİ |
| Disk alanı | DESTEKLENMİYOR (uygulamada) — HA OS arayüzünde görülebilir |
| Cihaz ekleme sihirbazı (keşif + HA config flow) | KISMEN TAMAMLANDI — akış başlatma/iptal test edildi; gerçek bir marka kurulumu yapılmadı; bazı özel alan türleri HA arayüzüne yönlendirir |
| Oturum yönetimi (açık oturumları sonlandırma) | TAMAMLANDI, GERÇEK DONANIMDA TEST EDİLMEDİ (API testli, ekran duman testli) |
| Çevrim dışı cihaz bildirimi (HA paketi) | KISMEN TAMAMLANDI — paket HA'da hatasız yükleniyor; gerçek bir kopma ile tetiklenmesi test edilmedi |
| iPhone push bildirimleri | KULLANICI İŞLEMİ GEREKİYOR — HA Companion uygulaması gerekir |
| Uygulama içi uyarılar (bağlantı, çevrim dışı, enerji eşiği) | TAMAMLANDI VE TEST EDİLDİ |
| Açık/koyu mod, küçük/büyük ekran | TAMAMLANDI VE TEST EDİLDİ (Chromium) |
| Otomasyon/senaryo dışa aktarma | TAMAMLANDI VE TEST EDİLDİ |
| İçe aktarma (uygulamadan) | DESTEKLENMİYOR — geri yükleme HA yedeğiyle yapılır |
| SwiftUI yerel uygulama | DESTEKLENMİYOR (bu ortamda) — Xcode/macOS yok |
| App Store'da yayın | DESTEKLENMİYOR — PWA App Store gerektirmez |

## Bilinen sorunlar / sınırlamalar

1. Gerçek iPhone Safari'de test edilmedi. WebKit farkları (ör. `color-mix`, `backdrop-filter`) görsel
   ayrıntıları etkileyebilir; işlevler standart API'lerle yazıldı.
2. HTTP (şifresiz) yerel adreste oturum kalıcı saklanamaz; her açılışta giriş gerekir.
3. İklim/fan modlarının bazı değerleri HA'nın ham adlarıyla görünür (ör. `on_high`). Ana modlar Türkçedir.
4. HA'nın "son olaylar" günlüğünden gelen bazı mesajlar entegrasyonun diline göre İngilizce olabilir.
5. Otomasyon oluşturucu "ve/veya" iç içe koşulları, şablonları ve çoklu varlık hedeflerini desteklemez.
   Bu tür otomasyonlar açılır ama yalnızca HA'da düzenlenir.
6. Enerji grafiği HA kayıt (recorder) istatistiğine bağlıdır; yeni eklenen sensörlerde ilk saatlerde boş görünür.
7. "Ev internet erişimi" doğrudan ölçülmez; bulut entegrasyonlarının durumundan çıkarılır ve öyle yazılır.
