"""Sahne altyapısı ve bütün oynanış sahnelerinin ortak özellikleri
(HUD, duraklatma menüsü, bölüm giriş/bitiş ekranları, kısayol tuşları)."""

import math

import pygame

from ..hud import HUD, Button, SoundPanel, panel, dim
from ..particles import Effects, ScreenSplats
from ..settings import WIDTH, HEIGHT, LEVELS, LAST_LEVEL, WHITE, UI_GREEN, UI_BLUE, UI_ACCENT, OUTLINE
from ..utils import cached_text, blit_center, ease_out_back


class Scene:
    """Bütün sahnelerin temel sınıfı."""

    def __init__(self, game):
        self.game = game
        self.shake = 0.0

    def handle_event(self, event):
        pass

    def update(self, dt):
        pass

    def draw(self, surf):
        pass

    def on_exit(self):
        pass


class PlayScene(Scene):
    """Bölüm sahneleri için ortak davranışlar.

    Alt sınıflar şunları yazar: update_world(dt, active), draw_world(surf),
    draw_hud(surf), handle_play_event(event).
    """

    INTRO_TIME = 2.6

    def __init__(self, game, level_no):
        super().__init__(game)
        self.level_no = level_no
        self.cfg = LEVELS[level_no]
        self.audio = game.audio
        self.stats = game.stats
        self.hud = HUD(game)
        self.effects = Effects()
        self.splats = ScreenSplats()
        self.phase = "intro"          # intro | play | complete (+ alt sınıfa özel aşamalar)
        self.intro_t = 0.0
        self.complete_t = 0.0
        self.paused = False
        self.banner = None            # [yazı, kalan süre, renk]
        self.summary = []             # Bölüm sonu satırları
        cx = WIDTH // 2
        self.pause_buttons = {
            "resume": Button((cx - 160, 210, 320, 64), "Devam Et", UI_GREEN, 38),
            "restart": Button((cx - 160, 470, 320, 58), "Yeniden Başlat", UI_ACCENT, 32),
            "menu": Button((cx - 160, 540, 320, 58), "Ana Menü", UI_BLUE, 32),
        }
        self.sound_panel = SoundPanel(game.audio, (cx - 245, 300))
        self.next_btn = Button((cx - 150, 520, 300, 70), "Devam Et", UI_GREEN, 40)

    # ------------------------------------------------------------ olaylar
    def handle_event(self, event):
        if event.type == pygame.KEYDOWN:
            if event.key in (pygame.K_ESCAPE, pygame.K_p):
                self.toggle_pause()
                return
            if event.key == pygame.K_m:
                self.audio.toggle_mute()
                return
            if event.key == pygame.K_r and (self.paused or event.mod & pygame.KMOD_CTRL or self.phase != "play"):
                self.game.new_game()
                return
        if self.paused:
            for key, b in self.pause_buttons.items():
                if b.handle_event(event):
                    self.audio.play("click")
                    if key == "resume":
                        self.toggle_pause()
                    elif key == "restart":
                        self.game.new_game()
                    elif key == "menu":
                        self.game.to_menu()
                    return
            self.sound_panel.handle_event(event)
            return
        action = self.hud.handle_event(event)
        if action:
            self.audio.play("click")
            if action == "pause":
                self.toggle_pause()
            elif action == "restart":
                self.game.new_game()
            elif action == "sound":
                self.audio.toggle_mute()
            return
        if self.phase == "intro":
            if (event.type == pygame.MOUSEBUTTONDOWN and event.button == 1) or \
                    (event.type == pygame.KEYDOWN and event.key in (pygame.K_SPACE, pygame.K_RETURN)):
                if self.intro_t > 0.4:
                    self.start_play()
            return
        if self.phase == "complete":
            if self.complete_t > 0.8 and (self.next_btn.handle_event(event) or
                                          (event.type == pygame.KEYDOWN and event.key in (pygame.K_RETURN, pygame.K_SPACE))):
                self.audio.play("click")
                self.go_next()
            return
        self.handle_play_event(event)

    def toggle_pause(self):
        if self.phase == "complete":
            return
        self.paused = not self.paused
        if self.paused:
            self.on_pause()

    def on_pause(self):
        pass

    def start_play(self):
        self.phase = "play"

    def handle_play_event(self, event):
        pass

    # ------------------------------------------------------------ bölüm sonu
    def complete(self, summary):
        """Bölüm başarıyla bitti."""
        if self.phase == "complete":
            return
        self.phase = "complete"
        self.complete_t = 0.0
        self.summary = summary
        self.stats.levels_completed += 1
        self.audio.set_engine(None)
        self.audio.play_music("music_victory", loop=False)
        for i in range(60):   # Konfeti
            self.effects.add(WIDTH / 2, HEIGHT / 2, math.cos(i) * (200 + i * 6), -abs(math.sin(i * 1.7)) * 600 - 100,
                             [(255, 90, 120), (255, 220, 70), (120, 160, 255), (120, 230, 140)][i % 4],
                             size=6, life=2.2, g=600, kind="star", vrot=5)

    def go_next(self):
        if self.level_no >= LAST_LEVEL:
            self.game.game_over(win=True)
        else:
            self.game.start_level(self.level_no + 1)

    def fail(self, reason):
        self.audio.set_engine(None)
        self.game.game_over(win=False, reason=reason)

    def show_banner(self, text, time=2.2, color=(255, 230, 90)):
        self.banner = [text, time, time, color]

    # ------------------------------------------------------------ döngü
    def update(self, dt):
        mouse = self.game.mouse_pos()
        self.hud.update(dt, mouse)
        if self.paused:
            for b in self.pause_buttons.values():
                b.update(dt, mouse)
            self.sound_panel.update(dt, mouse)
            return
        self.shake = max(0.0, self.shake - dt * 25)
        if self.banner:
            self.banner[1] -= dt
            if self.banner[1] <= 0:
                self.banner = None
        if self.phase == "intro":
            self.intro_t += dt
            if self.intro_t > self.INTRO_TIME:
                self.start_play()
            self.update_world(dt, False)
        elif self.phase == "complete":
            self.complete_t += dt
            self.next_btn.update(dt, mouse)
            self.update_world(dt, False)
        else:
            self.update_world(dt, True)
        self.effects.update(dt)
        self.splats.update(dt)

    def draw(self, surf):
        self.draw_world(surf)
        self.effects.draw_texts(surf)
        self.splats.draw(surf)
        self.draw_hud(surf)
        if self.banner:
            text, left, total, color = self.banner
            age = total - left
            sc = ease_out_back(min(1.0, age / 0.35))
            t = cached_text(text, 64, color, outline_px=4)
            if sc != 1.0:
                t = pygame.transform.smoothscale(t, (max(1, int(t.get_width() * sc)), max(1, int(t.get_height() * sc))))
            if left < 0.4:
                t = t.copy()
                t.set_alpha(int(255 * left / 0.4))
            blit_center(surf, t, (WIDTH / 2, 170))
        if self.phase == "intro":
            self.draw_intro(surf)
        elif self.phase == "complete":
            self.draw_complete(surf)
        if self.paused:
            self.draw_pause(surf)

    def draw_intro(self, surf):
        k = ease_out_back(min(1.0, self.intro_t / 0.5))
        y = -150 + (HEIGHT / 2 - 40 + 150) * k
        r = pygame.Rect(0, 0, 760, 230)
        r.center = (WIDTH // 2, int(y))
        panel(surf, r)
        blit_center(surf, cached_text("BÖLÜM %d" % self.level_no, 44, (255, 140, 60)), (r.centerx, r.y + 45))
        blit_center(surf, cached_text(self.cfg["name"], 64, (255, 220, 70), outline_px=4), (r.centerx, r.y + 105))
        blit_center(surf, cached_text(self.cfg["tip"], 28, OUTLINE, outline_px=0), (r.centerx, r.y + 165))
        if int(self.intro_t * 2) % 2 == 0:
            blit_center(surf, cached_text("Başlamak için tıkla", 24, (120, 120, 140), outline_px=0),
                        (r.centerx, r.y + 205))

    def draw_complete(self, surf):
        dim(surf, int(min(1.0, self.complete_t * 2) * 120))
        k = ease_out_back(min(1.0, self.complete_t / 0.6))
        r = pygame.Rect(0, 0, 640, 440)
        r.center = (WIDTH // 2, int(-300 + (HEIGHT / 2 + 300) * k))
        panel(surf, r)
        blit_center(surf, cached_text("BÖLÜM TAMAMLANDI!", 56, (255, 210, 60), outline_px=4), (r.centerx, r.y + 55))
        for i in range(3):   # Zıplayan yıldızlar
            sx = r.centerx + (i - 1) * 80
            sy = r.y + 120 - abs(math.sin(self.complete_t * 4 + i)) * 10
            _big_star(surf, sx, sy, 30)
        for i, line in enumerate(self.summary):
            blit_center(surf, cached_text(line, 32, OUTLINE, outline_px=0), (r.centerx, r.y + 185 + i * 42))
        self.next_btn.rect.center = (r.centerx, r.bottom - 60)
        if self.complete_t > 0.8:
            self.next_btn.label = "Devam Et" if self.level_no < LAST_LEVEL else "Sonuçlar"
            self.next_btn.draw(surf)

    def draw_pause(self, surf):
        dim(surf, 150)
        r = pygame.Rect(0, 0, 560, 520)
        r.center = (WIDTH // 2, HEIGHT // 2 + 30)
        panel(surf, r, (60, 60, 110), 240)
        blit_center(surf, cached_text("DURAKLATILDI", 56, WHITE, outline_px=4), (WIDTH // 2, 172))
        for b in self.pause_buttons.values():
            b.draw(surf)
        self.sound_panel.draw(surf)

    # Alt sınıfların dolduracağı yöntemler
    def update_world(self, dt, active):
        pass

    def draw_world(self, surf):
        pass

    def draw_hud(self, surf):
        pass


def _big_star(surf, x, y, r):
    pts = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5
        rr = r if i % 2 == 0 else r * 0.45
        pts.append((x + math.cos(a) * rr, y + math.sin(a) * rr))
    pygame.draw.polygon(surf, (255, 215, 50), pts)
    pygame.draw.polygon(surf, OUTLINE, pts, 3)
