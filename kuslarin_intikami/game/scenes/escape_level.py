"""Bölüm 3 - Büyük Kaçış: arabayla kuşlardan kaçış.

Kontroller: W/↑ hızlan, S/↓ yavaşla, A/D (←/→) ileri-geri, BOŞLUK zıpla.
Yolda taşlar, yumurtalar, kaygan yumurta sarısı ve yolu kesen kuşlar var.
Havadan dalış yapan ve yumurta bırakan kuşlar saldırır; arkadan bir sürü kovalar.
"""

import random

import pygame

from .. import art
from ..entities import Car, RoadObject, Diver, Bomber, AirEgg, Swarm
from ..settings import (WIDTH, HEIGHT, ROAD_Y, CAR_CRUISE_SPEED, CAR_MAX_SPEED, PLAYER_MAX_HEALTH, WHITE)
from ..utils import cached_text, blit_center
from .base import PlayScene

CAR_GROUND = ROAD_Y + 52     # Tekerleklerin yola değdiği çizgi


class EscapeLevel(PlayScene):
    def __init__(self, game, level_no=3):
        super().__init__(game, level_no)
        self.rng = random.Random()
        self.sky, self.hills, self.trees, self.road = art.build_road_layers(11)
        self.clouds = art.CloudLayer(self.rng, 6)
        self.length = self.cfg["length"]
        self.cam = 0.0
        self.car = Car(300, CAR_GROUND)
        self.objects, self.divers, self.bombers, self.air_eggs = [], [], [], []
        self.swarm = Swarm(CAR_GROUND - 40)
        self.next_obj_x = 1100.0
        self.diver_t = 3.5
        self.bomber_t = 9.0
        self.dist_acc = 0.0
        self.finish_spawned = False
        self.score_start = self.stats.score
        self.coins = 0
        self.dodges = 0
        self.t = 0.0
        self.play_t = 0.0
        self.stats.health = PLAYER_MAX_HEALTH     # Araba tam dayanıklılıkla başlar
        self.audio.play_music("music_action")

    def start_play(self):
        super().start_play()
        self.show_banner("KAÇ!", 1.5, (255, 120, 90))
        self.audio.play("honk")
        self.audio.play("vroom")

    # ================================================================ girdiler
    def handle_play_event(self, event):
        if event.type == pygame.KEYDOWN:
            if event.key in (pygame.K_SPACE,):
                if self.car.jump():
                    self.audio.play("jump")
                    self.effects.dust(self.car.x - 60, CAR_GROUND, 6)
            elif event.key in (pygame.K_w, pygame.K_UP):
                self.audio.play("vroom", 0.7)

    def progress(self):
        return min(1.0, self.cam / self.length)

    # ================================================================ hasar
    def hurt(self, amount, text):
        car = self.car
        if car.invuln_t > 0:
            return False
        self.stats.health = max(0, self.stats.health - amount)
        car.damage()
        self.shake = 10
        self.audio.play("hurt")
        self.effects.text(text, car.x, CAR_GROUND - 150, (255, 120, 120), 34, 0.9)
        self.effects.feathers(car.x, CAR_GROUND - 80, (255, 255, 255), 4)
        if self.stats.health <= 0:
            self.fail("Araba kuşlara yenildi!")
        return True

    def add_points(self, pts, text, x, y, color=(255, 240, 120)):
        self.stats.score += pts
        self.effects.text("%s +%d" % (text, pts), x, y, color, 30, 1.0)
        self.audio.play("point")

    # ================================================================ üretim
    def _spawn_objects(self):
        p = self.progress()
        while self.next_obj_x < self.cam + WIDTH + 200 and self.next_obj_x < self.length - 400:
            wx = self.next_obj_x
            kinds = ["rock", "bigrock", "egg", "puddle", "birdblock", "coin", "wrench"]
            weights = [30, 8 + 16 * p, 14, 12, 12 + 12 * p, 20, 6]
            kind = self.rng.choices(kinds, weights)[0]
            if kind == "coin":   # Yıldız sırası (bazen havada: zıplayarak toplanır)
                air = self.rng.choice((0, 0, 110))
                for i in range(self.rng.randint(3, 5)):
                    self.objects.append(RoadObject("coin", wx + i * 55, CAR_GROUND, air))
            else:
                self.objects.append(RoadObject(kind, wx, CAR_GROUND))
                if kind in ("rock", "bigrock") and self.rng.random() < 0.45:
                    for i in range(3):   # Engelin üstünde ödül yayı
                        self.objects.append(RoadObject("coin", wx - 55 + i * 55, CAR_GROUND, 120 + (i == 1) * 30))
            gap = self.rng.uniform(430, 720) * (1 - 0.35 * p) * (CAR_CRUISE_SPEED / 340)
            self.next_obj_x += max(320, gap)
        if not self.finish_spawned and self.cam + WIDTH + 200 > self.length:
            self.finish_spawned = True
            self.objects.append(RoadObject("finish", self.length, CAR_GROUND))

    def _spawn_air(self, dt):
        p = self.progress()
        if p > 0.96:
            return
        self.diver_t -= dt
        if self.diver_t <= 0:
            self.diver_t = max(1.1, 3.3 - 2.2 * p) * self.rng.uniform(0.8, 1.2)
            tx = max(160, min(WIDTH - 200, self.car.x + self.rng.uniform(-60, 180)))
            kind = self.rng.choice(("blue", "yellow", "red", "red"))
            self.divers.append(Diver(tx, CAR_GROUND - 70, kind, 520 + 320 * p))
            self.audio.play("angry", 0.6)
        if self.play_t > 8:
            self.bomber_t -= dt
            if self.bomber_t <= 0:
                self.bomber_t = max(3.0, 8.0 - 4.5 * p) * self.rng.uniform(0.8, 1.2)
                self.bombers.append(Bomber(self.rng.uniform(110, 190), self.rng.choice(("yellow", "red")),
                                           260 + 140 * p))

    def _spawn_air_egg(self, x, y):
        self.air_eggs.append(AirEgg(x, y))

    # ================================================================ döngü
    def update_world(self, dt, active):
        self.t += dt
        car = self.car
        keys = pygame.key.get_pressed()
        if self.phase == "intro":
            car.speed = 0.0
            self.clouds.update(dt)
            self.audio.set_engine(0, 0.5)
            return
        if self.phase == "complete":
            car.speed = CAR_CRUISE_SPEED
            car.x += 260 * dt
            car.update(dt, keys, enabled=False)
            self.cam += car.speed * dt
            self.clouds.update(dt, car.speed)
            for d in self.divers + self.bombers:
                d.alive = False
            return

        self.play_t += dt
        if car.update(dt, keys, enabled=True) == "land":
            self.effects.dust(car.x - 60, CAR_GROUND, 6)
            self.effects.dust(car.x + 60, CAR_GROUND, 6)
            self.audio.play("thud", 0.6)
        self.cam += car.speed * dt
        self.clouds.update(dt, car.speed)
        ratio = (car.speed - 160) / (CAR_MAX_SPEED - 160)
        self.audio.set_engine(0 if ratio < 0.3 else 1 if ratio < 0.7 else 2, 0.6 + 0.4 * ratio)

        # Mesafe puanı (hızlı gidince daha çok puan)
        self.dist_acc += car.speed * dt / 12 * (1 + ratio)
        if self.dist_acc >= 1:
            self.stats.score += int(self.dist_acc)
            self.dist_acc -= int(self.dist_acc)

        # Egzoz dumanı
        if self.rng.random() < 0.4:
            self.effects.add(car.x - 118, car.y - 30, -car.speed * 0.3 - 40, -20, (210, 210, 220),
                             size=7, life=0.5, kind="smoke")

        self._spawn_objects()
        self._spawn_air(dt)
        self._update_objects(dt)
        self._update_air(dt)
        self._update_swarm(dt)

        if self.cam + car.x >= self.length:
            self.finish()

    def _update_objects(self, dt):
        car = self.car
        low = car.low_rect()
        body = car.body_rect()
        for o in self.objects:
            o.update(dt, self.cam, car.x, self.effects, self.audio)
            if o.hit or o.kind == "finish":
                continue
            r = o.rect(self.cam)
            k = o.kind
            if k in ("coin", "wrench"):
                if body.colliderect(r):
                    o.hit, o.alive = True, False
                    if k == "coin":
                        self.coins += 1
                        self.add_points(50, "Yıldız", r.centerx, r.y - 10)
                        self.audio.play("pickup")
                        self.effects.stars(r.centerx, r.centery, 5)
                    else:
                        self.stats.health = min(PLAYER_MAX_HEALTH, self.stats.health + 25)
                        self.effects.text("Tamir +25", r.centerx, r.y - 20, (140, 255, 160), 34)
                        self.audio.play("pickup")
                continue
            if low.colliderect(r):
                o.hit = True
                sx = r.centerx
                if k == "rock":
                    self.hurt(12, "Taş!")
                    self.effects.dust(sx, CAR_GROUND, 10, (170, 170, 180))
                    self.audio.play("thud")
                    o.alive = False
                elif k == "bigrock":
                    self.hurt(18, "Koca taş!")
                    self.effects.dust(sx, CAR_GROUND, 14, (170, 170, 180))
                    self.audio.play("hit")
                    o.alive = False
                elif k == "egg":
                    self.audio.play("egg_crack")
                    self.effects.yolk(sx, CAR_GROUND - 15, CAR_GROUND)
                    self.splats.add(life=2.0)
                    car.splat_t = 2.5
                    car.slow_t = max(car.slow_t, 1.0)
                    if car.invuln_t <= 0:
                        self.hurt(4, "Yumurta!")
                    o.alive = False
                elif k == "puddle":
                    car.slow_t = max(car.slow_t, 1.6)
                    car.speed *= 0.8
                    self.effects.text("Kaygan!", sx, CAR_GROUND - 120, (255, 230, 120), 30, 0.8)
                elif k == "birdblock":
                    self.hurt(10, "Kuş barikatı!")
                    for b in o.birds:
                        if not b["fly"]:
                            b["fly"] = True
                            b["vy"] = -450
                            b["stay"] = False
                    self.effects.feathers(sx, CAR_GROUND - 30, (255, 255, 255), 10)
                    self.audio.play("flap")
            elif r.right < car.x - 110 and k in ("rock", "bigrock", "egg", "birdblock") \
                    and not getattr(o, "passed", False):
                o.passed = True
                if k != "birdblock" or any(b["stay"] and not b["fly"] for b in o.birds):
                    self.dodges += 1
                    self.stats.score += 10
                    if not car.on_ground:
                        self.effects.text("Süper zıplama! +10", car.x, CAR_GROUND - 170, (160, 230, 255), 28, 0.9)
        self.objects = [o for o in self.objects if o.alive]

    def _update_air(self, dt):
        car = self.car
        body = car.body_rect()
        for d in self.divers:
            d.update(dt, car)
            if d.t < d.WARN or d.hit:
                continue
            if not d.veered and body.colliderect(d.rect()):
                d.hit = True
                d.alive = False
                self.hurt(10, "Dalış saldırısı!")
                self.effects.feathers(d.x, d.y, (255, 255, 255), 6)
            elif d.veered and not d.passed and abs(d.x - car.x) < 200:
                d.passed = True
                self.add_points(25, "Kıl payı!", car.x, CAR_GROUND - 190, (255, 180, 220))
            elif not d.veered and not d.passed and d.y > d.ty + 20:
                d.passed = True
                self.dodges += 1
                self.add_points(15, "Atlattın!", d.x, d.y - 40, (180, 255, 180))
        self.divers = [d for d in self.divers if d.alive]

        for b in self.bombers:
            b.update(dt, car, self._spawn_air_egg)
        self.bombers = [b for b in self.bombers if b.alive]

        for e in self.air_eggs:
            e.update(dt)
            if body.colliderect(e.rect()):
                e.alive = False
                self.audio.play("egg_crack")
                self.effects.yolk(e.x, e.y, CAR_GROUND)
                self.splats.add()
                car.splat_t = 3.0
                self.effects.text("Görüş kapandı!", car.x, CAR_GROUND - 170, (255, 230, 120), 28, 1.0)
                if car.invuln_t <= 0:
                    self.hurt(3, "Yumurta!")
            elif e.y >= CAR_GROUND - 6:
                e.alive = False
                self.audio.play("egg_crack", 0.6)
                self.effects.yolk(e.x, CAR_GROUND - 6, CAR_GROUND)
                self.objects.append(RoadObject("puddle", self.cam + e.x, CAR_GROUND))
        self.air_eggs = [e for e in self.air_eggs if e.alive]

    def _update_swarm(self, dt):
        if self.play_t < 2.5:
            return
        car = self.car
        self.swarm.update(dt, car.speed, CAR_CRUISE_SPEED, CAR_MAX_SPEED, self.progress())
        if self.swarm.front() > car.x - 110:
            if self.hurt(6, "Gagalıyorlar!"):
                self.swarm.x -= 220     # Sürü bir an geri savrulur
                self.audio.play("angry")

    def finish(self):
        bonus = self.stats.health * 5
        self.stats.score += bonus + 500
        self.complete(["BİTİŞ ÇİZGİSİ! +500",
                       "Dayanıklılık bonusu: +%d" % bonus,
                       "Toplanan yıldız: %d   Atlatılan engel: %d" % (self.coins, self.dodges)])
        self.audio.play("honk")

    # ================================================================ çizim
    def _tile(self, surf, layer, factor, y=0):
        w = layer.get_width()
        off = -int(self.cam * factor) % w
        surf.blit(layer, (off - w, y))
        surf.blit(layer, (off, y))

    def draw_world(self, surf):
        surf.blit(self.sky, (0, 0))
        art.draw_sun(surf, 1120, 110, self.t)
        self.clouds.draw(surf)
        self._tile(surf, self.hills, 0.15)
        self._tile(surf, self.trees, 0.45)
        self._tile(surf, self.road, 1.0, ROAD_Y - 40)

        car = self.car
        if car.speed > 480:   # Hız çizgileri
            k = (car.speed - 480) / (CAR_MAX_SPEED - 480)
            for i in range(int(6 * k) + 1):
                y = (i * 97 + int(self.t * 900)) % 420 + 120
                x = (i * 263 - int(self.t * 2600)) % WIDTH
                pygame.draw.line(surf, (255, 255, 255), (x, y), (x + 80, y), 2)

        for o in self.objects:
            o.draw(surf, self.cam)
        for e in self.air_eggs:
            e.draw(surf)
        # Arabanın gölgesi (zıplarken küçülür)
        h = CAR_GROUND - car.y
        sw = max(60, 210 - h * 0.4)
        shadow = pygame.Surface((int(sw), 14), pygame.SRCALPHA)
        pygame.draw.ellipse(shadow, (0, 0, 0, 70), shadow.get_rect())
        surf.blit(shadow, (car.x - sw / 2, CAR_GROUND - 6))
        car.draw(surf)
        self.swarm.draw(surf)
        for d in self.divers:
            d.draw(surf)
        for b in self.bombers:
            b.draw(surf)
        self.effects.draw(surf)

        if self.phase == "play" and self.swarm.front() > car.x - 330 and int(self.t * 4) % 2 == 0:
            blit_center(surf, cached_text("Sürü yaklaşıyor! HIZLAN (W)!", 34, (255, 120, 120)),
                        (WIDTH / 2, 130))
        if self.phase == "play" and self.play_t < 6:
            blit_center(surf, cached_text("W: hızlan  •  S: yavaşla  •  A/D: ileri-geri  •  BOŞLUK: zıpla",
                                          28, WHITE), (WIDTH / 2, HEIGHT - 26))

    def draw_hud(self, surf):
        self.hud.draw(surf, self.level_no, self.cfg["name"], speed=int(self.car.speed * 0.25),
                      health=self.stats.health, health_label="Dayanıklılık", progress=self.progress())

    def on_exit(self):
        self.audio.set_engine(None)
