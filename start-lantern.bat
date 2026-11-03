@echo off
REM Lantern — double-click this file to start the library server.
REM It needs one free program, Node.js, from https://nodejs.org (the green LTS button).
title Lantern
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is not installed yet. That is the one program Lantern needs.
  echo.
  echo     1. Open   https://nodejs.org
  echo     2. Click the big green button that says  LTS
  echo     3. Next, Next, Finish. Then double-click this file again.
  echo.
  pause
  exit /b 1
)

if exist "%~dp0lantern.js" (
  echo Starting Lantern from lantern.js ...
  node "%~dp0lantern.js" 8080
) else (
  echo Starting Lantern from server.js ...
  node "%~dp0server.js" 8080
)

echo.
echo   Lantern has stopped. You can close this window.
pause
