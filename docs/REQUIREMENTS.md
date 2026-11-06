# Product requirements: everything agreed with the user

This is a living checklist. **Re-read it before starting new work, and keep it updated**: when the user asks for something, add it here, and mark items ✅ only once they're verified on the device or on screen.
The dates are when each item was asked for (2026-11-06 unless noted).

## Core
- **Android first.** Mirror *and fully control* the phone from the Mac, over USB and Wi-Fi.
- **Use verified facts, not assumptions.** Check primary sources, the scrcpy source code and the device itself, and record them in [FACTS.md](FACTS.md).
- **Use the best UI libraries:** shadcn/ui, lucide icons, Magic UI accents. No hand-rolled widgets; use `npm run ui:add` (ADR-7).
- **Work in priority order:** the core working first, then UI consistency. The app icon comes later.
- **Process:** don't spawn subagents ("no more agents").

## Control
- ✅ Precise cursor control: taps, drags, long-press, scroll, keyboard, and clipboard (⌘V/⌘C).
- ✅ Multi-touch: ⌥-drag pinch/rotate, trackpad pinch.
- ✅ Shortcuts in the Device menu, shown consistently in tooltips.
- ✅ **Rotate works with auto-rotate on** (2026-11-06). It goes through `cmd window user-rotation`, since scrcpy's ROTATE_DEVICE gets undone by the sensor. Auto-rotate is given back when you rotate back to portrait or disconnect. The compact window reshapes and remembers its size in each orientation.
- ✅ Touch indicator. "Show touches" controls the app's own dots and applies instantly.

## Latency and quality
- ✅ Latency measured and minimized. About 2–3 ms on the Mac side; USB is the low-latency path.
- ✅ Resolution and quality presets, plus H.265 (hardware on both sides).

## Connection
- ✅ Survives Wi-Fi drops (the router deauthenticates the phone, which then changes IP): auto-reconnect, a watchdog, and failover to USB.
- Wireless pairing (QR code / pairing code / address) and adb tcpip for older phones are built. The user hasn't tried them yet.

## Unlock
- ✅ Unlock the lock screen by typing the PIN blindly. The PIN screen is FLAG_SECURE, so it shows black in the mirror.
- ✅ Touch ID releases the saved PIN, and the **system prompt appears directly**, with no extra click.
- ✅ Robust: waits on the phone's state instead of fixed delays, uses the failure counter, never retries a wrong PIN, and respects lockouts.
- ✅ **Saved PIN typed directly, no Touch ID** (the user's call, 2026-11-06). Touch ID is optional in Settings → Unlock. **Agent (MCP) unlocks always require Touch ID.**
- ✅ **Fingerprint-sensor phones:** the lock screen shows a fingerprint overlay, and the app taps outside the sensor to reach the PIN pad. Verified: unlock in 4 s.
- ✅ **WhatsApp's own lock (system BiometricPrompt):** detected; the app taps "Use PIN" and types the PIN. Verified end to end. Prompts that accept only biometrics never get the PIN typed.
- After the lock screen opens, if an app lock asks for the PIN next, it is typed once more automatically.
- ✅ **Manual PIN entry is always available** (2026-11-06, "make sure of it"). The unlock dialog always has a PIN field, even with a saved PIN, for app locks with their own PIN.
  - Ways in: "Type PIN…" on the lock banner, ⌥⌘L, and "Type PIN to unlock…" in the strip menu.
  - "Remember" is offered only for the phone's lock screen, never for an app-lock PIN.
- **Unlocking locked apps.** Nothing's `com.nothing.applocker` draws an **overlay window**, so detection uses the focused window as well as the activity.
  - The overlay detection still needs the user to open a locked app to confirm it.

## UI and UX
- ✅ **Default = compact, phone-shaped mirror window.**
  - A thin title strip holds the native traffic lights.
  - The mirror fills the window edge to edge, with a control rail on the right.
  - The aspect ratio is locked to the phone's.
  - The **full view** (devices, settings, toolbar) is one click away (rail button, ⇧⌘M).
- ✅ **Phone frames** (2026-11-06). Settings → Window → Phone frame, a visual picker:
  - Styles: None, Modern (punch-hole), Minimal, Classic (earpiece and home button).
  - Seven finishes.
  - Side buttons work (volume, power), and so does Classic's home button.
  - The compact window takes the exact phone shape (transparent around it); in the full view the phone is centred with a shadow.
  - The designs are generic, not copies of a brand's phone.
  - The pieces around a framed phone match the control strip: dock-style pills behind the traffic lights and the name, a navigation dock under the phone, and the strip aligned with the phone body (2026-11-06).
  - **Precise layout** (2026-11-06). One spacing unit (6 px) everywhere, and all sizes shared between main and the renderer (src/shared/compact-layout.ts).
    - The strip and nav dock attach to the phone's measured position (ResizeObserver), not to the window edges.
    - Verified by measurement at 441×900, 300×640 and 600×700: strip = phone top and height, dock = phone bottom + 6, name pill centred on the phone.
- ✅ Sidebar: docked or floating, collapsible, with sections. The floating panel stays inside the stage.
- ✅ Responsive layout down to 480 px. The toolbar overflows into a menu and the sidebar floats automatically when narrow.
- ✅ Notifications:
  - Compact shadcn-styled toasts on one line with an ellipsis.
  - Clicking a toast opens the notification center with that notice expanded.
  - Warnings (such as the adb version mismatch) appear as in-app notifications with an action.
- ✅ **Home screen (nothing mirrored): keep the existing design, only enhance it** (the user said "the current home screen is best", 2026-11-06).
  - One-click "Mirror <phone> · USB/Wi-Fi" buttons, with the last-used phone listed first.
  - A "Tap Allow" state for unauthorized phones and a missing-adb install hint.
  - With no phone: USB-debugging help and Pair over Wi-Fi; the list updates live.
  - Auto-connect: the last phone, or the only phone the first time, is mirrored when it appears (edge-triggered, so Disconnect stays disconnected).
  - The toolbar hides phone controls and Disconnect when idle.
- ✅ **Compact view: floating control rail** (2026-11-06). The phone (title strip and mirror) is one rounded dark block. The rail is a separate pill, with a **see-through strip** between them. The window is transparent, and the strip doubles as a drag handle. The full view paints its own opaque, rounded background.
- ✅ **Light theme is consistent** (2026-11-06). The stage follows the theme (light grey or near-black), and the empty status strip is hidden when idle. Only the compact phone block is always dark.
- ✅ **The rail shows more controls when there's room** (window height ≥ 680 px): notifications panel, quick settings, screen off, shortcuts. They also stay in the ⋯ menu.
- ✅ **Development without restarts:** `npm run dev` watches everything. React Fast Refresh updates the renderer in place, and edits to main or preload relaunch Electron automatically. Use `npm run dev:debug` for CDP on port 9333.
- ✅ **App settings screen** (⌘, and the gear on the toolbar, plus Settings… in the strip menu) (2026-11-06).
  - General: theme System/Light/Dark, which also sets native UI; the view while mirroring; sidebar style; auto-connect.
  - Display, Audio.
  - Unlock: lock type, saved PIN with Forget, Touch ID.
  - Agents; About: adb versions and Restart adb.
  - Adapts to narrow windows (icon nav; controls wrap).
- ✅ **No duplicates on the compact strip:** the ⋯ menu lists only what the strip doesn't show. The strip is dark, matching the phone block.
- ✅ **Advanced settings for controlling Mob Mirror itself** (not the phone's settings) (2026-11-06).
  - Pages: General, Window, Mirroring, Mouse & keyboard, Unlock, Agents, Advanced.
  - Options: reconnect after a drop, pop-ups (all/errors/none), navigation bar under the phone (the user's drawing), keep window on top, status bar, frame-rate limit, keep phone awake, screen off on start, mouse-button shortcuts, scroll speed and direction, clipboard sync, open screenshot/recording folders, adb restart, reset all settings.
  - Only stream settings (quality, codec, audio, fps, stay awake, clipboard) restart a live mirror. Everything else is instant.
- ✅ **Docked vs floating explained:** below 900 px the sidebar always floats, and the compact view has none. Settings says so, and opens the sidebar when you change it.
- **No feature may require restarting the app.**
  - Settings apply live and are queued.
  - adb is re-detected if it was missing.
  - The adb server can be restarted from inside the app.
  - Mirrors reconnect by themselves.

## Engineering quality (2026-11-06: "consistency, robustness, the best algorithms")
- ✅ **Control queue.** When the control socket backs up, stale touch MOVEs coalesce per pointer (scrcpy's controller design); taps, keys and text are never dropped or reordered.
- ✅ **Fast keyframes.** RESET_VIDEO requests a keyframe on decoder errors and when the decode queue exceeds 6 frames, rate-limited to 1/s. Verified on the device: a keyframe arrives 180 ms after the request, against up to 10 s before.
- ✅ **Reconnect** is event-driven (it retries the moment adb reports the phone), with exponential backoff and equal jitter as the fallback.
- ✅ **adb:** at most 4 commands at once per phone (FIFO); the lock poll is one batched shell round trip instead of three.
- ✅ **Settings:** each field is validated on load (bad or old value: default) and synced across windows.
- ✅ **Error boundary:** a UI crash shows the error with a "Reload window" button instead of a blank window.

## Backlog (ideas the user shared, 2026-11-06; not started)
- Drag and drop, both ways, with resumable transfers (phone → Mac too).
- URL handoff: open a URL copied on the Mac on the phone.
- Notification actions: reply, dismiss and open phone notifications from the Mac.
- Clipboard history with search.
- Quick app launcher for installed Android apps.

## Agents (MCP)
- ✅ Coding agents (Claude Code and others) can control the phone through the local MCP server. It is off by default and protected by a token.
- On hold: no new agent features unless the user asks.
