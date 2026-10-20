# 🐦 Kuşların İntikamı 🚗

Renkli ağaçlardaki kuşlara taş atıp onları korkuttuğun, sonra da kızgın
kuşların intikamından arabayla kaçtığın, çizgi film tarzında 2D bir masaüstü
oyunu. Python + Pygame ile yazılmıştır. Hiçbir resim ya da ses dosyası
gerekmez: bütün grafikler kodla çizilir, bütün sesler ve müzikler açılışta
kodla üretilir.

## Kurulum ve çalıştırma

Gerekenler: **Python 3.9 veya üstü** (https://www.python.org/downloads/ —
Windows'ta kurulumda "Add Python to PATH" kutusunu işaretleyin).

```bash
cd kuslarin_intikami
python -m pip install -r requirements.txt
python main.py
```

(macOS / Linux'ta `python` yerine `python3` yazmanız gerekebilir.)

**Komut yazmadan:** Windows'ta `Oyunu Baslat.bat` dosyasına çift tıklayın;
pygame kurulu değilse kendisi kurar, sonra oyunu açar.

> `ModuleNotFoundError: No module named 'pygame'` hatası alırsanız
> `python -m pip install pygame` komutunu çalıştırın (o da olmazsa
> `python -m pip install pygame-ce`).

## iPhone / tarayıcı sürümü

`web/index.html`, oyunun dokunmatik kontrollü HTML5 sürümüdür (aynı üç bölüm,
aynı kuşlar, sesler ve puanlar). Kurulum gerekmez; iPhone'da Safari ile açılır.

- **Taş atma:** ekrana bas ve tut (güç toplanır), parmağını kaydırarak nişan al, bırak.
- **Yürüme:** sol alttaki ◀ ▶ düğmeleri. Bölüm 2 sonunda arabaya dokununca çocuk arabaya biner.
- **Araba:** ◀ ▶ ileri-geri, GAZ / FREN hız, ZIPLA engelleri aşar.
- Telefonu **yan çevirin**; dikey tutunca oyun duraklar ve uyarı çıkar.
- Tam ekran için Safari'de **Paylaş → Ana Ekrana Ekle**.
- Ses gelmiyorsa iPhone'un yanındaki sessiz düğmesini kapatın.

Kendi bağlantınızla yayınlamak için `web` klasörünü GitHub Pages veya herhangi
bir statik barındırmaya yükleyin (`index.html` + `icon.png` yeterli).

## Windows için çift tıklanabilir EXE

**Kolay yol:** `build_exe.bat` dosyasına çift tıklayın. Birkaç dakika sonra
`dist\KuslarinIntikami.exe` oluşur; bu dosyayı istediğiniz yere kopyalayıp
çift tıklayarak oynayabilirsiniz (Python kurulu olmayan bilgisayarlarda da çalışır).

**Elle:**

```bat
python -m pip install pygame pyinstaller
python -m PyInstaller --noconfirm --onefile --windowed --name KuslarinIntikami --add-data "assets;assets" main.py
```

> macOS/Linux'ta `--add-data "assets:assets"` (noktalı virgül yerine iki nokta) kullanın.

## Kontroller

| Tuş / Fare | Görev |
|---|---|
| Fareye **basılı tut** | Atış gücünü topla (güç çubuğu dolar) |
| Fareyi **sürükle** | Nişan yönünü ayarla (yörünge önizlemesi görünür) |
| Fareyi **bırak** | Taşı fırlat |
| **A / D** (← / →) | Bölüm 1-2: yürü, dalan kuşlardan kaç • Bölüm 3: arabayı ileri-geri sür |
| **W / ↑** | Arabayla hızlan |
| **S / ↓** | Arabayla yavaşla |
| **Boşluk** | Arabayla zıpla (Bölüm 2 sonunda: arabaya bin) |
| **E** | Arabaya bin |
| **P / ESC** | Duraklat (ses ayarları burada) |
| **M** | Bütün sesleri kapat/aç |
| **F11** | Tam ekran |

Ekranın sağ üstünde **Duraklat**, **Yeniden Başlat** ve **Ses** düğmeleri
vardır. Pencere fareyle yeniden boyutlandırılabilir; oyun oranını koruyarak
ölçeklenir.

## Oyun

**Bölüm 1 – Kuşlarla Tanışma:** Yavaş kuşlar, uzun yörünge önizlemesi.
12 kuşu kaçırınca bölüm biter.

**Bölüm 2 – Kuşların Öfkesi:** Daha hızlı kuşlar ve gökyüzünden geçen
**sürüler** (birini korkutursan bütün sürü dağılır, puanlar toplanır).
Bir süre sonra **kuşlar intikam ister**: oyuncunun üzerine dalış yapar,
üstünden geçerken yumurta bırakır (yumurta ekranı kısa süre kapatır ve
seni yavaşlatır). Ağaçlara giderek daha çok kuş toplanır, saldırılar hızlanır.
A/D ile kaç ya da dalan kuşu taşla savuştur. 22 kuşu kaçırınca bir araba
gelir: **arabaya bin!**

**Bölüm 3 – Büyük Kaçış:** Arabayla bitiş çizgisine ulaş. Yolda taşlar,
yuvarlanan yumurtalar, kaygan yumurta sarısı ve yolu kesen kuş barikatları
var (bazı kuşlar son anda kaçar!). Kuşlar havadan dalış yapar (önce kırmızı
**!** uyarısı ve gölge çıkar; bazıları son anda yön değiştirir), yumurta
bombalar ve arkadan bir **sürü kovalar**: yavaşlarsan yaklaşır, hızlanırsan
geride kalır. İngiliz anahtarı dayanıklılığı onarır, yıldızlar puan verir.

### Puanlar

| Kuş | Puan |
|---|---|
| Küçük mavi serçe | 10 |
| Sarı kanarya | 20 |
| Hızlı kırmızı kuş (sık dal değiştirir) | 30 |
| Nadir altın kuş (hiç yerinde durmaz) | 100 |

- Taşın yakınından geçtiği kuş korkup kaçar → kuşun puanı.
- **Doğrudan isabet** → +15 bonus; kuş sersemler, büyük gözyaşlarıyla
  ağlar, yumurta atar (yumurta yuvarlanır, çatlar, içinden kafasında
  kabukla bir civciv çıkıp kaçar), bazen arkadaşlarını yardıma çağırır;
  yakındaki kuşlar panikle havalanır.
- Aynı atışta birden çok kuş kaçarsa her ek kuş için bonus (ÇİFTE!, ÜÇLÜ!...).
- Arka arkaya başarılı atışlar **kombo çarpanını** artırır (x1.5, x2, ... x4).
- Taşlar sınırlıdır; yerde beliren taş yığınlarının üzerine yürüyerek taş
  toplayabilirsin. Taşların biterse bir kez "son şans" yığını gelir.
- Bölüm sonunda kalan her taş +5 puan.

Kaybedersen **Bölümü Tekrar Dene** ile o bölümün başından (o andaki
puanınla) devam edebilir ya da **Yeniden Başla** ile her şeyi sıfırlayabilirsin.
En yüksek puan (rekor) bilgisayarında saklanır.

### Sesler

Kuş sesleri, efektler, motor ve müzik **ayrı ayrı** açılıp kapatılabilir
(Ana menü → Ses Ayarları veya oyunda P / ESC). Ses kartı yoksa oyun sessiz
çalışmaya devam eder.

## Proje yapısı

```
kuslarin_intikami/
├── main.py                 # Başlatıcı
├── requirements.txt
├── build_exe.bat           # Windows EXE oluşturucu
├── assets/                 # İsteğe bağlı: kendi seslerin (assets/README.md)
├── game/
│   ├── app.py              # Pencere, oyun döngüsü, ölçekleme, sahne geçişleri
│   ├── settings.py         # Bütün denge ayarları (puanlar, hızlar, bölümler)
│   ├── audio.py            # Ses sentezleyici + kategori bazlı ses yöneticisi
│   ├── art.py              # Ağaç, gökyüzü, çocuk, araba ve simge çizimleri
│   ├── particles.py        # Gözyaşı, tüy, yıldız, yumurta efektleri, uçan yazılar
│   ├── hud.py              # Düğmeler, gösterge paneli, ses paneli
│   ├── state.py            # Puan / can / bölüm istatistikleri
│   ├── utils.py            # Yardımcılar (yazı tipi, matematik, rekor kaydı)
│   ├── entities/           # Stone, Bird, Egg, Chick, Player, Car, engeller
│   └── scenes/             # Menü, taş atma bölümleri, araba bölümü, oyun sonu
└── tests/
    └── test_playthrough.py # Oyunu baştan sona oynayan otomatik test botu
```

Dengeyi değiştirmek için `game/settings.py` dosyasını düzenleyin (ör. taş
sayısı, hedef kuş sayısı, kuş hızları, araba hızı, bölüm uzunluğu).

## Test

```bash
python -m pip install pytest
python -m pytest tests -q
```

Test botu menüden OYNA'ya basar, Bölüm 1 ve 2'de kuşlara nişan alıp taş atar,
arabaya biner, Bölüm 3'te engellerin üstünden zıplayarak bitiş çizgisine ulaşır;
ardından duraklatma, ses düğmeleri, kaybetme, bölümü tekrar deneme ve yeniden
başlatmada değerlerin sıfırlandığını kontrol eder. Pencere veya ses kartı
gerekmez. `SHOTS_DIR=klasor` ortam değişkeniyle ekran görüntüleri kaydeder.
