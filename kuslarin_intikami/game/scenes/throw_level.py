"""Bölüm 1 ve 2: renkli ağaçlardaki kuşlara taş atma.

Bölüm 2'de kuşlar intikam almaya başlar ve bölüm sonunda bir araba gelir;
oyuncu arabaya binerek Bölüm 3'e (Büyük Kaçış) geçer.
"""

import math
import random

import pygame

from .. import art
from ..entities import Bird, Stone, Egg, Chick, Player
from ..settings import (WIDTH, HEIGHT, GROUND_Y, GRAVITY, OUTLINE, WHITE, THROW_MIN_SPEED,
                        THROW_MAX_SPEED, CHARGE_TIME, COMBO_STEP, COMBO_MAX, HIT_BONUS, BIRD_TYPES)
from ..utils import cached_text, blit_center, dist, lerp_color
from .base import PlayScene


class ThrowLevel(PlayScene):
    TREE_XS = [555, 775, 985, 1165]

    def __init__(self, game, level_no):
        super().__init__(game, level_no)
        cfg = self.cfg
        self.rng = random.Random(level_no * 31 + random.randint(0, 999))
        self.sky, self.background, self.perches = art.build_throw_background(level_no * 7 + 3, self.TREE_XS)
        self.perch_owner = [None] * len(self.perches)
        self.clouds = art.CloudLayer(self.rng, 6)
        self.player = Player(200, GROUND_Y)
        self.birds, self.stones, self.eggs, self.chicks, self.piles = [], [], [], [], []
        self.stones_left = cfg["stones"]
        self.goal = cfg["goal"]
        self.scared_here = 0
        self.score_start = self.stats.score
        self.charging = False
        self.charge = 0.0
        self.combo = 0
        self.spawn_t = 1.0
        self.flock_t = 5.0
        self.next_flock = 1
        self.help_chance = 0.35 if level_no == 1 else 0.6
        self.revenge = cfg["revenge"]
        self.revenge_on = False
        self.attack_t = 3.0
        self.dive_speed = 1.0
        self.pile_t = 14.0
        self.rescued = False         # Taşlar bitince bir kez "son şans" verilir
        self.out_t = 0.0
        self.t = 0.0
        self.throws = 0
        self.car = None               # Bölüm 2 sonundaki kaçış arabası
        self.hint_t = 0.0
        # Başlangıçta ağaçlarda kuşlar olsun
        for _ in range(int(cfg["max_birds"] * 0.65)):
            self.spawn_bird(perched=True)
        self.audio.play_music("music_calm")

    # ================================================================ yardımcılar
    # (Kuşlar bu yöntemleri kullanarak dünyayla etkileşir.)
    def aim_point(self):
        if self.player.hidden:
            return (self.car["x"], GROUND_Y - 60) if self.car else (WIDTH / 2, GROUND_Y)
        return self.game.mouse_pos()

    def player_target(self):
        return (self.player.x, GROUND_Y - 50)

    def neighbor_of(self, bird, radius):
        for b in self.birds:
            if b is not bird and b.state == "perched" and abs(b.x - bird.x) < radius and abs(b.y - bird.y) < 80:
                return b
        return None

    def free_perch_near(self, x, y, max_d, avoid=None):
        options = [i for i, p in enumerate(self.perches)
                   if self.perch_owner[i] is None and dist(p, (x, y)) < max_d and i != avoid]
        return self.rng.choice(options) if options else None

    def claim_perch(self, i, bird):
        self.perch_owner[i] = bird

    def release_perch(self, i):
        if i is not None:
            self.perch_owner[i] = None

    def _rebuild_perches(self):
        self.perch_owner = [None] * len(self.perches)
        for b in self.birds:
            if b.perch is not None and b.state in ("perched", "hopping", "flying", "stunned"):
                self.perch_owner[b.perch] = b

    def choose_kind(self):
        w = self.cfg["weights"]
        kinds = list(w.keys())
        if any(b.kind == "gold" for b in self.birds):   # Aynı anda tek altın kuş
            kinds.remove("gold")
        return self.rng.choices(kinds, [w[k] for k in kinds])[0]

    def spawn_bird(self, kind=None, perched=False, near=None):
        kind = kind or self.choose_kind()
        if near is not None:
            idx = self.free_perch_near(near[0], near[1], 420)
        else:
            idx = self.free_perch_near(WIDTH / 2, 0, 9999)
        if idx is None:
            return None
        bird = Bird(kind, 0, 0, self.cfg["speed_mult"])
        bird.perch = idx
        self.claim_perch(idx, bird)
        if perched:
            bird.x, bird.y = bird.perch_pos(self.perches[idx])
            bird.set_state("perched")
        else:
            side = self.rng.choice((-1, 1)) if near is None else (1 if near[0] > WIDTH / 2 else -1)
            bird.x = -30 if side < 0 else WIDTH + 30
            bird.y = self.rng.uniform(80, 300)
            bird.set_state("flying")
        self.birds.append(bird)
        return bird

    def spawn_egg(self, x, y, vx, vy, color, harmful=False):
        self.eggs.append(Egg(x, y, vx, vy, color, harmful))
        if not harmful:
            self.effects.text("Yumurta!", x, y - 30, (255, 250, 220), 24, 0.8)

    def call_for_help(self, bird):
        """Vurulan kuş arkadaşlarını çağırır: yakına yeni kuşlar gelir."""
        n = self.rng.randint(2, 3) if self.level_no == 1 else self.rng.randint(3, 4)
        for _ in range(n):
            self.spawn_bird(near=(bird.x, bird.y))
        if self.revenge:
            self.attack_t = min(self.attack_t, 1.0)

    def progress(self):
        return min(1.0, self.scared_here / self.goal)

    # ================================================================ girdiler
    def handle_play_event(self, event):
        if self.phase == "car":
            if event.type == pygame.KEYDOWN and event.key in (pygame.K_e, pygame.K_SPACE, pygame.K_w, pygame.K_UP):
                self.try_board()
            elif event.type == pygame.MOUSEBUTTONDOWN and event.button == 1 and self.car:
                if abs(event.pos[0] - self.car["x"]) < 120 and event.pos[1] > GROUND_Y - 140:
                    self.try_board()
            return
        if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
            if self.stones_left > 0 and self.player.hurt_t <= 0:
                self.charging = True
                self.charge = 0.0
        elif event.type == pygame.MOUSEBUTTONUP and event.button == 1:
            if self.charging:
                self.throw()
            self.charging = False

    def on_pause(self):
        self.charging = False

    def throw_velocity(self, aim=None):
        aim = aim or self.game.mouse_pos()
        sx, sy = self.player.shoulder
        dx, dy = aim[0] - sx, aim[1] - sy
        d = math.hypot(dx, dy) or 1
        speed = THROW_MIN_SPEED + (THROW_MAX_SPEED - THROW_MIN_SPEED) * self.charge
        return dx / d * speed, dy / d * speed, (sx + dx / d * 28, sy + dy / d * 28)

    def throw(self):
        if self.stones_left <= 0:
            return
        vx, vy, (x, y) = self.throw_velocity()
        self.stones.append(Stone(x, y, vx, vy))
        self.stones_left -= 1
        self.throws += 1
        self.player.throw_anim = 0.25
        self.audio.play("throw")
        # Taş havalanınca yakındaki kuşlar tedirgin olur
        for b in self.birds:
            if b.state == "perched" and abs(b.x - x) < 500:
                b.nervous = 0.6

    # ================================================================ puanlar
    def award(self, bird, stone, hit=False, bonus_text=None):
        """Kaçan / vurulan kuş için puan verir (kombo ve çoklu kuş bonusu ile)."""
        if bird.counted:
            return
        bird.counted = True
        mult = 1 + COMBO_STEP * min(self.combo, COMBO_MAX)
        pts = bird.points + (HIT_BONUS if hit else 0)
        if stone is not None:
            pts += 10 * stone.scared          # Aynı atışta kaçan her ek kuş için bonus
            stone.scared += 1
            stone.touched.add(bird.id)
        pts = int(pts * mult)
        self.stats.score += pts
        self.stats.birds_scared += 1
        self.scared_here += 1
        col = BIRD_TYPES[bird.kind]["body"]
        self.effects.text("+%d" % pts, bird.x, bird.y - 25, lerp_color(col, WHITE, 0.2), 36 if pts < 100 else 46)
        if bonus_text:
            self.effects.text(bonus_text, bird.x, bird.y - 65, (255, 240, 120), 30, 1.2)
        if stone is not None:
            names = {2: "ÇİFTE!", 3: "ÜÇLÜ!", 4: "SÜPER!", 6: "MUHTEŞEM!"}
            if stone.scared in names:
                self.effects.text(names[stone.scared], stone.x, stone.y - 40, (255, 150, 220), 40, 1.3)
                self.audio.play("combo")
        if bird.kind == "gold":
            self.show_banner("ALTIN KUŞ! +%d" % pts, 1.6, (255, 215, 60))
        self.audio.play("point")

    def scare_bird(self, bird, stone, sx, sy, bonus_text=None):
        """Kuşu korkutup kaçırır (sürüdeyse bütün sürü kaçar)."""
        group = [bird]
        if bird.flock_id is not None:
            group = [b for b in self.birds if b.flock_id == bird.flock_id and not b.counted and b.state == "flock"]
            if len(group) > 1:
                self.effects.text("SÜRÜ DAĞILDI!", bird.x, bird.y - 70, (180, 230, 255), 34, 1.3)
        for b in group:
            self.award(b, stone, bonus_text=bonus_text)
            b.flee(sx, sy)
            self.effects.feathers(b.x, b.y, BIRD_TYPES[b.kind]["body"], 3)
        self.audio.play("flap")
        self.audio.play("chirp_" + bird.kind)

    def hit_bird(self, bird, stone):
        """Doğrudan isabet: kuş sersemler, ağlar, yumurta atar."""
        self.award(bird, stone, hit=True, bonus_text="İSABET!")
        stone.deflect()
        self.audio.play("hit")
        self.audio.play("cry")
        self.effects.stars(bird.x, bird.y - 10, 7)
        self.effects.feathers(bird.x, bird.y, BIRD_TYPES[bird.kind]["body"], 6)
        self.effects.text(self.rng.choice(["BONK!", "TONK!", "PAT!"]), bird.x + 30, bird.y - 40, (255, 255, 255), 30, 0.7, 40)
        self.shake = max(self.shake, 4)
        if bird.state in ("diving", "bomber", "flock"):
            bird.flee(stone.x, stone.y)
            if bird.state == "fleeing":
                self.effects.text("Savuşturuldu!", bird.x, bird.y - 70, (160, 255, 160), 30, 1.2)
            return
        bird.stun()
        # Yakındaki kuşlar panikle havalanır
        for other in self.birds:
            if other is not bird and other.is_target() and dist(other.pos, bird.pos) < 140:
                self.scare_bird(other, stone, bird.x, bird.y, "Panik!")

    def resolve_stone(self, stone):
        """Taş yere düştü: kombo serisini güncelle."""
        stone.resolved = True
        if stone.scared > 0:
            self.combo += 1
            self.stats.best_combo = max(self.stats.best_combo, self.combo)
            if self.combo >= 2:
                mult = 1 + COMBO_STEP * min(self.combo, COMBO_MAX)
                self.effects.text("KOMBO x%.1f!" % mult, stone.x, GROUND_Y - 80, (255, 130, 210), 38, 1.3)
                self.audio.play("combo")
        else:
            if self.combo >= 2:
                self.effects.text("Seri bitti", stone.x, GROUND_Y - 60, (220, 220, 230), 26, 0.9)
            self.combo = 0

    def damage_player(self, amount, text="Ah!"):
        p = self.player
        if p.invuln_t > 0 or p.hidden:
            return
        self.stats.health = max(0, self.stats.health - amount)
        p.hurt_t = 0.6
        p.invuln_t = 1.3
        self.charging = False
        self.shake = 9
        self.audio.play("hurt")
        self.effects.text(text, p.x, GROUND_Y - 120, (255, 120, 120), 34, 0.9)
        self.effects.feathers(p.x, GROUND_Y - 80, (255, 255, 255), 5)
        if self.stats.health <= 0:
            self.fail("Kuşlar seni yakaladı!")

    # ================================================================ döngü
    def update_world(self, dt, active):
        self.t += dt
        self.clouds.update(dt)
        aim = self.game.mouse_pos()
        if self.charging:
            self.charge = min(1.0, self.charge + dt / CHARGE_TIME)
        self.player.update(dt, pygame.key.get_pressed(), aim, self.charging,
                           enabled=active and not self.player.hidden)
        playing = active and self.phase in ("play", "car")

        if playing:
            self._spawning(dt)
            if self.revenge:
                self._revenge(dt)
            self._pickups(dt)

        self._rebuild_perches()
        for b in self.birds:
            b.update(dt, self)
        self.birds = [b for b in self.birds if b.alive]

        # Dalış yapan kuş oyuncuya çarptı mı?
        hb = self.player.hitbox()
        for b in self.birds:
            if b.state == "diving" and b.state_t > 0.7 and hb.inflate(b.size, b.size).collidepoint(b.x, b.y):
                self.damage_player(4 if self.phase == "car" else 9, self.rng.choice(["Ay!", "Gak!", "Of!"]))
                b.retreat()

        self._update_stones(dt)
        self._update_eggs(dt)
        for c in self.chicks:
            c.update(dt)
        self.chicks = [c for c in self.chicks if c.alive]

        if self.phase == "car":
            self._update_car(dt)
        if not playing or self.phase != "play":
            return

        # Kazanma / kaybetme kontrolü
        if self.scared_here >= self.goal:
            if self.level_no == 2:
                self.start_car_phase()
            else:
                self.finish_level()
            return
        if self.stones_left == 0 and not any(s.flying for s in self.stones):
            if not self.rescued:
                self.rescued = True
                self.spawn_pile(5, rescue=True)
            elif not self.piles:
                self.out_t += dt
                if self.out_t > 1.5:
                    self.fail("Taşların bitti!")
        else:
            self.out_t = 0.0

    def _spawning(self, dt):
        cfg = self.cfg
        self.spawn_t -= dt
        resting = sum(1 for b in self.birds if b.state in ("perched", "hopping", "flying", "stunned"))
        extra = int(self.progress() * 6) if self.revenge else 0   # İntikamda ağaçlar dolar
        if self.spawn_t <= 0 and resting < cfg["max_birds"] + extra:
            self.spawn_bird()
            self.spawn_t = cfg["spawn_every"] * self.rng.uniform(0.7, 1.3)
        if cfg["flocks"]:
            self.flock_t -= dt
            if self.flock_t <= 0:
                self.flock_t = self.rng.uniform(7, 11)
                self.spawn_flock()

    def spawn_flock(self):
        """Gökyüzünden geçen kuş sürüsü (birini korkutursan hepsi kaçar)."""
        n = self.rng.randint(5, 7)
        d = self.rng.choice((-1, 1))
        kind = self.rng.choice(("blue", "yellow", "red"))
        base_y = self.rng.uniform(90, 200)
        fid = self.next_flock
        self.next_flock += 1
        for i in range(n):
            b = Bird(kind, 0, 0, self.cfg["speed_mult"])
            row = i % 2
            b.x = (-60 - i * 45) if d > 0 else (WIDTH + 60 + i * 45)
            b.base_y = base_y + row * 35 + (i // 2) * 6
            b.y = b.base_y
            b.vx = d * 170 * self.cfg["speed_mult"]
            b.t = i * 0.3
            b.flock_id = fid
            b.set_state("flock")
            self.birds.append(b)
        self.audio.play("flap")

    def _revenge(self, dt):
        """Kuşların intikamı: dalışlar ve yumurta bombardımanı."""
        p = self.progress()
        if not self.revenge_on and (p >= 0.2 or self.t > 25):
            self.revenge_on = True
            self.show_banner("KUŞLAR İNTİKAM İSTİYOR!", 2.6, (255, 110, 110))
            self.audio.play_music("music_action")
            self.audio.play("angry")
        if not self.revenge_on:
            return
        self.dive_speed = 1.0 + p * 0.7
        self.attack_t -= dt
        if self.attack_t > 0:
            return
        interval = max(1.3, 3.8 - p * 2.3)
        if self.phase == "car":
            interval = 1.1
        self.attack_t = interval * self.rng.uniform(0.8, 1.2)
        if self.rng.random() < 0.65:
            perched = [b for b in self.birds if b.state == "perched"]
            if perched:
                b = self.rng.choice(perched)
                b.perch = None
            else:
                b = Bird(self.choose_kind(), self.rng.uniform(300, WIDTH - 100), -30, self.cfg["speed_mult"])
                self.birds.append(b)
            b.dive_target = None
            b.set_state("diving")
        else:
            d = self.rng.choice((-1, 1))
            b = Bird(self.rng.choice(("red", "yellow")), -40 if d > 0 else WIDTH + 40, 0, self.cfg["speed_mult"])
            b.base_y = self.rng.uniform(110, 170)
            b.y = b.base_y
            b.vx = d * self.rng.uniform(230, 300)
            b.set_state("bomber")
            self.birds.append(b)
            self.audio.play("angry")

    def _update_stones(self, dt):
        for s in self.stones:
            ev = s.update(dt, GROUND_Y)
            if ev == "bounce":
                self.audio.play("thud", 0.6)
                self.effects.dust(s.x, GROUND_Y, 5)
            if s.flying:
                for b in self.birds:
                    if b.id in s.touched or not b.is_target():
                        continue
                    d = dist((s.x, s.y), b.pos)
                    if d < b.size + s.RADIUS + 3:
                        self.hit_bird(b, s)
                    elif d < BIRD_TYPES[b.kind]["scare"] * (0.6 if b.state in ("diving", "bomber") else 1.0):
                        self.scare_bird(b, s, s.x, s.y)
                    elif d < 230 and b.state == "perched":
                        b.nervous = 0.4
            if not s.flying and not s.resolved:
                self.resolve_stone(s)
        self.stones = [s for s in self.stones if s.alive]

    def _update_eggs(self, dt):
        hb = self.player.hitbox()
        for e in self.eggs:
            ev = e.update(dt, GROUND_Y)
            if e.harmful and e.state == "fall" and not self.player.hidden and hb.collidepoint(e.x, e.y):
                e.alive = False
                self.audio.play("egg_crack")
                self.effects.yolk(e.x, e.y, GROUND_Y)
                if self.player.invuln_t <= 0:
                    self.player.slow_t = 2.5
                    self.splats.add()
                    self.damage_player(5, "Yumurta!")
                continue
            if ev == "land":
                self.audio.play("egg_drop")
                self.effects.dust(e.x, GROUND_Y, 3, (255, 255, 240))
            elif ev == "crack":
                e.alive = False
                self.audio.play("egg_crack")
                self.effects.yolk(e.x, e.y, GROUND_Y)
                self.effects.text("ÇAT!", e.x, e.y - 30, (255, 220, 80), 32, 0.8)
                if not e.harmful or self.rng.random() < 0.4:
                    self.chicks.append(Chick(e.x, GROUND_Y))
        self.eggs = [e for e in self.eggs if e.alive]

    # ------------------------------------------------------------ taş yığınları
    def spawn_pile(self, amount=5, rescue=False):
        x = self.rng.uniform(90, 440)
        self.piles.append({"x": x, "n": amount, "t": 0.0})
        if rescue:
            self.show_banner("Son şans! Taşları topla!", 2.4, (255, 220, 120))
        self.effects.dust(x, GROUND_Y, 8)

    def _pickups(self, dt):
        if self.phase != "play":
            return
        self.pile_t -= dt
        if self.pile_t <= 0:
            self.pile_t = self.rng.uniform(13, 18)
            if self.stones_left < 15 and len(self.piles) < 2:
                self.spawn_pile(self.rng.randint(3, 5))
        for p in self.piles:
            p["t"] += dt
            if abs(p["x"] - self.player.x) < 34:
                n, p["n"] = p["n"], 0
                self.stones_left += n
                self.audio.play("pickup")
                self.effects.text("+%d Taş" % n, p["x"], GROUND_Y - 110, (220, 220, 240), 30)
        self.piles = [p for p in self.piles if p["n"] > 0]

    # ------------------------------------------------------------ araba aşaması
    def start_car_phase(self):
        """Bölüm 2 sonu: kuşlar çok kızgın, araba kurtarmaya geliyor!"""
        self.phase = "car"
        self.charging = False
        self.car = {"x": -180.0, "state": "arrive", "t": 0.0, "wheel": 0.0, "boarded": False}
        self.show_banner("Çabuk, arabaya bin!", 3.0, (255, 230, 90))
        self.audio.play("honk")
        self.attack_t = 1.5
        for _ in range(6):            # Ağaçlara yığınla kuş gelir
            self.spawn_bird()

    def try_board(self):
        c = self.car
        if not c or c["state"] != "wait":
            return
        if abs(self.player.x - c["x"]) < 120:
            c["state"] = "leave"
            c["boarded"] = True
            c["t"] = 0.0
            self.player.hidden = True
            self.audio.play("vroom")
            self.audio.play("honk")
            self.effects.text("Hadi gidelim!", c["x"], GROUND_Y - 170, (255, 255, 255), 36)
        else:
            self.effects.text("Arabaya yaklaş!", self.player.x, GROUND_Y - 130, (255, 230, 120), 26, 0.8)

    def _update_car(self, dt):
        c = self.car
        c["t"] += dt
        if c["state"] == "arrive":
            c["x"] += 420 * dt
            c["wheel"] += 420 * dt / 21
            if c["x"] >= 330:
                c["x"] = 330
                c["state"] = "wait"
                self.effects.dust(c["x"] - 100, GROUND_Y, 8)
        elif c["state"] == "leave":
            speed = 200 + c["t"] * 700
            c["x"] += speed * dt
            c["wheel"] += speed * dt / 21
            if self.rng.random() < 0.5:
                self.effects.add(c["x"] - 115, GROUND_Y - 25, -80, -30, (210, 210, 220), size=8, life=0.6, kind="smoke")
            if c["x"] > WIDTH + 200:
                self.finish_level()

    def finish_level(self):
        bonus = self.stones_left * 5
        self.stats.score += bonus
        gained = self.stats.score - self.score_start
        self.complete(["Kaçan kuş: %d" % self.scared_here,
                       "Kalan taş bonusu: +%d" % bonus,
                       "Bu bölümde kazanılan: %d puan" % gained])

    # ================================================================ çizim
    def draw_world(self, surf):
        surf.blit(self.sky, (0, 0))
        art.draw_sun(surf, 110, 120, self.t)
        self.clouds.draw(surf)
        surf.blit(self.background, (0, 0))

        for p in self.piles:   # Taş yığınları
            bob = math.sin(p["t"] * 5) * 3
            for i, (dx, dy) in enumerate(((-10, 0), (8, 0), (0, -10))):
                art.draw_stone(surf, p["x"] + dx, GROUND_Y - 8 + dy, 9, i)
            blit_center(surf, cached_text("Taş!", 24, (255, 255, 255)), (p["x"], GROUND_Y - 45 + bob))

        for c in self.chicks:
            c.draw(surf)
        for e in self.eggs:
            e.draw(surf)

        if self.car:
            art.draw_car(surf, self.car["x"], GROUND_Y + 6, self.car["wheel"], self.car["boarded"])
        aiming = self.charging and self.phase == "play"
        self.player.draw(surf, aiming or (self.stones_left > 0 and self.player.throw_anim <= 0))
        if self.car and self.car["state"] == "wait":
            bob = abs(math.sin(self.t * 5)) * 10
            x = self.car["x"]
            pygame.draw.polygon(surf, (255, 230, 60), [(x - 18, GROUND_Y - 200 - bob), (x + 18, GROUND_Y - 200 - bob),
                                                      (x, GROUND_Y - 170 - bob)])
            blit_center(surf, cached_text("ARABAYA BİN! (E / Boşluk)", 30, (255, 240, 120)), (x + 40, GROUND_Y - 225 - bob))

        # Kuşlar: önce dalda olanlar, sonra uçanlar
        for b in sorted(self.birds, key=lambda b: b.state not in ("perched", "stunned")):
            b.draw(surf)
        for s in self.stones:
            s.draw(surf)
        self.effects.draw(surf)

        if aiming:
            self.draw_aim(surf)
        if self.phase == "play" and self.throws < 2 and self.level_no == 1:
            self.hint_t += 1 / 60
            blit_center(surf, cached_text("Fareye BASILI TUT: güç topla  •  BIRAK: taşı fırlat  •  A/D: yürü",
                                          28, (255, 255, 255)), (WIDTH / 2, HEIGHT - 40))

    def draw_aim(self, surf):
        """Yörünge önizlemesi ve güç göstergesi."""
        vx, vy, (x, y) = self.throw_velocity()
        steps = int(self.cfg["preview"] / 0.04)
        for i in range(1, steps):
            t = i * 0.04
            px = x + vx * t
            py = y + vy * t + 0.5 * GRAVITY * t * t
            if py > GROUND_Y:
                break
            r = max(2, 5 - i // 6)
            pygame.draw.circle(surf, OUTLINE, (int(px), int(py)), r + 1)
            pygame.draw.circle(surf, (255, 255, 255), (int(px), int(py)), r)
        # Güç çubuğu
        bx, by = self.player.x - 40, GROUND_Y - 135
        pygame.draw.rect(surf, OUTLINE, (bx - 2, by - 2, 84, 16), border_radius=7)
        pygame.draw.rect(surf, (60, 60, 80), (bx, by, 80, 12), border_radius=6)
        col = lerp_color((120, 230, 120), (255, 80, 60), self.charge)
        pygame.draw.rect(surf, col, (bx, by, int(80 * self.charge), 12), border_radius=6)
        if self.charge >= 1.0 and int(self.t * 8) % 2 == 0:
            blit_center(surf, cached_text("TAM GÜÇ!", 22, (255, 230, 90)), (self.player.x, by - 14))

    def draw_hud(self, surf):
        self.hud.draw(surf, self.level_no, self.cfg["name"], stones=self.stones_left,
                      scared=self.scared_here, goal=self.goal, health=self.stats.health,
                      health_label="Can", combo=self.combo)
