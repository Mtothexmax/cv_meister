#!/usr/bin/env bash
# Regenerates the Android launcher icons from src/lib/assets/favicon.svg.
#
#   src-tauri/android/make-icons.sh             # schreibt src-tauri/android/res/
#   PREVIEW=1 src-tauri/android/make-icons.sh   # zusaetzlich ein Masken-Vorschaubild
#
# Chrome muss aus einer Shell gestartet werden: Node kann in dieser Umgebung
# keinen Prozess erzeugen (spawnSync -> EBUSY), und ein mit `&` gestartetes
# Chrome stirbt, sobald der aufrufende Tool-Call zurueckkehrt. Deshalb steckt der
# Renderer in make-icons.mjs und dieses Skript liefert nur den Browser.
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
cd "$ROOT" || exit 1

PORT="${PORT:-9241}"
PROFILE="C:/Users/mtoth/AppData/Local/Temp/cvchrome-icons"
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"

if [ -z "${NODE:-}" ]; then
	# Die versionierte Binary wandert bei jedem Runtime-Update (…-3 → …-6).
	NODE="$(ls -d "C:/Users/mtoth/.workbuddy-ai/binaries/node/versions/"[0-9]*/node.exe 2>/dev/null | sort -V | tail -1)"
fi
if [ ! -x "$NODE" ]; then
	echo "Kein Node gefunden (NODE='$NODE'). Bitte NODE=/pfad/zu/node.exe setzen." >&2
	exit 1
fi
if [ ! -x "$CHROME" ]; then
	echo "Chrome nicht gefunden: $CHROME" >&2
	exit 1
fi

rm -rf "$PROFILE"
"$CHROME" --headless=new --disable-gpu --no-first-run --no-default-browser-check \
	--disable-extensions --remote-debugging-port="$PORT" --user-data-dir="$PROFILE" \
	about:blank >/dev/null 2>&1 &
CHROME_BG=$!
sleep 7
curl -s --noproxy '*' -o /dev/null -w "cdp=%{http_code}\n" "http://127.0.0.1:$PORT/json/version"

CDP_URL="http://127.0.0.1:$PORT" ROOT="$ROOT" PREVIEW="${PREVIEW:-}" "$NODE" src-tauri/android/make-icons.mjs
EXIT=$?

# Stuerzt der Node-Lauf ab, lebt Chrome weiter und ein blosses `wait` haengt.
kill "$CHROME_BG" 2>/dev/null
wait "$CHROME_BG" 2>/dev/null
rm -rf "$PROFILE"
exit "$EXIT"
