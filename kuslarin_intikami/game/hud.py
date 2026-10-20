"""Arayüz: düğmeler, oyun içi gösterge paneli (HUD) ve ses ayarları paneli."""

import math

import pygame

from . import art
from .settings import (WIDTH, HEIGHT, OUTLINE, WHITE, UI_PANEL, UI_ACCENT, UI_GREEN, UI_BLUE,
                       PLAYER_MAX_HEALTH, SOUND_CATEGORIES)
from .utils import cached_text, blit_center, clamp


class Button:
    """Fareyle tıklanabilen, üzerine gelince büyüyen çizgi film düğmesi."""

    def __init__(self, rect, label="", color=UI_ACCENT, text_size=34, icon=None, action=None):
        self.rect = pygame.Rect(rect)
        self.label = label
        self.color = color
        self.text_size = text_size
        self.icon = icon            # fonksiyon(yüzey, rect) ya da None
        self.action = action
        self.hover = 0.0
        self.hovered = False

    def update(self, dt, mouse):
        self.hovered = self.rect.collidepoint(mouse)
        target = 1.0 if self.hovered else 0.0
        self.hover += (target - self.hover) * min(1.0, dt * 14)

    def handle_event(self, event):
        """Tıklanırsa True döndürür."""
        return (event.type == pygame.MOUSEBUTTONDOWN and event.button == 1
                and self.rect.collidepoint(event.pos))

    def draw(self, surf):
        grow = int(self.hover * 6)
        r = self.rect.inflate(grow * 2, grow * 2)
        shadow = r.move(0, 5)
        radius = min(r.height // 2, 22)
        pygame.draw.rect(surf, tuple(max(0, c - 70) for c in self.color), shadow, border_radius=radius)
        col = tuple(min(255, c + int(25 * self.hover)) for c in self.color)
        pygame.draw.rect(surf, col, r, border_radius=radius)
        pygame.draw.rect(surf, OUTLINE, r, 3, border_radius=radius)
        pygame.draw.rect(surf, tuple(min(255, c + 60) for c in col),
                         (r.x + 10, r.y + 6, r.width - 20, max(4, r.height // 6)), border_radius=6)
        if self.icon:
            self.icon(surf, r)
        if self.label:
            blit_center(surf, cached_text(self.label, self.text_size, WHITE), r.center)


class SoundPanel:
    """Ses kategorilerini ayrı ayrı açıp kapatan düğme grubu."""

    def __init__(self, audio, top_left):
        self.audio = audio
        self.buttons = {}
        x, y = top_left
        for i, (key, label) in enumerate(SOUND_CATEGORIES.items()):
            self.buttons[key] = Button((x + (i % 2) * 250, y + (i // 2) * 66, 235, 54), "", text_size=28)

    def update(self, dt, mouse):
        for key, b in self.buttons.items():
            on = self.audio.cat_on[key] and not self.audio.muted
            b.color = UI_GREEN if on else (150, 150, 160)
            b.label = "%s: %s" % (SOUND_CATEGORIES[key], "Açık" if self.audio.cat_on[key] else "Kapalı")
            b.update(dt, mouse)

    def handle_event(self, event):
        for key, b in self.buttons.items():
            if b.handle_event(event):
                self.audio.toggle_category(key)
                self.audio.play("click")
                return True
        return False

    def draw(self, surf):
        for b in self.buttons.values():
            b.draw(surf)


def panel(surf, rect, color=UI_PANEL, alpha=235):
    """Yuvarlak köşeli yarı saydam panel."""
    s = pygame.Surface((rect.width, rect.height), pygame.SRCALPHA)
    pygame.draw.rect(s, (*color, alpha), s.get_rect(), border_radius=24)
    pygame.draw.rect(s, (*OUTLINE, 255), s.get_rect(), 4, border_radius=24)
    surf.blit(s, rect.topleft)


def dim(surf, alpha=140):
    s = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
    s.fill((10, 10, 30, alpha))
    surf.blit(s, (0, 0))


class HUD:
    """Üst bilgi çubuğu + duraklat / yeniden başlat / ses düğmeleri."""

    def __init__(self, game):
        self.game = game
        size = 52
        y = 10
        self.pause_btn = Button((WIDTH - 3 * (size + 10), y, size, size), color=UI_BLUE,
                                icon=lambda s, r: art.icon_pause(s, r))
        self.restart_btn = Button((WIDTH - 2 * (size + 10), y, size, size), color=UI_ACCENT,
                                  icon=lambda s, r: art.icon_restart(s, r))
        self.sound_btn = Button((WIDTH - (size + 10), y, size, size), color=UI_GREEN,
                                icon=lambda s, r: art.icon_sound(s, r, not self.game.audio.muted))
        self.buttons = [self.pause_btn, self.restart_btn, self.sound_btn]
        self.score_shown = 0.0
        self.pulse = 0.0

    def update(self, dt, mouse):
        for b in self.buttons:
            b.update(dt, mouse)
        target = self.game.stats.score
        if self.score_shown < target:   # Puan sayacı yukarı doğru akar
            self.score_shown = min(target, self.score_shown + max(60 * dt, (target - self.score_shown) * dt * 8))
            self.pulse = 0.2
        else:
            self.score_shown = target
        self.pulse = max(0.0, self.pulse - dt)

    def handle_event(self, event):
        """'pause', 'restart', 'sound' veya None döndürür."""
        if self.pause_btn.handle_event(event):
            return "pause"
        if self.restart_btn.handle_event(event):
            return "restart"
        if self.sound_btn.handle_event(event):
            return "sound"
        return None

    def draw(self, surf, level_no, level_name, stones=None, scared=None, goal=None,
             health=None, health_label="Can", combo=0, speed=None, progress=None):
        bar = pygame.Surface((WIDTH, 72), pygame.SRCALPHA)
        bar.fill((30, 30, 60, 150))
        surf.blit(bar, (0, 0))
        x = 16
        # Puan
        sc = 1.0 + self.pulse * 0.8
        t = cached_text("Puan: %d" % int(self.score_shown), 36, (255, 230, 90))
        if sc != 1.0:
            t = pygame.transform.smoothscale(t, (int(t.get_width() * sc), int(t.get_height() * sc)))
        surf.blit(t, (x, 18 - (t.get_height() - 28) // 2))
        x += 210
        # Kalan taş
        if stones is not None:
            art.draw_stone(surf, x + 12, 36, 11, 0.4)
            surf.blit(cached_text("x %d" % stones, 32, WHITE if stones > 3 else (255, 120, 120)), (x + 30, 22))
            x += 110
        if speed is not None:
            surf.blit(cached_text("Hız: %d km/sa" % speed, 30, WHITE), (x, 24))
            x += 175
        # Kaçan kuşlar
        if scared is not None:
            from .entities.bird import draw_bird
            draw_bird(surf, "blue", x + 16, 38, 1, pygame.time.get_ticks() / 80, True, "scared",
                      (0, 0), 0, 0.8)
            label = "Kaçan: %d" % scared + ("/%d" % goal if goal else "")
            surf.blit(cached_text(label, 30, WHITE), (x + 40, 24))
            x += 175
        # Can / dayanıklılık
        if health is not None:
            surf.blit(cached_text(health_label, 26, WHITE), (x, 10))
            hb = pygame.Rect(x, 36, 150, 20)
            pygame.draw.rect(surf, (60, 40, 50), hb, border_radius=8)
            frac = clamp(health / PLAYER_MAX_HEALTH, 0, 1)
            col = (90, 220, 110) if frac > 0.5 else (255, 200, 60) if frac > 0.25 else (255, 80, 80)
            if frac > 0:
                pygame.draw.rect(surf, col, (hb.x, hb.y, int(hb.width * frac), hb.height), border_radius=8)
            pygame.draw.rect(surf, OUTLINE, hb, 2, border_radius=8)
            art.draw_heart(surf, hb.right + 16, hb.centery - 3, 9)
            x += 190
        # Bölüm göstergesi
        lt = cached_text("Bölüm %d/3: %s" % (level_no, level_name), 28, (190, 230, 255))
        surf.blit(lt, (x, 8))
        if progress is not None:
            pb = pygame.Rect(x, 40, 220, 16)
            pygame.draw.rect(surf, (60, 60, 80), pb, border_radius=8)
            pygame.draw.rect(surf, (255, 200, 60), (pb.x, pb.y, int(pb.width * clamp(progress, 0, 1)), pb.height),
                             border_radius=8)
            pygame.draw.rect(surf, OUTLINE, pb, 2, border_radius=8)
            # Küçük araba simgesi
            cx = pb.x + int(pb.width * clamp(progress, 0, 1))
            pygame.draw.circle(surf, (235, 65, 70), (cx, pb.centery), 9)
            pygame.draw.circle(surf, OUTLINE, (cx, pb.centery), 9, 2)
        elif combo >= 1:
            mult = 1 + combo * 0.5
            wob = math.sin(pygame.time.get_ticks() / 90) * 2
            surf.blit(cached_text("Kombo x%.1f" % mult, 28, (255, 160, 220)), (x, 38 + wob))
        for b in self.buttons:
            b.draw(surf)
