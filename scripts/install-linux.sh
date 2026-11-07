#!/usr/bin/env bash
set -euo pipefail

# Installs a per-user desktop entry and CLI launcher for LumaCut.
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="${HOME}/.local/share/applications"
ICON_DIR="${HOME}/.local/share/icons/hicolor/512x512/apps"
BIN_DIR="${HOME}/.local/bin"

mkdir -p "$APP_DIR" "$ICON_DIR" "$BIN_DIR"

if [ ! -f "$PROJECT_DIR/node_modules/.bin/electron" ]; then
  echo "Dependencies are not installed yet. Run: npm install" >&2
  exit 1
fi

if [ ! -f "$PROJECT_DIR/dist/index.html" ]; then
  echo "Building the production editor…"
  (cd "$PROJECT_DIR" && npm run build)
fi

cp "$PROJECT_DIR/public/icon.png" "$ICON_DIR/lumacut.png"

cat > "${APP_DIR}/lumacut.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=LumaCut
GenericName=Video Editor
Comment=Local-first video editor for Linux
Exec=bash -lc 'cd "$PROJECT_DIR" && exec npm run desktop:start'
Icon=lumacut
Terminal=false
Categories=AudioVideo;Video;Editor;
StartupWMClass=LumaCut
DESKTOP
chmod +x "${APP_DIR}/lumacut.desktop"

cat > "${BIN_DIR}/lumacut" <<LAUNCHER
#!/usr/bin/env bash
cd "$PROJECT_DIR" && exec npm run desktop:start "\$@"
LAUNCHER
chmod +x "${BIN_DIR}/lumacut"

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$APP_DIR" >/dev/null 2>&1 || true
fi

echo "LumaCut installed."
echo "  App menu:  search for LumaCut"
echo "  Terminal:  lumacut"
echo "  Project:   $PROJECT_DIR"
