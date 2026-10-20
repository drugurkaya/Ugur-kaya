"""Araba bölümündeki engeller, ödüller ve havadan saldıran kuşlar."""

import math
import random

import pygame

from ..art import draw_stone
from ..settings import OUTLINE, WIDTH
from ..utils import outlined_circle, cached_text, ellipse_poly
from .bird import draw_bird, draw_bubble


# =============================================================================
#  Yoldaki nesneler (dünya koordinatında durur, kamera kaydıkça yaklaşır)
# =============================================================================
class RoadObject:
    """kind: rock | bigrock | egg | puddle | birdblock | wrench | coin | finish"""

    def __init__(self, kind, wx, ground_y, air=0):
        self.kind = kind
        self.wx = float(wx)
        self.ground = ground_y
        self.air = air                 # Yerden yükseklik (havadaki yıldızlar için)
        self.alive = True
        self.hit = False
        self.t = random.uniform(0, 10)
        self.vx = -70 if kind == "egg" else 0     # Yumurtalar arabaya doğru yuvarlanır
        if kind == "birdblock":
            n = random.randint(2, 3)
            self.birds = [{"kind": random.choice(("blue", "yellow", "red")), "dx": i * 42 - (n - 1) * 21,
                           "stay": random.random() < 0.55, "fly": False, "vy": 0.0, "y": 0.0}
                          for i in range(n)]
            if not any(b["stay"] for b in self.birds):
                self.birds[0]["stay"] = True
            self.warned = False

    # Çarpışma kutusu (ekran koordinatı)
    def rect(self, cam):
        sx = self.wx - cam
        g = self.ground
        k = self.kind
        if k == "rock":
            return pygame.Rect(sx - 20, g - 34, 40, 34)
        if k == "bigrock":
            return pygame.Rect(sx - 30, g - 50, 60, 50)
        if k == "egg":
            return pygame.Rect(sx - 10, g - 26, 20, 26)
        if k == "puddle":
            return pygame.Rect(sx - 45, g - 8, 90, 10)
        if k == "birdblock":
            xs = [b["dx"] for b in self.birds if b["stay"] and not b["fly"]]
            if not xs:
                return pygame.Rect(-999, -999, 1, 1)
            return pygame.Rect(sx + min(xs) - 18, g - 44, max(xs) - min(xs) + 36, 44)
        if k in ("wrench", "coin"):
            return pygame.Rect(sx - 18, g - 18 - self.air - 18, 36, 36)
        if k == "finish":
            return pygame.Rect(sx - 10, 0, 20, g)
        return pygame.Rect(sx, g, 1, 1)

    def update(self, dt, cam, car_x, effects, audio):
        self.t += dt
        self.wx += self.vx * dt
        sx = self.wx - cam
        if self.kind == "birdblock":
            # Araba yaklaşınca bazı kuşlar son anda kaçar!
            if not self.warned and sx - car_x < 330:
                self.warned = True
                audio.play("angry", 0.6)
            for b in self.birds:
                if not b["stay"] and not b["fly"] and sx + b["dx"] - car_x < 230:
                    b["fly"] = True
                    b["vy"] = -380
                    effects.feathers(sx + b["dx"], self.ground - 20, (255, 255, 255), 3)
                    audio.play("flap", 0.5)
                if b["fly"]:
                    b["vy"] -= 200 * dt
                    b["y"] += b["vy"] * dt
        if sx < -200:
            self.alive = False

    def draw(self, surf, cam):
        sx = self.wx - cam
        g = self.ground
        k = self.kind
        if sx < -150 or sx > WIDTH + 150:
            return
        if k == "rock":
            draw_stone(surf, sx - 8, g - 12, 14, 0.3)
            draw_stone(surf, sx + 8, g - 14, 16, 1.2)
            draw_stone(surf, sx, g - 26, 12, 2.0)
        elif k == "bigrock":
            draw_stone(surf, sx, g - 24, 28, 0.5)
            draw_stone(surf, sx - 22, g - 10, 12, 1.0)
            pygame.draw.line(surf, OUTLINE, (sx - 6, g - 40), (sx + 4, g - 28), 2)
        elif k == "egg":
            rot = -self.t * 6
            pts = ellipse_poly(sx, g - 13, 10, 13, rot, 14)
            pygame.draw.polygon(surf, (255, 250, 235), pts)
            pygame.draw.polygon(surf, OUTLINE, pts, 2)
            pygame.draw.circle(surf, (120, 170, 255), (int(sx + math.cos(rot) * 4), int(g - 13 + math.sin(rot) * 5)), 3)
        elif k == "puddle":
            pygame.draw.ellipse(surf, (255, 250, 235), (sx - 48, g - 9, 96, 16))
            pygame.draw.ellipse(surf, (255, 195, 40), (sx - 16, g - 7, 32, 11))
            pygame.draw.ellipse(surf, OUTLINE, (sx - 48, g - 9, 96, 16), 2)
        elif k == "birdblock":
            for b in self.birds:
                bx = sx + b["dx"]
                by = g - 22 + b["y"]
                hop = abs(math.sin(self.t * 5 + b["dx"])) * 4 if not b["fly"] else 0
                draw_bird(surf, b["kind"], bx, by - hop, -1, self.t * (25 if b["fly"] else 3), b["fly"],
                          "scared" if b["fly"] else "angry", (-1, 0), self.t)
            if not self.warned and 0 < sx < WIDTH:
                draw_bubble(surf, "Geçemezsin!", sx, g - 60, (255, 220, 220))
        elif k == "wrench":
            y = g - 36 - self.air + math.sin(self.t * 4) * 5
            outlined_circle(surf, (120, 220, 140), (sx, y), 20, 3)
            pygame.draw.line(surf, OUTLINE, (sx - 9, y + 9), (sx + 7, y - 7), 7)
            pygame.draw.line(surf, (230, 230, 240), (sx - 9, y + 9), (sx + 7, y - 7), 4)
            pygame.draw.circle(surf, (230, 230, 240), (int(sx + 8), int(y - 8)), 6)
            pygame.draw.circle(surf, (120, 220, 140), (int(sx + 11), int(y - 11)), 3)
        elif k == "coin":
            y = g - 36 - self.air + math.sin(self.t * 5) * 4
            w = abs(math.cos(self.t * 3)) * 16 + 4
            pygame.draw.ellipse(surf, OUTLINE, (sx - w - 2, y - 18, w * 2 + 4, 36))
            pygame.draw.ellipse(surf, (255, 210, 40), (sx - w, y - 16, w * 2, 32))
            if w > 10:   # Parıltı
                pygame.draw.circle(surf, (255, 240, 140), (int(sx - w * 0.3), int(y - 6)), 4)
        elif k == "finish":
            for i in range(0, int(g), 20):   # Damalı bitiş direği ve bayrak
                c = (255, 255, 255) if (i // 20) % 2 else OUTLINE
                pygame.draw.rect(surf, c, (sx - 8, i, 16, 20))
            for row in range(4):
                for col in range(6):
                    c = OUTLINE if (row + col) % 2 else (255, 255, 255)
                    wave = math.sin(self.t * 5 + col * 0.6) * 4
                    pygame.draw.rect(surf, c, (sx + 8 + col * 18, 60 + row * 18 + wave, 18, 18))
            surf.blit(cached_text("BİTİŞ", 40, (255, 230, 80)), (sx + 10, 140))


# =============================================================================
#  Havadan saldıranlar (ekran koordinatında hareket eder)
# =============================================================================
class Diver:
    """Önce uyarı işareti, sonra arabaya dalış. Bazıları son anda vazgeçer."""

    WARN = 0.95

    def __init__(self, target_x, target_y, kind, speed):
        self.kind = kind
        self.tx, self.ty = target_x, target_y
        self.x, self.y = target_x + random.uniform(160, 300), -40.0
        self.speed = speed
        self.t = 0.0
        self.alive = True
        self.veer = random.random() < 0.3     # Son anda yön değiştirecek mi?
        self.veered = False
        self.passed = False
        self.vx = self.vy = 0.0
        self.hit = False

    def update(self, dt, car):
        self.t += dt
        if self.t < self.WARN:
            return
        if not self.vx and not self.vy:
            dx, dy = self.tx - self.x, self.ty - self.y
            d = math.hypot(dx, dy) or 1
            self.vx, self.vy = dx / d * self.speed, dy / d * self.speed
        if self.veer and not self.veered and self.y > self.ty - 170:
            self.veered = True             # Yön değiştirip yukarı kaçar
            self.vx, self.vy = -self.speed * 0.9, -self.speed * 0.5
        self.x += self.vx * dt
        self.y += self.vy * dt
        if self.y > self.ty + 60 or self.x < -100 or self.y < -200:
            self.alive = False

    def rect(self):
        return pygame.Rect(int(self.x - 18), int(self.y - 18), 36, 36)

    def draw(self, surf):
        if self.t < self.WARN:
            # Yolda gölge ve yanıp sönen uyarı
            k = self.t / self.WARN
            pygame.draw.ellipse(surf, (60, 60, 70), (self.tx - 30 * k, self.ty + 50, 60 * k, 12))
            if int(self.t * 10) % 2 == 0:
                surf.blit(cached_text("!", 50, (255, 60, 60)), (self.tx - 8, 20))
            return
        flap = self.t * (8 if not self.veered else 28)
        draw_bird(surf, self.kind, self.x, self.y, -1 if self.vx < 0 else 1, flap, True,
                  "angry" if not self.veered else "scared", (self.vx / self.speed, self.vy / self.speed), self.t)


class Bomber:
    """Yukarıdan geçerken arabaya yumurta bırakan kuş."""

    def __init__(self, y, kind, speed):
        self.kind = kind
        self.x, self.y = WIDTH + 50.0, y
        self.base_y = y
        self.speed = speed
        self.t = 0.0
        self.alive = True
        self.drops = random.randint(1, 2)
        self.cool = 0.0

    def update(self, dt, car, spawn_egg):
        self.t += dt
        self.x -= self.speed * dt
        self.y = self.base_y + math.sin(self.t * 4) * 12
        self.cool -= dt
        # Arabanın biraz önüne nişan alır
        if self.drops > 0 and self.cool <= 0 and abs(self.x - (car.x + 120)) < 30:
            self.drops -= 1
            self.cool = 0.35
            spawn_egg(self.x, self.y + 18)
        if self.x < -80:
            self.alive = False

    def draw(self, surf):
        draw_bird(surf, self.kind, self.x, self.y, -1, self.t * 20, True, "angry", (-0.5, 0.8), self.t)


class AirEgg:
    """Bombacı kuşun bıraktığı yumurta."""

    def __init__(self, x, y):
        self.x, self.y = x, y
        self.vx, self.vy = -60.0, 50.0
        self.alive = True
        self.rot = 0.0

    def update(self, dt):
        self.vy += 900 * dt
        self.x += self.vx * dt
        self.y += self.vy * dt
        self.rot += dt * 8

    def rect(self):
        return pygame.Rect(int(self.x - 9), int(self.y - 12), 18, 24)

    def draw(self, surf):
        pts = ellipse_poly(self.x, self.y, 9, 12, self.rot, 12)
        pygame.draw.polygon(surf, (255, 250, 235), pts)
        pygame.draw.polygon(surf, OUTLINE, pts, 2)


class Swarm:
    """Arabayı arkadan kovalayan kızgın kuş sürüsü.

    Araba yavaşlarsa yaklaşır, hızlanırsa geride kalır.
    """

    def __init__(self, ground_y):
        self.x = -380.0            # Sürünün ön ucu (ekran koordinatı)
        self.ground = ground_y
        self.t = 0.0
        self.members = [(random.choice(("blue", "yellow", "red")), random.uniform(-200, 0),
                         random.uniform(-260, -40), random.uniform(0, 6)) for _ in range(9)]

    def update(self, dt, car_speed, cruise, max_speed, pressure):
        self.t += dt
        rel = (car_speed - cruise) / (max_speed - cruise)
        v = 70 + 80 * pressure - 330 * rel
        self.x += v * dt
        self.x = max(-380.0, min(self.x, 900.0))

    def front(self):
        return self.x

    def draw(self, surf):
        if self.x < -260:
            return
        for kind, dx, dy, ph in self.members:
            bx = self.x + dx + math.sin(self.t * 3 + ph) * 12
            by = self.ground + dy + math.cos(self.t * 4 + ph) * 10
            draw_bird(surf, kind, bx, by, 1, self.t * 22 + ph, True, "angry", (1, 0.2), self.t, 0.9)
