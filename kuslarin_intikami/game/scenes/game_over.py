"""Oyun sonu ekranı: kazanma veya kaybetme, toplam puan ve istatistikler."""

import math
import random

import pygame

from .. import art
from ..entities import draw_bird
from ..hud import Button, panel
from ..particles import Effects
from ..settings import WIDTH, HEIGHT, GROUND_Y, OUTLINE, WHITE, UI_GREEN, UI_BLUE, UI_ACCENT, LAST_LEVEL
from ..utils import cached_text, blit_center, ease_out_back
from .base import Scene


class GameOverScene(Scene):
    def __init__(self, game, win=False, reason=""):
        super().__init__(game)
        self.win = win
        self.reason = reason
        self.t = 0.0
        self.effects = Effects()
        self.sky, self.background, _ = art.build_throw_background(77, [200, 1080])
        self.clouds = art.CloudLayer(random.Random(3), 5)
        self.new_record = game.stats.score > 0 and game.stats.score >= game.best_score
        cx = WIDTH // 2
        self.buttons = {}
        if win:
            self.buttons["new"] = Button((cx - 330, 585, 310, 64), "Tekrar Oyna", UI_GREEN, 36)
            self.buttons["menu"] = Button((cx + 20, 585, 310, 64), "Ana Menü", UI_BLUE, 36)
            game.audio.play_music("music_victory", loop=False)
        else:
            self.buttons["retry"] = Button((cx - 490, 585, 310, 64), "Bölümü Tekrar Dene", UI_GREEN, 32)
            self.buttons["new"] = Button((cx - 155, 585, 310, 64), "Yeniden Başla", UI_ACCENT, 34)
            self.buttons["menu"] = Button((cx + 180, 585, 310, 64), "Ana Menü", UI_BLUE, 34)
            game.audio.play_music("music_gameover", loop=False)

    def handle_event(self, event):
        for key, b in self.buttons.items():
            if b.handle_event(event):
                self.game.audio.play("click")
                if key == "new":
                    self.game.new_game()
                elif key == "retry":
                    self.game.retry_level()
                else:
                    self.game.to_menu()
                return
        if event.type == pygame.KEYDOWN:
            if event.key in (pygame.K_RETURN, pygame.K_SPACE, pygame.K_r):
                self.game.new_game()
            elif event.key == pygame.K_ESCAPE:
                self.game.to_menu()

    def update(self, dt):
        self.t += dt
        self.clouds.update(dt)
        mouse = self.game.mouse_pos()
        for b in self.buttons.values():
            b.update(dt, mouse)
        if self.win and random.random() < 12 * dt:   # Konfeti yağmuru
            self.effects.add(random.uniform(0, WIDTH), -10, random.uniform(-40, 40), random.uniform(60, 160),
                             random.choice([(255, 90, 120), (255, 220, 70), (120, 160, 255), (120, 230, 140)]),
                             size=random.randint(4, 7), life=4.0, g=40, kind="star", vrot=4)
        self.effects.update(dt)

    def draw(self, surf):
        surf.blit(self.sky, (0, 0))
        self.clouds.draw(surf)
        surf.blit(self.background, (0, 0))
        st = self.game.stats
        # Kuşlar: kazanınca beyaz bayrak sallar, kaybedince zafer dansı yapar
        for i, k in enumerate(["blue", "yellow", "red", "gold", "blue"]):
            x = 150 + i * 250
            y = GROUND_Y - 30 - abs(math.sin(self.t * (3 if not self.win else 2) + i)) * (25 if not self.win else 6)
            draw_bird(surf, k, x, y, 1 if i % 2 else -1, self.t * 4, False,
                      "cry" if self.win else "angry", (0, 0), self.t, 1.6)
            if self.win:
                pole_x = x + 30
                pygame.draw.line(surf, OUTLINE, (pole_x, y - 10), (pole_x, y - 70), 3)
                wave = math.sin(self.t * 6 + i) * 4
                pygame.draw.polygon(surf, WHITE, [(pole_x, y - 70), (pole_x + 30, y - 64 + wave), (pole_x, y - 52)])
                pygame.draw.polygon(surf, OUTLINE, [(pole_x, y - 70), (pole_x + 30, y - 64 + wave), (pole_x, y - 52)], 2)
        self.effects.draw(surf)

        k = ease_out_back(min(1.0, self.t / 0.6))
        r = pygame.Rect(0, 0, 760, 450)
        r.center = (WIDTH // 2, int(-300 + (HEIGHT / 2 - 20 + 300) * k))
        panel(surf, r)
        if self.win:
            title, color = "TEBRİKLER! KAÇTIN!", (255, 200, 50)
            sub = "Kuşlar pes etti ve beyaz bayrak salladı!"
        else:
            title, color = "OYUN BİTTİ", (255, 100, 100)
            sub = self.reason or "Kuşlar bu sefer kazandı!"
        blit_center(surf, cached_text(title, 66, color, outline_px=4), (r.centerx, r.y + 55))
        blit_center(surf, cached_text(sub, 30, OUTLINE, outline_px=0), (r.centerx, r.y + 110))
        rows = [("Toplam Puan", "%d" % st.score),
                ("Kaçan Kuş Sayısı", "%d" % st.birds_scared),
                ("Tamamlanan Bölüm", "%d / %d" % (st.levels_completed, LAST_LEVEL)),
                ("En İyi Kombo", "%d" % st.best_combo),
                ("Rekor", "%d" % self.game.best_score)]
        for i, (label, val) in enumerate(rows):
            y = r.y + 160 + i * 46
            surf.blit(cached_text(label, 34, OUTLINE, outline_px=0), (r.x + 120, y))
            v = cached_text(val, 38, (255, 140, 60))
            surf.blit(v, (r.right - 120 - v.get_width(), y - 4))
        if self.new_record and int(self.t * 3) % 2 == 0:
            blit_center(surf, cached_text("YENİ REKOR!", 40, (255, 90, 160), outline_px=3), (r.right - 60, r.y + 20))
        if self.t > 0.6:
            for b in self.buttons.values():
                b.draw(surf)
