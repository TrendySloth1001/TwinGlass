# Architecture decisions

## ADR-1: The phone side is the official scrcpy-server 5.0.1, pushed over adb
- **Why:** it does screen capture, hardware encoding and input injection without installing an APK, and it is Apache-2.0.
- **Consequence:** client and server versions are locked to each other. A server upgrade means re-checking [FACTS.md](FACTS.md) against the new source.

## ADR-2: Desktop app is Electron 45, electron-vite 6 and TypeScript
- **Why:** the Node main process has raw sockets, and the Chromium renderer has WebCodecs for hardware H.264 decoding. One language covers both.
- **Process split:**
  - **main:** adb, the scrcpy server lifecycle, sockets and demuxing.
  - **preload:** a narrow `contextBridge` API.
  - **renderer:** decoding, rendering and input capture.
- **Security:** `contextIsolation`, `sandbox` and no `nodeIntegration`.

## ADR-3: Our own protocol layer, not Tango's packages
- **Why:** Tango's stable `@yume-chan/scrcpy@2.3.0` supports scrcpy only up to 3.3.3. Support for 5.x exists only in the 3.0.0 beta. The test phone runs Android 17, and old servers have broken on new Android versions.
- **The protocol is small and fully specified** in [FACTS.md](FACTS.md). The encoders and decoders are pure functions with unit tests.
- **Tango (MIT) stays a reference** for the SPS parser, the keycode table and decoder handling.

## ADR-4: Use the system adb binary, not a bundled one
- **Why:** Google's prebuilt platform-tools can't be redistributed (SDK license §3.4).
- **How it works:**
  - We locate adb on PATH, in `$ANDROID_HOME`, or at a path the user sets.
  - Device listing, push, forward, pair and connect shell out to `adb`.
  - The scrcpy streams themselves are plain TCP sockets through `adb forward`.
- **Later:** an optional download or a bundled AOSP build.

## ADR-5: Forward tunnel (`tunnel_forward=true`)
- **Why:** it behaves the same over USB and Wi-Fi, and the client doesn't need to open a listening port, so there are no firewall prompts.
- **Cost:** we must read the dummy byte on the first socket.

## ADR-6: Video packets go from main to renderer over a MessagePort
- **Why:** transferable ArrayBuffers avoid structured-clone copies for every frame. Control messages go back over the same port.
