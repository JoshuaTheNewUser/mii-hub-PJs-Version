@echo off
rem Starts the Mii Hub Paintball server (double-click this file).
rem The first time, it installs what the server needs.
cd /d "%~dp0"
if not exist node_modules (
  echo Installing the server's parts (only needed once)...
  call npm install --omit=dev
)
echo.
echo Starting the Paintball server. Leave this window open while people play.
echo Close it (or press Ctrl+C) to stop the server.
echo.
node paintball-server.js
pause
