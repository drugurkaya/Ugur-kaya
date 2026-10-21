# Hasta Takip

Hasta randevularını, kalp cerrahisi kayıtlarını ve cerrah icap takvimini takip etmek için basit, tek dosyalık bir uygulama.

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

### İcap Takvimi
- İki cerrah **birer hafta arayla** dönüşümlü icapçı olur
- Ayarlar: iki cerrahın adı, ilk icap haftasının başlangıç günü, ilk haftanın icapçısı ve devir saati (varsayılan 08:00)
- "Bugünün icapçısı" ve bir sonraki devrin ne zaman olacağı en üstte görünür
- Aylık renkli takvim; bir güne dokunarak o günü diğer cerraha verebilirsiniz (izin / nöbet değişimi), tekrar dokununca geri alınır
- Önümüzdeki 12 haftanın listesi, yazdırılabilir
- **Takvime aktar (.ics):** 12 aylık icap planını telefon, Outlook veya Google Takvim'e eklenebilir dosya olarak indirme

## Veriler nerede saklanır?
Veriler **yalnızca kullandığınız bilgisayarın tarayıcısında** saklanır. Hiçbir sunucuya gönderilmez.
Bu yüzden:
- Başka bir bilgisayarda ya da tarayıcıda açarsanız randevular görünmez.
- Tarayıcı geçmişini/site verilerini silerseniz randevular silinir.
- **Düzenli olarak "Yedek al" butonuna basın.** Oluşan `.json` dosyasını saklayın.
  Yedek randevuları, ameliyatları ve icap takvimini içerir. Gerekirse "Yedekten yükle" ile geri getirebilirsiniz.

Yedek dosyaları hasta bilgisi içerir. Güvenli bir yerde saklayın.

---

## 🐦 Kuşların İntikamı (oyun)

Bu depoda ayrıca Python + Pygame ile yazılmış bir masaüstü oyunu bulunur:
[`kuslarin_intikami/`](kuslarin_intikami/README.md). Çalıştırmak için:

```bash
cd kuslarin_intikami
python -m pip install -r requirements.txt
python main.py
```

---

## 🥊 Çöp Adam Arena (iPhone oyunu)

[`cop_adam_arena/index.html`](cop_adam_arena/index.html): tek dosyalık çubuk adam dövüş oyunu.
iPhone'da Safari ile açılır, kurulum gerekmez (Paylaş → "Ana Ekrana Ekle" ile uygulama gibi açılır).

- **4 tuş:** ◀ Geri/Blok, ▶ İleri, **Y** Yumruk, **T** Tekme
- **Kombinasyonlar:** Y-Y-Y Kroşe · ▶-Y Aparkat · T-T Süpürme · ◀-▶-T Dönen Tekme · ▶-▶ Atılma
- Puan alan her vuruşta alkış, büyük vuruşta ve kombolarda tezahürat
- Ağır darbeyle yere düşünce kalp atışı sesi, tehlike işareti ve EKG ekranı
- Her kazanılan seviyede çöp adamın kasları büyür (8 kas seviyesi)
- Bilgisayarda klavye: ← → , J/Z yumruk, K/X tekme, Esc duraklat

Ses gelmiyorsa iPhone'un sessiz düğmesini kapatın.
