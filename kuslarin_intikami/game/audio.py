"""Ses yöneticisi ve küçük bir ses sentezleyici.

Oyun hiçbir harici ses dosyasına ihtiyaç duymaz: bütün sesler (cıvıltılar,
taş, yumurta, motor, müzik) açılışta matematiksel olarak üretilir.
İsterseniz `assets/sounds/<ad>.wav` (veya .ogg) koyarak herhangi bir sesi
kendi dosyanızla değiştirebilirsiniz (ör. assets/sounds/chirp_blue.wav).

Sesler dört kategoriye ayrılır ve her biri ayrı ayrı açılıp kapatılabilir:
kuş sesleri, efektler, motor ve müzik.
"""

import array
import math
import os
import random

import pygame

from .settings import SOUND_CATEGORIES
from .utils import resource_path

TAU = 2 * math.pi


# =============================================================================
#  Sentez yardımcıları (saf Python, harici kütüphane yok)
# =============================================================================
def _osc(wave, p):
    """Tek bir dalga örneği; p = faz (0..1)."""
    p -= int(p)
    if wave == "sine":
        return math.sin(TAU * p)
    if wave == "square":
        return 0.6 if p < 0.5 else -0.6
    if wave == "tri":
        return 4.0 * abs(p - 0.5) - 1.0
    if wave == "saw":
        return 2.0 * p - 1.0
    return 0.0


def sweep(sr, f0, f1, dur, wave="sine", vib_rate=0.0, vib_depth=0.0, curve=1.0):
    """f0'dan f1'e kayan ton (cıvıltı, bonk, zıplama...)."""
    n = int(sr * dur)
    out = [0.0] * n
    ph = 0.0
    for i in range(n):
        t = i / n
        f = f0 + (f1 - f0) * (t ** curve)
        if vib_rate:
            f *= 1.0 + vib_depth * math.sin(TAU * vib_rate * i / sr)
        ph += f / sr
        out[i] = _osc(wave, ph)
    return out


def noise(sr, dur):
    return [random.uniform(-1.0, 1.0) for _ in range(int(sr * dur))]


def lowpass(samples, alpha):
    """Basit tek kutuplu alçak geçiren filtre (alpha küçükse daha boğuk)."""
    y = 0.0
    out = []
    for s in samples:
        y += alpha * (s - y)
        out.append(y)
    return out


def envelope(samples, attack=0.01, release=0.3, sr=22050):
    """Doğrusal yükselme ve sönme; release toplam sürenin oranıdır."""
    n = len(samples)
    a = max(1, int(attack * sr))
    r = max(1, int(release * n))
    for i in range(n):
        g = 1.0
        if i < a:
            g = i / a
        if i > n - r:
            g *= (n - i) / r
        samples[i] *= g
    return samples


def mix(*tracks):
    n = max(len(t) for t in tracks)
    out = [0.0] * n
    for t in tracks:
        for i, s in enumerate(t):
            out[i] += s
    return out


def concat(*parts):
    out = []
    for p in parts:
        out.extend(p)
    return out


def silence(sr, dur):
    return [0.0] * int(sr * dur)


def render_song(sr, bpm, tracks, beats, hats=None):
    """Nota listelerinden müzik üretir.

    tracks: [(dalga, ses, [(başlangıç_vuruşu, uzunluk_vuruş, midi), ...]), ...]
    """
    spb = 60.0 / bpm
    n = int(sr * beats * spb)
    buf = [0.0] * n
    for wave, vol, notes in tracks:
        for start, length, midi in notes:
            if midi is None:
                continue
            f = 440.0 * 2 ** ((midi - 69) / 12.0)
            s0 = int(start * spb * sr)
            ln = int(length * spb * sr)
            att = int(0.008 * sr)
            rel = max(1, int(ln * 0.35))
            inc = f / sr
            ph = 0.0
            for i in range(ln):
                idx = s0 + i
                if idx >= n:
                    break
                g = 1.0
                if i < att:
                    g = i / att
                elif i > ln - rel:
                    g = (ln - i) / rel
                ph += inc
                buf[idx] += _osc(wave, ph) * vol * g
    if hats:  # Hafif ritim (zil) sesleri
        vol, every = hats
        step = every * spb
        k = 0
        while k * step < beats * spb:
            s0 = int(k * step * sr)
            ln = int(0.03 * sr)
            for i in range(ln):
                if s0 + i < n:
                    buf[s0 + i] += random.uniform(-1, 1) * vol * (1 - i / ln)
            k += 1
    return buf


# =============================================================================
#  Ses yöneticisi
# =============================================================================
class Audio:
    """Bütün sesleri üretir, çalar ve kategori bazında açıp kapatır."""

    MUSIC_VOLUME = 0.32
    ENGINE_VOLUME = 0.28

    def __init__(self):
        self.enabled = False
        self.muted = False
        self.cat_on = {k: True for k in SOUND_CATEGORIES}
        self.sounds = {}          # ad -> (Sound listesi, kategori)
        self.min_gap = {}         # ad -> aynı sesin tekrar çalınması için en az süre
        self.last_play = {}
        self.music_name = None
        self.music_loop = True
        self.engine_level = None
        self.engine_volume = 0.0
        self.rate, self.channels = 22050, 1
        try:
            if not pygame.mixer.get_init():
                pygame.mixer.init(22050, -16, 1, 512)
            freq, size, channels = pygame.mixer.get_init()
            if size != -16:
                raise pygame.error("desteklenmeyen ses biçimi")
            self.rate, self.channels = freq, channels
            pygame.mixer.set_num_channels(24)
            pygame.mixer.set_reserved(2)
            self.music_ch = pygame.mixer.Channel(0)
            self.engine_ch = pygame.mixer.Channel(1)
            self.enabled = True
        except (pygame.error, TypeError) as exc:  # Ses kartı yoksa oyun sessiz çalışır
            print("Ses başlatılamadı, oyun sessiz çalışacak:", exc)

    # ------------------------------------------------------------------ üretim
    def _make(self, samples, volume=0.8):
        """Float örnek listesini pygame Sound nesnesine çevirir."""
        data = array.array("h")
        for s in samples:
            v = int(max(-1.0, min(1.0, s * volume)) * 32000)
            data.append(v)
            if self.channels == 2:
                data.append(v)
        return pygame.mixer.Sound(buffer=data.tobytes())

    def _add(self, name, category, variants, volume=0.8, gap=0.0):
        override = None
        for ext in (".wav", ".ogg"):
            path = resource_path("assets", "sounds", name + ext)
            if os.path.exists(path):
                try:
                    override = [pygame.mixer.Sound(path)]
                except pygame.error:
                    override = None
                break
        sounds = override or [self._make(v, volume) for v in variants]
        self.sounds[name] = (sounds, category)
        self.min_gap[name] = gap

    def build(self, progress=None):
        """Bütün sesleri üretir. progress(oran) yükleme ekranını günceller."""
        if not self.enabled:
            return
        sr = self.rate
        steps = []

        # --- Kuş sesleri -----------------------------------------------------
        def chirps(pitch):
            out = []
            for k in range(3):
                p = pitch * random.uniform(0.9, 1.1)
                a = envelope(sweep(sr, p, p * 1.5, 0.07, "sine", 40, 0.05), 0.005, 0.4, sr)
                b = envelope(sweep(sr, p * 1.3, p * 0.9, 0.08 + 0.02 * k, "sine", 30, 0.06), 0.005, 0.5, sr)
                out.append(concat(a, silence(sr, 0.03), b))
            return out

        from .settings import BIRD_TYPES
        for key, data in BIRD_TYPES.items():
            steps.append(lambda key=key, data=data:
                         self._add("chirp_" + key, "birds", chirps(data["pitch"]), 0.35, 0.12))

        def flap():
            bursts = []
            for _ in range(3):
                bursts += envelope(lowpass(noise(sr, 0.05), 0.25), 0.005, 0.8, sr)
                bursts += silence(sr, 0.03)
            return bursts
        steps.append(lambda: self._add("flap", "birds", [flap(), flap()], 0.5, 0.08))

        def cry():
            # "Vaaah-vaaah" çizgi film ağlaması
            w1 = envelope(sweep(sr, 720, 520, 0.45, "saw", 7, 0.06), 0.03, 0.4, sr)
            w2 = envelope(sweep(sr, 680, 430, 0.6, "saw", 7, 0.08), 0.03, 0.5, sr)
            return lowpass(concat(w1, silence(sr, 0.08), w2), 0.35)
        steps.append(lambda: self._add("cry", "birds", [cry()], 0.45, 0.3))

        def help_call():
            a = envelope(sweep(sr, 900, 1500, 0.15, "square", 12, 0.05), 0.01, 0.3, sr)
            return concat(a, silence(sr, 0.05), a)
        steps.append(lambda: self._add("help", "birds", [lowpass(help_call(), 0.4)], 0.35, 0.4))

        def angry():
            return lowpass(envelope(sweep(sr, 500, 300, 0.35, "saw", 25, 0.15), 0.01, 0.4, sr), 0.3)
        steps.append(lambda: self._add("angry", "birds", [angry()], 0.45, 0.25))

        # --- Efektler -----------------------------------------------------------
        def whoosh():
            n = noise(sr, 0.28)
            out, y = [], 0.0
            for i, s in enumerate(n):
                a = 0.05 + 0.4 * math.sin(math.pi * i / len(n))
                y += a * (s - y)
                out.append(y * 1.6)
            return envelope(out, 0.02, 0.4, sr)
        steps.append(lambda: self._add("throw", "sfx", [whoosh()], 0.7, 0.05))

        def bonk():
            tone = envelope(sweep(sr, 420, 110, 0.22, "sine", curve=0.5), 0.002, 0.7, sr)
            click = envelope(lowpass(noise(sr, 0.03), 0.5), 0.001, 0.9, sr)
            return mix(tone, click)
        steps.append(lambda: self._add("hit", "sfx", [bonk()], 0.9, 0.05))

        steps.append(lambda: self._add("thud", "sfx", [envelope(lowpass(noise(sr, 0.08), 0.12), 0.002, 0.8, sr)], 0.8, 0.06))

        def plop():
            return envelope(sweep(sr, 650, 220, 0.12, "sine", curve=0.6), 0.003, 0.6, sr)
        steps.append(lambda: self._add("egg_drop", "sfx", [plop()], 0.7, 0.05))

        def crack():
            crk = []
            for _ in range(4):
                crk += envelope(noise(sr, 0.012), 0.001, 0.9, sr) + silence(sr, 0.018)
            splat = envelope(lowpass(noise(sr, 0.22), 0.15), 0.005, 0.8, sr)
            return concat(crk, splat)
        steps.append(lambda: self._add("egg_crack", "sfx", [crack()], 0.8, 0.05))

        def blip(f):
            return envelope(sweep(sr, f, f * 1.5, 0.09, "square"), 0.003, 0.5, sr)
        steps.append(lambda: self._add("point", "sfx", [lowpass(blip(880), 0.5)], 0.35, 0.04))

        def combo():
            return lowpass(concat(*[envelope(sweep(sr, f, f, 0.07, "square"), 0.003, 0.4, sr)
                                    for f in (660, 880, 1100, 1320)]), 0.5)
        steps.append(lambda: self._add("combo", "sfx", [combo()], 0.35, 0.2))

        steps.append(lambda: self._add("click", "sfx", [envelope(sweep(sr, 1200, 800, 0.04, "tri"), 0.002, 0.6, sr)], 0.5, 0.03))

        def hurt():
            return lowpass(envelope(sweep(sr, 300, 120, 0.3, "square", 30, 0.1), 0.005, 0.5, sr), 0.4)
        steps.append(lambda: self._add("hurt", "sfx", [hurt()], 0.6, 0.15))

        def boing():
            return envelope(sweep(sr, 180, 520, 0.25, "sine", 18, 0.1, curve=0.6), 0.005, 0.5, sr)
        steps.append(lambda: self._add("jump", "sfx", [boing()], 0.7, 0.1))

        def honk():
            a = mix(sweep(sr, 392, 392, 0.18, "square"), sweep(sr, 494, 494, 0.18, "square"))
            a = envelope(lowpass(a, 0.3), 0.01, 0.2, sr)
            return concat(a, silence(sr, 0.06), a)
        steps.append(lambda: self._add("honk", "sfx", [honk()], 0.45, 0.4))

        def pickup():
            return lowpass(concat(envelope(sweep(sr, 990, 990, 0.06, "square"), 0.003, 0.3, sr),
                                  envelope(sweep(sr, 1480, 1480, 0.12, "square"), 0.003, 0.6, sr)), 0.5)
        steps.append(lambda: self._add("pickup", "sfx", [pickup()], 0.35, 0.05))

        steps.append(lambda: self._add("vroom", "engine",
                                       [lowpass(envelope(sweep(sr, 70, 160, 0.6, "saw", 18, 0.15), 0.02, 0.5, sr), 0.2)],
                                       0.7, 0.5))

        # --- Motor döngüleri (tam sayı Hz -> kesintisiz döngü) -----------------
        def engine(f):
            out = []
            ph1 = ph2 = 0.0
            for i in range(sr):
                ph1 += f / sr
                ph2 += (f / 2) / sr
                putt = 0.6 + 0.4 * math.sin(TAU * 8 * i / sr)
                out.append((_osc("saw", ph1) * 0.6 + _osc("square", ph2) * 0.5) * putt)
            return lowpass(out, 0.18)
        for lvl, f in enumerate((48, 66, 88)):
            steps.append(lambda lvl=lvl, f=f: self._add("engine%d" % lvl, "engine", [engine(f)], 0.8))

        # --- Müzikler ----------------------------------------------------------
        def calm_song():
            mel = [72, 76, 79, 76, 77, 81, 79, None, 76, 79, 84, 79, 81, 79, 76, None,
                   74, 77, 81, 77, 79, 77, 76, 74, 72, 76, 79, 76, 72, None, None, None]
            bass = [48, 48, 53, 53, 48, 48, 45, 45, 50, 50, 43, 43, 48, 43, 48, 48]
            m = [(i * 0.5, 0.45, n) for i, n in enumerate(mel)]
            b = [(i, 0.9, n) for i, n in enumerate(bass)]
            return render_song(sr, 126, [("tri", 0.45, m), ("square", 0.18, b)], 16, hats=(0.05, 1))

        def action_song():
            bass_pat = [45] * 8 + [41] * 8 + [43] * 8 + [40] * 8
            b = [(i * 0.5, 0.4, n + (12 if i % 2 else 0)) for i, n in enumerate(bass_pat)]
            mel = [69, 72, 76, 81, 79, 76, 72, 76, 77, 81, 84, 81, 79, 77, 76, 74,
                   76, 79, 83, 79, 74, 79, 83, 86, 76, 76, 80, 83, 88, 83, 80, 76]
            m = [(i * 0.5, 0.42, n) for i, n in enumerate(mel)]
            return render_song(sr, 164, [("square", 0.22, m), ("saw", 0.22, b)], 16, hats=(0.08, 0.5))

        def victory_song():
            notes = [(0, 0.25, 72), (0.25, 0.25, 76), (0.5, 0.25, 79), (0.75, 0.75, 84),
                     (1.75, 0.25, 79), (2.0, 2.0, 84)]
            harm = [(0.75, 0.75, 76), (2.0, 2.0, 79)]
            bass = [(0, 1.5, 48), (1.75, 2.25, 43)]
            return render_song(sr, 140, [("square", 0.3, notes), ("tri", 0.3, harm), ("tri", 0.3, bass)], 4.5)

        def sad_trombone():
            parts = []
            for f, d in ((392, 0.42), (370, 0.42), (349, 0.42)):
                parts.append(envelope(sweep(sr, f, f * 0.98, d, "saw"), 0.02, 0.3, sr))
            parts.append(envelope(sweep(sr, 330, 320, 1.3, "saw", 6, 0.03), 0.02, 0.4, sr))
            return lowpass(concat(*parts), 0.15)

        steps.append(lambda: self._add("music_calm", "music", [calm_song()], 0.7))
        steps.append(lambda: self._add("music_action", "music", [action_song()], 0.7))
        steps.append(lambda: self._add("music_victory", "music", [victory_song()], 0.7))
        steps.append(lambda: self._add("music_gameover", "music", [sad_trombone()], 0.8))

        for i, step in enumerate(steps):
            step()
            if progress:
                progress((i + 1) / len(steps))

    # ------------------------------------------------------------------ çalma
    def _allowed(self, category):
        return self.enabled and not self.muted and self.cat_on.get(category, True)

    def play(self, name, volume=1.0):
        entry = self.sounds.get(name)
        if not entry:
            return
        sounds, cat = entry
        if not self._allowed(cat):
            return
        now = pygame.time.get_ticks() / 1000.0
        if now - self.last_play.get(name, -99) < self.min_gap.get(name, 0):
            return
        self.last_play[name] = now
        snd = random.choice(sounds)
        ch = snd.play()
        if ch is not None:
            ch.set_volume(volume)

    def play_music(self, name, loop=True):
        """Müziği değiştirir. Aynı müzik çalıyorsa baştan başlatmaz."""
        if name == self.music_name and loop and self.enabled and self.music_ch.get_busy():
            return
        self.music_name, self.music_loop = name, loop
        self._restart_music()

    def _restart_music(self):
        if not self.enabled:
            return
        self.music_ch.stop()
        entry = self.sounds.get(self.music_name or "")
        if entry and self._allowed("music"):
            self.music_ch.set_volume(self.MUSIC_VOLUME)
            self.music_ch.play(entry[0][0], loops=-1 if self.music_loop else 0)

    def stop_music(self):
        self.music_name = None
        if self.enabled:
            self.music_ch.stop()

    def set_engine(self, level, volume=1.0):
        """Motor sesi: level None ise susar, 0-2 arası devir seviyesi."""
        if not self.enabled:
            return
        if level is None or not self._allowed("engine"):
            if self.engine_ch.get_busy():
                self.engine_ch.stop()
            self.engine_level = None
            return
        if level != self.engine_level or not self.engine_ch.get_busy():
            self.engine_level = level
            entry = self.sounds.get("engine%d" % level)
            if entry:
                self.engine_ch.play(entry[0][0], loops=-1, fade_ms=60)
        self.engine_ch.set_volume(self.ENGINE_VOLUME * volume)

    # ------------------------------------------------------------- ayarlar
    def toggle_category(self, cat):
        self.cat_on[cat] = not self.cat_on[cat]
        self._apply_toggles()

    def toggle_mute(self):
        self.muted = not self.muted
        self._apply_toggles()

    def _apply_toggles(self):
        if not self.enabled:
            return
        if self._allowed("music"):
            if self.music_name and self.music_loop and not self.music_ch.get_busy():
                self._restart_music()
        else:
            self.music_ch.stop()
        if not self._allowed("engine"):
            self.set_engine(None)
        if self.muted:
            pygame.mixer.stop()
            self.engine_level = None
