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

## M4: Polish and packaging
- [ ] Audio (Android 11+, opus → WebCodecs AudioDecoder)
- [ ] Screenshot and recording, file drag-and-drop (push / install APK)
- [ ] Multiple devices in multiple windows
- [ ] electron-builder `.dmg`, signing and notarization; adb detection or download UX
