---
name: scrcpy-protocol
description: Use when changing anything that touches the scrcpy wire protocol (src/shared/scrcpy, src/main/scrcpy, control or input encoding), debugging dropped input or a broken video stream, or upgrading the pinned scrcpy-server version.
---

# Working with the scrcpy protocol

## Ground rules
1. Byte layouts come from `docs/FACTS.md`, which was verified against the scrcpy v5.0.1 source. Never from memory or from older scrcpy docs.
   - 5.x differs from 2.x/3.x. It uses `send_stream_meta`, not `send_codec_meta`, and width and height arrive in **session packets**, not in the codec meta.
2. If FACTS.md doesn't cover something, read the server source at the pinned tag:
   ```bash
   git clone --depth 1 --branch v5.0.1 https://github.com/Genymobile/scrcpy /tmp/scrcpy-src   # or your scratchpad
   ```
   Key files:
   - `server/src/main/java/com/genymobile/scrcpy/control/ControlMessageReader.java` (client → device)
   - `control/DeviceMessageWriter.java` (device → client)
   - `device/Streamer.java` (stream framing)
   - `device/DesktopConnection.java` (sockets, dummy byte)
   - `Options.java` (server args)
   - `control/PositionMapper.java` (why events get dropped)

   Record anything new in FACTS.md with its source path.
3. Every encoder or decoder change gets a byte-exact test (in `test/control.test.ts` or `test/stream.test.ts`).

## Debugging checklist
- **Input does nothing:**
  - Check that the touch/scroll `screen` w×h equals the latest `session` event's size.
  - Xiaomi phones also need "USB debugging (Security settings)" enabled, then a reboot.
  - Check the server log: `session.on('log')`.
- **No video:**
  - Run `MOB_DEVICE=<serial> npx vitest run test/integration --silent=false`. It shows the codec, session and config events.
- **Server exits immediately:** the version argument doesn't match the jar, or an option is unknown. Read the logs in the thrown error.
- **Black screen in some apps:** that's FLAG_SECURE, and it's expected.

## Upgrading scrcpy-server
1. Get the new release tag and its `SHA256SUMS.txt` with `gh release view vX.Y.Z -R Genymobile/scrcpy`.
2. Diff the protocol between the two tags:
   ```bash
   git diff vOLD vNEW -- server/src/main/java/com/genymobile/scrcpy/{control,device,Options.java} doc/develop.md
   ```
3. Update together:
   - `SCRCPY_VERSION` in `src/shared/scrcpy/constants.ts`
   - `VERSION`/`SHA256` in `scripts/fetch-server.mjs`
   - the resource filename in `src/main/index.ts`
   - docs/FACTS.md
4. Run `npm run fetch-server`, `npm test`, then `MOB_DEVICE=<serial> npm test` on a real device.
