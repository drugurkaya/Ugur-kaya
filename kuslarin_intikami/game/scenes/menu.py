"""Başlangıç ekranı: büyük OYNA düğmesi, nasıl oynanır ve ses ayarları."""

import math
import random

import pygame

from .. import art
from ..entities import Bird, draw_bird
from ..hud import Button, SoundPanel, panel, dim
from ..settings import WIDTH, HEIGHT, GROUND_Y, OUTLINE, WHITE, UI_GREEN, UI_BLUE, UI_ACCENT, BIRD_TYPES, TITLE
from ..utils import cached_text, blit_center
from .base import Scene


class MenuScene(Scene):
    def __init__(self, game):
        super().__init__(game)
        rng = random.Random(5)
        self.sky, self.background, perches = art.build_throw_background(42, [130, 360, 930, 1170])
        self.clouds = art.CloudLayer(rng, 7)
        self.t = 0.0
        # Dallarda süs kuşları
        self.perched = []
        kinds = ["blue", "yellow", "red", "blue", "yellow", "gold", "red", "blue"]
        for i, p in enumerate(rng.sample(perches, min(10, len(perches)))):
            k = kinds[i % len(kinds)]
            self.perched.append([k, p[0], p[1] - BIRD_TYPES[k]["size"] * 1.1, rng.uniform(0, 6), 1 if p[0] < WIDTH / 2 else -1])
        # Gökyüzünde dolaşan sürü
        self.flyers = []
        for i in range(6):
            b = Bird(rng.choice(["blue", "yellow", "red"]), -100 - i * 60, 0)
            b.base_y = 250 + (i % 2) * 30
            b.vx = 140
            b.t = i * 0.4
            b.set_state("flock")
            self.flyers.append(b)
        cx = WIDTH // 2
        self.play_btn = Button((cx - 190, 300, 380, 110), "OYNA", UI_GREEN, 76)
        self.help_btn = Button((cx - 400, 435, 250, 62), "Nasıl Oynanır?", UI_BLUE, 32)
        self.sound_btn = Button((cx - 125, 435, 250, 62), "Ses Ayarları", UI_ACCENT, 32)
        self.quit_btn = Button((cx + 150, 435, 250, 62), "Çıkış", (200, 90, 120), 32)
        self.close_btn = Button((cx - 110, 590, 220, 58), "Kapat", UI_BLUE, 32)
        self.sound_panel = SoundPanel(game.audio, (cx - 245, 330))
        self.overlay = None   # None | "help" | "sound"
        game.audio.play_music("music_calm")

    def handle_event(self, event):
        if self.overlay:
            if self.close_btn.handle_event(event) or (event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE):
                self.game.audio.play("click")
                self.overlay = None
            elif self.overlay == "sound":
                self.sound_panel.handle_event(event)
            return
        if self.play_btn.handle_event(event) or (event.type == pygame.KEYDOWN and event.key in (pygame.K_RETURN, pygame.K_SPACE)):
            self.game.audio.play("click")
            self.game.new_game()
        elif self.help_btn.handle_event(event):
            self.game.audio.play("click")
            self.overlay = "help"
        elif self.sound_btn.handle_event(event):
            self.game.audio.play("click")
            self.overlay = "sound"
        elif self.quit_btn.handle_event(event) or (event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE):
            self.game.running = False

    def update(self, dt):
        self.t += dt
        mouse = self.game.mouse_pos()
        self.clouds.update(dt)
        for b in self.flyers:
            b.update(dt, None)
            b.alive = True
            if b.x > WIDTH + 80:
                b.x = -80
        if self.overlay:
            self.close_btn.update(dt, mouse)
            self.sound_panel.update(dt, mouse)
        else:
            for b in (self.play_btn, self.help_btn, self.sound_btn, self.quit_btn):
                b.update(dt, mouse)
        # Ara sıra bir kuş öter
        if random.random() < 0.5 * dt:
            self.game.audio.play("chirp_" + random.choice(["blue", "yellow", "red"]), 0.4)

    def draw(self, surf):
        surf.blit(self.sky, (0, 0))
        art.draw_sun(surf, 110, 110, self.t)
        self.clouds.draw(surf)
        surf.blit(self.background, (0, 0))
        for k, x, y, ph, f in self.perched:
            hop = abs(math.sin(self.t * 3 + ph)) * 4
            mouse = self.game.mouse_pos()
            dx, dy = mouse[0] - x, mouse[1] - y
            d = math.hypot(dx, dy) or 1
            blink = (self.t + ph) % 4 < 0.12
            draw_bird(surf, k, x, y - hop, 1 if dx > 0 else -1, self.t * 2, False,
                      "blink" if blink else "normal", (dx / d, dy / d), self.t)
        for b in self.flyers:
            b.draw(surf)
        # Yerdeki çocuk karakter el sallıyor
        art.draw_kid(surf, 520, GROUND_Y, 1, 0, -1.6 + math.sin(self.t * 6) * 0.5, True)

        # Başlık: harfleri dalgalanan büyük yazı
        x = WIDTH / 2
        letters = [cached_text(ch, 104, c, outline_px=5) for ch, c in
                   zip(TITLE, _rainbow(len(TITLE)))]
        total = sum(l.get_width() - 8 for l in letters)
        cx = x - total / 2
        for i, l in enumerate(letters):
            y = 150 + math.sin(self.t * 3 + i * 0.5) * 10
            surf.blit(l, (cx, y - l.get_height() / 2))
            cx += l.get_width() - 8
        blit_center(surf, cached_text("Taş at, kuşları kaçır... ama intikamlarından kaç!", 34, WHITE),
                    (WIDTH / 2, 245))

        for b in (self.play_btn, self.help_btn, self.sound_btn, self.quit_btn):
            b.draw(surf)
        best = self.game.best_score
        if best:
            blit_center(surf, cached_text("Rekor: %d" % best, 30, (255, 230, 90)), (WIDTH / 2, 530))

        if self.overlay == "help":
            self.draw_help(surf)
        elif self.overlay == "sound":
            dim(surf)
            r = pygame.Rect(0, 0, 600, 420)
            r.center = (WIDTH // 2, 410)
            panel(surf, r, (60, 60, 110), 240)
            blit_center(surf, cached_text("SES AYARLARI", 50, WHITE, outline_px=3), (r.centerx, r.y + 50))
            blit_center(surf, cached_text("Her ses türünü ayrı ayrı aç/kapat. (M: hepsini sustur)", 24, (220, 220, 255), outline_px=0),
                        (r.centerx, r.y + 95))
            self.sound_panel.draw(surf)
            self.close_btn.rect.centery = r.bottom - 50
            self.close_btn.draw(surf)

    def draw_help(self, surf):
        dim(surf)
        r = pygame.Rect(0, 0, 1080, 600)
        r.center = (WIDTH // 2, HEIGHT // 2 + 10)
        panel(surf, r)
        blit_center(surf, cached_text("NASIL OYNANIR?", 52, (255, 140, 60), outline_px=3), (r.centerx, r.y + 42))
        lines = [
            "Fare: BASILI TUT güç topla, sürükleyerek nişan al, BIRAK taşı fırlat.",
            "Taşın yakınından geçtiği kuşlar korkup kaçar ve puan kazandırır.",
            "Doğrudan isabet: kuş ağlar, yumurta atar, arkadaşlarını çağırır!",
            "Arka arkaya başarılı atışlar KOMBO çarpanını büyütür.",
            "Bölüm 2'de kuşlar dalış yapar: A/D ile kaç ya da taşla savuştur.",
            "Bölüm 3 araba: W hızlan, S yavaşla, A/D ileri-geri, BOŞLUK zıpla.",
            "P / ESC: duraklat     M: sesi kapat     F11: tam ekran",
        ]
        for i, l in enumerate(lines):
            surf.blit(cached_text(l, 28, OUTLINE, outline_px=0), (r.x + 50, r.y + 85 + i * 38))
        # Kuş puan tablosu
        y = r.y + 375
        for i, k in enumerate(["blue", "yellow", "red", "gold"]):
            x = r.x + 130 + i * 240
            draw_bird(surf, k, x, y + 40, 1, self.t * 2, False, "normal", (1, 0), self.t, 1.4)
            blit_center(surf, cached_text(BIRD_TYPES[k]["name"], 26, OUTLINE, outline_px=0), (x + 20, y + 95))
            blit_center(surf, cached_text("%d puan" % BIRD_TYPES[k]["points"], 30, (255, 140, 60), outline_px=0), (x + 20, y + 125))
        self.close_btn.rect.centery = r.bottom - 10
        self.close_btn.draw(surf)


def _rainbow(n):
    cols = [(255, 90, 90), (255, 170, 60), (255, 225, 70), (120, 220, 110), (90, 170, 255), (190, 120, 255), (255, 130, 200)]
    return [cols[i % len(cols)] for i in range(n)]
