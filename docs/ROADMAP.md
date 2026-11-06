# Roadmap

## M0: Foundations ✅
- [x] Verified facts ([FACTS.md](FACTS.md)) and decisions ([DECISIONS.md](DECISIONS.md))
- [x] Electron 45 + electron-vite 6 + TypeScript scaffold; sandboxed renderer
- [x] scrcpy-server 5.0.1 download with SHA-256 check (`npm run fetch-server`)
- [x] Protocol layer: control encoders, stream demuxer, device-message parser, SPS codec string
- [x] Input helpers: DOM code → Android keycode, letterbox-aware coordinate mapping
- [x] adb wrapper: discovery, `devices -l` parsing, merging USB and Wi-Fi transports per phone
- [x] Session lifecycle (push, forward, launch, dummy byte, device meta, demux) verified on a real device

## M1: Video
- [ ] Main → renderer MessagePort pipe (transferable buffers)
- [ ] WebCodecs decoder: config + keyframe merge, reconfigure on SPS change, latency reset, `VideoFrame.close()`
- [ ] Canvas rendering with contain scaling; resize the window to the phone's aspect ratio
- [ ] Check hardware decoding (`isConfigSupported`, `chrome://gpu`)

## M2: Control
- [ ] Pointer → touch (mouse id -1, pointer capture, drag clamping), always using the latest session size
- [ ] Wheel → scroll; keyboard → keycode, printable text → INJECT_TEXT, non-ASCII → SET_CLIPBOARD with paste
- [ ] Toolbar: Back, Home, Recents, power, volume, rotate, notification panel
- [ ] Clipboard sync in both directions (CLIPBOARD / SET_CLIPBOARD + ACK)

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
