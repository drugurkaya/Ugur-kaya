"""Kuşların İntikamı - oyunu başlatır.

Çalıştırmak için:  python main.py
"""

import os
import sys

# Kaynak klasörünü içe aktarma yoluna ekle (EXE ve farklı çalışma klasörleri için)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from game.app import Game  # noqa: E402


def main():
    Game().run()


if __name__ == "__main__":
    main()
