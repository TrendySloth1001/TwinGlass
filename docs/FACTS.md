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
| vitest | 5.1.0 | npm |
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
- **Redistribution:** the Android SDK license forbids redistributing Google's prebuilt platform-tools. adb built from AOSP is Apache-2.0. Policy: detect a system adb first.

## Known gotchas
- **Xiaomi:** you must also enable "USB debugging (Security settings)" and reboot, or input injection fails with an INJECT_EVENTS error.
- **FLAG_SECURE windows** (banking apps, DRM) are captured black. This is by design.
- **Android OS updates have broken scrcpy before** (14, 15 and 16 all needed fixes). Keep the server version current.
- **Wi-Fi bitrate:** use about 2–4 Mbps with `max_size` 800–1024 (based on older scrcpy guidance), versus 8 Mbps over USB.
