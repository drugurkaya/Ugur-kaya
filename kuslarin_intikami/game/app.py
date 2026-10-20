"""Ana oyun sınıfı: pencere, oyun döngüsü, sahne geçişleri ve ölçekleme.

Oyun her zaman 1280x720'lik sabit bir tuvale çizilir; pencere yeniden
boyutlandırıldığında tuval en-boy oranı korunarak pencereye sığdırılır.
"""

import random

import pygame

from .audio import Audio
from .settings import WIDTH, HEIGHT, FPS, TITLE, LEVELS, SKY_TOP, WHITE, OUTLINE
from .state import GameStats
from .utils import cached_text, blit_center, load_best_score, save_best_score


class Game:
    def __init__(self):
        pygame.mixer.pre_init(22050, -16, 1, 512)
        pygame.init()
        pygame.display.set_caption(TITLE)
        self.window = pygame.display.set_mode((WIDTH, HEIGHT), pygame.RESIZABLE)
        pygame.display.set_icon(self._make_icon())
        self.canvas = pygame.Surface((WIDTH, HEIGHT))
        self.clock = pygame.time.Clock()
        self.fullscreen = False
        self.running = True
        self.stats = GameStats()
        self.best_score = load_best_score()
        self.audio = Audio()
        self.audio.build(self._loading_screen)
        from .scenes import MenuScene
        self.scene = MenuScene(self)

    # ------------------------------------------------------------ görüntü
    def _make_icon(self):
        from .entities import draw_bird
        icon = pygame.Surface((64, 64), pygame.SRCALPHA)
        draw_bird(icon, "red", 34, 34, 1, 0, False, "angry", (1, 0), 0, 1.3, legs=False)
        return icon

    def _loading_screen(self, frac):
        pygame.event.pump()
        self.canvas.fill(SKY_TOP)
        blit_center(self.canvas, cached_text(TITLE, 90, (255, 220, 70), outline_px=5), (WIDTH / 2, HEIGHT / 2 - 60))
        blit_center(self.canvas, cached_text("Kuşlar ötmeye hazırlanıyor...", 34, WHITE), (WIDTH / 2, HEIGHT / 2 + 20))
        bar = pygame.Rect(WIDTH / 2 - 250, HEIGHT / 2 + 70, 500, 26)
        pygame.draw.rect(self.canvas, OUTLINE, bar.inflate(6, 6), border_radius=13)
        pygame.draw.rect(self.canvas, (120, 230, 120), (bar.x, bar.y, int(bar.width * frac), bar.height), border_radius=12)
        self.present()

    def _view(self):
        """Tuvalin pencere içindeki ölçeği ve konumu (siyah kenarlarla)."""
        ww, wh = self.window.get_size()
        scale = min(ww / WIDTH, wh / HEIGHT) or 1
        w, h = int(WIDTH * scale), int(HEIGHT * scale)
        return scale, (ww - w) // 2, (wh - h) // 2, w, h

    def to_canvas(self, pos):
        scale, ox, oy, _, _ = self._view()
        return ((pos[0] - ox) / scale, (pos[1] - oy) / scale)

    def mouse_pos(self):
        return self.to_canvas(pygame.mouse.get_pos())

    def present(self):
        self.window = pygame.display.get_surface()
        scale, ox, oy, w, h = self._view()
        shake = getattr(self.scene, "shake", 0) if hasattr(self, "scene") else 0
        sx = int(random.uniform(-shake, shake)) if shake > 0.5 else 0
        sy = int(random.uniform(-shake, shake)) if shake > 0.5 else 0
        if (w, h) == (WIDTH, HEIGHT):
            if ox or oy or sx or sy:
                self.window.fill((0, 0, 0))
            self.window.blit(self.canvas, (ox + sx, oy + sy))
        else:
            self.window.fill((0, 0, 0))
            fn = pygame.transform.smoothscale if scale < 1 else pygame.transform.scale
            self.window.blit(fn(self.canvas, (w, h)), (ox + int(sx * scale), oy + int(sy * scale)))
        pygame.display.flip()

    def toggle_fullscreen(self):
        self.fullscreen = not self.fullscreen
        try:
            if self.fullscreen:
                self.window = pygame.display.set_mode((0, 0), pygame.FULLSCREEN)
            else:
                self.window = pygame.display.set_mode((WIDTH, HEIGHT), pygame.RESIZABLE)
        except pygame.error:
            self.fullscreen = False

    # ------------------------------------------------------------ sahneler
    def change_scene(self, scene):
        self.scene.on_exit()
        self.scene = scene

    def start_level(self, n):
        from .scenes import ThrowLevel, EscapeLevel
        self.stats.level = n
        self.stats.checkpoint()
        if LEVELS[n]["kind"] == "throw":
            self.change_scene(ThrowLevel(self, n))
        else:
            self.change_scene(EscapeLevel(self, n))

    def new_game(self):
        """Yeniden başlat: bütün değerler sıfırlanır, Bölüm 1'den başlanır."""
        self.stats.reset()
        self.start_level(1)

    def retry_level(self):
        self.stats.restore_checkpoint()
        self.start_level(self.stats.level)

    def to_menu(self):
        from .scenes import MenuScene
        self.audio.set_engine(None)
        self.change_scene(MenuScene(self))

    def game_over(self, win=False, reason=""):
        from .scenes import GameOverScene
        if self.stats.score > self.best_score:
            self.best_score = self.stats.score
            save_best_score(self.best_score)
        self.change_scene(GameOverScene(self, win, reason))

    # ------------------------------------------------------------ döngü
    def _convert(self, event):
        """Fare olaylarının konumunu pencere -> tuval koordinatına çevirir."""
        if event.type in (pygame.MOUSEBUTTONDOWN, pygame.MOUSEBUTTONUP, pygame.MOUSEMOTION):
            d = dict(event.dict)
            d["pos"] = self.to_canvas(event.pos)
            return pygame.event.Event(event.type, d)
        return event

    def handle_events(self, events=None):
        for event in events if events is not None else pygame.event.get():
            if event.type == pygame.QUIT:
                self.running = False
                continue
            if event.type == pygame.KEYDOWN and event.key == pygame.K_F11:
                self.toggle_fullscreen()
                continue
            if event.type == pygame.WINDOWFOCUSLOST and hasattr(self.scene, "paused") \
                    and not self.scene.paused and getattr(self.scene, "phase", "") == "play":
                self.scene.toggle_pause()      # Pencere arka plana geçince otomatik duraklat
            self.scene.handle_event(self._convert(event))

    def step(self, dt, events=None):
        """Tek bir kare: olaylar, güncelleme, çizim."""
        self.handle_events(events)
        self.scene.update(min(dt, 1 / 30))
        self.scene.draw(self.canvas)
        self.present()

    def run(self):
        while self.running:
            dt = self.clock.tick(FPS) / 1000.0
            self.step(dt)
        self.audio.set_engine(None)
        pygame.quit()
