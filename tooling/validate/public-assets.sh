#!/usr/bin/env sh
# Ensure required public/ assets exist. Run before build or in CI.
# See public/README.md for the full inventory.
set -e

cd "$(dirname "$0")/../.."
PUBLIC="public"

REQUIRED="config.js theme-init.js locale-init.js app-icon.svg manifest.webmanifest _headers offline.html robots.txt pwa-192x192.png pwa-512x512.png"
MISSING=""
for f in $REQUIRED; do
  if [ ! -f "$PUBLIC/$f" ]; then
    MISSING="$MISSING $f"
  fi
done

if [ -n "$MISSING" ]; then
  echo "[validate-public-assets] ERROR: Missing required files in $PUBLIC/:$MISSING"
  echo "See public/README.md for the list of required assets."
  echo "Generate PWA PNGs from app-icon.svg: sips -s format png public/app-icon.svg --out public/pwa-192x192.png -z 192 192"
  exit 1
fi

echo "[validate-public-assets] OK: All required public assets present."
