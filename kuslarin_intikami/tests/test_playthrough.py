"""Otomatik oynanış testi: bir "bot" oyunu baştan sona oynar.

Pencere ve ses kartı gerekmez (SDL dummy sürücüleri kullanılır).
Çalıştırma:  python -m pytest tests  veya  python tests/test_playthrough.py
İsteğe bağlı: SHOTS_DIR=klasör  ->  ekran görüntüleri kaydeder.
"""

import math
import os
import sys

os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pygame  # noqa: E402

from game.app import Game  # noqa: E402
from game.settings import GRAVITY, PLAYER_MAX_HEALTH  # noqa: E402
from game.scenes import ThrowLevel, EscapeLevel, GameOverScene, MenuScene  # noqa: E402

DT = 1 / 60
SHOTS = os.environ.get("SHOTS_DIR")


class FakeKeys:
    """pygame.key.get_pressed() yerine geçen sahte klavye durumu."""

    def __init__(self):
        self.down = set()

    def __getitem__(self, key):
        return key in self.down


KEYS = FakeKeys()
pygame.key.get_pressed = lambda: KEYS


class Bot:
    def __init__(self, game):
        self.game = game
        self.mouse = (640, 360)
        game.mouse_pos = lambda: self.mouse
        self.shot_n = 0

    def frames(self, n, events_fn=None):
        for _ in range(n):
            evs = events_fn() if events_fn else []
            self.game.step(DT, evs)

    def click(self, pos):
        self.mouse = pos
        self.game.step(DT, [pygame.event.Event(pygame.MOUSEBUTTONDOWN, button=1, pos=pos)])
        self.game.step(DT, [pygame.event.Event(pygame.MOUSEBUTTONUP, button=1, pos=pos)])

    def key(self, k):
        self.game.step(DT, [pygame.event.Event(pygame.KEYDOWN, key=k, mod=0, unicode="")])

    def shot(self, name):
        if SHOTS:
            os.makedirs(SHOTS, exist_ok=True)
            self.shot_n += 1
            pygame.image.save(self.game.canvas, os.path.join(SHOTS, "%02d_%s.png" % (self.shot_n, name)))

    # --- Akıllı nişan: hedefe en yakın geçen yörüngeyi seç -------------------
    def best_throw(self, scene, bird):
        best = None
        sx, sy = scene.player.shoulder
        for charge in [i / 10 for i in range(0, 11)]:
            for ang_deg in range(-85, 0, 2):
                a = math.radians(ang_deg)
                aim = (sx + math.cos(a) * 200, sy + math.sin(a) * 200)
                scene.charge = charge
                vx, vy, (x, y) = scene.throw_velocity(aim)
                tb = abs((bird.x - x) / vx) if vx else 99
                py = y + vy * tb + 0.5 * GRAVITY * tb * tb
                err = abs(py - bird.y)
                if best is None or err < best[0]:
                    best = (err, charge, aim)
        scene.charge = 0
        return best

    def throw_at(self, scene, bird):
        err, charge, aim = self.best_throw(scene, bird)
        hold = max(1, int(charge * 60))
        self.mouse = aim
        self.game.step(DT, [pygame.event.Event(pygame.MOUSEBUTTONDOWN, button=1, pos=aim)])
        self.frames(hold - 1)
        self.game.step(DT, [pygame.event.Event(pygame.MOUSEBUTTONUP, button=1, pos=aim)])


def play_throw_level(bot, game, max_seconds=150):
    scene = game.scene
    assert isinstance(scene, ThrowLevel)
    scene.start_play()
    frames = 0
    shot_taken = False
    while game.scene is scene and scene.phase in ("play", "car") and frames < max_seconds * 60:
        if scene.phase == "car":
            c = scene.car
            if c["state"] == "wait":
                KEYS.down = {pygame.K_a} if scene.player.x > c["x"] + 40 else {pygame.K_d} if scene.player.x < c["x"] - 40 else set()
                if not KEYS.down:
                    bot.key(pygame.K_e)
            if not shot_taken and c["state"] == "wait":
                bot.shot("level2_car")
                shot_taken = True
            bot.frames(1)
            frames += 1
            continue
        KEYS.down = set()
        # Dalan kuştan kaç
        divers = [b for b in scene.birds if b.state == "diving"]
        if divers:
            KEYS.down = {pygame.K_a} if divers[0].x > scene.player.x else {pygame.K_d}
        # Taş yığını varsa topla
        if scene.piles and scene.stones_left < 3:
            px = scene.piles[0]["x"]
            KEYS.down = {pygame.K_a} if px < scene.player.x else {pygame.K_d}
        targets = [b for b in scene.birds if b.state == "perched" and not b.counted]
        if targets and scene.stones_left > 0 and not scene.stones:
            target = min(targets, key=lambda b: abs(b.x - 700))
            bot.throw_at(scene, target)
            frames += 30
        else:
            bot.frames(5)
            frames += 5
        if frames % 600 < 5 and not shot_taken:
            pass
    KEYS.down = set()
    return scene


def test_full_playthrough():
    game = Game()
    bot = Bot(game)
    assert isinstance(game.scene, MenuScene)
    bot.frames(30)
    bot.shot("menu")
    # Menüden OYNA
    bot.click(game.scene.play_btn.rect.center)
    assert isinstance(game.scene, ThrowLevel) and game.scene.level_no == 1
    bot.frames(20)
    bot.shot("level1_intro")

    # ---- Bölüm 1
    scene = play_throw_level(bot, game)
    assert scene.phase == "complete", "Bölüm 1 bitmedi (kaçan %d/%d, taş %d, sahne %s)" % (
        scene.scared_here, scene.goal, scene.stones_left, type(game.scene).__name__)
    print("Bölüm 1 tamam: puan", game.stats.score, "kaçan", game.stats.birds_scared, "atış", scene.throws)
    bot.frames(60)
    bot.shot("level1_complete")
    bot.key(pygame.K_RETURN)
    assert isinstance(game.scene, ThrowLevel) and game.scene.level_no == 2

    # ---- Bölüm 2 (intikam + araba)
    scene = game.scene
    scene.start_play()
    bot.frames(300)
    bot.shot("level2_play")
    scene = play_throw_level(bot, game, 240)
    if isinstance(game.scene, GameOverScene):
        print("Bölüm 2'de kaybedildi:", game.scene.reason, "- checkpoint'ten tekrar deneniyor")
        game.retry_level()
        game.stats.health = 10 ** 6
        scene = play_throw_level(bot, game, 240)
    assert scene.phase == "complete", "Bölüm 2 bitmedi: %s kaçan %d/%d" % (scene.phase, scene.scared_here, scene.goal)
    print("Bölüm 2 tamam: puan", game.stats.score, "can", game.stats.health)
    bot.frames(60)
    bot.key(pygame.K_RETURN)
    assert isinstance(game.scene, EscapeLevel)

    # ---- Bölüm 3 (araba): basit sürücü bot
    scene = game.scene
    bot.frames(30)
    bot.shot("level3_intro")
    scene.start_play()
    frames = 0
    took_mid = False
    while game.scene is scene and scene.phase == "play" and frames < 200 * 60:
        KEYS.down = {pygame.K_w}
        car = scene.car
        evs = []
        for o in scene.objects:
            if o.kind in ("rock", "bigrock", "egg", "birdblock") and not o.hit:
                sx = o.wx - scene.cam
                gap = sx - (car.x + 105)
                if 0 < gap < car.speed * 0.28 and car.on_ground:
                    evs.append(pygame.event.Event(pygame.KEYDOWN, key=pygame.K_SPACE, mod=0, unicode=" "))
                    break
        for d in scene.divers:
            if d.t < d.WARN and abs(d.tx - car.x) < 140:
                KEYS.down.add(pygame.K_a if d.tx > car.x else pygame.K_d)
        game.stats.health = max(game.stats.health, 30)   # Test botu kaybetmesin
        game.step(DT, evs)
        frames += 1
        if not took_mid and scene.progress() > 0.5:
            bot.shot("level3_mid")
            took_mid = True
    KEYS.down = set()
    assert scene.phase == "complete", "Bölüm 3 bitmedi, ilerleme %.2f" % scene.progress()
    print("Bölüm 3 tamam: puan", game.stats.score, "süre %.1f sn" % (frames / 60), "kaçınma", scene.dodges)
    bot.frames(60)
    bot.shot("level3_complete")
    bot.key(pygame.K_RETURN)
    assert isinstance(game.scene, GameOverScene) and game.scene.win
    assert game.stats.levels_completed == 3
    bot.frames(60)
    bot.shot("victory")

    # ---- Yeniden başlat: bütün değerler sıfırlanmalı
    bot.click(game.scene.buttons["new"].rect.center)
    assert isinstance(game.scene, ThrowLevel) and game.scene.level_no == 1
    assert game.stats.score == 0 and game.stats.birds_scared == 0 and game.stats.levels_completed == 0
    assert game.stats.health == PLAYER_MAX_HEALTH


def test_pause_sound_and_fail():
    game = Game()
    bot = Bot(game)
    game.new_game()
    scene = game.scene
    scene.start_play()
    # Duraklat + ses kategorilerini aç/kapat
    bot.key(pygame.K_p)
    assert scene.paused
    bot.frames(10)
    bot.shot("pause_menu")
    for key, btn in scene.sound_panel.buttons.items():
        before = game.audio.cat_on[key]
        bot.click(btn.rect.center)
        assert game.audio.cat_on[key] != before
        bot.click(btn.rect.center)
    bot.click(scene.pause_buttons["resume"].rect.center)
    assert not scene.paused
    # HUD ses düğmesi
    bot.click(scene.hud.sound_btn.rect.center)
    assert game.audio.muted
    bot.click(scene.hud.sound_btn.rect.center)
    assert not game.audio.muted
    # Bütün taşları boşa at -> son şans -> oyun biter
    while scene.stones_left > 0:
        bot.mouse = (0, 700)
        bot.game.step(DT, [pygame.event.Event(pygame.MOUSEBUTTONDOWN, button=1, pos=bot.mouse)])
        bot.game.step(DT, [pygame.event.Event(pygame.MOUSEBUTTONUP, button=1, pos=bot.mouse)])
        bot.frames(40)
    bot.frames(200)
    assert scene.rescued and scene.piles
    scene.piles.clear()
    bot.frames(200)
    assert isinstance(game.scene, GameOverScene) and not game.scene.win
    bot.frames(60)
    bot.shot("game_over")
    # Bölümü tekrar dene
    bot.click(game.scene.buttons["retry"].rect.center)
    assert isinstance(game.scene, ThrowLevel)
    # Pencere boyutu değişse de fare dönüşümü doğru olmalı
    game.window = pygame.display.set_mode((1920, 1080), pygame.RESIZABLE)
    cx, cy = game.to_canvas((960, 540))
    assert abs(cx - 640) < 1 and abs(cy - 360) < 1
    bot.frames(5)


if __name__ == "__main__":
    test_full_playthrough()
    test_pause_sound_and_fail()
    print("TÜM TESTLER GEÇTİ")
