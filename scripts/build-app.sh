#!/bin/zsh
# Builds frontend, backend and host, then assembles "build/Personal Raycast.app".
set -euo pipefail

ROOT="${0:A:h:h}"
APP="$ROOT/build/Personal Raycast.app"
CONFIG="${CONFIG:-release}"

echo "→ frontend"
(cd "$ROOT/frontend" && bun install --frozen-lockfile >/dev/null && bun run build >/dev/null)

echo "→ backend"
(cd "$ROOT/backend" && bun install --frozen-lockfile >/dev/null && bun run build >/dev/null)

echo "→ host ($CONFIG)"
(cd "$ROOT/host" && swift build -c "$CONFIG" 2>&1 | grep -vE "ld: warning: search path" || true)
BIN="$(cd "$ROOT/host" && swift build -c "$CONFIG" --show-bin-path)/PersonalRaycast"

echo "→ bundle"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN" "$APP/Contents/MacOS/PersonalRaycast"
cp -R "$ROOT/frontend/dist" "$APP/Contents/Resources/frontend"
cp "$ROOT/backend/dist/prc-backend" "$APP/Contents/Resources/prc-backend"

cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>com.arjun.personal-raycast</string>
  <key>CFBundleName</key><string>Personal Raycast</string>
  <key>CFBundleDisplayName</key><string>Personal Raycast</string>
  <key>CFBundleExecutable</key><string>PersonalRaycast</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>14.0</string>
  <key>LSUIElement</key><true/>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST

# Signs with the certificate from setup-signing.sh, so macOS keeps the Accessibility grant across
# rebuilds. Without it, falls back to an ad-hoc signature, which macOS treats as a new app every build.
IDENTITY="Personal Raycast Local Signing"
if ! security find-certificate -c "$IDENTITY" >/dev/null 2>&1; then
  echo "! no \"$IDENTITY\" certificate; signing ad hoc (run scripts/setup-signing.sh)"
  IDENTITY="-"
fi
codesign --force --sign "$IDENTITY" "$APP/Contents/Resources/prc-backend"
codesign --force --sign "$IDENTITY" "$APP"
echo "✓ $APP"
