# Homebrew cask for Twinglass. Lives in the tap repo (TrendySloth1001/homebrew-tap, Casks/).
# Install:  brew install --cask TrendySloth1001/tap/twinglass
# Updated by scripts/update-cask.mjs after each release (version + sha256).
cask "twinglass" do
  version "0.1.5"
  sha256 "720a39298350704b4da9559ee5a2902420c63658ea216b5d9ac10491fbb03488"

  url "https://github.com/TrendySloth1001/TwinGlass/releases/download/v#{version}/Twinglass-#{version}-arm64.dmg"
  name "Twinglass"
  desc "Mirror and control Android phones over USB or Wi-Fi"
  homepage "https://github.com/TrendySloth1001/TwinGlass"

  livecheck do
    url :url
    strategy :github_latest
  end

  # Twinglass updates itself (Settings → Advanced → Updates, or the notice when one is out).
  auto_updates true
  depends_on arch: :arm64
  depends_on macos: :ventura

  app "Twinglass.app"

  # Ad-hoc signed (not notarized yet): clear the download quarantine so macOS opens it.
  postflight_steps do
    run "/usr/bin/xattr", args: ["-dr", "com.apple.quarantine", "{{appdir}}/Twinglass.app"], must_succeed: false
  end

  uninstall quit: "app.twinglass.mac"

  zap trash: [
    "~/Library/Application Support/mob-mirror",
    "~/Library/Caches/app.twinglass.mac",
    "~/Library/Preferences/app.twinglass.mac.plist",
    "~/Library/Saved Application State/app.twinglass.mac.savedState",
  ]

  caveats <<~EOS
    Wi-Fi, no setup: open Twinglass → Add phone, and scan the QR with your phone.
    Developer mode (second screens, coding agents, app testing) also needs adb:
      brew install android-platform-tools
  EOS
end
