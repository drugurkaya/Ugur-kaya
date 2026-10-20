"""Programatik çizimler: gökyüzü, tepeler, renkli ağaçlar, çiçekler, bulutlar,
oyuncu karakteri, araba ve arayüz simgeleri.

Hiçbir resim dosyası gerekmez; her şey pygame çizim komutlarıyla yapılır.
"""

import math
import random

import pygame

from .settings import (WIDTH, HEIGHT, GROUND_Y, ROAD_Y, SKY_TOP, SKY_BOTTOM, GRASS,
                       GRASS_DARK, TREE_COLORS, FLOWER_COLORS, OUTLINE, WHITE)
from .utils import lerp_color, outlined_circle, ellipse_poly


# =============================================================================
#  Gökyüzü, tepeler, çimen
# =============================================================================
def draw_sky(surf, top=SKY_TOP, bottom=SKY_BOTTOM, height=HEIGHT):
    for y in range(0, height, 4):
        pygame.draw.rect(surf, lerp_color(top, bottom, y / height), (0, y, surf.get_width(), 4))


def draw_hills(surf, base_y, rng, width=WIDTH):
    for color, amp, off in (((150, 220, 140), 70, 0), ((120, 200, 115), 45, 90)):
        pts = [(0, HEIGHT)]
        phase = rng.uniform(0, 6)
        for x in range(0, width + 41, 40):
            # Döşenebilir olması için periyot genişliğe tam bölünür
            y = base_y - off * 0.3 - amp * (0.5 + 0.5 * math.sin(phase + x / width * math.tau * 2)) \
                - amp * 0.3 * math.sin(x / width * math.tau * 5)
            pts.append((x, y))
        pts.append((width, HEIGHT))
        pygame.draw.polygon(surf, color, pts)


def draw_flower(surf, x, y, color, size=6):
    pygame.draw.line(surf, (60, 150, 60), (x, y), (x, y + size * 2), 2)
    for i in range(5):
        a = i * math.tau / 5
        pygame.draw.circle(surf, color, (int(x + math.cos(a) * size * 0.8), int(y + math.sin(a) * size * 0.8)), size // 2 + 1)
    pygame.draw.circle(surf, (255, 220, 60), (x, y), max(2, size // 2))


def draw_ground(surf, top_y, rng, width=WIDTH):
    pygame.draw.rect(surf, GRASS, (0, top_y, width, HEIGHT - top_y))
    pygame.draw.rect(surf, GRASS_DARK, (0, top_y + 40, width, HEIGHT - top_y - 40))
    pygame.draw.line(surf, (70, 150, 60), (0, top_y), (width, top_y), 3)
    for _ in range(width // 6):          # Çimen yaprakları
        x = rng.randint(0, width)
        y = rng.randint(top_y, HEIGHT)
        pygame.draw.line(surf, (60, 140, 55), (x, y), (x + rng.randint(-3, 3), y - rng.randint(5, 11)), 2)
    for _ in range(width // 25):         # Çiçekler
        draw_flower(surf, rng.randint(5, width - 5), rng.randint(top_y + 8, HEIGHT - 15),
                    rng.choice(FLOWER_COLORS), rng.randint(4, 7))


# =============================================================================
#  Ağaçlar
# =============================================================================
def _leaf_cluster(surf, cx, cy, r, colors, rng, n=7):
    dark, light = colors
    blobs = [(cx + rng.uniform(-r * 0.8, r * 0.8), cy + rng.uniform(-r * 0.5, r * 0.5),
              rng.uniform(r * 0.45, r * 0.7)) for _ in range(n)]
    for bx, by, br in blobs:              # Kenar çizgisi
        pygame.draw.circle(surf, OUTLINE, (int(bx), int(by)), int(br) + 3)
    for bx, by, br in blobs:
        pygame.draw.circle(surf, dark, (int(bx), int(by)), int(br))
    for bx, by, br in blobs:              # Parlak vurgular
        pygame.draw.circle(surf, light, (int(bx - br * 0.25), int(by - br * 0.3)), int(br * 0.45))


def draw_tree(surf, x, ground_y, height, colors, rng, perches=None):
    """Renkli bir ağaç çizer ve kuşların konabileceği dal noktalarını döndürür."""
    trunk = (130, 85, 55)
    top_y = ground_y - height
    pts = [(x - 20, ground_y + 6), (x - 11, top_y + 40), (x + 11, top_y + 40), (x + 20, ground_y + 6)]
    pygame.draw.polygon(surf, trunk, pts)
    pygame.draw.polygon(surf, OUTLINE, pts, 3)
    pygame.draw.line(surf, (105, 65, 40), (x - 4, ground_y - 10), (x - 2, top_y + 60), 3)

    branch_levels = [top_y + height * 0.38, top_y + height * 0.58]
    tips = []
    for i, by in enumerate(branch_levels):
        for side in (-1, 1):
            if rng.random() < 0.15 and i == 1:
                continue
            length = rng.randint(85, 125)
            sx, sy = x, by + side * 6
            ex, ey = x + side * length, by - rng.randint(18, 34)
            pygame.draw.line(surf, OUTLINE, (sx, sy), (ex, ey), 14)
            pygame.draw.line(surf, trunk, (sx, sy), (ex, ey), 9)
            tips.append((ex, ey))
            if perches is not None:
                for t in (0.45, 0.78):
                    px = sx + (ex - sx) * t
                    py = sy + (ey - sy) * t - 4
                    perches.append((px, py))
    _leaf_cluster(surf, x, top_y + 20, 75, colors, rng, 9)
    for ex, ey in tips:
        _leaf_cluster(surf, ex + rng.randint(-6, 6), ey - 6, 22, colors, rng, 3)
    if perches is not None:
        perches.append((x - 32, top_y - 32))
        perches.append((x + 30, top_y - 30))
    return tips


def draw_sun(surf, x, y, t):
    for i in range(12):
        a = t * 0.4 + i * math.tau / 12
        r1, r2 = 50, 70 + 6 * math.sin(t * 3 + i)
        pygame.draw.line(surf, (255, 220, 80), (x + math.cos(a) * r1, y + math.sin(a) * r1),
                         (x + math.cos(a) * r2, y + math.sin(a) * r2), 5)
    outlined_circle(surf, (255, 225, 70), (x, y), 44, 3)
    # Gülen yüz
    pygame.draw.circle(surf, OUTLINE, (x - 14, y - 8), 4)
    pygame.draw.circle(surf, OUTLINE, (x + 14, y - 8), 4)
    pygame.draw.arc(surf, OUTLINE, (x - 18, y - 6, 36, 26), math.pi + 0.3, math.tau - 0.3, 3)
    pygame.draw.circle(surf, (255, 160, 120), (x - 24, y + 6), 6)
    pygame.draw.circle(surf, (255, 160, 120), (x + 24, y + 6), 6)


# =============================================================================
#  Bulutlar
# =============================================================================
def make_cloud(rng, scale=1.0):
    w, h = int(220 * scale), int(110 * scale)
    s = pygame.Surface((w, h), pygame.SRCALPHA)
    blobs = [(w * 0.3, h * 0.6, h * 0.32), (w * 0.5, h * 0.42, h * 0.4), (w * 0.7, h * 0.6, h * 0.3),
             (w * 0.42, h * 0.68, h * 0.28), (w * 0.6, h * 0.68, h * 0.28)]
    for bx, by, br in blobs:
        pygame.draw.circle(s, (210, 225, 245), (int(bx), int(by) + 4), int(br))
    for bx, by, br in blobs:
        pygame.draw.circle(s, WHITE, (int(bx), int(by)), int(br))
    return s


class CloudLayer:
    """Yavaşça kayan bulutlar."""

    def __init__(self, rng, count=6, speed=12):
        self.clouds = []
        for i in range(count):
            sc = rng.uniform(0.6, 1.2)
            self.clouds.append([make_cloud(rng, sc), rng.uniform(0, WIDTH), rng.uniform(30, 260),
                                speed * rng.uniform(0.6, 1.4) * sc])

    def update(self, dt, extra=0.0):
        for c in self.clouds:
            c[1] -= (c[3] + extra * c[3] * 0.05) * dt
            if c[1] < -c[0].get_width():
                c[1] = WIDTH + 20

    def draw(self, surf):
        for s, x, y, _ in self.clouds:
            surf.blit(s, (int(x), int(y)))


# =============================================================================
#  Arka planlar
# =============================================================================
def build_throw_background(seed, tree_xs):
    """Taş atma bölümünün sabit arka planı + dal (tünek) noktaları."""
    rng = random.Random(seed)
    sky = pygame.Surface((WIDTH, HEIGHT))
    draw_sky(sky)
    scene = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
    draw_hills(scene, GROUND_Y - 40, rng)
    perches = []
    colors = TREE_COLORS[:]
    rng.shuffle(colors)
    for i, tx in enumerate(tree_xs):
        draw_tree(scene, tx, GROUND_Y, rng.randint(300, 380), colors[i % len(colors)], rng, perches)
    # Ekranın dışında kalan ya da arayüzün altına giren dalları kullanma
    perches = [p for p in perches if 30 < p[0] < WIDTH - 30 and p[1] > 120]
    draw_ground(scene, GROUND_Y, rng)
    return sky, scene, perches


def build_road_layers(seed):
    """Araba bölümü için yatay döşenebilir (tile) katmanlar."""
    rng = random.Random(seed)
    sky = pygame.Surface((WIDTH, HEIGHT))
    draw_sky(sky)
    hills = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
    draw_hills(hills, ROAD_Y - 70, rng)
    trees = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
    xs = list(range(80, WIDTH, 210))
    for i, x in enumerate(xs):
        h = rng.randint(200, 270)
        surf_tree = pygame.Surface((360, h + 120), pygame.SRCALPHA)
        draw_tree(surf_tree, 180, h + 100, h, TREE_COLORS[i % 4], rng)
        for dx in (-WIDTH, 0, WIDTH):   # Kenardan taşan kısım diğer uçta görünür
            trees.blit(surf_tree, (x - 180 + dx, ROAD_Y - 30 - (h + 100)))
    road = pygame.Surface((WIDTH, HEIGHT - ROAD_Y + 40), pygame.SRCALPHA)
    pygame.draw.rect(road, GRASS, (0, 0, WIDTH, 30))
    for _ in range(40):
        draw_flower(road, rng.randint(5, WIDTH - 5), rng.randint(4, 18), rng.choice(FLOWER_COLORS), 4)
    pygame.draw.rect(road, (95, 95, 110), (0, 30, WIDTH, HEIGHT))
    pygame.draw.rect(road, (75, 75, 90), (0, 30, WIDTH, 8))
    for x in range(0, WIDTH, 160):        # Yol çizgileri
        pygame.draw.rect(road, (255, 235, 120), (x + 20, 75, 80, 8), border_radius=4)
    pygame.draw.rect(road, GRASS_DARK, (0, 118, WIDTH, HEIGHT))
    return sky, hills, trees, road


# =============================================================================
#  Oyuncu karakteri (sevimli çocuk)
# =============================================================================
SKIN = (255, 210, 170)


def draw_kid(surf, x, y, facing=1, walk=0.0, arm_angle=-0.8, holding=False,
             hurt=0.0, yolk=False, scale=1.0):
    """x, y: ayakların orta noktası. arm_angle: atan kolun açısı (radyan)."""
    s = scale
    bob = abs(math.sin(walk * 2)) * 3 * s
    # Bacaklar
    for side in (-1, 1):
        sw = math.sin(walk * 2 + (0 if side < 0 else math.pi)) * 8 * s
        pygame.draw.line(surf, OUTLINE, (x + side * 6 * s, y - 28 * s), (x + side * 6 * s + sw, y - 3), int(9 * s))
        pygame.draw.line(surf, (60, 80, 160), (x + side * 6 * s, y - 28 * s), (x + side * 6 * s + sw, y - 3), int(6 * s))
        pygame.draw.ellipse(surf, OUTLINE, (x + side * 6 * s + sw - 8 * s, y - 7 * s, 16 * s, 9 * s))
    by = y - bob
    # Gövde (tişört)
    body = pygame.Rect(0, 0, int(32 * s), int(36 * s))
    body.midbottom = (x, int(by - 24 * s))
    pygame.draw.rect(surf, OUTLINE, body.inflate(4, 4), border_radius=int(10 * s))
    pygame.draw.rect(surf, (255, 120, 60), body, border_radius=int(10 * s))
    pygame.draw.circle(surf, (255, 230, 80), body.center, int(6 * s))   # Tişört üzerindeki yıldız
    # Arka kol
    sh = (x - facing * 8 * s, by - 52 * s)
    pygame.draw.line(surf, OUTLINE, sh, (sh[0] - facing * 6 * s, sh[1] + 24 * s), int(9 * s))
    pygame.draw.line(surf, SKIN, sh, (sh[0] - facing * 6 * s, sh[1] + 24 * s), int(6 * s))
    # Kafa
    head = (x, int(by - 76 * s))
    outlined_circle(surf, SKIN, head, 18 * s, 2)
    # Şapka
    cap = pygame.Rect(0, 0, int(38 * s), int(20 * s))
    cap.midbottom = (head[0], head[1] - int(4 * s))
    pygame.draw.ellipse(surf, OUTLINE, cap.inflate(4, 4))
    pygame.draw.ellipse(surf, (60, 140, 255), cap)
    pygame.draw.rect(surf, (40, 110, 220), (head[0] + (0 if facing > 0 else -24 * s), head[1] - 10 * s, 24 * s, 6 * s), border_radius=3)
    # Yüz
    ex = head[0] + facing * 6 * s
    if hurt > 0:
        for dx in (-5, 5):     # Sersemlemiş X gözler
            cx = ex + dx * s
            pygame.draw.line(surf, OUTLINE, (cx - 3, head[1] - 3), (cx + 3, head[1] + 3), 2)
            pygame.draw.line(surf, OUTLINE, (cx - 3, head[1] + 3), (cx + 3, head[1] - 3), 2)
        pygame.draw.circle(surf, OUTLINE, (int(ex), int(head[1] + 9 * s)), int(4 * s), 2)
    else:
        pygame.draw.circle(surf, OUTLINE, (int(ex - 5 * s), int(head[1] - 1)), max(2, int(3 * s)))
        pygame.draw.circle(surf, OUTLINE, (int(ex + 5 * s), int(head[1] - 1)), max(2, int(3 * s)))
        pygame.draw.arc(surf, OUTLINE, (ex - 7 * s, head[1] + 1, 14 * s, 10 * s), math.pi + 0.4, math.tau - 0.4, 2)
    pygame.draw.circle(surf, (255, 160, 150), (int(ex - 11 * s * facing), int(head[1] + 5 * s)), int(4 * s))
    if yolk:   # Kafada yumurta sarısı
        pygame.draw.ellipse(surf, (255, 250, 235), (head[0] - 16 * s, head[1] - 26 * s, 32 * s, 14 * s))
        pygame.draw.circle(surf, (255, 195, 30), (head[0], int(head[1] - 20 * s)), int(6 * s))
    # Atan kol
    sh = (x + facing * 10 * s, by - 52 * s)
    hand = (sh[0] + math.cos(arm_angle) * 28 * s, sh[1] + math.sin(arm_angle) * 28 * s)
    pygame.draw.line(surf, OUTLINE, sh, hand, int(9 * s))
    pygame.draw.line(surf, SKIN, sh, hand, int(6 * s))
    outlined_circle(surf, SKIN, hand, 5 * s, 2)
    if holding:
        outlined_circle(surf, (150, 150, 165), hand, 7 * s, 2)
    return hand


# =============================================================================
#  Araba
# =============================================================================
def draw_car(surf, x, y, wheel_rot=0.0, driver=True, tilt=0.0, flash=False, splat=False):
    """Çizgi film arabası. x: orta nokta, y: tekerleklerin yere değdiği çizgi."""
    W, H = 260, 170
    c = pygame.Surface((W, H), pygame.SRCALPHA)
    ox, oy = W // 2, H - 10           # Yerel koordinatlarda zemin noktası
    body_col = (255, 255, 255) if flash else (235, 65, 70)
    # Kabin
    cabin = [(ox - 55, oy - 62), (ox - 35, oy - 105), (ox + 35, oy - 105), (ox + 65, oy - 62)]
    pygame.draw.polygon(c, body_col, cabin)
    pygame.draw.polygon(c, OUTLINE, cabin, 3)
    win = [(ox - 44, oy - 64), (ox - 29, oy - 97), (ox + 28, oy - 97), (ox + 53, oy - 64)]
    pygame.draw.polygon(c, (170, 225, 255), win)
    if driver:
        outlined_circle(c, SKIN, (ox + 8, oy - 76), 13, 2)
        pygame.draw.ellipse(c, (60, 140, 255), (ox - 6, oy - 96, 28, 14))
        pygame.draw.circle(c, OUTLINE, (ox + 14, oy - 78), 2)
        pygame.draw.arc(c, OUTLINE, (ox + 6, oy - 76, 12, 8), math.pi + 0.3, math.tau - 0.3, 2)
    pygame.draw.line(c, (230, 250, 255), (ox + 30, oy - 92), (ox + 44, oy - 70), 4)
    pygame.draw.polygon(c, OUTLINE, win, 2)
    pygame.draw.line(c, OUTLINE, (ox - 2, oy - 98), (ox - 2, oy - 64), 3)
    if splat:
        pygame.draw.circle(c, (255, 252, 235), (ox + 38, oy - 76), 14)
        pygame.draw.circle(c, (255, 195, 30), (ox + 38, oy - 76), 6)
    # Gövde
    body = pygame.Rect(ox - 110, oy - 66, 220, 46)
    pygame.draw.rect(c, OUTLINE, body.inflate(6, 6), border_radius=18)
    pygame.draw.rect(c, body_col, body, border_radius=16)
    pygame.draw.rect(c, (255, 140, 140) if not flash else WHITE, (ox - 95, oy - 60, 170, 8), border_radius=4)
    pygame.draw.circle(c, (255, 245, 150), (ox + 104, oy - 50), 8)        # Far
    pygame.draw.circle(c, OUTLINE, (ox + 104, oy - 50), 8, 2)
    pygame.draw.rect(c, (255, 90, 60), (ox - 112, oy - 54, 8, 12), border_radius=3)  # Stop lambası
    pygame.draw.line(c, OUTLINE, (ox - 5, oy - 60), (ox - 5, oy - 24), 2)  # Kapı
    pygame.draw.rect(c, OUTLINE, (ox + 8, oy - 50, 14, 4), border_radius=2)
    # Tekerlekler
    for wx in (ox - 65, ox + 65):
        pygame.draw.circle(c, OUTLINE, (wx, oy - 20), 24)
        pygame.draw.circle(c, (60, 60, 70), (wx, oy - 20), 21)
        pygame.draw.circle(c, (200, 200, 210), (wx, oy - 20), 10)
        for k in range(4):
            a = wheel_rot + k * math.pi / 2
            pygame.draw.line(c, (120, 120, 130), (wx, oy - 20),
                             (wx + math.cos(a) * 18, oy - 20 + math.sin(a) * 18), 3)
    if tilt:
        c = pygame.transform.rotate(c, -math.degrees(tilt))
    rect = c.get_rect(center=(int(x), int(y - (H - 10) + H // 2)))
    surf.blit(c, rect)
    return rect


# =============================================================================
#  Arayüz simgeleri
# =============================================================================
def icon_pause(surf, rect, color=WHITE):
    w = rect.width // 6
    pygame.draw.rect(surf, color, (rect.centerx - 2 * w, rect.y + rect.height // 4, w + 1, rect.height // 2), border_radius=2)
    pygame.draw.rect(surf, color, (rect.centerx + w, rect.y + rect.height // 4, w + 1, rect.height // 2), border_radius=2)


def icon_play(surf, rect, color=WHITE):
    cx, cy, r = rect.centerx, rect.centery, rect.height // 4
    pygame.draw.polygon(surf, color, [(cx - r * 0.7, cy - r), (cx - r * 0.7, cy + r), (cx + r, cy)])


def icon_restart(surf, rect, color=WHITE):
    cx, cy, r = rect.centerx, rect.centery, rect.height // 4
    pygame.draw.arc(surf, color, (cx - r, cy - r, 2 * r, 2 * r), 0.6, math.tau - 0.2, 3)
    tip = (cx + math.cos(0.6) * r, cy - math.sin(0.6) * r)
    pygame.draw.polygon(surf, color, [(tip[0] - 7, tip[1] - 3), (tip[0] + 5, tip[1] - 5), (tip[0] + 1, tip[1] + 7)])


def icon_sound(surf, rect, on=True, color=WHITE):
    cx, cy, r = rect.centerx - 4, rect.centery, rect.height // 4
    pygame.draw.rect(surf, color, (cx - r, cy - r * 0.45, r * 0.6, r * 0.9))
    pygame.draw.polygon(surf, color, [(cx - r * 0.5, cy - r * 0.45), (cx + r * 0.3, cy - r),
                                      (cx + r * 0.3, cy + r), (cx - r * 0.5, cy + r * 0.45)])
    if on:
        for k in (1, 2):
            rr = r * 0.5 * k
            pygame.draw.arc(surf, color, (cx + r * 0.3 - rr, cy - rr, 2 * rr, 2 * rr), -0.9, 0.9, 2)
    else:
        pygame.draw.line(surf, (255, 90, 90), (cx + r * 0.6, cy - r * 0.5), (cx + r * 1.4, cy + r * 0.5), 3)
        pygame.draw.line(surf, (255, 90, 90), (cx + r * 0.6, cy + r * 0.5), (cx + r * 1.4, cy - r * 0.5), 3)


def draw_heart(surf, x, y, size, color=(240, 70, 90)):
    r = size // 2
    pygame.draw.circle(surf, color, (x - r // 2 - 1, y), r // 1)
    pygame.draw.circle(surf, color, (x + r // 2 + 1, y), r // 1)
    pygame.draw.polygon(surf, color, [(x - size + 1, y + 2), (x + size - 1, y + 2), (x, y + size + 2)])


def draw_stone(surf, x, y, r, rot=0.0):
    pts = ellipse_poly(x, y, r * 1.1, r * 0.9, rot, 9)
    pygame.draw.polygon(surf, (150, 150, 165), pts)
    pygame.draw.polygon(surf, OUTLINE, pts, 2)
    pygame.draw.circle(surf, (190, 190, 205), (int(x - r * 0.3), int(y - r * 0.3)), max(1, int(r * 0.35)))
