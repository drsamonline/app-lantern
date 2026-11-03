#!/bin/sh
# Lantern — start the library server. Double-click it, or run: sh start-lantern.sh
# It needs one free program, Node.js, from https://nodejs.org (the green LTS button).
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "  Node.js is not installed yet. That is the one program Lantern needs."
  echo
  echo "    1. Open   https://nodejs.org"
  echo "    2. Click the big green button that says  LTS"
  echo "    3. Next, Next, Finish. Then run this file again."
  echo
  printf "  Press Enter to close."
  read -r _
  exit 1
fi

# Open the browser a moment after the server has printed its address.
( sleep 2; command -v xdg-open >/dev/null 2>&1 && xdg-open http://localhost:8080/ >/dev/null 2>&1 ) &

if [ -f ./lantern.js ]; then
  echo "Starting Lantern from lantern.js ..."
  node ./lantern.js 8080
else
  echo "Starting Lantern from server.js ..."
  node ./server.js 8080
fi

echo
echo "  Lantern has stopped."
printf "  Press Enter to close."
read -r _
