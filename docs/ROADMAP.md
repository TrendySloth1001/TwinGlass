# Roadmap

## M0: Foundations ✅
- [x] Verified facts ([FACTS.md](FACTS.md)) and decisions ([DECISIONS.md](DECISIONS.md))
- [x] Electron 45 + electron-vite 6 + TypeScript scaffold; sandboxed renderer
- [x] scrcpy-server 5.0.1 download with SHA-256 check (`npm run fetch-server`)
- [x] Protocol layer: control encoders, stream demuxer, device-message parser, SPS codec string
- [x] Input helpers: DOM code → Android keycode, letterbox-aware coordinate mapping
- [x] adb wrapper: discovery, `devices -l` parsing, merging USB and Wi-Fi transports per phone
- [x] Session lifecycle (push, forward, launch, dummy byte, device meta, demux) verified on a real device

## M1: Video ✅ (verified on the Nothing A024 over Wi-Fi)
- [x] Per-session MessagePort pipe between main and renderer (ADR-6)
- [x] WebCodecs decoder: config + keyframe merge, reconfigure on SPS change, latency reset, `VideoFrame.close()`, error recovery
- [x] Canvas rendering with contain scaling, plus an fps / codec / hardware status line
- [x] Hardware decoding confirmed
- [ ] Resize the window to the phone's aspect ratio (nice to have)

## M2: Control (code-complete; ✅ marks items verified on the device)
- [x] Pointer → touch (mouse id -1, pointer capture, coalesced moves, drag clamping, release on blur) ✅ swipe
- [x] Wheel → scroll ✅ direction verified
- [x] Keyboard: printable ASCII → INJECT_TEXT, non-ASCII → SET_CLIPBOARD with paste, other keys → keycode + meta state
- [x] Cmd+V pastes the Mac clipboard to the phone; Cmd+C/X copy from the phone; the phone clipboard autosyncs to the Mac
- [x] Mouse shortcuts: right = Back, middle = Home, 4th = Recents, 5th = notifications
- [x] Toolbar: Back, Home, Recents, volume, power, notifications, rotate, screen off
- [ ] Verify keyboard, clipboard and toolbar on the device (needs a text field and the user present)

## M3: Connectivity (code-complete; ✅ marks items verified on the device)
- [x] Live device list via `adb track-devices -l`, auto-restarted if the adb server goes away ✅ disconnect and reconnect reflected live
- [x] Device cards show the API level; hints for unauthorized and offline transports
- [x] Add-device dialog with three tabs:
  - [x] QR pairing (`WIFI:T:ADB;S:studio-…;P:…;;`, then poll `adb mdns services`, then `adb pair`). The QR code renders; scanning it isn't tested yet.
  - [x] Pairing code (ip:port + 6-digit code)
  - [x] Connect by address ✅
- [x] Disconnect a Wi-Fi transport (✕) ✅
- [x] Legacy `adb tcpip 5555` for USB devices (the "Wi-Fi" button), with an auto-detected phone IP and connect retries
- [x] Separate quality presets for USB (8 Mbps, full resolution) and Wi-Fi (4 Mbps, 1280)
- [x] Warn when the adb server version differs from the client
- [x] Mirroring verified over both the ip:port and the mDNS transport ✅
- [ ] Needs the user: scan the QR code, pair with a code, test the USB cable and the tcpip button

## M5: Full control and latency (current focus)
- [x] Multi-touch: ⌥-drag pinch/rotate, ⌥⇧-drag two-finger swipe, trackpad pinch → pinch-zoom at the cursor
- [x] Touch indicator overlay; "Show touches on phone" setting (scrcpy `show_touches`, restored on disconnect)
- [x] Device menu with shortcuts (⌘B Back, ⇧⌘H Home, ⌘S Recents, ⌘N/⇧⌘N panels, ⌘↑/⌘↓ volume, ⌘P power, ⌘R rotate, ⌘O screen off, ⇧⌘S screenshot, ⇧⌘R record, ⌘D disconnect), the same table used for toolbar tooltips
- [x] Clipboard through Edit-role paste/copy/cut events (works even though the menu owns ⌘V)
- [x] Controls help sheet (⌨ button)
- [x] Latency instrumentation in the status bar (app ms, jitter; IPC, decode and queue in the tooltip) ✅ measured over USB and Wi-Fi
- [x] `pointerrawupdate` for drags; `backgroundThrottling: false`
- [x] USB mirroring ✅ verified (first wired session)
- [x] Opt-in input trace: `localStorage['mob-mirror:debug-input']='1'` → `window.__mobMirrorInputLog`
- [ ] Needs the user: try pinch (⌥-drag, trackpad), typing, ⌘V, and the menu shortcuts on the phone
- [x] Unlock from the Mac (⌘L / toolbar lock / "Phone is locked" banner)
  - Wakes the phone, shows the bouncer and types the PIN/password over the control socket, then verifies.
  - Detects the lock type (pattern → explains it can't be typed).
  - Optional "Remember on this Mac" (safeStorage / Keychain, per device; a saved PIN that fails is forgotten).
  - Never auto-retries. ✅ The user confirmed unlocking with a typed PIN.
  - Saved PIN released only after Touch ID (in main); no silent fallback. ✅ Detected on the dev Mac.
- [ ] Needs the user: lock the phone → ⌘L → Unlock with Touch ID
- [ ] Optional quality presets (e.g. "Low latency" = smaller max_size on Wi-Fi), driven by jitter measurements

## M4: Polish and packaging (in progress; ✅ marks items verified)
- [x] UI rebuilt on React 19 + Tailwind 4 + shadcn/ui + lucide, with Magic UI accents (ADR-7) ✅ idle and live screens checked visually
- [x] Audio: Off / Mac (phone muted) / Mac + phone; Opus → WebCodecs AudioDecoder → Web Audio jitter buffer; mute toggle ✅ decoder configures on the device (not yet listened to)
- [x] Screenshot → ~/Pictures/Mob Mirror ✅
- [x] Recording (MP4 H.264 + Opus, chunks streamed to ~/Movies/Mob Mirror) ✅ duration bug found and fixed
- [x] Drag & drop: `.apk` → `adb install -r`, other files → /sdcard/Download + media scan (not yet tested on the device)
- [x] "Mirror in new window" for several phones at once (not yet tested)
- [x] macOS inset title bar, light and dark following the system
- [x] electron-builder `.dmg` (arm64, unsigned) ✅ builds
- [x] Packaged app verified ✅ lists devices (also with Finder's minimal PATH), mirrors, disconnects cleanly
- [x] Signing and notarization guide: [RELEASE.md](RELEASE.md)
- [x] `app.asar` 56 MB → 2.0 MB (renderer libraries moved to devDependencies); renderer JS 1,538 → 471 KB (minify on, `motion` replaced by CSS) ✅
- [x] Independent code review: 10 findings fixed (sessions cancelled when a window closes mid-connect, recordings tied to their window and closed on close/reload, robust chunk writes, preload-only file paths, mute no longer silences recordings, audio decoder recovery, socket cleanup on a failed handshake, cancellable connect, unique screenshot names, Show in Finder limited to our folders) ✅ window-close-mid-connect verified on the device
- [ ] App icon (`build/icon.icns` or a 1024 px `build/icon.png`)
- [ ] Signed + notarized release (needs an Apple Developer ID)
- [ ] Needs the user: listen to audio, drag & drop an APK or file, "Mirror in new window"

## M6: Agent control (MCP)
- [x] Local MCP server (127.0.0.1, bearer token, Host/Origin validation), off by default; sidebar toggle, "Copy Claude Code setup", token rotation
- [x] 14 tools: list_devices, device_info, screenshot, get_ui_tree, tap, long_press, swipe, scroll, type_text, press_key, list_apps, launch_app, unlock_phone (Touch ID), wait
- [x] Screenshots from the live mirror frame (238 ms) or adb screencap (2 s); a single agent coordinate space mapped to video or device pixels
- [x] "Agent: …" activity pill on the mirror
- [x] docs/AGENTS.md and the `phone-control` skill
- [ ] Needs the user: `claude mcp add …`, then ask Claude Code to do something on the phone (first input tools on the device)
- [ ] Ideas: per-tool permissions (e.g. allow read-only tools only), an action log/replay, a "Stop agent" button, app-install tool, notifications/logcat reader for app debugging

## M7: Reliability, quality and UI (2026-11-06)
- [x] Auto-reconnect + watchdog (router deauth / IP change / cable); USB > mDNS > ip:port ✅ failover verified
- [x] Quality presets + H.265 end to end ✅ (USB native 16 Mbps hvc1, Wi-Fi 1600 px 6 Mbps)
- [x] Unlock locked apps (app-lock PIN prompts), Touch ID gated
- [x] Sidebar: docked/floating, collapsible, sections; responsive layout down to 480 px ✅ 1180/860/560
- [x] Show touches = app overlay, instant; settings apply live and are queued, not dropped ✅
- [x] Notifications: compact shadcn-styled toasts (one line); click opens the notification center (bell) with the notice expanded; adb mismatch notice with "Restart adb"
- [ ] Needs the user: open an app-locked app to confirm its activity name is recognised (else use "Type PIN")
