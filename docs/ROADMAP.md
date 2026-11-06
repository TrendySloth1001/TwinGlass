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

## M3: Connectivity
- [ ] Live device list via `adb track-devices`
- [ ] Wireless pairing UI: 6-digit code and QR (`WIFI:T:ADB;S:studio-…;P:…;;` + mDNS)
- [ ] Legacy `adb tcpip` flow for Android ≤10
- [ ] Separate quality presets for USB (8 Mbps) and Wi-Fi (2–4 Mbps, max_size 1024)

## M4: Polish and packaging
- [ ] Audio (Android 11+, opus → WebCodecs AudioDecoder)
- [ ] Screenshot and recording, file drag-and-drop (push / install APK)
- [ ] Multiple devices in multiple windows
- [ ] electron-builder `.dmg`, signing and notarization; adb detection or download UX
