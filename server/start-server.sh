#!/bin/sh
# Starts the Mii Hub Paintball server (Mac / Linux): ./start-server.sh
cd "$(dirname "$0")"
[ -d node_modules ] || npm install --omit=dev
exec node paintball-server.js
