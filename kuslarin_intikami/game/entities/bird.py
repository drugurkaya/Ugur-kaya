"""Kuşlar: çizim, animasyon ve davranış durumları.

Durumlar (state):
    flying    - bir hedef noktaya uçuyor (çoğunlukla bir dala konmak için)
    perched   - dalda: zıplar, göz kırpar, öter, oyuncuyu gözleriyle takip eder
    hopping   - yakındaki başka bir dala zıplıyor
    stunned   - taş isabet etti: sersemler, ağlar, yumurta atar, yardım çağırır
    fleeing   - korkup kaçıyor (ekrandan çıkınca silinir)
    flock     - sürü halinde gökyüzünden geçiyor
    diving    - intikam: oyuncunun üzerine dalış yapıyor
    bomber    - intikam: oyuncunun üstünden geçerken yumurta bırakıyor
    retreat   - saldırıdan sonra uzaklaşıyor
"""

import math
import random

import pygame

from ..settings import BIRD_TYPES, OUTLINE, WIDTH, HEIGHT
from ..utils import ellipse_poly, outlined_circle, outlined_poly, cached_text, dist

CHAT_LINES = ["Cik!", "Cik cik!", "Naber?", "Hey!", "Bak bak!", "Pıt pıt!", "Hı hı!"]
HELP_LINES = ["İMDAAT!", "Yardım!", "Arkadaşlar!"]
ANGRY_LINES = ["Grrr!", "İntikam!", "Hücuum!", "Gak!"]


# =============================================================================
#  Kuş çizimi (bütün oyunda ortak kullanılır)
# =============================================================================
def draw_bird(surf, kind, x, y, facing=1, flap=0.0, flying=False, expr="normal",
              look=(0.0, 0.0), t=0.0, scale=1.0, squash=0.0, legs=True):
    """Sevimli çizgi film kuşu çizer.

    flap: kanat fazı (radyan), expr: normal | blink | nervous | scared | cry | angry
    look: gözbebeklerinin bakış yönü (birim vektör), squash: zıplama ezilmesi
    """
    d = BIRD_TYPES[kind]
    s = d["size"] * scale
    f = facing
    sx = 1 + squash * 0.25
    sy = 1 - squash * 0.25
    body_col = d["body"]
    if kind == "gold":   # Altın kuş parlar
        k = 0.5 + 0.5 * math.sin(t * 6)
        body_col = (255, int(190 + 50 * k), int(20 + 80 * k))

    # Bacaklar
    if legs and not flying:
        for dx in (-0.25, 0.2):
            lx = x + dx * s * f
            pygame.draw.line(surf, (240, 140, 30), (lx, y + s * 0.7 * sy), (lx, y + s * 1.15), 3)
            pygame.draw.line(surf, (240, 140, 30), (lx, y + s * 1.15), (lx + f * 5, y + s * 1.15), 2)

    # Kuyruk
    tail = [(x - f * s * 0.7, y + s * 0.1), (x - f * s * 1.75, y - s * 0.45),
            (x - f * s * 1.85, y + s * 0.05), (x - f * s * 1.6, y + s * 0.5)]
    outlined_poly(surf, d["wing"], tail, 2)

    # Uzak kanat (uçarken görünür)
    if flying:
        a = -0.4 - math.sin(flap) * 1.0
        _wing(surf, x + f * s * 0.15, y - s * 0.2, s, f, a + 0.35, tuple(max(0, c - 40) for c in d["wing"]))

    # Gövde
    rx, ry = s * sx, s * sy
    pygame.draw.ellipse(surf, OUTLINE, (x - rx - 2, y - ry - 2, rx * 2 + 4, ry * 2 + 4))
    pygame.draw.ellipse(surf, body_col, (x - rx, y - ry, rx * 2, ry * 2))
    pygame.draw.ellipse(surf, d["belly"], (x - rx * 0.35 + f * rx * 0.25, y - ry * 0.05,
                                           rx * 1.1, ry * 0.95))

    # Tepelik / taç
    if kind == "red":
        for i, (ox, h) in enumerate(((-0.1, 0.7), (0.15, 0.85), (0.38, 0.6))):
            bx = x + f * s * ox
            outlined_poly(surf, body_col, [(bx - 5, y - ry * 0.85), (bx + f * 4, y - ry - s * h),
                                           (bx + 6, y - ry * 0.8)], 2)
    elif kind == "yellow":
        pygame.draw.arc(surf, OUTLINE, (x - 2, y - ry - 12, 14, 16), 1.2, 3.4, 3)
    elif kind == "gold":
        cx, cy = x + f * s * 0.1, y - ry - 2
        crown = [(cx - 9, cy), (cx - 9, cy - 10), (cx - 4, cy - 4), (cx, cy - 12),
                 (cx + 4, cy - 4), (cx + 9, cy - 10), (cx + 9, cy)]
        outlined_poly(surf, (255, 230, 60), crown, 2)
        pygame.draw.circle(surf, (255, 80, 120), (int(cx), int(cy - 4)), 2)

    # Yakın kanat
    if flying:
        a = -0.4 - math.sin(flap) * 1.0
    else:
        a = 0.55 + math.sin(flap) * 0.08
    _wing(surf, x - f * s * 0.05, y - s * 0.05, s, f, a, d["wing"])

    # Yüz
    e1 = (x + f * s * 0.2, y - s * 0.32)
    e2 = (x + f * s * 0.62, y - s * 0.36)
    er = s * 0.3
    beak_x = x + f * s * 0.95
    beak_y = y - s * 0.08
    mouth_open = expr in ("cry", "scared", "angry_shout")

    if expr == "cry":
        for e in (e1, e2):   # Sıkıca kapanmış ağlayan gözler (^ ^)
            pygame.draw.arc(surf, OUTLINE, (e[0] - er, e[1] - er * 0.6, er * 2, er * 1.6), 0.2, math.pi - 0.2, 3)
        # Akan büyük gözyaşı şelaleleri
        for e in (e1, e2):
            wob = math.sin(t * 20 + e[0]) * 2
            tear = pygame.Rect(0, 0, max(4, int(er * 0.9)), int(s * 1.1))
            tear.midtop = (int(e[0] + wob), int(e[1] + er * 0.4))
            pygame.draw.rect(surf, (110, 190, 255), tear, border_radius=4)
            pygame.draw.rect(surf, (200, 235, 255), tear.inflate(-tear.width // 2, -4), border_radius=3)
    elif expr == "blink":
        for e in (e1, e2):
            pygame.draw.line(surf, OUTLINE, (e[0] - er * 0.8, e[1]), (e[0] + er * 0.8, e[1]), 3)
    else:
        big = 1.25 if expr == "scared" else 1.0
        pupil = 0.32 if expr == "scared" else 0.55
        for e in (e1, e2):
            outlined_circle(surf, (255, 255, 255), e, er * big, 2)
            px = e[0] + look[0] * er * 0.45
            py = e[1] + look[1] * er * 0.45
            pygame.draw.circle(surf, OUTLINE, (int(px), int(py)), max(2, int(er * pupil)))
            pygame.draw.circle(surf, (255, 255, 255), (int(px - er * 0.2), int(py - er * 0.25)), max(1, int(er * 0.2)))
        if expr == "angry":
            for e in (e1, e2):   # Çatık kaşlar
                pygame.draw.line(surf, OUTLINE, (e[0] - f * er, e[1] - er * 1.5), (e[0] + f * er, e[1] - er * 0.7), 4)

    # Gaga
    if mouth_open:
        outlined_poly(surf, (255, 160, 40), [(beak_x - f * s * 0.2, beak_y - s * 0.22),
                                              (beak_x + f * s * 0.45, beak_y - s * 0.3),
                                              (beak_x - f * s * 0.05, beak_y - s * 0.02)], 2)
        outlined_poly(surf, (240, 120, 30), [(beak_x - f * s * 0.2, beak_y + s * 0.05),
                                              (beak_x + f * s * 0.35, beak_y + s * 0.3),
                                              (beak_x - f * s * 0.05, beak_y + s * 0.2)], 2)
        pygame.draw.circle(surf, (150, 40, 50), (int(beak_x - f * s * 0.1), int(beak_y + s * 0.02)), max(2, int(s * 0.12)))
    else:
        outlined_poly(surf, (255, 160, 40), [(beak_x - f * s * 0.2, beak_y - s * 0.17),
                                              (beak_x + f * s * 0.42, beak_y),
                                              (beak_x - f * s * 0.2, beak_y + s * 0.17)], 2)
    # Yanak
    pygame.draw.circle(surf, (255, 150, 170), (int(x + f * s * 0.35), int(y + s * 0.12)), max(2, int(s * 0.16)))

    if expr == "nervous":     # Ter damlası
        sx_, sy_ = x - f * s * 0.5, y - s * 1.0
        pygame.draw.polygon(surf, (120, 200, 255), [(sx_, sy_ - 7), (sx_ - 4, sy_ + 1), (sx_ + 4, sy_ + 1)])
        pygame.draw.circle(surf, (120, 200, 255), (int(sx_), int(sy_ + 1)), 4)


def _wing(surf, px, py, s, f, angle, color):
    """Omuz noktası (px, py) etrafında dönen kanat."""
    dx, dy = -f * math.cos(angle), math.sin(angle)
    cx, cy = px + dx * s * 0.6, py + dy * s * 0.6
    ang = math.atan2(dy, dx)
    pts = ellipse_poly(cx, cy, s * 0.75, s * 0.38, ang, 12)
    outlined_poly(surf, color, pts, 2)


def draw_bubble(surf, text, x, y, color=(255, 255, 255)):
    txt = cached_text(text, 22, OUTLINE, outline_px=0)
    w, h = txt.get_width() + 16, txt.get_height() + 10
    r = pygame.Rect(0, 0, w, h)
    r.midbottom = (int(x), int(y))
    r.clamp_ip(pygame.Rect(4, 4, WIDTH - 8, HEIGHT - 8))
    pygame.draw.polygon(surf, OUTLINE, [(r.centerx - 7, r.bottom - 2), (r.centerx + 7, r.bottom - 2), (r.centerx, r.bottom + 10)])
    pygame.draw.rect(surf, OUTLINE, r.inflate(4, 4), border_radius=10)
    pygame.draw.rect(surf, color, r, border_radius=9)
    pygame.draw.polygon(surf, color, [(r.centerx - 5, r.bottom - 3), (r.centerx + 5, r.bottom - 3), (r.centerx, r.bottom + 6)])
    surf.blit(txt, (r.x + 8, r.y + 5))


# =============================================================================
#  Kuş sınıfı
# =============================================================================
class Bird:
    _next_id = 0

    def __init__(self, kind, x, y, speed_mult=1.0):
        Bird._next_id += 1
        self.id = Bird._next_id
        self.kind = kind
        self.data = BIRD_TYPES[kind]
        self.size = self.data["size"]
        self.points = self.data["points"]
        self.speed = self.data["speed"] * speed_mult
        self.x, self.y = float(x), float(y)
        self.vx = self.vy = 0.0
        self.state = "flying"
        self.state_t = 0.0
        self.perch = None             # Konduğu / gideceği dal indeksi
        self.target = (x, y)
        self.facing = 1
        self.flap = random.uniform(0, 6)
        self.t = random.uniform(0, 10)
        self.blink_t = random.uniform(1.5, 4.0)
        self.blink = 0.0
        self.look = (0.0, 0.0)
        self.expr = "normal"
        self.bubble = None            # (yazı, kalan süre, renk)
        self.alive = True
        self.counted = False          # Puanı verildi mi?
        self.hop_from = self.hop_to = None
        self.squash = 0.0
        self.nervous = 0.0
        self.tear_t = 0.0
        self.egg_laid = False
        self.helped = False
        self.flock_id = None
        self.base_y = y
        self.dive_target = None
        self.dropped = False
        self.relocate_t = random.uniform(3.0, 5.0)   # Altın kuş sık yer değiştirir

    # ---------------------------------------------------------------- yardımcılar
    @property
    def pos(self):
        return (self.x, self.y)

    def perch_pos(self, perch):
        return (perch[0], perch[1] - self.size * 1.1)

    def say(self, text, time=1.4, color=(255, 255, 255)):
        self.bubble = [text, time, color]

    def set_state(self, state):
        self.state = state
        self.state_t = 0.0

    def is_target(self):
        """Taşla korkutulabilir mi?"""
        return self.state in ("perched", "hopping", "flying", "flock", "diving", "bomber") and not self.counted

    def fly_to(self, x, y):
        self.target = (x, y)
        self.set_state("flying")

    def flee(self, from_x=None, from_y=None):
        """Korkup kaçar: tehlikeden uzağa ve yukarı doğru."""
        if self.state == "fleeing":
            return
        fx = from_x if from_x is not None else self.x - 1
        dir_x = 1 if self.x >= fx else -1
        if self.x > WIDTH - 150:
            dir_x = 1
        self.vx = dir_x * self.speed * random.uniform(1.4, 1.8)
        self.vy = -self.speed * random.uniform(1.0, 1.5)
        self.facing = dir_x
        self.expr = "scared"
        self.bubble = None
        self.set_state("fleeing")

    def stun(self):
        self.set_state("stunned")
        self.expr = "cry"
        self.bubble = None

    # ---------------------------------------------------------------- güncelleme
    def update(self, dt, level):
        self.t += dt
        self.state_t += dt
        self.squash *= 0.85 ** (dt * 60)
        if self.bubble:
            self.bubble[1] -= dt
            if self.bubble[1] <= 0:
                self.bubble = None
        st = self.state
        handler = getattr(self, "_update_" + st)
        handler(dt, level)
        if st in ("fleeing", "retreat", "flock", "bomber"):
            if self.x < -120 or self.x > WIDTH + 120 or self.y < -150:
                self.alive = False

    def _idle_face(self, dt, level):
        """Göz kırpma ve oyuncuyu gözle takip etme."""
        self.blink_t -= dt
        if self.blink_t <= 0:
            self.blink = 0.13
            self.blink_t = random.uniform(1.8, 4.5)
        self.blink = max(0.0, self.blink - dt)
        ax, ay = level.aim_point()
        dx, dy = ax - self.x, ay - self.y
        d = math.hypot(dx, dy) or 1
        self.look = (dx / d, dy / d)
        if abs(dx) > 30:
            self.facing = 1 if dx > 0 else -1
        self.nervous = max(0.0, self.nervous - dt)
        if self.blink > 0:
            self.expr = "blink"
        elif self.nervous > 0:
            self.expr = "nervous"
        else:
            self.expr = "normal"

    def _update_flying(self, dt, level):
        tx, ty = self.target
        if self.perch is not None:
            tx, ty = self.perch_pos(level.perches[self.perch])
        dx, dy = tx - self.x, ty - self.y
        d = math.hypot(dx, dy)
        self.flap += dt * 22
        self.facing = 1 if dx >= 0 else -1
        self.expr = "normal"
        self.look = (self.facing, 0.2)
        step = self.speed * dt
        if d <= step or d < 4:
            self.x, self.y = tx, ty
            if self.perch is not None:
                self.set_state("perched")
                self.squash = 1.0
            else:
                self.flee()
            return
        # Hafif dalgalı uçuş
        self.x += dx / d * step
        self.y += dy / d * step + math.sin(self.t * 9) * 25 * dt

    def _update_perched(self, dt, level):
        self.flap += dt * 2
        self._idle_face(dt, level)
        self.y = self.perch_pos(level.perches[self.perch])[1] - abs(math.sin(self.t * 3)) * 1.5
        # Rastgele ötme
        if random.random() < 0.10 * dt:
            self.say(random.choice(CHAT_LINES), 1.1)
            level.audio.play("chirp_" + self.kind, 0.7)
            level.effects.add(self.x + self.facing * 10, self.y - self.size, self.facing * 30, -50,
                              self.data["wing"], size=4, life=1.0, kind="note")
        # Komşusuyla sohbet
        elif random.random() < 0.04 * dt:
            other = level.neighbor_of(self, 170)
            if other is not None:
                self.facing = 1 if other.x > self.x else -1
                other.facing = -self.facing
                self.say(random.choice(CHAT_LINES), 1.4)
                other.say(random.choice(CHAT_LINES), 1.4, (255, 245, 210))
                level.audio.play("chirp_" + other.kind, 0.5)
        # Dal değiştirme
        hop = self.data["hop_chance"]
        if self.kind == "gold":
            self.relocate_t -= dt
            if self.relocate_t <= 0:
                hop = 99
                self.relocate_t = random.uniform(2.5, 4.5)
        if random.random() < hop * dt:
            new = level.free_perch_near(self.x, self.y, 260 if self.kind != "gold" else 900)
            if new is not None:
                level.release_perch(self.perch)
                self.hop_from = (self.x, self.y)
                self.perch = new
                level.claim_perch(new, self)
                self.hop_to = self.perch_pos(level.perches[new])
                if dist(self.hop_from, self.hop_to) > 190:
                    self.set_state("flying")
                else:
                    self.set_state("hopping")
                    self.squash = 0.8

    def _update_hopping(self, dt, level):
        dur = 0.45
        k = min(1.0, self.state_t / dur)
        (x0, y0), (x1, y1) = self.hop_from, self.perch_pos(level.perches[self.perch])
        self.x = x0 + (x1 - x0) * k
        self.y = y0 + (y1 - y0) * k - math.sin(k * math.pi) * 40
        self.facing = 1 if x1 >= x0 else -1
        self.flap += dt * 25
        self.expr = "normal"
        if k >= 1.0:
            self.set_state("perched")
            self.squash = 1.0

    def _update_stunned(self, dt, level):
        self.expr = "cry"
        self.flap += dt * 2
        self.tear_t -= dt
        if self.tear_t <= 0:   # Gözyaşı damlaları
            self.tear_t = 0.07
            for side in (-1, 1):
                level.effects.add(self.x + self.facing * self.size * 0.4, self.y - self.size * 0.2,
                                  side * random.uniform(60, 140), random.uniform(-160, -60), None,
                                  size=4, life=0.9, g=700, kind="tear")
        if self.state_t > 0.35 and not self.egg_laid:
            self.egg_laid = True
            level.spawn_egg(self.x, self.y + self.size, self.facing * random.uniform(20, 70), -60, self.data["wing"])
        if self.state_t > 0.9 and not self.helped:
            self.helped = True
            if random.random() < level.help_chance:
                self.say(random.choice(HELP_LINES), 1.4, (255, 230, 230))
                level.audio.play("help")
                level.call_for_help(self)
        if self.state_t > 2.3:
            self.flee()

    def _update_fleeing(self, dt, level):
        self.flap += dt * 30
        self.vy -= 120 * dt
        self.x += self.vx * dt
        self.y += self.vy * dt

    def _update_flock(self, dt, level):
        self.flap += dt * 18
        self.x += self.vx * dt
        self.y = self.base_y + math.sin(self.t * 2.5) * 18
        self.facing = 1 if self.vx > 0 else -1
        self.expr = "normal"
        self.look = (self.facing, 0)

    def _update_diving(self, dt, level):
        """Hazırlık (titreme) sonrası oyuncuya doğru dalış."""
        windup = 0.7
        self.expr = "angry"
        if self.state_t < windup:
            self.flap += dt * 30
            self.x += math.sin(self.t * 60) * 1.5
            px, py = level.player_target()
            self.facing = 1 if px > self.x else -1
            self.look = (self.facing, 0.6)
            if self.dive_target is None:
                self.say(random.choice(ANGRY_LINES), 1.0, (255, 210, 210))
                level.audio.play("angry")
                self.dive_target = (px, py)
            return
        px, py = level.player_target()
        tx, ty = self.dive_target
        # Hafif hedef takibi (çok az yön düzeltme)
        tx += (px - tx) * min(1.0, 1.2 * dt)
        self.dive_target = (tx, ty)
        dx, dy = tx - self.x, ty - self.y
        d = math.hypot(dx, dy) or 1
        sp = self.speed * level.dive_speed
        self.vx, self.vy = dx / d * sp, dy / d * sp
        self.x += self.vx * dt
        self.y += self.vy * dt
        self.flap += dt * 10
        self.facing = 1 if self.vx >= 0 else -1
        self.look = (self.vx / sp, self.vy / sp)
        if d < 14 or self.y > ty + 10:
            self.retreat()

    def retreat(self):
        self.vx = self.facing * self.speed * 1.2
        self.vy = -self.speed * 1.1
        self.expr = "normal"
        self.set_state("retreat")

    def _update_retreat(self, dt, level):
        self.flap += dt * 24
        self.x += self.vx * dt
        self.y += self.vy * dt

    def _update_bomber(self, dt, level):
        self.flap += dt * 20
        self.x += self.vx * dt
        self.y = self.base_y + math.sin(self.t * 4) * 10
        self.facing = 1 if self.vx > 0 else -1
        self.expr = "angry"
        px, _ = level.player_target()
        # Oyuncunun hareketini tahmin ederek yumurtayı biraz önceden bırakır
        lead = self.vx * 0.35
        if not self.dropped and abs(self.x + lead - px) < 25:
            self.dropped = True
            self.say("Al sana!", 0.9, (255, 210, 210))
            level.spawn_egg(self.x, self.y + self.size, self.vx * 0.4, 40, self.data["wing"], harmful=True)

    # ------------------------------------------------------------------ çizim
    def draw(self, surf):
        flying = self.state in ("flying", "fleeing", "flock", "diving", "retreat", "bomber", "hopping")
        draw_bird(surf, self.kind, self.x, self.y, self.facing, self.flap, flying,
                  self.expr, self.look, self.t, 1.35 if self.state == "stunned" else 1.0, self.squash)
        if self.state == "stunned":     # Kafanın etrafında dönen yıldızlar
            for i in range(3):
                a = self.t * 5 + i * math.tau / 3
                sx = self.x + math.cos(a) * self.size * 1.2
                sy = self.y - self.size * 1.3 + math.sin(a) * self.size * 0.35
                _star(surf, sx, sy, 6, (255, 230, 60))
        if self.state == "fleeing" and self.state_t < 0.6:
            surf.blit(cached_text("!", 34, (255, 80, 80)), (self.x - 6, self.y - self.size * 2.6))
        if self.state == "diving" and self.state_t < 0.7:
            if int(self.state_t * 10) % 2 == 0:
                surf.blit(cached_text("!!", 36, (255, 60, 60)), (self.x - 10, self.y - self.size * 3))
        if self.bubble:
            draw_bubble(surf, self.bubble[0], self.x, self.y - self.size * 1.6, self.bubble[2])


def _star(surf, x, y, r, color):
    pts = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5
        rr = r if i % 2 == 0 else r * 0.45
        pts.append((x + math.cos(a) * rr, y + math.sin(a) * rr))
    pygame.draw.polygon(surf, color, pts)
    pygame.draw.polygon(surf, OUTLINE, pts, 1)
