@echo off
REM Kuslarin Intikami - Windows icin tek dosyalik EXE olusturur.
REM Bu dosyaya cift tiklayin; bitince dist\KuslarinIntikami.exe hazir olur.
python -m pip install --upgrade pygame pyinstaller
python -m PyInstaller --noconfirm --onefile --windowed --name KuslarinIntikami --add-data "assets;assets" main.py
echo.
echo EXE hazir: dist\KuslarinIntikami.exe
pause
