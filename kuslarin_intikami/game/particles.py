"""Parçacık efektleri: gözyaşları, tüyler, yıldızlar, yumurta sarısı,
uçan puan yazıları ve ekranı kapatan yumurta lekeleri."""

import math
import random

import pygame

from .settings import OUTLINE, WIDTH, HEIGHT
from .utils import cached_text, ellipse_poly, ease_out_back


class Particle:
    """Tek bir parçacık. 'kind' çizim biçimini belirler."""

    __slots__ = ("x", "y", "vx", "vy", "g", "life", "max_life", "color",
                 "size", "kind", "rot", "vrot", "ground")

    def __init__(self, x, y, vx, vy, color, size=4, life=1.0, g=0.0,
                 kind="circle", rot=0.0, vrot=0.0, ground=None):
        self.x, self.y, self.vx, self.vy = x, y, vx, vy
        self.color, self.size, self.kind = color, size, kind
        self.life = self.max_life = life
        self.g, self.rot, self.vrot = g, rot, vrot
        self.ground = ground

    def update(self, dt):
        self.vy += self.g * dt
        self.x += self.vx * dt
        self.y += self.vy * dt
        self.rot += self.vrot * dt
        if self.kind == "feather":           # Tüyler sallanarak süzülür
            self.vx *= 0.97
            self.vy = min(self.vy, 60)
            self.x += math.sin(self.life * 6) * 30 * dt
        if self.ground is not None and self.y > self.ground:
            self.y = self.ground
            self.vy *= -0.3
            self.vx *= 0.6
        self.life -= dt
        return self.life > 0

    def draw(self, surf):
        t = max(0.0, self.life / self.max_life)
        x, y = int(self.x), int(self.y)
        k = self.kind
        if k == "circle":
            pygame.draw.circle(surf, self.color, (x, y), max(1, int(self.size * (0.4 + 0.6 * t))))
        elif k == "smoke":
            r = int(self.size * (1.8 - t))
            pygame.draw.circle(surf, self.color, (x, y), max(1, r))
        elif k == "tear":
            s = self.size
            pts = [(x, y - s * 1.6), (x - s, y), (x, y + s), (x + s, y)]
            pygame.draw.polygon(surf, (120, 200, 255), pts)
            pygame.draw.circle(surf, (120, 200, 255), (x, y), s)
            pygame.draw.circle(surf, (230, 250, 255), (x - s // 3, y - s // 3), max(1, s // 3))
        elif k == "feather":
            pts = ellipse_poly(x, y, self.size * 1.6, self.size * 0.6, self.rot, 8)
            pygame.draw.polygon(surf, self.color, pts)
            pygame.draw.polygon(surf, OUTLINE, pts, 1)
        elif k == "star":
            r = self.size
            pts = []
            for i in range(10):
                a = self.rot + i * math.pi / 5
                rr = r if i % 2 == 0 else r * 0.45
                pts.append((x + math.cos(a) * rr, y + math.sin(a) * rr))
            pygame.draw.polygon(surf, self.color, pts)
        elif k == "note":                      # Müzik notası (kuş ötüşü)
            pygame.draw.circle(surf, self.color, (x, y), self.size)
            pygame.draw.line(surf, self.color, (x + self.size - 1, y), (x + self.size - 1, y - self.size * 3), 2)
            pygame.draw.line(surf, self.color, (x + self.size - 1, y - self.size * 3),
                             (x + self.size + 4, y - self.size * 2), 2)
        elif k == "shell":
            pts = [(x, y - self.size), (x + self.size, y + self.size // 2), (x - self.size, y + self.size // 2)]
            ca, sa = math.cos(self.rot), math.sin(self.rot)
            pts = [(x + (px - x) * ca - (py - y) * sa, y + (px - x) * sa + (py - y) * ca) for px, py in pts]
            pygame.draw.polygon(surf, (255, 250, 235), pts)
            pygame.draw.polygon(surf, OUTLINE, pts, 1)
        elif k == "spark":
            l = self.size * t
            pygame.draw.line(surf, self.color, (x - l, y), (x + l, y), 2)
            pygame.draw.line(surf, self.color, (x, y - l), (x, y + l), 2)


class FloatingText:
    """Yükselip kaybolan animasyonlu yazı (+20, KOMBO x2!, ...)."""

    def __init__(self, text, x, y, color, size=34, life=1.1, rise=70):
        self.text, self.x, self.y = text, x, y
        self.color, self.size = color, size
        self.life = self.max_life = life
        self.rise = rise

    def update(self, dt):
        self.life -= dt
        self.y -= self.rise * dt
        return self.life > 0

    def draw(self, surf):
        age = self.max_life - self.life
        pop = ease_out_back(min(1.0, age / 0.25))
        surf_txt = cached_text(self.text, self.size, self.color)
        scale = max(0.1, pop)
        if abs(scale - 1.0) > 0.02:
            w, h = surf_txt.get_size()
            surf_txt = pygame.transform.smoothscale(surf_txt, (max(1, int(w * scale)), max(1, int(h * scale))))
        if self.life < 0.35:
            surf_txt = surf_txt.copy()
            surf_txt.set_alpha(int(255 * self.life / 0.35))
        surf.blit(surf_txt, surf_txt.get_rect(center=(int(self.x), int(self.y))))


class Effects:
    """Bütün parçacıkları ve uçan yazıları yönetir."""

    MAX_PARTICLES = 900

    def __init__(self):
        self.particles = []
        self.texts = []

    def clear(self):
        self.particles.clear()
        self.texts.clear()

    def add(self, *args, **kw):
        if len(self.particles) < self.MAX_PARTICLES:
            self.particles.append(Particle(*args, **kw))

    def text(self, text, x, y, color, size=34, life=1.1, rise=70):
        self.texts.append(FloatingText(text, x, y, color, size, life, rise))

    # --- Hazır efektler -------------------------------------------------------
    def feathers(self, x, y, color, n=6):
        for _ in range(n):
            self.add(x, y, random.uniform(-120, 120), random.uniform(-160, -20), color,
                     size=random.randint(4, 7), life=random.uniform(0.9, 1.6), g=220,
                     kind="feather", rot=random.uniform(0, 6), vrot=random.uniform(-6, 6))

    def stars(self, x, y, n=6, color=(255, 230, 80)):
        for _ in range(n):
            a = random.uniform(0, math.tau)
            sp = random.uniform(90, 220)
            self.add(x, y, math.cos(a) * sp, math.sin(a) * sp, color, size=random.randint(5, 9),
                     life=0.6, kind="star", vrot=6)

    def dust(self, x, y, n=6, color=(200, 180, 150)):
        for _ in range(n):
            self.add(x, y, random.uniform(-80, 80), random.uniform(-90, -10), color,
                     size=random.randint(4, 8), life=random.uniform(0.4, 0.8), g=120, kind="smoke")

    def yolk(self, x, y, ground):
        for _ in range(10):
            self.add(x, y, random.uniform(-160, 160), random.uniform(-260, -60), (255, 200, 40),
                     size=random.randint(3, 6), life=0.9, g=900, ground=ground)
        for _ in range(7):
            self.add(x, y, random.uniform(-140, 140), random.uniform(-280, -80), (255, 250, 235),
                     size=6, life=1.2, g=900, kind="shell", rot=random.uniform(0, 6),
                     vrot=random.uniform(-10, 10), ground=ground)

    def sparkle(self, x, y, color=(255, 240, 120)):
        self.add(x + random.uniform(-14, 14), y + random.uniform(-14, 14), 0, -20,
                 color, size=random.randint(3, 6), life=0.5, kind="spark")

    # --- Döngü ------------------------------------------------------------------
    def update(self, dt):
        self.particles = [p for p in self.particles if p.update(dt)]
        self.texts = [t for t in self.texts if t.update(dt)]

    def draw(self, surf):
        for p in self.particles:
            p.draw(surf)

    def draw_texts(self, surf):
        for t in self.texts:
            t.draw(surf)


class ScreenSplats:
    """Ekrana yapışan yumurta lekeleri: oyuncunun görüşünü kısa süre kapatır."""

    def __init__(self):
        self.splats = []   # [yüzey, x, y, kalan süre, toplam süre]

    def clear(self):
        self.splats.clear()

    def add(self, x=None, y=None, size=None, life=2.6):
        size = size or random.randint(90, 150)
        x = x if x is not None else random.randint(200, WIDTH - 200)
        y = y if y is not None else random.randint(140, HEIGHT - 220)
        s = pygame.Surface((size * 3, size * 3), pygame.SRCALPHA)
        c = size * 3 // 2
        # Beyaz kısım: düzensiz damlalar
        for _ in range(9):
            a = random.uniform(0, math.tau)
            d = random.uniform(0, size * 0.7)
            r = random.randint(size // 3, size // 2)
            pygame.draw.circle(s, (255, 252, 235, 235), (int(c + math.cos(a) * d), int(c + math.sin(a) * d)), r)
        # Aşağı akan damlalar
        for _ in range(4):
            dx = random.randint(-size // 2, size // 2)
            ln = random.randint(size // 2, size)
            pygame.draw.line(s, (255, 252, 235, 235), (c + dx, c), (c + dx, c + ln), 10)
            pygame.draw.circle(s, (255, 252, 235, 235), (c + dx, c + ln), 8)
        # Sarı kısım
        pygame.draw.circle(s, (255, 190, 30, 250), (c, c), size // 3)
        pygame.draw.circle(s, (255, 230, 120, 250), (c - size // 10, c - size // 10), size // 9)
        self.splats.append([s, x, y, life, life])

    def update(self, dt):
        for sp in self.splats:
            sp[3] -= dt
            sp[2] += 12 * dt            # Yavaşça aşağı kayar
        self.splats = [sp for sp in self.splats if sp[3] > 0]

    def draw(self, surf):
        for s, x, y, life, total in self.splats:
            alpha = 255 if life > 0.8 else int(255 * life / 0.8)
            s.set_alpha(alpha)
            surf.blit(s, s.get_rect(center=(int(x), int(y))))
