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

---

## ⚔️ Shadow Warriors: Rise of the Last Fighter (3D dövüş oyunu)

[`shadow_warriors/`](shadow_warriors/README.md): masaüstü tarayıcı için Three.js + TypeScript ile yazılmış
gerçek zamanlı 3D dövüş oyunu. İki dövüşçü (The Phantom, Iron Fang), kombo ve özel güç sistemi,
üç zorluk seviyeli yapay zekâ, karanlık tapınak arenası, menüler ve ayarlar.

```bash
cd shadow_warriors
npm install
npm run dev
```

GitHub Pages'te `https://<kullanıcı-adı>.github.io/<depo>/shadow_warriors/` adresinden de açılır.
Klavye: W/A/S/D hareket, J/K yumruk, U/I tekme, L blok, Space kaçınma, O özel saldırı, Esc duraklat.

---

## 🫀 HEARTLINE: Bir Kalp Cerrahının Hayatı (3D anlatı oyunu)

[`heartline/`](heartline/README.md): Bursa'da 50 yaşındaki kalp cerrahı Dr. Kemal Arslan'ın günü.
Saat 05:12'de yoğun bakımdan gelen telefonla başlar: cevapla, bekle ya da reddet; telefonda talimat
ver, evde hazırlan (her eylem dakika harcar, hasta beklemez), hastaneye git, yatak başında ve
ameliyathanede karar ver, aileyle konuş. Gizli klinik neden (cerrahi kanama / koagülopati /
tamponat), dakika dakika işleyen hasta modeli, stres–yorgunluk–ekip güveni–aile gibi oyunu
gerçekten etkileyen değişkenler, gecikmeli sonuçlar, karakter hafızası, kanıta dayalı kurgusal
inceleme/hukuk süreci ve altı farklı son. Türkçe/İngilizce, masaüstü ve dokunmatik, kayıt/yükleme.
Three.js + TypeScript.

```bash
cd heartline
npm install
npm run dev
```

GitHub Pages'te `https://<kullanıcı-adı>.github.io/<depo>/heartline/` adresinden de açılır.
Kurgusaldır; tıbbi ve hukuki içerik sadeleştirilmiştir, klinisyen/hukukçu denetiminden geçmemiştir.

---

## 💳 Ödeme Takip (iPhone, sesli kayıt + yapay zekâ)

[`odeme_takip/index.html`](odeme_takip/index.html): banka ödemeleri, kredi taksitleri, kredi kartı, fatura,
kira ve bireysel ödemeleri aylık takip eden iPhone uyumlu uygulama.

- **Sesli kayıt:** ortadaki 🎙️ düğmesine dokunup cümleyle anlatın:
  *"Garanti'den çektiğim krediye her ayın 15'inde 4.250 lira, 24 taksit"*,
  *"Ahmet'e 3 Kasım'da iki bin lira vereceğim"*, *"Elektrik faturasını ödedim"*.
- **Yapay zekâ ile anlamlandırma:** cümle birebir değil, anlamına göre Claude tarafından ödeme kaydına
  çevrilir (tür, tutar, banka/kişi, vade günü, taksit sayısı, tek seferlik tarih). Sonuç kaydetmeden önce
  düzenlenebilir bir formda gösterilir. "…ödedim" gibi cümleler ilgili kaydı bu ay *ödendi* yapar.
  Ayarlar'a Anthropic API anahtarı girilmezse uygulama basit Türkçe kurallarla yorumlar.
- **Aylık görünüm:** toplam / ödenen / kalan, taksit numarası (ör. 3/24), tek dokunuşla "ödendi".
- **Uyarılar:** açılışta gecikmiş ve yaklaşan ödemeler en üstte; uygulama simgesinde rozet;
  **"Tümünü iPhone Takvimine ekle"** ile her ödeme vadesinden X gün önce ve vade günü 09:00'da
  iPhone'un kendi alarmıyla hatırlatılır (uygulama kapalıyken de çalışır).
- **Kısayol:** Ayarlar → *iPhone kısayolu* bölümündeki adımlarla "Hey Siri, Ödeme Kaydet" dediğinizde
  cümleniz doğrudan uygulamaya gider. Arkaya dokunma ve Eylem düğmesine de atanabilir.
  Uygulama adresine `?metin=...` (dikte edilen cümle) veya `?ses=1` (sesli kaydı aç) eklenebilir.
- **Yedek:** kayıtlar yalnızca telefonda saklanır; düzenli olarak "Yedek al" ile iCloud Drive'a kaydedin.

### iPhone'a kurulum
Ses tanıma ve Kestirmeler için uygulamanın bir web adresinden açılması gerekir. En kolayı GitHub Pages:
GitHub'da depo → **Settings → Pages → Build and deployment → Branch** olarak bu dalı ve `/ (root)`
seçin. Birkaç dakika sonra adres `https://<kullanıcı-adı>.github.io/<depo>/odeme_takip/` olur.
Bu adresi iPhone'da Safari ile açın, Ayarlar sekmesindeki kısayol adımlarını uygulayın.
