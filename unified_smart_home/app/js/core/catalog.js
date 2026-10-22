// Marka / entegrasyon kataloğu. Cihaz ekleme sihirbazı ve uyumluluk ekranı bu bilgiyi kullanır.
// Ayrıntılı gerekçeler ve kaynaklar: DEVICE_COMPATIBILITY.md
// "status" değerleri son rapordaki durum etiketleriyle aynıdır.

export const Status = Object.freeze({
  SUPPORTED: 'Desteklenir (HA çekirdek entegrasyonu)',
  COMMUNITY: 'Topluluk entegrasyonu ile desteklenir',
  NEEDS_RESEARCH: 'ARAŞTIRILMASI GEREKİYOR',
  USER_ACTION: 'KULLANICI İŞLEMİ GEREKİYOR',
  UNSUPPORTED: 'DESTEKLENMİYOR',
});

export const BRANDS = [
  {
    id: 'xenon',
    name: 'Xenon Smart',
    status: Status.NEEDS_RESEARCH,
    protocols: ['Wi-Fi', 'Zigbee (ağ geçidi ile)', 'Bluetooth (bazı modeller)'],
    connectivity: 'unverified',
    summary:
      'Xenon Smart ürünleri birden fazla altyapıyla satılıyor. Hangi uygulamayı kullandığınız entegrasyon yolunu belirler; ' +
      'marka adına bakarak tek bir platform varsayılamaz.',
    paths: [
      {
        title: 'A) Cihazlar "Tuya Smart" veya "Smart Life" uygulamasında görünüyorsa',
        integration: 'tuya',
        kind: 'core',
        connectivity: 'cloud',
        steps: [
          'Home Assistant > Entegrasyonlar > Tuya ekleyin.',
          'Smart Life / Tuya Smart uygulamasında Ben > ayarlar simgesi > Hesap ve Güvenlik altındaki "Kullanıcı Kodu"nu girin.',
          'HA ekranındaki QR kodu Smart Life uygulamasıyla okutun.',
        ],
        notes: [
          'Bulut bağımlıdır: internet veya Tuya sunucusu kesilirse kontrol durur.',
          'Yerel kontrol için topluluk entegrasyonu "tuya-local" (HACS) değerlendirilebilir; cihaz başına yerel anahtar gerekir ve firmware güncellemeleri uyumluluğu bozabilir.',
        ],
      },
      {
        title: 'B) Cihazlar yalnızca "Xenon Smart" / "XenonSmartHome" uygulamasında görünüyorsa',
        integration: null,
        kind: 'none',
        connectivity: 'cloud',
        steps: [
          'Uygulamanın Ayarlar > Hakkında bölümündeki sürüm ve cihaz bilgisi sayfasının ekran görüntüsünü paylaşın.',
          'Cihaz modelini (ör. X7014, X7052, X7964) ve kutudaki/arkadaki etiketin fotoğrafını paylaşın.',
          'Uygulamada "Alexa / Google Home / Tuya / Home Assistant / Matter" bağlantı seçeneği var mı kontrol edin.',
        ],
        notes: [
          'XenonSmartHome Android paket adı (com.lanbon.swit.xenonsmart) uygulamanın Lanbon altyapısına dayandığını gösteriyor. Lanbon cihazları için resmî bir HA entegrasyonu bulunamadı.',
          'Markalı (OEM) Tuya uygulamalarında oluşturulmuş hesaplar HA Tuya entegrasyonuna doğrudan bağlanamayabilir ("designated app" hatası). Bu durumda cihazları Smart Life uygulamasına yeniden eşleştirmek gerekir — bu, mevcut otomasyonlarınızı etkiler ve onayınız olmadan yapılmamalıdır.',
        ],
      },
      {
        title: 'C) Zigbee modeller (ör. X7052) ve Xenon Zigbee ağ geçidi',
        integration: 'zha',
        kind: 'core',
        connectivity: 'local',
        steps: [
          'Mevcut Xenon/Tuya ağ geçidi ile çalışmaya devam edebilir (yol A veya B).',
          'Tamamen yerel kontrol için HA\'ya bağlı bir Zigbee koordinatörü (ör. USB Zigbee çubuğu) gerekir; cihaz bu koordinatöre yeniden eşleştirilir.',
        ],
        notes: ['Yeniden eşleştirme cihazı mevcut ağ geçidinden ve uygulamadan çıkarır. Onayınız olmadan yapılmaz.'],
      },
      {
        title: 'D) Kablolu "Xenon Smart Room Controller" sistemi',
        integration: null,
        kind: 'none',
        connectivity: 'unverified',
        steps: ['Bu sistemin protokolü (KNX, Modbus, özel) kurulum firmasından öğrenilmelidir.'],
        notes: ['Protokol öğrenilmeden entegrasyon yolu belirlenemez.'],
      },
    ],
  },
  {
    id: 'sonoff',
    name: 'Sonoff (eWeLink)',
    status: Status.COMMUNITY,
    protocols: ['Wi-Fi', 'Zigbee', 'Matter (bazı yeni modeller)'],
    connectivity: 'hybrid',
    summary: 'Sonoff cihazlarının hepsi aynı yolla bağlanmaz; model, firmware ve bağlantı türü belirleyicidir.',
    paths: [
      {
        title: 'A) Orijinal firmware, Wi-Fi modeller (eWeLink uygulaması)',
        integration: 'sonoff',
        kind: 'hacs',
        connectivity: 'hybrid',
        steps: [
          'HACS kurulu değilse kurun (https://hacs.xyz).',
          'HACS > "Sonoff LAN" (AlexxIT/SonoffLAN) entegrasyonunu kurun, HA\'yı yeniden başlatın.',
          'Entegrasyonlar > Sonoff ekleyin; eWeLink hesabınızla giriş yapın. Cihazlar aynı ağdaysa LAN üzerinden, değilse buluttan kontrol edilir.',
        ],
        notes: [
          'Alternatif: CoolKit\'in resmî "eWeLink Smart Home" eklentisi (yalnızca Home Assistant OS/Supervised).',
          'Topluluk raporlarına göre 2026 itibarıyla bazı güç ölçümlü cihazlarda enerji sensörleri gerçek zamanlı güncellenmeyebilir. Gerçek cihazda doğrulanmalı.',
        ],
      },
      {
        title: 'B) Sonoff Zigbee cihazları (SNZB serisi, ZBMINI vb.)',
        integration: 'zha',
        kind: 'core',
        connectivity: 'local',
        steps: ['HA\'ya bağlı bir Zigbee koordinatörü gerekir (ör. Sonoff ZBDongle-E/P).', 'Entegrasyonlar > ZHA ekleyin, ardından cihazı eşleştirme moduna alın.'],
        notes: ['Cihazlar şu an eWeLink Zigbee köprüsüne bağlıysa yol A ile de görülebilir.'],
      },
      {
        title: 'C) Matter destekli modeller (ör. MINIR4M)',
        integration: 'matter',
        kind: 'core',
        connectivity: 'local',
        steps: ['HA Matter Server eklentisi/kapsayıcısı gerekir.', 'Cihaz Apple Home\'daysa Ev uygulamasından "Eşleştirme modunu aç" ile ikinci denetleyici olarak HA\'ya eklenebilir.'],
        notes: [],
      },
      {
        title: 'D) DIY modu / ESPHome / Tasmota',
        integration: 'esphome',
        kind: 'core',
        connectivity: 'local',
        steps: ['Yalnızca donanımın desteklediği ve sizin onayladığınız durumda.'],
        notes: ['Firmware değiştirmek garantiyi bozabilir ve geri dönüş her modelde mümkün değildir. Önerilmeden önce model bazında değerlendirilir.'],
      },
    ],
  },
  {
    id: 'tuya',
    name: 'Tuya / Smart Life',
    status: Status.SUPPORTED,
    protocols: ['Wi-Fi', 'Zigbee (ağ geçidi)', 'Bluetooth'],
    connectivity: 'cloud',
    summary: 'HA\'nın resmî Tuya entegrasyonu (bulut). Yerel kontrol için topluluk entegrasyonu "tuya-local".',
    paths: [{ title: 'Resmî Tuya entegrasyonu', integration: 'tuya', kind: 'core', connectivity: 'cloud', steps: ['Entegrasyonlar > Tuya > Kullanıcı Kodu > QR kod.'], notes: [] }],
  },
  {
    id: 'apple',
    name: 'Apple Home (HomeKit) cihazları',
    status: Status.SUPPORTED,
    protocols: ['HomeKit (Wi-Fi/Thread/BLE)', 'Matter'],
    connectivity: 'local',
    summary:
      'HomeKit uyumlu cihazlar HA\'ya "HomeKit Device" entegrasyonuyla yerel olarak eklenebilir. Bir HomeKit cihazı aynı anda yalnızca BİR HomeKit denetleyicisiyle eşleşebilir; Apple Home\'dan çıkarılması gerekir. Matter cihazları ise birden fazla denetleyiciyi destekler.',
    paths: [
      { title: 'HomeKit Device (yalnızca HomeKit cihazları)', integration: 'homekit_controller', kind: 'core', connectivity: 'local', steps: ['Cihazı Apple Home\'dan kaldırın (onayınızla).', 'HA otomatik keşfeder; kurulum kodunu girin.'], notes: ['Apple Home\'dan kaldırılan cihaz oradaki otomasyonlardan da çıkar.'] },
      { title: 'Matter (çoklu denetleyici)', integration: 'matter', kind: 'core', connectivity: 'local', steps: ['Ev uygulaması > cihaz > Eşleştirme Modunu Aç > kodu HA\'ya girin.'], notes: ['Thread cihazları için Thread sınır yönlendiricisi gerekir (ör. HomePod mini / Apple TV 4K).'] },
      { title: 'HA cihazlarını Apple Home\'a göstermek', integration: 'homekit', kind: 'core', connectivity: 'local', steps: ['Entegrasyonlar > HomeKit Bridge.'], notes: ['Ters yön: HA\'daki cihazlar Siri ve Ev uygulamasında görünür.'] },
    ],
  },
  { id: 'shelly', name: 'Shelly', status: Status.SUPPORTED, protocols: ['Wi-Fi', 'Bluetooth', 'Z-Wave (Wave)'], connectivity: 'local', summary: 'Yerel, otomatik keşif.', paths: [{ title: 'Shelly', integration: 'shelly', kind: 'core', connectivity: 'local', steps: ['Otomatik keşif veya IP adresi ile ekleyin.'], notes: [] }] },
  { id: 'hue', name: 'Philips Hue', status: Status.SUPPORTED, protocols: ['Zigbee (Hue Bridge)'], connectivity: 'local', summary: 'Hue Bridge üzerinden yerel.', paths: [{ title: 'Philips Hue', integration: 'hue', kind: 'core', connectivity: 'local', steps: ['Keşfedilen köprüyü seçip köprüdeki düğmeye basın.'], notes: [] }] },
  { id: 'esphome', name: 'ESPHome', status: Status.SUPPORTED, protocols: ['Wi-Fi'], connectivity: 'local', summary: 'Yerel, şifreli API.', paths: [{ title: 'ESPHome', integration: 'esphome', kind: 'core', connectivity: 'local', steps: ['Otomatik keşif veya IP adresi.'], notes: [] }] },
  { id: 'zigbee', name: 'Zigbee (genel)', status: Status.USER_ACTION, protocols: ['Zigbee'], connectivity: 'local', summary: 'Zigbee koordinatörü (USB çubuk veya ağ koordinatörü) gerekir.', paths: [{ title: 'ZHA', integration: 'zha', kind: 'core', connectivity: 'local', steps: ['Koordinatörü takın, ZHA ekleyin.'], notes: ['Alternatif: Zigbee2MQTT (MQTT aracısı gerekir).'] }] },
  { id: 'matter', name: 'Matter', status: Status.USER_ACTION, protocols: ['Matter (Wi-Fi/Thread)'], connectivity: 'local', summary: 'Matter Server gerekir; Thread cihazları için sınır yönlendirici.', paths: [{ title: 'Matter', integration: 'matter', kind: 'core', connectivity: 'local', steps: ['Matter Server eklentisini kurun, Matter entegrasyonunu ekleyin.'], notes: [] }] },
  { id: 'tapo', name: 'TP-Link Tapo / Kasa', status: Status.SUPPORTED, protocols: ['Wi-Fi'], connectivity: 'local', summary: 'Yerel.', paths: [{ title: 'TP-Link Smart Home', integration: 'tplink', kind: 'core', connectivity: 'local', steps: ['IP adresi ve TP-Link hesabı ile ekleyin.'], notes: [] }] },
  { id: 'meross', name: 'Meross', status: Status.COMMUNITY, protocols: ['Wi-Fi'], connectivity: 'hybrid', summary: 'Meross\'un HomeKit destekli modelleri HomeKit Device ile yerel eklenebilir; diğerleri için topluluk entegrasyonu.', paths: [{ title: 'HomeKit Device (HomeKit destekli modeller)', integration: 'homekit_controller', kind: 'core', connectivity: 'local', steps: [], notes: [] }] },
  { id: 'aqara', name: 'Aqara', status: Status.USER_ACTION, protocols: ['Zigbee', 'Matter (M2/M3 hub)', 'Thread'], connectivity: 'local', summary: 'Aqara hub\'ı Matter köprüsü olarak veya cihazları doğrudan Zigbee koordinatörüne eşleştirerek.', paths: [{ title: 'Matter köprüsü', integration: 'matter', kind: 'core', connectivity: 'local', steps: [], notes: [] }] },
  { id: 'mqtt', name: 'MQTT cihazları', status: Status.USER_ACTION, protocols: ['MQTT'], connectivity: 'local', summary: 'MQTT aracısı (ör. Mosquitto) gerekir.', paths: [{ title: 'MQTT', integration: 'mqtt', kind: 'core', connectivity: 'local', steps: ['Mosquitto eklentisini kurun, MQTT entegrasyonunu ekleyin.'], notes: [] }] },
];

export const DISCOVERY_TROUBLESHOOTING = [
  ['Cihaz ve Home Assistant aynı yerel ağda mı?', 'Cihaz farklı bir Wi-Fi ağına (ör. 5 GHz yerine 2,4 GHz ya da misafir ağına) bağlı olabilir.'],
  ['Farklı VLAN veya misafir ağı', 'Misafir ağları cihazları birbirinden yalıtır. Cihazı ana ağa alın veya yönlendiricide VLAN\'lar arası erişimi açın.'],
  ['Cihaz çevrim dışı olabilir', 'Cihazın elektriğini ve üretici uygulamasında çevrim içi göründüğünü kontrol edin.'],
  ['mDNS / multicast engelleniyor olabilir', 'Bazı yönlendiricilerde "IGMP snooping" veya "multicast filtreleme" keşfi engeller. Cihazı IP adresiyle eklemeyi deneyin.'],
  ['Gerekli entegrasyon kurulu değil', 'Topluluk entegrasyonları (ör. Sonoff LAN) önce HACS ile kurulmalıdır.'],
  ['Üretici bulutu gerekiyor', 'Bazı cihazlar yalnızca üretici hesabı ile eklenebilir; hesap bilgileri HA\'ya girilir (bu uygulamada saklanmaz).'],
  ['Protokol desteklenmiyor', 'Cihaz özel bir protokol kullanıyorsa köprü veya ek donanım gerekebilir.'],
  ['Zigbee koordinatörü yok', 'Zigbee cihazları için HA\'ya bağlı bir koordinatör gerekir.'],
  ['Kimlik doğrulama başarısız', 'Hesap bilgilerini, iki adımlı doğrulamayı ve hesabın bölgesini (ör. Avrupa sunucusu) kontrol edin.'],
];
