"""Küçük yardımcı fonksiyonlar: dosya yolları, yazı tipleri, matematik."""

import json
import math
import os
import sys

import pygame

from .settings import OUTLINE


def resource_path(*parts):
    """Dosya yolunu döndürür; PyInstaller ile paketlenmiş EXE'de de çalışır."""
    base = getattr(sys, "_MEIPASS", None)
    if base is None:
        base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, *parts)


# --- Yazı tipleri ---------------------------------------------------------------
_font_cache = {}


def font(size, bold=True):
    """Önbellekli yazı tipi. Varsayılan pygame yazı tipi Türkçe harfleri destekler."""
    key = (size, bold)
    if key not in _font_cache:
        f = pygame.font.Font(None, size)
        f.set_bold(False)
        _font_cache[key] = f
    return _font_cache[key]


def render_text(text, size, color, outline=OUTLINE, outline_px=2):
    """Çizgi film tarzı kenarlıklı yazı yüzeyi üretir."""
    f = font(size)
    inner = f.render(text, True, color)
    if not outline_px:
        return inner
    w, h = inner.get_width() + outline_px * 2, inner.get_height() + outline_px * 2
    surf = pygame.Surface((w, h), pygame.SRCALPHA)
    edge = f.render(text, True, outline)
    for dx in range(-outline_px, outline_px + 1):
        for dy in range(-outline_px, outline_px + 1):
            if dx * dx + dy * dy <= outline_px * outline_px + 1:
                surf.blit(edge, (dx + outline_px, dy + outline_px))
    surf.blit(inner, (outline_px, outline_px))
    return surf


_text_cache = {}


def cached_text(text, size, color, outline=OUTLINE, outline_px=2):
    """Sık değişmeyen yazılar için önbellek (her karede yeniden çizmeyelim)."""
    key = (text, size, color, outline, outline_px)
    surf = _text_cache.get(key)
    if surf is None:
        if len(_text_cache) > 600:
            _text_cache.clear()
        surf = render_text(text, size, color, outline, outline_px)
        _text_cache[key] = surf
    return surf


def blit_center(target, surf, center):
    target.blit(surf, surf.get_rect(center=(int(center[0]), int(center[1]))))


# --- Matematik ------------------------------------------------------------------
def clamp(v, lo, hi):
    return lo if v < lo else hi if v > hi else v


def lerp(a, b, t):
    return a + (b - a) * t


def lerp_color(c1, c2, t):
    return tuple(int(lerp(a, b, t)) for a, b in zip(c1, c2))


def dist(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def ellipse_poly(cx, cy, rx, ry, angle=0.0, n=14):
    """Döndürülmüş elips için çokgen noktaları (kanatlar, yapraklar...)."""
    ca, sa = math.cos(angle), math.sin(angle)
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        x, y = rx * math.cos(t), ry * math.sin(t)
        pts.append((cx + x * ca - y * sa, cy + x * sa + y * ca))
    return pts


def outlined_circle(surf, color, center, radius, width=2, outline=OUTLINE):
    c = (int(center[0]), int(center[1]))
    r = max(1, int(radius))
    pygame.draw.circle(surf, outline, c, r + width)
    pygame.draw.circle(surf, color, c, r)


def outlined_poly(surf, color, pts, width=2, outline=OUTLINE):
    pygame.draw.polygon(surf, color, pts)
    pygame.draw.polygon(surf, outline, pts, width)


def ease_out_back(t):
    c1 = 1.70158
    c3 = c1 + 1
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2


# --- Rekor kaydı ------------------------------------------------------------
_SAVE_FILE = os.path.join(os.path.expanduser("~"), ".kuslarin_intikami.json")


def load_best_score():
    try:
        with open(_SAVE_FILE, "r", encoding="utf-8") as fh:
            return int(json.load(fh).get("best", 0))
    except (OSError, ValueError, TypeError):
        return 0


def save_best_score(score):
    try:
        with open(_SAVE_FILE, "w", encoding="utf-8") as fh:
            json.dump({"best": int(score)}, fh)
    except OSError:
        pass
