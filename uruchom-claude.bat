@echo off
rem Uruchamia Claude Code w katalogu projektu (tam, gdzie lezy ten plik).
rem Dodatkowe argumenty sa przekazywane dalej, np.: claude.bat --continue
chcp 65001 >nul
cd /d "%~dp0"

where claude >nul 2>nul
if errorlevel 1 (
    if exist "%USERPROFILE%\.local\bin\claude.exe" (
        set "PATH=%USERPROFILE%\.local\bin;%PATH%"
    ) else (
        echo Nie znaleziono polecenia "claude". Zainstaluj Claude Code lub dodaj go do PATH.
        pause
        exit /b 1
    )
)

claude %*
