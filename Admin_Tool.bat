@echo off
title GodMian Mod Manager (Web App)
setlocal
set "PY_EXE=C:\Program Files (x86)\Steam\steamapps\common\Blender\5.3\python\bin\python.exe"
if exist "%PY_EXE%" goto :find_script
set "PY_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if exist "%PY_EXE%" goto :find_script
echo [ERROR] Python runtime not found.
pause
exit /b 1
:find_script
set "SCRIPT=%~dp0scripts\admin-server.py"
if exist "%SCRIPT%" goto :run
set "SCRIPT=%USERPROFILE%\Desktop\GODMIAN\godmian-hon.github.io\scripts\admin-server.py"
if exist "%SCRIPT%" goto :run
echo [ERROR] admin-server.py not found.
pause
exit /b 1
:run
chcp 65001 >nul
"%PY_EXE%" "%SCRIPT%" %*
if "%~1"=="" pause
