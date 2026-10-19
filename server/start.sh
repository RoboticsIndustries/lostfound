#!/bin/sh
# Starts the Lost & Found server (macOS / Linux / Raspberry Pi).
# The first run downloads PocketBase (about 15 MB) into ./bin.
set -e
cd "$(dirname "$0")"

PB_VERSION=0.40.5
PORT="${PORT:-8090}"

if [ ! -x bin/pocketbase ]; then
  case "$(uname -s)" in
    Darwin) os=darwin ;;
    Linux) os=linux ;;
    *) echo "Unsupported system: $(uname -s). On Windows, double-click start.bat instead."; exit 1 ;;
  esac
  case "$(uname -m)" in
    x86_64 | amd64) arch=amd64 ;;
    arm64 | aarch64) arch=arm64 ;;
    armv7l) arch=armv7 ;;
    *) echo "Unsupported processor: $(uname -m)"; exit 1 ;;
  esac
  echo "Downloading PocketBase $PB_VERSION ($os/$arch)..."
  mkdir -p bin
  curl -fL --progress-bar -o bin/pb.zip \
    "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_${os}_${arch}.zip"
  unzip -oq bin/pb.zip pocketbase -d bin
  rm bin/pb.zip
fi

if [ ! -f pb_public/index.html ]; then
  echo "Warning: pb_public/ has no web app. Download the release zip, or run scripts/package.sh to build it."
fi

# The address other devices on the network use (shown to admins on the School tab).
ip="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || true)"
export LF_ADDRESS="http://${ip:-localhost}:${PORT}"

cat <<EOF

  Lost & Found is running.
    On this computer:        http://localhost:${PORT}
    Phones and other PCs:    ${LF_ADDRESS}   (same Wi-Fi / network)

  Keep this window open. Press Ctrl+C to stop.

EOF

# First run: open the setup page in the browser.
if [ ! -d pb_data ]; then
  (sleep 2; (open "http://localhost:${PORT}" || xdg-open "http://localhost:${PORT}") >/dev/null 2>&1 || true) &
fi

exec bin/pocketbase serve --http "0.0.0.0:${PORT}" \
  --dir pb_data --hooksDir pb_hooks --migrationsDir pb_migrations --publicDir pb_public
