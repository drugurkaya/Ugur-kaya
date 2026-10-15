# Hasta Takip

Hasta randevularını ve kalp cerrahisi kayıtlarını takip etmek için basit, tek dosyalık bir uygulama.

## Nasıl açılır?
`randevu.html` dosyasını bilgisayarınıza indirin ve çift tıklayın. Chrome, Edge, Safari veya Firefox'ta açılır.
İnternet ya da kurulum gerekmez.

## Özellikler

### Randevular
- Randevu ekleme, düzenleme ve silme (ad, telefon, tarih, saat, tür, not)
- Bugün / Yaklaşan / Geçmiş / Tümü görünümleri, isim veya telefonla arama
- "Geldi / Gelmedi" işaretleme, aylık özet sayılar
- Aynı saate çakışan randevu uyarısı
- Telefon numarasına dokunarak arama (telefonda)
- Yazdırma ile günlük liste çıktısı

### Ameliyatlar
- Hasta bilgileri, preop EF, EuroSCORE II
- Ameliyat bilgileri: tarih, cerrah, aciliyet, yaklaşım, on/off-pump, KPB ve kros klemp süresi
- **Koroner bypass:** her greft için greft adı (LIMA, RIMA, SVG, radiyal, GEA…), hedef damar(lar),
  anastomoz şekli (tek / sekansiyel / kompozit) ve endarterektomi; distal anastomoz sayısı otomatik hesaplanır
- **Kapak:** kapak (aort, mitral, triküspit, pulmoner), işlem (replasman, tamir…), protez tipi,
  marka/model (öneri listesiyle) ve boyut
- Aort ve diğer işlemler için serbest metin
- Postoperatif yoğun bakım/yatış süresi, komplikasyonlar, sonuç (taburcu/exitus)
- Türe göre filtreleme, arama, özet sayılar (mortalite dahil)
- **Excel'e aktar** ile tüm ameliyatları tablo olarak indirme

## Veriler nerede saklanır?
Veriler **yalnızca kullandığınız bilgisayarın tarayıcısında** saklanır. Hiçbir sunucuya gönderilmez.
Bu yüzden:
- Başka bir bilgisayarda ya da tarayıcıda açarsanız randevular görünmez.
- Tarayıcı geçmişini/site verilerini silerseniz randevular silinir.
- **Düzenli olarak "Yedek al" butonuna basın.** Oluşan `.json` dosyasını saklayın.
  Yedek hem randevuları hem ameliyatları içerir. Gerekirse "Yedekten yükle" ile geri getirebilirsiniz.

Yedek dosyaları hasta bilgisi içerir. Güvenli bir yerde saklayın.
