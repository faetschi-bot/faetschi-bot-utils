#!/usr/bin/env bash
# One-time (idempotent) setup: a pinned Playwright, a Chromium build and any
# missing shared libraries, all under a persistent cache so it survives worktree
# recreation. No root required on Debian/Ubuntu.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CACHE="${VISUAL_SHOT_CACHE:-${BRUTAL_VISUAL_CACHE:-${XDG_DATA_HOME:-$HOME/.local/share}/visual-shot}}"
BROWSERS="$CACHE/browsers"
SYSROOT="$CACHE/sysroot"
PW_VERSION="${VISUAL_SHOT_PLAYWRIGHT_VERSION:-${BRUTAL_PLAYWRIGHT_VERSION:-1.49.1}}"

mkdir -p "$BROWSERS" "$SYSROOT" "$CACHE/pw"
export PLAYWRIGHT_BROWSERS_PATH="$BROWSERS"
export VISUAL_SHOT_CACHE="$CACHE"
echo "[visual-shot] cache: $CACHE"

PW_PKG="$CACHE/pw/node_modules/playwright"
PW_CLI="$PW_PKG/cli.js"
if [ ! -f "$PW_CLI" ]; then
  echo "[visual-shot] installing playwright@$PW_VERSION into the cache..."
  npm install --prefix "$CACHE/pw" --no-save --no-package-lock --no-audit --no-fund \
    "playwright@$PW_VERSION" >/dev/null
fi

shell_bin="$(find "$BROWSERS" -type f -name headless_shell 2>/dev/null | head -1 || true)"
if [ -z "$shell_bin" ]; then
  echo "[visual-shot] downloading Chromium..."
  node "$PW_CLI" install chromium
  shell_bin="$(find "$BROWSERS" -type f -name headless_shell 2>/dev/null | head -1 || true)"
fi
if [ -z "$shell_bin" ]; then
  echo "[visual-shot] could not find headless_shell after install" >&2
  exit 1
fi

existing_libs="$(find "$SYSROOT" -name '*.so*' -printf '%h\n' 2>/dev/null | sort -u | paste -sd: -)"
if LD_LIBRARY_PATH="$existing_libs" ldd "$shell_bin" 2>/dev/null | grep -q 'not found'; then
  if [ -f /etc/debian_version ] && command -v apt-get >/dev/null 2>&1; then
    bash "$here/provision-sysroot.sh" "$CACHE"
  else
    echo "[visual-shot] Chromium is missing shared libraries." >&2
    echo "              Run (with root): npx playwright install-deps chromium" >&2
    exit 1
  fi
fi

libs="$(find "$SYSROOT" -name '*.so*' -printf '%h\n' 2>/dev/null | sort -u | paste -sd: -)"
fonts="$SYSROOT/usr/share/fonts"
{
  echo "export PLAYWRIGHT_BROWSERS_PATH=\"$BROWSERS\""
  if [ -n "$libs" ]; then echo "export LD_LIBRARY_PATH=\"$libs\""; fi
  if [ -d "$fonts" ]; then
    echo "export FONTCONFIG_FILE=\"$CACHE/fonts.conf\""
    echo "export FONTCONFIG_PATH=\"$SYSROOT/etc/fonts\""
  fi
} > "$CACHE/env.sh"

if [ -n "$libs" ]; then
  if LD_LIBRARY_PATH="$libs" ldd "$shell_bin" 2>/dev/null | grep -q 'not found'; then
    echo "[visual-shot] still missing libraries after provisioning:" >&2
    LD_LIBRARY_PATH="$libs" ldd "$shell_bin" 2>/dev/null | grep 'not found' >&2
    exit 1
  fi
fi

touch "$CACHE/.provisioned"
echo "[visual-shot] ready. env written to $CACHE/env.sh"
