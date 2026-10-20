"""Oyuncunun kaçış arabası."""

import math

import pygame

from ..art import draw_car
from ..settings import (CAR_MIN_SPEED, CAR_CRUISE_SPEED, CAR_MAX_SPEED, CAR_ACCEL,
                        CAR_BRAKE, CAR_JUMP_SPEED, CAR_GRAVITY)


class Car:
    MIN_X, MAX_X = 150, 820
    SIDE_SPEED = 330

    def __init__(self, x, ground_y):
        self.x = float(x)
        self.ground = ground_y
        self.y = float(ground_y)
        self.vy = 0.0
        self.on_ground = True
        self.speed = CAR_CRUISE_SPEED      # Dünya kayma hızı (px/s)
        self.wheel = 0.0
        self.tilt = 0.0
        self.invuln_t = 0.0
        self.slow_t = 0.0
        self.flash_t = 0.0
        self.splat_t = 0.0
        self.t = 0.0

    def max_speed(self):
        return CAR_MAX_SPEED * (0.6 if self.slow_t > 0 else 1.0)

    def update(self, dt, keys, enabled=True):
        """Klavye girdisine göre hızı, konumu ve zıplamayı günceller."""
        self.t += dt
        event = None
        accel = brake = left = right = False
        if enabled:
            accel = keys[pygame.K_w] or keys[pygame.K_UP]
            brake = keys[pygame.K_s] or keys[pygame.K_DOWN]
            left = keys[pygame.K_a] or keys[pygame.K_LEFT]
            right = keys[pygame.K_d] or keys[pygame.K_RIGHT]
        if accel:
            self.speed += CAR_ACCEL * dt
        elif brake:
            self.speed -= CAR_BRAKE * dt
        else:   # Gaz/fren yoksa seyir hızına doğru yaklaşır
            diff = CAR_CRUISE_SPEED - self.speed
            self.speed += max(-200 * dt, min(200 * dt, diff))
        self.speed = max(CAR_MIN_SPEED, self.speed)
        if self.speed > self.max_speed():   # Yavaşlatıldıysa hız yumuşakça düşer
            self.speed = max(self.max_speed(), self.speed - 500 * dt)
        move = (right - left) * self.SIDE_SPEED * dt
        self.x = max(self.MIN_X, min(self.MAX_X, self.x + move))

        if not self.on_ground:
            self.vy += CAR_GRAVITY * dt
            self.y += self.vy * dt
            self.tilt = max(-0.22, min(0.22, self.vy / 2400))
            if self.y >= self.ground:
                self.y = self.ground
                self.vy = 0
                self.on_ground = True
                self.tilt = 0
                event = "land"
        else:
            # Hafif motor titreşimi
            self.tilt = math.sin(self.t * 30) * 0.008 * (self.speed / CAR_MAX_SPEED)
        self.wheel += self.speed * dt / 21
        self.invuln_t = max(0.0, self.invuln_t - dt)
        self.slow_t = max(0.0, self.slow_t - dt)
        self.flash_t = max(0.0, self.flash_t - dt)
        self.splat_t = max(0.0, self.splat_t - dt)
        return event

    def jump(self):
        if self.on_ground:
            self.on_ground = False
            self.vy = -CAR_JUMP_SPEED
            return True
        return False

    def damage(self):
        """Hasar alınca kısa süre yavaşlar ve yanıp söner."""
        self.invuln_t = 1.4
        self.flash_t = 0.25
        self.slow_t = 1.2
        self.speed = max(CAR_MIN_SPEED, self.speed * 0.7)

    def body_rect(self):
        return pygame.Rect(int(self.x - 108), int(self.y - 112), 216, 102)

    def low_rect(self):
        """Yerdeki engeller için alt kısım (tekerlekler + gövde altı)."""
        return pygame.Rect(int(self.x - 105), int(self.y - 50), 210, 50)

    def draw(self, surf):
        if self.invuln_t > 0 and int(self.invuln_t * 14) % 2 == 0 and self.flash_t <= 0:
            alpha_skip = True
        else:
            alpha_skip = False
        if alpha_skip:
            return
        draw_car(surf, self.x, self.y, self.wheel, True, self.tilt, self.flash_t > 0, self.splat_t > 0)
