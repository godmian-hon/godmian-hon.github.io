@echo off
title GodMian Mod and Video Updater
setlocal
set "PY_EXE=C:\Program Files (x86)\Steam\steamapps\common\Blender\5.3\python\bin\python.exe"
if exist "%PY_EXE%" goto :run
set "PY_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if exist "%PY_EXE%" goto :run
echo [ERROR] Python runtime not found.
pause
exit /b 1
:run
chcp 65001 >nul
"%PY_EXE%" "%~dp0scripts\update-mod.py" %*
if "%~1"=="" pause
