#!/usr/bin/env bash
# Local sysroot for headless Chromium when the system libs are missing and we
# have no root (Debian/Ubuntu). Downloads the .deb closure with apt and unpacks
# it under $CACHE/sysroot instead of installing system-wide.
set -euo pipefail

CACHE="${1:?usage: provision-sysroot.sh <cache-dir>}"
SYSROOT="$CACHE/sysroot"
APT_DIR="$CACHE/apt"
DEBS="$CACHE/debs"

TARGETS=(
  libnss3 libnspr4
  libatk1.0-0 libatk1.0-0t64 libatk-bridge2.0-0 libatk-bridge2.0-0t64
  libcups2 libcups2t64 libdrm2 libxkbcommon0
  libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1
  libpango-1.0-0 libcairo2 libasound2 libasound2t64
  libatspi2.0-0 libatspi2.0-0t64
  libx11-6 libxcb1 libxext6 libglib2.0-0 libglib2.0-0t64 libdbus-1-3
  libx11-xcb1 libxcb-glx0 libxcb-dri3-0 libxcb-present0 libxcb-sync1 libxcb-xfixes0
  libxshmfence1 libwayland-client0 libwayland-server0 libegl1
  libxrender1 libxi6 libxtst6 libfontconfig1 libfreetype6
  fontconfig-config fonts-dejavu-core fonts-dejavu-mono fonts-noto-core fonts-noto-mono
)

mkdir -p "$APT_DIR/lists/partial" "$APT_DIR/cache/archives/partial" "$DEBS" "$SYSROOT"
APT_OPTS=(-o "Dir::State::Lists=$APT_DIR/lists" -o "Dir::Cache=$APT_DIR/cache")

echo "[visual-shot] fetching apt metadata..."
apt-get "${APT_OPTS[@]}" update >/dev/null 2>&1

resolvable=()
for p in "${TARGETS[@]}"; do
  cand="$(apt-cache "${APT_OPTS[@]}" policy "$p" 2>/dev/null | awk -F': ' '/Candidate:/{print $2; exit}')"
  if [ -n "${cand:-}" ] && [ "$cand" != "(none)" ]; then resolvable+=("$p"); fi
done

apt-cache "${APT_OPTS[@]}" depends --recurse --no-recommends --no-suggests \
  --no-conflicts --no-breaks --no-replaces --no-enhances "${resolvable[@]}" 2>/dev/null \
  | awk '/^[[:space:]]*(Depends|PreDepends):/{print $2}' \
  | sed 's/:amd64$//' > "$CACHE/deps.txt"
printf '%s\n' "${resolvable[@]}" >> "$CACHE/deps.txt"
sort -u "$CACHE/deps.txt" -o "$CACHE/deps.txt"

: > "$CACHE/need.txt"
while read -r p; do
  [ -z "$p" ] && continue
  case "$p" in '<'*) continue ;; esac
  inst="$(apt-cache "${APT_OPTS[@]}" policy "$p" 2>/dev/null | awk -F': ' '/Installed:/{print $2; exit}')"
  if [ "$inst" = "(none)" ] || [ -z "${inst:-}" ]; then
    cand="$(apt-cache "${APT_OPTS[@]}" policy "$p" 2>/dev/null | awk -F': ' '/Candidate:/{print $2; exit}')"
    if [ -n "${cand:-}" ] && [ "$cand" != "(none)" ]; then echo "$p" >> "$CACHE/need.txt"; fi
  fi
done < "$CACHE/deps.txt"

echo "[visual-shot] downloading $(wc -l < "$CACHE/need.txt") packages..."
( cd "$DEBS" && xargs -a "$CACHE/need.txt" apt-get "${APT_OPTS[@]}" download >/dev/null 2>&1 )

echo "[visual-shot] extracting sysroot..."
for d in "$DEBS"/*.deb; do dpkg-deb -x "$d" "$SYSROOT"; done

mkdir -p "$CACHE/fontcache"
cat > "$CACHE/fonts.conf" <<EOF
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
  <dir>$SYSROOT/usr/share/fonts</dir>
  <cachedir>$CACHE/fontcache</cachedir>
  <include ignore_missing="yes">$SYSROOT/etc/fonts/fonts.conf</include>
</fontconfig>
EOF

echo "[visual-shot] sysroot ready at $SYSROOT"
