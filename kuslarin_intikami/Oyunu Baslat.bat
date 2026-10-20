@echo off
REM Kuslarin Intikami - cift tiklayinca gerekli kutuphaneyi kurar ve oyunu acar.
cd /d "%~dp0"
python -c "import pygame" >NUL 2>&1
if errorlevel 1 (
  echo Pygame kuruluyor, lutfen bekleyin...
  python -m pip install pygame || python -m pip install pygame-ce
)
python main.py
if errorlevel 1 pause
