#!/usr/bin/env bash
set -euo pipefail

# Installs a per-user desktop entry and CLI launcher for Aava Cut.
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

cp "$PROJECT_DIR/public/icon.png" "$ICON_DIR/aava-cut.png"

cat > "${APP_DIR}/aava-cut.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Aava Cut
GenericName=Video Editor
Comment=Local-first video editor for Linux
Exec=bash -lc 'cd "$PROJECT_DIR" && exec npm run desktop:start'
Icon=aava-cut
Terminal=false
Categories=AudioVideo;Video;Editor;
StartupWMClass=aava-cut
DESKTOP
chmod +x "${APP_DIR}/aava-cut.desktop"

cat > "${BIN_DIR}/aava-cut" <<LAUNCHER
#!/usr/bin/env bash
cd "$PROJECT_DIR" && exec npm run desktop:start "\$@"
LAUNCHER
chmod +x "${BIN_DIR}/aava-cut"

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$APP_DIR" >/dev/null 2>&1 || true
fi

echo "Aava Cut installed."
echo "  App menu:  search for Aava Cut"
echo "  Terminal:  aava-cut"
echo "  Project:   $PROJECT_DIR"
