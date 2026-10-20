"""Taş atan oyuncu karakteri."""

import math

import pygame

from ..art import draw_kid
from ..settings import PLAYER_SPEED


class Player:
    def __init__(self, x, ground_y, min_x=50, max_x=460):
        self.x = float(x)
        self.ground = ground_y
        self.min_x, self.max_x = min_x, max_x
        self.facing = 1
        self.walk = 0.0
        self.arm_angle = -0.9
        self.hurt_t = 0.0          # Sersemleme süresi (vurulunca)
        self.invuln_t = 0.0        # Hasar sonrası kısa dokunulmazlık
        self.slow_t = 0.0          # Yumurta sarısına bulanınca yavaşlar
        self.hidden = False        # Arabaya binince görünmez
        self.throw_anim = 0.0

    @property
    def shoulder(self):
        return (self.x + self.facing * 10, self.ground - 54)

    @property
    def center(self):
        return (self.x, self.ground - 45)

    def hitbox(self):
        return pygame.Rect(int(self.x - 18), int(self.ground - 95), 36, 95)

    def update(self, dt, keys, aim, charging, enabled=True):
        move = 0
        if enabled and self.hurt_t <= 0:
            if keys[pygame.K_a] or keys[pygame.K_LEFT]:
                move -= 1
            if keys[pygame.K_d] or keys[pygame.K_RIGHT]:
                move += 1
        speed = PLAYER_SPEED * (0.5 if self.slow_t > 0 else 1.0)
        self.x = max(self.min_x, min(self.max_x, self.x + move * speed * dt))
        if move:
            self.walk += dt * 9
        else:
            self.walk = 0.0
        self.hurt_t = max(0.0, self.hurt_t - dt)
        self.invuln_t = max(0.0, self.invuln_t - dt)
        self.slow_t = max(0.0, self.slow_t - dt)
        self.throw_anim = max(0.0, self.throw_anim - dt)
        # Nişan yönüne dön ve kolu hedefe çevir
        if aim[0] > self.x + 5:
            self.facing = 1
        elif aim[0] < self.x - 5:
            self.facing = -1
        sx, sy = self.shoulder
        target = math.atan2(aim[1] - sy, aim[0] - sx)
        if charging:
            # Güç toplarken kol geriye çekilir
            target = target + math.pi * 0.9 * (-1 if self.facing > 0 else 1) * 0.5
        elif self.throw_anim > 0:
            target = math.atan2(aim[1] - sy, aim[0] - sx)
        self.arm_angle = target

    def draw(self, surf, holding):
        if self.hidden:
            return
        if self.invuln_t > 0 and int(self.invuln_t * 12) % 2 == 0:
            return   # Yanıp sönme efekti
        draw_kid(surf, self.x, self.ground, self.facing, self.walk, self.arm_angle,
                 holding, self.hurt_t, self.slow_t > 0)
