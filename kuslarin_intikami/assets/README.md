# assets klasörü

Oyun **hiçbir harici dosyaya ihtiyaç duymaz**: bütün grafikler pygame çizim
komutlarıyla, bütün sesler ve müzikler açılışta matematiksel olarak üretilir.

İsterseniz kendi seslerinizi `assets/sounds/` klasörüne `.wav` veya `.ogg`
olarak koyarak üretilen sesleri değiştirebilirsiniz. Dosya adı aşağıdaki
adlardan biri olmalıdır:

| Dosya adı | Ne zaman çalar |
|---|---|
| `chirp_blue`, `chirp_yellow`, `chirp_red`, `chirp_gold` | Kuş cıvıltıları |
| `flap` | Kanat çırpma |
| `cry` | Vurulan kuşun ağlaması |
| `help`, `angry` | Yardım çağrısı / kızgın kuş |
| `throw`, `hit`, `thud` | Taş atma, isabet, yere düşme |
| `egg_drop`, `egg_crack` | Yumurta düşmesi / çatlaması |
| `point`, `combo`, `pickup`, `click`, `hurt` | Puan, kombo, toplama, düğme, hasar |
| `jump`, `honk`, `vroom` | Araba zıplama, korna, hızlanma |
| `engine0`, `engine1`, `engine2` | Motor döngüsü (düşük/orta/yüksek devir) |
| `music_calm`, `music_action` | Sakin ve heyecanlı müzik döngüleri |
| `music_victory`, `music_gameover` | Zafer ve oyun sonu müziği |

Örnek: `assets/sounds/cry.wav` koyarsanız ağlama sesi sizin dosyanızla çalar.
Ücretsiz ve lisansı uygun sesler için: https://freesound.org (CC0 filtresi), https://kenney.nl/assets
