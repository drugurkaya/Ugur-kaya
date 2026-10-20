"""Oyun boyunca taşınan istatistikler (puan, kaçan kuş, can...)."""

from .settings import PLAYER_MAX_HEALTH


class GameStats:
    def __init__(self):
        self.reset()

    def reset(self):
        """Yeniden başlatmada bütün değerler sıfırlanır."""
        self.score = 0
        self.birds_scared = 0
        self.levels_completed = 0
        self.health = PLAYER_MAX_HEALTH
        self.level = 1
        self.best_combo = 0
        self._checkpoint = None

    def checkpoint(self):
        """Bölüm başındaki değerleri saklar ('Bölümü tekrar dene' için)."""
        self._checkpoint = (self.score, self.birds_scared, self.levels_completed, self.level)

    def restore_checkpoint(self):
        if self._checkpoint:
            self.score, self.birds_scared, self.levels_completed, self.level = self._checkpoint
        self.health = PLAYER_MAX_HEALTH
