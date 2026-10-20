"""Taş: parabolik yörüngede uçan mermi."""

from ..art import draw_stone
from ..settings import GRAVITY, WIDTH


class Stone:
    RADIUS = 8

    def __init__(self, x, y, vx, vy):
        self.x, self.y = x, y
        self.vx, self.vy = vx, vy
        self.rot = 0.0
        self.alive = True
        self.flying = True          # Yere değene kadar kuşları korkutabilir
        self.bounces = 0
        self.rest_t = 0.0
        self.touched = set()        # Bu taşın etkilediği kuşların kimlikleri
        self.scared = 0             # Bu taşla kaçırılan kuş sayısı
        self.resolved = False       # Kombo hesabı yapıldı mı?

    def update(self, dt, ground_y):
        """Fiziği ilerletir. Yere çarptığı karede 'bounce' döndürür."""
        event = None
        self.vy += GRAVITY * dt
        self.x += self.vx * dt
        self.y += self.vy * dt
        self.rot += self.vx * dt * 0.05
        if self.y >= ground_y - self.RADIUS:
            self.y = ground_y - self.RADIUS
            if self.flying:
                event = "bounce"
            self.flying = False
            if abs(self.vy) > 140 and self.bounces < 2:
                self.vy *= -0.35
                self.vx *= 0.55
                self.bounces += 1
            else:
                self.vy = 0
                self.vx *= 0.8
                self.rest_t += dt
                if self.rest_t > 1.2:
                    self.alive = False
        if self.x < -60 or self.x > WIDTH + 60:
            self.alive = False
            self.flying = False
        return event

    def deflect(self):
        """Kuşa çarpınca geri seker."""
        self.vx *= -0.35
        self.vy = -abs(self.vy) * 0.3 - 80

    def draw(self, surf):
        draw_stone(surf, self.x, self.y, self.RADIUS, self.rot)
