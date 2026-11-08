# Verified facts

Checked 2026-11-06 against primary sources: the scrcpy `v5.0.1` source tree, npm registry, developer.android.com, and AOSP `packages/modules/adb`.
Items marked **UNVERIFIED** still need to be confirmed on a real device or in code.
Re-verify this file whenever a pinned version changes.

## Environment (dev machine)

| Item | Value |
|---|---|
| Mac | Apple Silicon arm64, macOS 26.6.2, Xcode 26.6 |
| Node / npm | 25.2.1 / 11.6.2 |
| adb | 37.0.0 (latest stable 37.0.1, Jul 2026; 37.0.2 is canary) |
| Test phone | Nothing A024, Android 17 (SDK 37), 1260×2800, wireless debugging |

The phone shows up twice in `adb devices`: once as `192.168.0.13:<port>` and once as `adb-<serial>-<rand>._adb-tls-connect._tcp`. It is the same device, so we de-duplicate by `ro.serialno`.

## Pinned versions

| Package | Version | Source |
|---|---|---|
| scrcpy-server | **5.0.1** (2026-10-08), SHA-256 `764eb6f79811d5211fe9df341120882ba9994c7a61b897d7bf3fb662e53bc536`, Apache-2.0 | github.com/Genymobile/scrcpy releases |
| electron | 45.2.3 (Chromium 156, Node 24.22) | releases.electronjs.org |
| electron-vite | 6.0.0 (vite ^6, ^7 or ^8) | npm |
| vite | 8.3.6 | npm |
| typescript | 7.0.2 (Go-native `tsc`; used for type-checking only) | npm |
| vitest | 5.1.0 (engines: Node ^22.12, ^24 or >=26; it works on the dev machine's Node 25 but warns on install) | npm |
| qrcode | 1.5.4 (MIT), used in main for the QR pairing SVG | npm |
| electron-builder | 26.18.0 | npm |

## scrcpy 5.0.1 protocol

Sources: `server/src/main/java/com/genymobile/scrcpy/{Options,device/DesktopConnection,device/Streamer,control/ControlMessageReader,control/DeviceMessageWriter,control/PositionMapper}.java`, `app/src/{server,demuxer,control_msg,packet_merger}.c`, `doc/develop.md`.

### Launch
```
adb push scrcpy-server-v5.0.1 /data/local/tmp/scrcpy-server.jar
adb shell CLASSPATH=/data/local/tmp/scrcpy-server.jar app_process / com.genymobile.scrcpy.Server 5.0.1 key=value ...
```
- The first argument must equal `5.0.1` exactly, or the server throws.
- `scid` is a 31-bit value formatted as `%08x` (the server parses it as hex). The socket name is `localabstract:scrcpy_<scid>`.
- Useful keys and their defaults:
  - `video`, `audio`, `control`: true
  - `tunnel_forward`: false
  - `video_codec`: h264
  - `max_size`: 0
  - `video_bit_rate`: 8000000
  - `max_fps`: 0
  - `audio_codec`: opus
  - `send_device_meta`, `send_frame_meta`, `send_dummy_byte`, `send_stream_meta`: true
  - `cleanup`: true
  - `power_on`: true
  - `stay_awake`: false
  - `clipboard_autosync`: true
- There is **no `send_codec_meta`** in 5.x. It is now called `send_stream_meta`.

### Tunnel and socket order
- **Forward** (`tunnel_forward=true`): `adb forward tcp:PORT localabstract:scrcpy_<scid>`, and the client connects. The server writes one dummy byte `0x00` on the **first** socket only.
- **Reverse** (default): `adb reverse`, the client listens, and no dummy byte is sent.
- Sockets connect in the order video, audio, control. A disabled stream skips its socket.
- The first socket then receives the device meta: a 64-byte, NUL-padded UTF-8 device name.

### Stream framing
1. **Codec id** (u32 BE). Video: h264 `0x68323634`, h265 `0x68323635`, av1 `0x00617631`. Audio: opus `0x6F707573`, aac `0x00616163`, flac `0x666C6163`, raw `0x00726177`. An id of `0` means the stream is disabled on the device; `1` means a configuration error.
2. **Session packet** (video only, 12 bytes): `u32 0x80000000|flags`, `u32 width`, `u32 height`. It is sent before every encoder (re)start: at start, on rotation or fold, on resize, and on `RESET_VIDEO`.
3. **Media packet**: a `u64` header, then a `u32 size`, then the payload.
   - Bit 63 of the header is 0 for a media packet (this is how it differs from a session packet).
   - Bit 62 is the CONFIG flag and bit 61 is the KEY_FRAME flag.
   - Bits 0–60 hold the PTS in µs.
   - Config packets carry SPS/PPS, header value exactly `1<<62`. Prepend them to the next frame before decoding.
- **H.264 is Annex-B.** Verified on the device on 2026-11-06: the Nothing A024 on Android 17 over Wi-Fi sent a config packet with start-code-delimited SPS/PPS, codec `avc1.640020` (High profile, level 3.2), and a session packet of 460×1024 at `max_size=1024`. Run it yourself with `test/integration/session.test.ts`.

### Control messages (client → device, big-endian, max 256 KiB)
| id | type | layout after the type byte |
|---|---|---|
| 0 | INJECT_KEYCODE | action u8, keycode i32, repeat i32, metastate i32 |
| 1 | INJECT_TEXT | u32 len + UTF-8 (max **300** bytes; ASCII is reliable, other characters are not) |
| 2 | INJECT_TOUCH_EVENT | action u8, pointerId i64, x i32, y i32, w u16, h u16, pressure u16, actionButton i32, buttons i32 |
| 3 | INJECT_SCROLL_EVENT | x i32, y i32, w u16, h u16, hscroll i16, vscroll i16, buttons i32 |
| 4 | BACK_OR_SCREEN_ON | action u8 |
| 5/6/7 | EXPAND_NOTIFICATION / EXPAND_SETTINGS / COLLAPSE_PANELS | none |
| 8 | GET_CLIPBOARD | copyKey u8 (0 none, 1 copy, 2 cut) |
| 9 | SET_CLIPBOARD | sequence u64, paste u8, u32 len + UTF-8 |
| 10 | SET_DISPLAY_POWER | on u8 |
| 11 | ROTATE_DEVICE | none |
| 12/13/14 | UHID_CREATE / UHID_INPUT / UHID_DESTROY | see ControlMessageReader.java |
| 15 | OPEN_HARD_KEYBOARD_SETTINGS | none |
| 16 | START_APP | u8 len + name (`+` force-stop, `?` search) |
| 17 | RESET_VIDEO | none |
| 18/19/20 | CAMERA_SET_TORCH / ZOOM_IN / ZOOM_OUT | |
| 21 | RESIZE_DISPLAY | w u16, h u16 |
| 22 | SCAN_FILE | u32 len + path |

- **Pressure:** `u16 = round(p * 65536)`, clamped to 0xFFFF.
- **Scroll:** values in [-16, 16] are encoded as `i16 = v/16 * 32768`, clamped to [-32768, 32767].
- **Pointer ids:** mouse = -1, generic finger = -2, virtual finger = -3.
- **The touch/scroll `w` and `h` must exactly equal the current video size** (taken from the latest session packet). Otherwise the server silently drops the event.

### Device → client (control socket)
| id | type | layout |
|---|---|---|
| 0 | CLIPBOARD | u32 len + UTF-8 |
| 1 | ACK_CLIPBOARD | sequence u64 |
| 2 | UHID_OUTPUT | id u16, u16 len + data |

### Audio
- Requires Android 11+. Android 12+ works out of the box; on Android 11 the device must be unlocked when the server starts.
- Format is 48 kHz stereo s16. The Opus config packet is a bare `OpusHead`.
- **The default `audio_source=output` mutes the phone while it captures** (REMOTE_SUBMIX). Source: doc/audio.md at v5.0.1.
  - `audio_source=playback` with `audio_dup=true` keeps the phone playing as well (Android 13+), but apps can opt out of capture.
  - That's why the app defaults to audio **off**, with modes Off / Mac (phone muted) / Mac + phone.
- **Verified on the device on 2026-11-06:** `audio=true audio_codec=opus audio_source=playback audio_dup=true` on Android 17 delivers an Opus config packet. WebCodecs `AudioDecoder` configures with `{codec:'opus', sampleRate:48000, numberOfChannels:2, description: OpusHead}`. Sound quality and latency have not been judged by ear yet.

## Recording and screenshots (verified 2026-11-06)
- `canvas.toBlob('image/png')` produces a screenshot at the video's resolution (576×1280 over Wi-Fi).
- `MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.640028,opus')` is true in Electron 45. The output is H.264 + Opus MP4, checked with ffprobe.
- **`canvas.captureStream(fps)` only emits frames when the canvas is repainted.** scrcpy sends no frames for a static screen, so a 3.5 s recording came out 1.09 s long.
  - The fix is `captureStream(0)` plus `track.requestFrame()` at 30 fps. A ~4 s recording then measured 3.92 s.

## WebCodecs (renderer)
- `VideoDecoder.configure({ codec: 'avc1.PPCCLL', optimizeForLatency: true })` with **no `description`**, which tells WebCodecs to expect Annex-B input. `PPCCLL` is `profile_idc`, `constraint_flags` and `level_idc` from the SPS, each as two hex digits.
- Prepend the config packet to the next keyframe and send it as one `key` chunk. Reconfigure the decoder when the SPS changes.
- Call `VideoFrame.close()` on every frame. Decoding a delta frame before any keyframe throws.
- To bound latency: if `decodeQueueSize > 0` when a keyframe arrives, call `reset()`, reconfigure, and decode from that keyframe.
- **Hardware decoding: verified in the app on 2026-11-06.** `isConfigSupported({codec:'avc1.640020', hardwareAcceleration:'prefer-hardware'})` returns supported in Electron 45 on Apple Silicon.
  - We measured 44–66 fps while scrolling over Wi-Fi at 576×1280.
  - On a still screen it reads 0 fps: the encoder emits no frames when nothing changes.

## Input: verified on the device (2026-11-06)
- **Wheel:** `hscroll = deltaX/50` and `vscroll = -deltaY/50`, in scrcpy's SDL convention (+y = up). The scroll direction is correct on the Nothing A024.
- **Mouse drag:** pointer id -1 with PRIMARY buttons scrolls lists like a finger swipe.
- **Not yet tested on a device:** keyboard text and keycodes, clipboard bridging, and the toolbar buttons.

## adb
- **Host protocol** on 127.0.0.1:5037: each request is 4 hex length characters followed by the payload. The reply is `OKAY`, or `FAIL` + hex4 length + message.
  - `host:track-devices-l` streams a new device list on every change.
- **`adb devices -l` fields:** serial, state (`device`, `offline`, `unauthorized`), devpath, `product:`, `model:`, `device:`, `transport_id:N` (always last).
- **Wireless (Android 11+):** `adb pair ip:port code`, then `adb connect ip:port`. The pairing port and the connect port are different, and both are random.
  - QR pairing payload: `WIFI:T:ADB;S:studio-<10 chars>;P:<password>;;`. Then wait for `_adb-tls-pairing._tcp` with that instance name in `adb mdns services`, and run `adb pair`.
  - Android 17 with adb 37 adds "adb Wi-Fi 2.0": the phone auto-connects on a trusted network.
- **Legacy wireless (Android ≤10):** `adb tcpip 5555`, then `adb connect ip:5555`. This is unencrypted.
- **mDNS backend:** platform-tools 37.0.1+ has only `libadbmdns`. `ADB_MDNS_OPENSCREEN` has no effect.
  - On the dev machine, `adb mdns check` reports `Openscreen discovery`. This is correct for the server it talks to.
- **What matters is the server, not the client.** Commands are handled by whichever adb server is already running.
  - On the dev machine the server is **36.0.2**, from a second install at `/opt/homebrew/share/android-commandlinetools/platform-tools/adb`, with `usb_backend: LIBUSB` and `mdns_backend: OPENSCREEN`.
  - The `adb` on PATH is a 37.0.0 client. The two coexist because both speak protocol 41.
  - `adb server-status` shows the server's version and path. The app warns when client and server versions differ.
- **`adb track-devices -l`** works even though `adb help` doesn't list it (verified 2026-11-06).
  - It streams frames of 4 hex length digits plus a payload. The payload uses the same text format as `adb devices -l`, without the header line. An empty list arrives as `0000`.
- **`adb connect` exits 0 even when it fails.** Classify the message instead: "connected to" or "already connected to" means success; "failed to connect" or "cannot connect" means failure.
- **`adb disconnect <ip:port>`** prints `disconnected <ip:port>`. `adb track-devices` reflects the change within about a second (verified).
- **The phone's Wi-Fi IP** comes from `adb shell ip -f inet addr show wlan0`, on the `inet a.b.c.d/nn` line.
- **Redistribution:** the Android SDK license forbids redistributing Google's prebuilt platform-tools. adb built from AOSP is Apache-2.0. Policy: detect a system adb first.

## Control precision and latency (measured 2026-11-06, Nothing A024 / Android 17)
- **Multi-touch:** the client sends DOWN/MOVE/UP per pointer id. The server turns a second pointer's DOWN/UP into `ACTION_POINTER_DOWN/UP` itself (Controller.injectTouch).
  - The pinch/rotate "virtual finger" (id -3) is the mouse position mirrored through the centre, `(w−x, h−y)`. Tilt mirrors x only (input_manager.c).
- **Never send `ACTION_CANCEL` for a pointer.** The server only clears a pointer on `ACTION_UP` (Pointer.setUp), so a cancelled pointer stays "down" and corrupts every later touch.
- **Encoder:** the server already sets `KEY_PRIORITY=0` and `KEY_LATENCY=1` (SurfaceEncoder.java). Its reference client displays frames as soon as they're decoded, with no buffering.
- **Mac-side latency (main received → frame drawn): ~2–3 ms.** IPC is 0.2–0.3 ms and hardware decode ~2 ms (the first frame is ~50 ms while the decoder warms up). The decoder queue stays at 0.
- **Network/encoder jitter** (transit time beyond the fastest recent frame): **USB 5–11 ms** (1260×2800 at 8 Mbps); **Wi-Fi 10–24 ms with spikes to 48–65 ms** (576×1280 at 4 Mbps). Frame rate reaches 120 fps on this 120 Hz phone. USB is the low-latency path.
- **Electron/Chromium:**
  - `pointerrawupdate` is available (secure context) and fires with every OS move. `pointermove` is frame-aligned. Drags use rawupdate.
  - The canvas `desynchronized: true` is honoured.
  - An occluded window reports `visibilityState: hidden`, so `backgroundThrottling: false` is set.
- **Precision:** the overlay dot was drawn exactly at the press point, with the CDP press at (856, 538) and the dot at (856, 538). The round trip from video pixel to screen and back is exact (unit test). Video→device quantization is about 2.2 device px over Wi-Fi (576→1260) and 1:1 over USB.
- **⌘ shortcuts:** Electron's menu handles key equivalents before the page, so ⌘V/⌘C/⌘X reach the canvas as `paste`/`copy`/`cut` events (Edit role). Device shortcuts are menu accelerators (src/shared/shortcuts.ts).

## Unlocking (verified on Android 17, Nothing A024, 2026-11-06)
- **Lock state:** `dumpsys window policy` (~3 KB, ~70 ms) shows `KeyguardServiceDelegate` / `showing=true|false`. The full `dumpsys window` (67 KB) has `isKeyguardShowing=`.
- **Lock type:** `dumpsys lock_settings` reports `CredentialType: PIN` (or PASSWORD / PATTERN / NONE). It never shows the credential. `cmd lock_settings get-disabled` returns `false` when a lock screen is set.
- **`wm dismiss-keyguard` exists:** "Dismiss the keyguard, prompting user for auth if necessary". It brings up the PIN/password bouncer.
- **The PIN/password bouncer is FLAG_SECURE,** so it shows black in the mirror, but injected key events still reach it.
- **The unlock flow:**
  1. KEYCODE_WAKEUP (224)
  2. `wm dismiss-keyguard`
  3. INJECT_TEXT of the secret over the control socket (never on a shell command line)
  4. KEYCODE_ENTER
  5. Poll the lock state for up to 3.5 s
- **Not yet verified end to end:** typing a real PIN into a locked phone. The user needs to test this, since it needs their PIN.
- **Pattern locks can't be typed.** Only ASCII PINs/passwords are supported (that's the INJECT_TEXT limitation).
- ✅ **The user confirmed that a typed PIN unlocks the phone** (2026-11-06).
- **Touch ID:** `systemPreferences.canPromptTouchID()` / `promptTouchID(reason)` (Electron 45, darwin). The dev Mac (MacBookPro18,3) has biometrics enabled for unlock.
  - Electron's own docs say `promptTouchID` is an **app-level gate** and doesn't protect data by itself. So main decrypts the saved secret (safeStorage) only after Touch ID succeeds, and the renderer can't bypass that.
  - **Limit:** code running as the same macOS user could still decrypt the safeStorage file. A hardware-bound Keychain item (`kSecAccessControlUserPresence`) would need a native module.
  - Touch ID is checked *after* "already unlocked", so an unlocked phone never prompts. If Touch ID is unavailable (lid closed), there's no silent fallback: the user types the PIN.

## Agent control over MCP (verified 2026-11-06)
- **SDK:** `@modelcontextprotocol/server` 2.4.0 + `@modelcontextprotocol/node` 2.1.2 (the v2 split SDK, implementing the 2026-07-28 spec) and zod 4.6.7.
  - API: `createMcpHandler(factory)` + `toNodeHandler`, `registerTool(name, {description, inputSchema: z.object(...)}, cb)`.
  - Clients on the 2025-06-18 protocol are also served (verified with curl).
- **Bundling:** the SDK is bundled into main (devDependencies). ajv is vendored inside the SDK build. The `require("ajv/…")` strings in the bundle are codegen templates and are never executed.
- **Security, verified with curl:**
  - No token → 401.
  - A foreign `Host` → 403 (localhostHostValidation).
  - 127.0.0.1 only.
  - `agent.json` has mode 600.
- **Tools:** 14 in total (see docs/AGENTS.md).
- **Measured on the Nothing A024:**
  - `device_info` 315 ms
  - `screenshot` via adb screencap **1,961 ms**, via the live mirror frame **238 ms**
  - JPEG at 576×1280 is ~80–90 KB
  - Out-of-range coordinates and invalid package names are rejected
- **`uiautomator dump`** fails with "could not get idle state" after ~11 s while the screen animates (seen on the home screen). The tool reports this and suggests a screenshot instead.
- **Foreground app:** `dumpsys activity activities | grep topResumedActivity` works. `dumpsys window` `mCurrentFocus` returned null.
- **`wm size`** reports the physical portrait size (1260×2800) regardless of rotation. Orientation comes from the screenshot or the live video size.
- **Claude Code** warns above 10k tokens of tool output and caps it at 25k (`MAX_MCP_OUTPUT_TOKENS`), which is why screenshots are capped at a 1280 px long edge.

## Build and packaging (verified 2026-11-06)
- **electron-vite 6 does not minify the renderer by default.** With `renderer.build.minify: true`, the JS goes from 1,538 KB to 606 KB. Dropping `motion` brings it to 471 KB.
- **electron-builder ships everything in `dependencies` inside `app.asar`.** With the renderer libraries listed there, the asar was 56 MB, including 37 MB of lucide-react sources. Moved to devDependencies, it's 2.0 MB, with only `qrcode` and its dependency tree.
- **An unsigned build (`identity: null`) gets only the linker's ad-hoc signature.** `spctl` rejects it. On macOS 15+, Control-click → Open no longer bypasses Gatekeeper; use System Settings → Privacy & Security → Open Anyway, or remove the quarantine attribute with `xattr -dr com.apple.quarantine`. See [RELEASE.md](RELEASE.md).
- The packaged app finds adb even with `PATH=/usr/bin:/bin` (what Finder gives it), thanks to the `/opt/homebrew/bin/adb` fallback.

## Known gotchas
- **Xiaomi:** you must also enable "USB debugging (Security settings)" and reboot, or input injection fails with an INJECT_EVENTS error.
- **FLAG_SECURE windows** (banking apps, DRM) are captured black. This is by design.
- **Android OS updates have broken scrcpy before** (14, 15 and 16 all needed fixes). Keep the server version current.
- **Wi-Fi bitrate:** use about 2–4 Mbps with `max_size` 800–1024 (based on older scrcpy guidance), versus 8 Mbps over USB.


## Rotation (verified on the A024, Android 17, 2026-11-06)
- With auto-rotate on, scrcpy's ROTATE_DEVICE (`freezeRotation` followed by `thawRotation`) gets undone at once by the sensor. `mUserRotation` changes but the display stays at 0.
- What works: `cmd window user-rotation -d 0 lock <0-3>` and `free`.
- To read the state, look at the `Display: mDisplayId=0` block of `dumpsys window displays` (`mRotation=`, `mUserRotationMode=`). Scrcpy's virtual display is listed first.

## Unlock on phones with an under-display fingerprint sensor, and system BiometricPrompt (verified on the A024, Android 17, 2026-11-06)
- **Lock screen.** `wm dismiss-keyguard` shows SystemUI's **alternate bouncer** instead of the PIN pad. That is the fingerprint overlay, window `AlternateBouncerView`.
  - It takes no key input, and `mCurrentFocus=null`, so a typed PIN is lost. No failure is counted.
  - A tap outside the sensor (top-centre quarter) switches to the PIN pad. `dumpsys activity service com.android.systemui` then reports `isPrimaryBouncerShowingOrWillBeShowing=true` and `isAlternateBouncerShowing=false`.
  - The `AlternateBouncerView` window exists only while the overlay is shown.
- **WhatsApp's own app lock.** It uses `com.whatsapp/.authentication.AppAuthenticationActivity`, which shows Android's system **BiometricPrompt** (window `BiometricPrompt`, input focus null).
  - `dumpsys biometric` shows `CredentialRequested: true`, so the device PIN is accepted.
  - The PIN pad is behind the button `com.android.systemui:id/button_use_credential` ("Use PIN"). `uiautomator dump` finds it even though the prompt is hidden from capture.
  - The sequence is: tap it, wait about 700 ms, type the PIN, press Enter. The prompt closes and the app resumes. Verified end to end.
  - Prompts without that button are biometric-only, and the PIN is never typed there.
- **Dev note.** During quick successive `electron-vite dev --watch` restarts, the old Electron sometimes survived. It quits normally on SIGTERM, so electron-vite lost track of it. If "No handler registered" errors appear, look for two Electron processes.

## Mac screen → phone (verified 2026-11-06, A024 Android 17, Electron 45)
- getDisplayMedia, then WebCodecs VideoEncoder (`avc1.640033`, realtime, Annex-B), then a local HTTP stream, then `adb reverse tcp:P tcp:P`, then Chrome on the phone (WebCodecs VideoDecoder). Works, also over wireless adb.
- `session.setDisplayMediaRequestHandler` must be registered after `app.whenReady()`. Before that it silently fails and getDisplayMedia rejects with "Not supported".
- Without macOS Screen Recording permission, `desktopCapturer.getSources` returns no screens, and the handler callback throws "Video was requested, but no video stream was provided". `getMediaAccessStatus('screen')` reports "denied" even for an app that was never asked.
- The dev build needs `node_modules/electron/dist/Electron.app` added under Screen Recording, followed by an app restart (a macOS rule).

## Packaging: "can't be opened" on other Macs (verified 2026-11-07)
- With `identity: null`, electron-builder edits Electron's pre-signed bundle and leaves it with a **broken** signature. `codesign --verify --deep --strict` reports "code has no resources but signature indicates they must be present". On Apple Silicon, macOS refuses to open such an app on other Macs ("damaged / can't be opened").
- Fix: `identity: '-'` (ad-hoc signature over the whole bundle) and `hardenedRuntime: false` (hardened runtime is only for notarized Developer ID builds). After that `codesign --verify` is valid. Gatekeeper (`spctl`) still rejects it as not notarized, so the first open needs right-click → Open, or Privacy & Security → Open Anyway.
- Running a packaged app from a VS Code terminal: unset `ELECTRON_RUN_AS_NODE`, or it exits silently.

## Agents on a second screen (verified on the A024, Android 17, 2026-11-07)
- `uiautomator dump` has no display option ("dump [--verbose][file] [--compressed]"). It only dumps the default display, so UI trees of a scrcpy virtual display need an accessibility service. `AccessibilityService.getWindowsOnAllDisplays()` (API 30+) returns the windows per display id.
- `screencap -d` takes **SurfaceFlinger** display ids (`dumpsys SurfaceFlinger --display-id`: e.g. 4630946765914633619, and virtual "scrcpy" displays as 11529215…). It does not take logical ids like 505, so agent-screen screenshots use the mirror window's frame.
- `input [-d DISPLAY_ID]` and `am start --display N` exist. scrcpy's control socket injects into the virtual display of its session.
- The server logs `New display: WxH/dpi (id=N)` when `new_display` is used, which gives each session's display id.
- `am broadcast -n pkg/.Receiver` prints `Broadcast completed: result=0, data="…"` with the receiver's `resultData`. That makes it a synchronous request/response channel to the phone app (base64 JSON, no network).
- Accessibility node text is cached. With only `typeWindowStateChanged` events, a changed label (calculator result 42 → 12) kept its old text. Content and text-change events in the service config keep it fresh (phone app 0.4.1).
- An accessibility service can be switched on from adb: `settings put secure enabled_accessibility_services <existing>:com.mobmirror.companion/.AgentService` plus `accessibility_enabled 1`. It stays on across `adb install -r`.
- `dumpsys notification --noredact` has per-record blocks `NotificationRecord(…pkg=…` with `android.title=String (…)` / `android.text=…`, `when=<epoch ms>`, `flags=…ONGOING_EVENT…`.
- Test tool formats:
  - `dumpsys gfxinfo <pkg>` gives `Total frames rendered`, `Janky frames: N (x%)` and `50th/90th/95th/99th percentile: Nms`.
  - `dumpsys meminfo <pkg>` gives `TOTAL PSS: N` (KB).
  - `dumpsys cpuinfo` lines look like `x% pid/pkg: …`.
  - `am start -W` gives `TotalTime: N`.
  - `cmd package resolve-activity --brief -c android.intent.category.LAUNCHER <pkg>`: the last line is the component.
  - `versionName` may contain spaces: "9.3 (967717812)".

## adb server socket and performance (verified 2026-11-08, adb 37.0.0, A024 Android 17)
- The adb server answers its socket protocol on 127.0.0.1:5037 (`ANDROID_ADB_SERVER_PORT` overrides it). Requests are 4 hex digits of length plus the service; replies are `OKAY` or `FAIL` + 4 hex length + message.
  - `host:version` → `OKAY00040029`.
  - `host:devices-l` returns the same lines as `adb devices -l`, without the header.
  - `host-serial:<s>:get-state` → `device`.
  - `host-serial:<s>:forward:tcp:L;remote` sends a second OKAY once bound. `host-serial:<s>:killforward:tcp:L` also works.
  - After `host:transport:<s>`, these services run on the phone:
    - `shell:<cmd>`: stdout and stderr in one stream, until close.
    - `reverse:forward:tcp:a;tcp:b`: second OKAY once bound.
    - `reverse:killforward:tcp:a`
    - `reverse:list-forward`: length-prefixed; the same lines as `adb reverse --list`.
    - `sync:`: SEND "path,mode", DATA ≤ 64 KB chunks, DONE mtime, reply OKAY/FAIL. The pushed scrcpy server matched byte for byte (sha256).
  - Covered by test/adb-socket.test.ts (`MOB_DEVICE=… npm test`).
- **scrcpy-server deletes its own jar once it starts.** With 2 servers running, `/data/local/tmp` had no `scrcpy-server.jar`, so it must be pushed for every session.
  - A running server keeps its deleted file open, so pushing again never disturbs it.
  - `adb push` of the 717 KB server took 0.12–0.45 s, almost all of it starting the adb program. Over the socket it takes milliseconds.
- `adb` processes started by the app while mirroring, counted over 30 s:
  - Before: about 20 (a get-state check every 4 s and a lock poll every 2.5 s, per window).
  - After: 0 short-lived processes. Only `track-devices` and the server's `shell` stay running.
- Agent screenshots (MCP round trip): 84 ms (full PNG, then decoded, resized and re-encoded in main) → about 57 ms (the window scales the frame and encodes the JPEG).
- Electron 45 `MessagePortMain.postMessage` transfers only ports, not ArrayBuffers, so video packets are copied to the window (about 750 KB/s at 6 Mbit/s: negligible).
- Startup bundle: 611 KB → 460 KB. Settings, ⌘K, Phone details, help, unlock, the app grid, the switcher and the home screen load on first use.
- Phone app: debug build 22 MB → release build (R8 + resource shrinking) 1.8 MB, signed with the debug key so it updates in place.

## Wi-Fi latency (measured 2026-11-08, A024 over wireless debugging, home Wi-Fi)
- The scrcpy 5.0.1 server already sets `KEY_PRIORITY 0` (realtime) and `KEY_LATENCY 1` on the encoder (`video/SurfaceEncoder.java` createFormat). Passing them again through video_codec_options changes nothing.
- `video_codec_options` format: `key:type=value`, comma separated, `\` escapes (`model/CodecOption.java`). Supported in SessionOptions.videoCodecOptions.
- Benchmark (`MOB_DEVICE=… MOB_BENCH=1 npx vitest run test/bench`): a scrolling Settings app on a virtual display, 14 s per setting, "added delay" = arrival − PTS relative to the best frame:

  | Setting | p50 | p95 | p99 | Notes |
  |---|---|---|---|---|
  | h265 1600/6M | 14 | 24 | 31 | 70 fps, largest frame 41 KB |
  | h264 1600/6M | 13 | 25 | 32 | |
  | h265 1600/4M | 12 | 26 | 34 | |
  | h265 1280/4M | 12 | 23 | 29 | |
  | h265 + intra-refresh-period 60 | 13 | 26 | 33 | |
  | h265, max 60 fps | 9 | 27 | 34 | |

  These differences are within noise: frames are small, so bitrate and size don't change the delay on this link.
- The phone's Wi-Fi radio: `ping` 4.1 / 6.3 / 24 ms (min / avg / max), 0% loss. `cmd wifi` on this phone has no low-latency / hi-perf command. WifiManager's low-latency lock only works while the requesting app is in the foreground, so it can't help during mirroring.
- Mac pipeline, packet → drawn (`appMs`), on a second screen at ~117 fps: about 12 ms (decode about 3.5 ms) whether frames are drawn at once or on the next refresh (runs vary ±4 ms; one 3.7 ms reading was an outlier). Refresh-paced drawing is kept, since it costs fewer draws.

## Screen map (verified 2026-11-08, A024 Android 17)
- AccessibilityNodeInfo `EXTRA_DATA_RENDERING_INFO_KEY` (API 30) through `refreshWithExtraData` returns:
  - `layoutSize`: layout params in px; -1 match_parent, -2 wrap_content
  - `textSizeInPx` and `textSizeUnit` (TypedValue: 0 px, 1 dp, 2 sp)
- Home screen: 85 views, 46 with a layout size, 13 with a text size; map in about 750 ms.
- Settings on the agent screen: 82 views; the full MCP call including the image took about 550 ms.
- Text sizes come back as whole pixels: 18sp at 2.625 density is 47.25 px, reported as 47. screen_map reports the simplest value that rounds to the measured pixels (`nice()` in screen-map.ts), so it shows 18sp, not 17.9.

## Direct link: "Wi-Fi, no setup" (verified 2026-11-08)
- **Mac side:** src/main/direct/protocol.ts (spec in its header) and server.ts. **Phone side:** companion …/direct/DirectCrypto.kt, DirectLink.kt, MirrorService.kt, DirectInput.kt.
- **Transport and discovery:** TCP port 47200 on the Mac. Advertised with macOS' own `/usr/bin/dns-sd -R <Mac name> _twinglass._tcp local 47200 v=1` (verified with `dns-sd -B`: "Nikhils-MacBook-Pro" on 2 interfaces). Phones discover it with Android NsdManager.
- **Pairing:** P-256 ECDH. Node `createECDH('prime256v1')` and Android EC/ECDH both give the 32-byte x-coordinate, and public keys are uncompressed 65-byte points. Key derivation is HKDF-SHA256 with salt = the 6-digit code; both sides confirm with HMACs. The code lasts 5 minutes or 3 wrong tries.
- **Sessions:** HKDF from the long-term secret and both nonces. Frames are AES-256-GCM with a 4-zero + u64 counter IV per direction; replayed or out-of-order frames are rejected.
- **Interop:** fixed test vectors give identical bytes in vitest (test/direct-protocol.test.ts) and JUnit (companion DirectCryptoTest).
- **Video:** the payload is scrcpy's own stream framing (codec id, 12-byte session packet with bit 0x80, then u64 flags/pts + u32 size + data), so the Mac reuses StreamDemuxer, the decoder, recording and screenshots unchanged.
- **End-to-end test:** a fake phone (scratch script) checked the following.
  - A wrong code is rejected ("code").
  - The right code pairs.
  - The encrypted session opens.
  - An "offer" makes the Mac open a mirror window by itself (#connect=direct:<id>).
  - "go", then a recorded real H.264 clip decodes (avc1.64002a, 720×1600) and shows.
- **Phone side:**
  - MediaProjection needs the user's consent each session; on Android 14+ the foreground service (type mediaProjection) must be started before getMediaProjection.
  - Input goes through AccessibilityService.dispatchGesture (canPerformGestures="true"): a finger's path is sent as one gesture on release, wheel → swipe, keys → global actions / the focused field.
  - Accessibility-bound apps may start activities from the background (START_APP).
- **Not possible without developer mode:** second screens / the agent screen (creating displays for other apps needs shell), silent installs, logcat / pm / dumpsys tools, the lock-screen PIN.

## USB latency: the encoder, not the cable (measured 2026-11-08, A024 over USB, test/bench MOB_BENCH_SET=usb)
- A phone-sized 1260×2800 virtual display was scrolled for 14 s per setting. "Added delay" is arrival − PTS, relative to the best frame:

  | Setting | p50 | p95 | p99 |
  |---|---|---|---|
  | native 16 Mbps h265 (the old USB "High") | 50 | 74 | 87 |
  | 1920 px 12 Mbps h265 | 16 | 33 | 82 |
  | 1600 px 8 Mbps h265 | 19 | 43 | 78 |
  | 1600 px 8 Mbps h264 | 19 | 36 | 49 |
  | native 16 Mbps h264 | 42 | 60 | 80 |

- Full-resolution frames queue in the phone's encoder. That is why USB at native felt slower than Wi-Fi (capped at 1600).
- USB "High" (and Auto on USB) is now 1920 px / 12 Mbps; native is only "Maximum".
- A second full-resolution 120 fps stream (agent screen) showed ~15 ms main → window IPC delay on that window. Keep concurrent streams capped.
