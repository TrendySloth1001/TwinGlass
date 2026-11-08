#!/usr/bin/env bash
# Twinglass installer for macOS (Apple Silicon).
#
#   curl -fsSL https://raw.githubusercontent.com/TrendySloth1001/TwinGlass/master/install.sh | bash
#
# Downloads the latest release DMG, installs Twinglass.app into /Applications, and offers adb for
# Developer mode. Files fetched with curl carry no quarantine flag, so macOS opens the (ad-hoc
# signed) app without the "can't be opened" prompt. Options:
#   --uninstall          remove Twinglass.app (settings are kept; add --purge to remove them too)
#   --no-adb             don't offer to install adb
#   --open               open Twinglass when done
# Environment (for testing / mirrors):
#   TWINGLASS_REPO       owner/name on GitHub (default below)
#   TWINGLASS_DMG_URL    use this DMG instead of the latest release (http(s):// or file://)
#   TWINGLASS_APP_DIR    install here instead of /Applications
set -euo pipefail

REPO="${TWINGLASS_REPO:-TrendySloth1001/TwinGlass}"
APP_DIR="${TWINGLASS_APP_DIR:-/Applications}"
APP="$APP_DIR/Twinglass.app"

bold=$'\033[1m'; dim=$'\033[2m'; red=$'\033[31m'; reset=$'\033[0m'
[ -t 1 ] || { bold=; dim=; red=; reset=; }
say() { printf '%s\n' "$*"; }
step() { printf '%s→%s %s\n' "$bold" "$reset" "$*"; }
fail() { printf '%s✗ %s%s\n' "$red" "$*" "$reset" >&2; exit 1; }

# Questions go to the terminal even when the script itself comes through a pipe (curl | bash).
ask() {
  local answer=""
  # No terminal (CI, a GUI wrapper): no questions, default to "no".
  { exec 3</dev/tty; } 2>/dev/null || return 1
  read -r -p "$1 [Y/n] " answer <&3 || true
  exec 3<&-
  [[ -z "$answer" || "$answer" =~ ^[Yy] ]]
}

UNINSTALL=0; PURGE=0; OFFER_ADB=1; OPEN=0
for arg in "$@"; do
  case "$arg" in
    --uninstall) UNINSTALL=1 ;;
    --purge) PURGE=1 ;;
    --no-adb) OFFER_ADB=0 ;;
    --open) OPEN=1 ;;
    -h|--help) sed -n '2,17p' "$0" 2>/dev/null || true; exit 0 ;;
    *) fail "Unknown option: $arg" ;;
  esac
done

# Quits only the copy being replaced (a Twinglass running from elsewhere is left alone).
quit_running() {
  local exe="$APP/Contents/MacOS/Twinglass"
  if pgrep -qf "^$exe" ; then
    step "Quitting the running Twinglass"
    osascript -e "tell application \"$APP\" to quit" >/dev/null 2>&1 || true
    for _ in 1 2 3 4 5 6 7 8 9 10; do pgrep -qf "^$exe" || break; sleep 0.5; done
    pkill -f "^$exe" 2>/dev/null || true
  fi
}

if [ "$UNINSTALL" = 1 ]; then
  quit_running
  if [ -d "$APP" ]; then step "Removing $APP"; rm -rf "$APP"; else say "Twinglass isn't installed in $APP_DIR."; fi
  if [ "$PURGE" = 1 ]; then
    step "Removing settings and caches"
    rm -rf "$HOME/Library/Application Support/Twinglass" "$HOME/Library/Preferences/app.twinglass.mac.plist" "$HOME/Library/Caches/app.twinglass.mac"
  fi
  say "${bold}Done.${reset} Screenshots and recordings in ~/Pictures/Twinglass and ~/Movies/Twinglass were left alone."
  exit 0
fi

[ "$(uname -s)" = Darwin ] || fail "Twinglass is a macOS app."
[ "$(uname -m)" = arm64 ] || fail "This build is for Apple Silicon Macs (M1 or newer)."
major="$(sw_vers -productVersion | cut -d. -f1)"
[ "$major" -ge 13 ] || fail "Twinglass needs macOS 13 or newer (this Mac has $(sw_vers -productVersion))."

tmp="$(mktemp -d -t twinglass)"
mnt=""
cleanup() { [ -n "$mnt" ] && hdiutil detach "$mnt" -quiet >/dev/null 2>&1 || true; rm -rf "$tmp"; }
trap cleanup EXIT

# 1. Find the DMG: the latest GitHub release's arm64 .dmg (and its .sha256 if published).
url="${TWINGLASS_DMG_URL:-}"
sha_url=""
if [ -z "$url" ]; then
  step "Looking up the latest release of $REPO"
  api="https://api.github.com/repos/$REPO/releases/latest"
  json="$(curl -fsSL -H 'Accept: application/vnd.github+json' "$api")" || fail "Couldn't reach GitHub ($api)."
  url="$(printf '%s' "$json" | grep -o '"browser_download_url": *"[^"]*arm64\.dmg"' | head -1 | sed 's/.*"\(http[^"]*\)"/\1/')"
  sha_url="$(printf '%s' "$json" | grep -o '"browser_download_url": *"[^"]*arm64\.dmg\.sha256"' | head -1 | sed 's/.*"\(http[^"]*\)"/\1/')"
  tag="$(printf '%s' "$json" | grep -o '"tag_name": *"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')"
  [ -n "$url" ] || fail "The latest release has no Apple Silicon DMG."
  say "  ${dim}${tag:-latest}: ${url##*/}${reset}"
fi

# 2. Download (curl sets no quarantine flag) and check the checksum when one is published.
step "Downloading Twinglass"
dmg="$tmp/Twinglass.dmg"
curl -fL --progress-bar -o "$dmg" "$url" || fail "Download failed: $url"
if [ -n "$sha_url" ]; then
  expected="$(curl -fsSL "$sha_url" | awk '{print $1}')"
  actual="$(shasum -a 256 "$dmg" | awk '{print $1}')"
  [ "$expected" = "$actual" ] || fail "Checksum mismatch: the download is damaged or was tampered with."
  say "  ${dim}SHA-256 verified${reset}"
fi

# 3. Mount, copy the app, unmount.
step "Installing into $APP_DIR"
mnt="$tmp/mnt"
mkdir -p "$mnt"
hdiutil attach "$dmg" -nobrowse -readonly -noautoopen -mountpoint "$mnt" -quiet || fail "Couldn't open the DMG."
src="$(find "$mnt" -maxdepth 1 -name 'Twinglass.app' -print -quit)"
[ -n "$src" ] || fail "Twinglass.app isn't in the DMG."
quit_running
mkdir -p "$APP_DIR"
if [ -w "$APP_DIR" ]; then
  rm -rf "$APP"; ditto "$src" "$APP"
else
  say "  ${dim}$APP_DIR needs your password${reset}"
  sudo rm -rf "$APP"; sudo ditto "$src" "$APP"
fi
# Belt and braces: nothing quarantined (e.g. if the DMG came through a browser download).
xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true
version="$(defaults read "$APP/Contents/Info" CFBundleShortVersionString 2>/dev/null || echo '?')"
say "  ${dim}Twinglass $version${reset}"

# 4. adb is only needed for Developer mode (Wi-Fi, no setup works without it).
if [ "$OFFER_ADB" = 1 ] && ! command -v adb >/dev/null 2>&1; then
  say ""
  say "Developer mode (second screens, coding agents, app testing, lowest latency) uses adb."
  say "${dim}Wi-Fi, no setup works without it. Twinglass never bundles adb; it uses yours.${reset}"
  if command -v brew >/dev/null 2>&1; then
    if ask "Install adb with Homebrew now?"; then brew install --quiet android-platform-tools; fi
  else
    say "Install it later with:  brew install android-platform-tools   (https://brew.sh)"
  fi
fi

say ""
say "${bold}Twinglass is installed.${reset}"
say "Open it, then click ${bold}Add phone${reset}: scan the QR with your phone to get the Twinglass phone app and pair."
say "${dim}Uninstall any time:  curl -fsSL https://raw.githubusercontent.com/$REPO/master/install.sh | bash -s -- --uninstall${reset}"
if [ "$OPEN" = 1 ] || ask "Open Twinglass now?"; then open "$APP"; fi
