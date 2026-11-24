@echo off
chcp 65001 >nul
title GodMian Mod & Video Updater
setlocal

set "PY_EXE="
if exist "C:\Program Files (x86)\Steam\steamapps\common\Blender\5.3\python\bin\python.exe" (
    set "PY_EXE=C:\Program Files (x86)\Steam\steamapps\common\Blender\5.3\python\bin\python.exe"
) else if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" (
    set "PY_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
)

if "%PY_EXE%"=="" (
    echo [ERROR] ไม่พบ Python ในเครื่อง
    pause
    exit /b 1
)

"%PY_EXE%" "%~dp0scripts\update-mod.py" %*
if "%1"=="" (
    echo.
    pause
)
