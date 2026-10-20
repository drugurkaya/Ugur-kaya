"""Oyunun bütün sabitleri tek bir yerde.

Dengeyi (zorluk, puanlar, hızlar) değiştirmek isterseniz önce buraya bakın.
"""

# --- Pencere ---------------------------------------------------------------
TITLE = "Kuşların İntikamı"
WIDTH, HEIGHT = 1280, 720          # Mantıksal çizim çözünürlüğü
FPS = 60

# --- Dünya -----------------------------------------------------------------
GROUND_Y = 625                     # Çimenlerin üst çizgisi (taş atma bölümleri)
GRAVITY = 900.0                    # px / s²  (taşlar, yumurtalar)
ROAD_Y = 610                       # Araba bölümünde yolun üst çizgisi

# --- Renkler ---------------------------------------------------------------
WHITE = (255, 255, 255)
BLACK = (20, 20, 30)
OUTLINE = (40, 30, 50)
SKY_TOP = (94, 178, 255)
SKY_BOTTOM = (200, 236, 255)
GRASS = (110, 205, 90)
GRASS_DARK = (78, 168, 66)
DIRT = (150, 105, 70)
YELLOW = (255, 214, 60)
ORANGE = (255, 150, 40)
RED = (235, 70, 70)
PINK = (255, 140, 200)
PURPLE = (170, 110, 230)
GOLD = (255, 200, 40)
UI_BG = (30, 30, 60)
UI_PANEL = (255, 250, 235)
UI_ACCENT = (255, 120, 60)
UI_GREEN = (80, 200, 110)
UI_BLUE = (80, 150, 255)

# Ağaç yaprak renkleri: yeşil, pembe, sarı, mor
TREE_COLORS = [
    ((90, 200, 90), (140, 230, 120)),
    ((255, 130, 190), (255, 180, 220)),
    ((250, 210, 60), (255, 235, 130)),
    ((160, 110, 230), (200, 160, 250)),
]
FLOWER_COLORS = [(255, 90, 120), (255, 220, 70), (120, 160, 255),
                 (255, 255, 255), (230, 120, 255), (255, 150, 60)]

# --- Kuş türleri -----------------------------------------------------------
# points: kaçınca kazanılan puan, size: gövde yarıçapı, speed: uçuş hızı
# hop_chance: saniyede dal değiştirme olasılığı, scare: korkma yarıçapı
BIRD_TYPES = {
    "blue": dict(name="Mavi Serçe", points=10, size=17, speed=190,
                 body=(80, 150, 255), belly=(190, 225, 255), wing=(50, 110, 220),
                 hop_chance=0.05, scare=95, pitch=2600),
    "yellow": dict(name="Sarı Kanarya", points=20, size=20, speed=220,
                   body=(255, 215, 50), belly=(255, 245, 180), wing=(235, 170, 30),
                   hop_chance=0.08, scare=90, pitch=2200),
    "red": dict(name="Hızlı Kızılkuş", points=30, size=18, speed=330,
                body=(235, 60, 60), belly=(255, 190, 170), wing=(185, 35, 45),
                hop_chance=0.22, scare=80, pitch=3000),
    "gold": dict(name="Altın Kuş", points=100, size=16, speed=380,
                 body=(255, 200, 30), belly=(255, 240, 160), wing=(220, 150, 0),
                 hop_chance=0.35, scare=70, pitch=3400),
}

# --- Bölümler --------------------------------------------------------------
LEVELS = {
    1: dict(name="Kuşlarla Tanışma", kind="throw", stones=25, goal=12,
            speed_mult=0.7, max_birds=14, spawn_every=2.2,
            weights={"blue": 60, "yellow": 30, "red": 10, "gold": 2},
            flocks=False, revenge=False, preview=1.0,
            tip="Fareye basılı tut, nişan al ve bırak! Kuşları korkut."),
    2: dict(name="Kuşların Öfkesi", kind="throw", stones=32, goal=22,
            speed_mult=1.2, max_birds=20, spawn_every=1.5,
            weights={"blue": 35, "yellow": 35, "red": 28, "gold": 4},
            flocks=True, revenge=True, preview=0.45,
            tip="Kuşlar sinirlendi! A/D ile kaç, dalan kuşları taşla savuştur."),
    3: dict(name="Büyük Kaçış", kind="escape", length=22000,
            tip="W hızlan, S yavaşla, A/D ileri-geri, BOŞLUK zıpla!"),
}
LAST_LEVEL = 3

# --- Taş atma --------------------------------------------------------------
THROW_MIN_SPEED = 380
THROW_MAX_SPEED = 1250
CHARGE_TIME = 1.0                  # Tam güce ulaşma süresi (sn)
COMBO_STEP = 0.5                   # Her başarılı atış çarpanı bu kadar artırır
COMBO_MAX = 6
HIT_BONUS = 15                     # Doğrudan isabet ek puanı

# --- Oyuncu / Araba ----------------------------------------------------------
PLAYER_MAX_HEALTH = 100
PLAYER_SPEED = 300
CAR_MIN_SPEED = 160
CAR_CRUISE_SPEED = 340
CAR_MAX_SPEED = 680
CAR_ACCEL = 420
CAR_BRAKE = 600
CAR_JUMP_SPEED = 640
CAR_GRAVITY = 1700

# --- Ses kategorileri (ayrı ayrı açılıp kapatılabilir) -----------------------
SOUND_CATEGORIES = {
    "birds": "Kuş Sesleri",
    "sfx": "Efektler",
    "engine": "Motor",
    "music": "Müzik",
}
