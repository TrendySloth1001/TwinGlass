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
- **Unlocking locked apps.** Nothing's `com.nothing.applocker` draws an **overlay window**, so detection uses the focused window as well as the activity.
  - The overlay detection still needs the user to open a locked app to confirm it.

## UI and UX
- ✅ **Default = compact, phone-shaped mirror window.**
  - A thin title strip holds the native traffic lights.
  - The mirror fills the window edge to edge, with a control rail on the right.
  - The aspect ratio is locked to the phone's.
  - The **full view** (devices, settings, toolbar) is one click away (rail button, ⇧⌘M).
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
- ✅ Compact frame: the title strip and the rail are one flush surface (no floating card or gaps).
- **No feature may require restarting the app.**
  - Settings apply live and are queued.
  - adb is re-detected if it was missing.
  - The adb server can be restarted from inside the app.
  - Mirrors reconnect by themselves.

## Agents (MCP)
- ✅ Coding agents (Claude Code and others) can control the phone through the local MCP server. It is off by default and protected by a token.
- On hold: no new agent features unless the user asks.
