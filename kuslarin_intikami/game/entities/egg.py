"""Yumurtalar ve yumurtadan çıkan komik civcivler."""

import math
import random

import pygame

from ..settings import GRAVITY, OUTLINE, WIDTH
from ..utils import ellipse_poly, outlined_circle


class Egg:
    """Kuşların attığı yumurta: düşer, seker, yuvarlanır ve sonunda çatlar."""

    RX, RY = 9, 12

    def __init__(self, x, y, vx, vy, spot_color, harmful=False):
        self.x, self.y, self.vx, self.vy = x, y, vx, vy
        self.spot = spot_color
        self.harmful = harmful      # Oyuncuya zarar verebilir mi (intikam yumurtası)
        self.rot = 0.0
        self.state = "fall"
        self.timer = 0.0
        self.alive = True
        self.bounced = False

    def update(self, dt, ground_y):
        """Olayları döndürür: 'land' (ilk çarpma) veya 'crack' (çatlama)."""
        if self.state == "fall":
            self.vy += GRAVITY * 0.8 * dt
            self.x += self.vx * dt
            self.y += self.vy * dt
            self.rot += self.vx * dt * 0.02
            if self.y >= ground_y - self.RY:
                self.y = ground_y - self.RY
                if self.vy > 650 or self.harmful:   # Çok hızlı düşen yumurta hemen çatlar
                    self.state = "crack"
                    return "crack"
                self.state = "roll"
                self.vy = 0
                if abs(self.vx) < 60:
                    self.vx = random.choice((-1, 1)) * random.uniform(90, 170)
                return "land"
        elif self.state == "roll":
            self.x += self.vx * dt
            self.vx *= 0.985 ** (dt * 60)
            self.rot += self.vx * dt / self.RX
            # Sağa sola küçük sekmeler
            self.y = ground_y - self.RY - abs(math.sin(self.rot * 2)) * 2
            if self.x < 20 or self.x > WIDTH - 20:
                self.vx *= -1
                self.x = max(20, min(WIDTH - 20, self.x))
            if abs(self.vx) < 12:
                self.timer += dt
                if self.timer > 0.5:
                    self.state = "crack"
                    return "crack"
        return None

    def draw(self, surf):
        pts = ellipse_poly(self.x, self.y, self.RX, self.RY, self.rot, 14)
        pygame.draw.polygon(surf, (255, 250, 235), pts)
        pygame.draw.polygon(surf, OUTLINE, pts, 2)
        for k in range(3):
            a = self.rot + k * 2.1
            px = self.x + math.cos(a) * 4
            py = self.y + math.sin(a) * 5
            pygame.draw.circle(surf, self.spot, (int(px), int(py)), 2)
        if self.state == "roll" and self.timer > 0:   # Çatlak çizgisi
            pygame.draw.lines(surf, OUTLINE, False, [(self.x - 7, self.y), (self.x - 3, self.y - 3),
                                                     (self.x, self.y + 2), (self.x + 4, self.y - 2),
                                                     (self.x + 7, self.y)], 2)


class Chick:
    """Çatlayan yumurtadan çıkıp kafasında kabukla koşarak kaçan civciv."""

    def __init__(self, x, ground_y):
        self.x = x
        self.ground = ground_y
        self.dir = random.choice((-1, 1))
        self.t = 0.0
        self.alive = True
        self.speed = random.uniform(110, 170)

    def update(self, dt):
        self.t += dt
        if self.t > 0.6:             # Önce şaşkınca etrafa bakar, sonra kaçar
            self.x += self.dir * self.speed * dt
        if self.x < -30 or self.x > WIDTH + 30:
            self.alive = False

    def draw(self, surf):
        hop = abs(math.sin(self.t * 14)) * 6 if self.t > 0.6 else 0
        x, y = int(self.x), int(self.ground - 10 - hop)
        pygame.draw.line(surf, (255, 150, 40), (x - 3, y + 7), (x - 4, y + 11), 2)
        pygame.draw.line(surf, (255, 150, 40), (x + 3, y + 7), (x + 4, y + 11), 2)
        outlined_circle(surf, (255, 235, 90), (x, y), 9, 2)
        d = self.dir if self.t > 0.6 else (1 if int(self.t * 6) % 2 else -1)
        pygame.draw.circle(surf, OUTLINE, (x + d * 4, y - 2), 2)
        pygame.draw.polygon(surf, (255, 150, 40), [(x + d * 8, y), (x + d * 13, y + 2), (x + d * 8, y + 4)])
        # Kafadaki kabuk
        pts = [(x - 9, y - 5), (x - 6, y - 12), (x - 2, y - 8), (x + 2, y - 13), (x + 6, y - 8), (x + 9, y - 5)]
        pygame.draw.polygon(surf, (255, 250, 235), pts)
        pygame.draw.lines(surf, OUTLINE, False, pts, 2)
