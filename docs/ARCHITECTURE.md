# Architecture

How Twinglass is put together. The README has the short version; this is the long one.

## Overview

```mermaid
flowchart LR
  subgraph MAC["Twinglass for Mac (Electron)"]
    direction TB
    UI["Renderer: React UI<br/>sandboxed, no Node"]
    ENG["Engine: WebCodecs video,<br/>input, audio, recorder"]
    PRE["Preload: window.mobMirror<br/>narrow contextBridge API"]
    subgraph MAIN["Main process"]
      ADB["adb socket client<br/>shell · sync · forward · reverse"]
      SES["scrcpy session<br/>server push, sockets"]
      DIR["Direct server<br/>pairing, AES-GCM link, mDNS"]
      MCP["MCP server<br/>46 tools, localhost + token"]
      LNK["Companion link<br/>HTTP via adb reverse"]
      UPD["Updater<br/>both apps"]
    end
    UI --- ENG
    UI <--> PRE <--> MAIN
  end

  subgraph PHONE["Android phone"]
    direction TB
    SRV["scrcpy-server 5.0.1<br/>(Developer mode)"]
    subgraph APP["Twinglass phone app"]
      MIR["MirrorService<br/>MediaProjection + H.264"]
      A11Y["AgentService<br/>accessibility, any display"]
      RCV["Receivers<br/>DUMP-protected"]
      DL["DirectLink<br/>Wi-Fi pairing + sessions"]
    end
  end

  AGENTS["Coding agents<br/>Claude Code, Cursor, VS Code"]
  GH["GitHub Releases"]

  SES <-->|"USB / wireless adb<br/>video · audio · control"| SRV
  ADB <-->|"am broadcast"| RCV
  RCV --- A11Y
  LNK <-->|"adb reverse tcp"| APP
  DIR <-->|"Wi-Fi, encrypted"| DL
  DL --- MIR
  AGENTS <-->|"Streamable HTTP"| MCP
  UPD -->|"latest release + SHA-256"| GH
```

## Developer mode: one tunnel, three sockets

```mermaid
sequenceDiagram
  autonumber
  participant M as Mac (main)
  participant A as adb server
  participant P as Phone
  M->>A: push scrcpy-server.jar (sync: SEND/DATA/DONE)
  M->>A: forward tcp:port → localabstract:scrcpy_xxxx
  M->>P: app_process … Server 5.0.1 (video, audio, control options)
  P-->>M: video socket: codec id, session packet (w×h), frames
  P-->>M: audio socket: codec id, frames
  M->>P: control socket: touch, keys, text, clipboard
  P-->>M: control socket: clipboard, acks
  Note over M,P: Touch sizes always come from the latest session packet,<br/>otherwise the server silently drops the event.
```

## Wi-Fi, no setup: pairing and an encrypted session

```mermaid
sequenceDiagram
  autonumber
  participant P as Phone app
  participant M as Mac (direct server :47200)
  Note over M: Add phone shows a 6-digit code and a QR (code, port, Mac name)
  P->>M: pair {id, name, P-256 public key}
  M-->>P: {Mac P-256 public key}
  Note over P,M: shared = ECDH, key = HKDF-SHA256(shared, salt = code)
  P->>M: confirm HMAC(key, "phone")
  M-->>P: confirm HMAC(key, "mac")
  Note over P,M: Both store the pairing secret. A wrong code fails here.<br/>Codes expire after 5 minutes or 3 tries.
  P->>M: hello {id, nonce, app version}
  M-->>P: hello {nonce}
  Note over P,M: Per-direction AES-256-GCM keys from the secret and both nonces<br/>IV = 4 zero bytes + 64-bit counter (replay-proof)
  P->>M: VIDEO frames in scrcpy framing (H.264)
  M->>P: CONTROL messages → accessibility gestures
```

## One video pipeline for both modes

```mermaid
flowchart LR
  S1["scrcpy-server<br/>(adb)"] --> F["scrcpy stream framing<br/>codec id · session packet · pts/flags · size"]
  S2["Phone app MirrorService<br/>(encrypted Wi-Fi)"] --> F
  F --> D["StreamDemuxer<br/>src/shared/scrcpy"]
  D --> W["WebCodecs VideoDecoder<br/>hardware H.265 / H.264"]
  W --> C["Canvas, one draw per refresh"]
  D --> R["Recorder (MP4)"]
  W --> SH["Screenshots · agent captures"]
```

## How an agent action runs

```mermaid
flowchart TD
  T["Agent calls tap_element {text}"] --> R["Read the element tree<br/>(phone app, that display)"]
  R --> Q{"Match?"}
  Q -- "no, retry ≤ 2.5 s" --> R
  Q -- "yes" --> C["Prefer clickable, a label →<br/>its clickable row"]
  C --> X["Accessibility click<br/>(else a tap at its centre)"]
  X --> I["idle: wait until no window on that<br/>display changed for 300 ms"]
  I --> OK["Result: pressed · screen settled (n ms)"]
```

## Updates for both apps

```mermaid
flowchart LR
  GH["GitHub Releases<br/>DMG + .sha256"] -->|"check: launch + every 6 h"| MAC["Twinglass for Mac"]
  MAC -->|"download, verify SHA-256,<br/>bundle id, swap, reopen"| MAC
  MAC -->|"Developer mode: adb install"| PA["Phone app"]
  MAC -->|"Wi-Fi mode: serves the APK<br/>on the LAN for 10 min"| PA
```

The phone app never contacts the internet: every Mac release carries the newest phone app and its version code.

## Repository layout

```
src/shared/scrcpy/      protocol: control encoders, stream demuxer (no Node/DOM; runs in both processes)
src/main/adb/           system adb: socket client (shell/sync/forward/reverse), parsers, limiter
src/main/scrcpy/        session lifecycle: push server, sockets, options
src/main/direct/        Wi-Fi, no setup: pairing, encrypted link, mDNS, sessions
src/main/agent/         MCP server and the device controller behind it
src/preload/            the narrow window.mobMirror API (renderer stays sandboxed)
src/renderer/src/       React UI; engine/ (WebCodecs video, input, audio, recorder) is framework-free
companion/              the Android phone app
changelog/              release notes shown in both apps and rendered to CHANGELOG.md
docs/                   FACTS (verified protocol/platform facts), DECISIONS (ADRs), REQUIREMENTS, AGENTS, RELEASE
```

Design decisions are recorded as ADRs in [docs/DECISIONS.md](docs/DECISIONS.md); every byte layout is verified against the scrcpy 5.0.1 source in [docs/FACTS.md](docs/FACTS.md).
