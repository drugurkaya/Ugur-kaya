# Unified Smart Home — "Evim"

Farklı markalardaki akıllı ev cihazlarını **Home Assistant** üzerinden tek bir iPhone uygulamasında
toplayan, Türkçe ve güvenlik öncelikli bir arayüz.

- Cihazları odalara göre görürsünüz, gerçek durumlarını izlersiniz ve kontrol edersiniz.
- Her komutun cihaz tarafından **gerçekten uygulanıp uygulanmadığını** görürsünüz.
- Otomasyon ve senaryoları teknik bilgi olmadan kurarsınız.
- Enerjiyi takip eder, sistem sağlığını tek ekranda görürsünüz.

> **Durum:** Yazılım hazır ve 107 otomatik testten geçti. Testler gerçek bir Home Assistant
> çekirdeğinde **simüle cihazlarla** yapıldı. **Evinizdeki cihazlarla henüz denenmedi.**
> Xenon Smart için sizden bilgi gerekiyor; ayrıntılar
> [DEVICE_COMPATIBILITY.md](DEVICE_COMPATIBILITY.md) ve [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) dosyalarında.

## Gerekenler

| Bileşen | Gerekli mi? | Not |
|---|---|---|
| Home Assistant (HA OS önerilir) | **Evet** | Ör. Home Assistant Green, Raspberry Pi 4/5 veya mini PC |
| iPhone + Safari | Evet | iOS 16.4 veya üzeri önerilir |
| HTTPS adres (Nabu Casa veya VPN + sertifika) | Önerilir | Oturumun kalıcı olması ve ev dışından erişim için |
| HA Companion uygulaması (App Store) | Bildirimler için | Push bildirimleri bunun üzerinden gelir |
| Zigbee koordinatörü (USB) | Zigbee cihazları yerel bağlanacaksa | Ör. Sonoff ZBDongle-E/P |
| HACS | Sonoff (SonoffLAN) ve tuya-local için | https://hacs.xyz |
| Matter Server / Thread sınır yönlendirici | Matter/Thread cihazları için | |

## Kurulum

### 1) Home Assistant'a yükleme

HA yapılandırma klasörüne erişebilen bir terminalden (HA OS'te "Terminal & SSH" eklentisi):

```bash
git clone https://github.com/drugurkaya/Ugur-kaya.git
cd Ugur-kaya/unified_smart_home
deployment/install_to_ha.sh /config               # yalnızca uygulama
deployment/install_to_ha.sh /config --with-package  # + çevrim dışı bildirim paketi
```

Terminal kullanmıyorsanız `app/` klasörünü Samba ya da File Editor ile `/config/www/unified-smart-home/`
olarak kopyalayın. `www` klasörü yeni oluşturulduysa HA'yı bir kez yeniden başlatın.

Betik `configuration.yaml` dosyasını **değiştirmez** ve mevcut otomasyonlara dokunmaz.

### 2) İlk bağlantı

Tarayıcıda `https://<home-assistant-adresiniz>/local/unified-smart-home/index.html` adresini açın ve
HA kullanıcı adınız ile parolanızla giriş yapın. Yönetici olmayan hesaplar cihazları kontrol edebilir ama
otomasyon düzenleyemez.

### 3) iPhone'a uygulama gibi ekleme

1. iPhone'da **Safari** ile yukarıdaki adresi açın ve giriş yapın.
2. Paylaş düğmesi → **Ana Ekrana Ekle** → "Evim".
3. Uygulama artık tam ekran açılır. HTTPS adresinde "Bu cihazda oturumu açık tut" seçilirse yeniden giriş
   istenmez.

Yerel ağ izni gerekmez (uygulama yalnızca HA ile konuşur). Bildirimler için Companion uygulamasını kurup
bildirim iznini verin (Ayarlar ekranında adımlar var). App Store'da yayın **yoktur ve gerekmez**.

### 4) Ev dışından erişim

**Port açmayın.** En kolay yol Home Assistant Cloud (Nabu Casa). Uygulama adresi
`https://<id>.ui.nabu.casa/local/unified-smart-home/index.html` olur. Alternatif olarak Tailscale/WireGuard
VPN kullanabilirsiniz. Ayrıntılar: [SECURITY.md](SECURITY.md).

## Cihaz ekleme

Uygulamada **Sistem → Yeni cihaz ekle**. Marka seçince o markanın bağlantı yolları, yerel/bulut durumu,
gereken ek donanım ve güvenlik notları gösterilir. "Kurulumu başlat" HA'nın kendi yapılandırma akışını
açar. Bulunamayan cihazlar için olası nedenler adım adım listelenir.

## Yedekleme ve geri yükleme

1. **Tam yedek (önerilen):** HA → Ayarlar → Sistem → Yedeklemeler → otomatik yedeklemeyi açın. Geri
   yükleme aynı ekrandan veya yeni kurulumda "Yedekten geri yükle" ile yapılır.
2. **Okunabilir dışa aktarma:** Uygulama → Sistem → "Otomasyon ve senaryoları dışa aktar" (JSON). Ya da:
   ```bash
   USH_HA_URL=https://... USH_HA_TOKEN=<uzun ömürlü token> python3 scripts/export_ha_config.py yedekler/
   ```
3. **Uygulama güncellemesi geri alma:** `install_to_ha.sh` önceki sürümü
   `/config/www/.ush-backups/` altına taşır. Geri almak için o klasörü `www/unified-smart-home` adıyla geri koyun.
4. **Başarısız HA güncellemesi:** HA güncelleme öncesi otomatik yedek alır. Sorun olursa
   Ayarlar → Sistem → Yedeklemeler'den güncelleme öncesi yedeği geri yükleyin.

## Geliştirme ve testler

```bash
npm test                                            # birim testleri (HA gerekmez)
python3 -m venv .venv-ha && .venv-ha/bin/pip install homeassistant home-assistant-frontend
USH_HA_VENV=$PWD/.venv-ha scripts/run_tests.sh      # + gerçek HA ile entegrasyon ve arayüz testleri
```

## Belgeler

[PROJECT_PLAN.md](PROJECT_PLAN.md) · [ARCHITECTURE.md](ARCHITECTURE.md) ·
[DEVICE_COMPATIBILITY.md](DEVICE_COMPATIBILITY.md) · [SECURITY.md](SECURITY.md) ·
[IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) · [TEST_PLAN.md](TEST_PLAN.md) · [CHANGELOG.md](CHANGELOG.md)
