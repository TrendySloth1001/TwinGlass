# Mob Mirror

An Electron desktop app (macOS first) that mirrors **and controls** Android phones over USB or Wi-Fi. It pushes the official scrcpy-server through adb and speaks the scrcpy protocol itself.

## Read first
- [docs/FACTS.md](docs/FACTS.md): verified protocol, version and platform facts. This is the source of truth for every byte layout. Don't work from memory.
- [docs/DECISIONS.md](docs/DECISIONS.md): ADRs (own protocol layer, system adb, forward tunnel, and others)
- [docs/ROADMAP.md](docs/ROADMAP.md): milestones and what's next

## Layout
- `src/shared/scrcpy/`: pure protocol code. Encoders, demuxer and parsers, with no Node or DOM APIs. Runs in both processes.
- `src/shared/input/`: keycode table and coordinate mapping
- `src/main/adb/`: system adb wrapper and parsers
- `src/main/scrcpy/`: session lifecycle (sockets, server process)
- `src/preload/`: the `window.mobMirror` contextBridge API. Types live in `api.d.ts`.
- `src/renderer/`: UI, WebCodecs decoding, input capture
- `resources/scrcpy-server-v5.0.1`: downloaded and SHA-checked by `npm run fetch-server`. Gitignored.

## Commands
- `npm run dev`: run the app
- `npm test`: unit tests
- `MOB_DEVICE=<serial> npm test`: also runs the real-device integration test (`adb devices` shows the serial)
- `npm run typecheck`: type-checking with TS 7 (the Go `tsc`), used only for checking. Vite does the transpiling.

**Launching from a VS Code terminal:** the VS Code extension host exports `ELECTRON_RUN_AS_NODE=1`, which makes Electron run as plain Node. You'll see `Cannot read properties of undefined (reading 'handle')`. Launch with `env -u ELECTRON_RUN_AS_NODE npm run dev`.

**Driving the running app** (for automated checks): launch it with `env -u ELECTRON_RUN_AS_NODE npx electron . --remote-debugging-port=9333` after `npm run build`. Then use CDP: `Runtime.evaluate`, `Input.dispatchMouseEvent` and `Page.captureScreenshot`. On the user's phone, prefer harmless input (scrolling) over taps.

## Rules
- The scrcpy version is locked: `SCRCPY_VERSION` in constants.ts, VERSION and SHA256 in `scripts/fetch-server.mjs`, and docs/FACTS.md must always agree. To upgrade, follow the `scrcpy-protocol` skill.
- Any change to the protocol layer needs a byte-level unit test.
- Touch and scroll `screen` sizes must come from the **latest session packet**. Otherwise the server silently drops the event.
- Keep the renderer sandboxed. Add new capabilities as narrow preload methods, never through `nodeIntegration`.
- Never bundle Google's prebuilt adb (license). See ADR-4.
