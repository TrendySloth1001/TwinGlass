# Changelog

Twinglass for Mac and the Twinglass phone app ship together: each Mac release carries the phone app listed with it.

## [0.1.4](https://github.com/TrendySloth1001/TwinGlass/releases/tag/v0.1.4) · 2026-11-12 · Room for the mirror

Fixes the mirror being squeezed into a narrow column when the side bar floats over it.

### Twinglass for Mac 0.1.4

- With a floating side bar, the mirror, tab and controls fill the window again instead of a narrow column on the left.
- The floating side bar stops above the status bar.
- Breadcrumbs no longer run into the phone controls in narrow windows.

### Phone app 0.8.2

- No changes in this release: 0.8.2 is still the current phone app.

## [0.1.3](https://github.com/TrendySloth1001/TwinGlass/releases/tag/v0.1.3) · 2026-11-12 · A familiar workbench

Twinglass for Mac now looks and works like VS Code: an activity bar, an explorer for your phones, the phone as an editor tab and a status bar that shows what's live.

### Twinglass for Mac 0.1.3

- VS Code-style workbench: a title bar with a command center that opens the palette, and an activity bar for Phones, opening an app, clipboard history, second screens, Agents, shortcuts and Settings.
- Phones sit in an explorer-style tree: one row per way to reach the phone (USB, Wi-Fi), with an inline Mirror button, or double-click.
- The mirrored phone is an editor tab (close it to disconnect), with breadcrumbs and the phone's controls underneath.
- A status bar with a blue phone indicator and the stream's resolution, frame rate, codec, latency and audio.
- VS Code's Light Modern and Dark Modern colours, the system font, square corners and a blue accent across every dialog and menu.
- The compact, phone-shaped mirror keeps its layout.

### Phone app 0.8.2

- No changes in this release: 0.8.2 is still the current phone app.

## [0.1.2](https://github.com/TrendySloth1001/TwinGlass/releases/tag/v0.1.2) · 2026-11-12 · Agents that don't trip

Coding agents act on settled screens, find what they're told to press, and never report a change that didn't happen.

### Twinglass for Mac 0.1.2

- Every agent action returns only after the screen settles, so the next step never lands mid-transition.
- tap_element and set_text keep looking for up to 2.5 s while menus and pages open.
- A plain label presses the row or button around it; rows without text are named by the text inside them.
- set_text reads the field back, falls back to clear-and-type, and reports what the field shows if it still doesn't match.
- scroll says whether the content moved, and scrolls the list directly when a drag does nothing.
- Element trees leave out the keyboard and the status and navigation bars (system: true brings them back).
- unlock_phone answers an app's PIN or fingerprint prompt on the phone's screen, still only after Touch ID.
- About and What's new pages in Settings.

### Phone app 0.8.2

- Tells the Mac when a screen has finished changing, per display.
- Names clickable rows that have no text of their own.
- About and What's new pages in Settings.

## [0.1.1](https://github.com/TrendySloth1001/TwinGlass/releases/tag/v0.1.1) · 2026-11-09 · Updates by themselves

Both apps now update without a trip to GitHub, and a forgotten Mac is one tap away from linking again.

### Twinglass for Mac 0.1.1

- Updates itself: checks for new releases, verifies the download's SHA-256, swaps the app in place and reopens.
- Carries the newest phone app and offers it when a connected phone has an older one.
- Links a phone again as soon as the phone allows it, without re-plugging.
- Settings → Phone app always offers Pair or Relink.

### Phone app 0.8.0

- Update available on Home: installed by the Mac in Developer mode, downloaded from the Mac over Wi-Fi otherwise. The phone app never goes online for it.
- Link now and Link again on Home after a forget; the forgotten Mac is named, with Pair again in Wi-Fi mode.

## [0.1.0](https://github.com/TrendySloth1001/TwinGlass/releases/tag/v0.1.0) · 2026-11-08 · First release

Mirror and control Android phones from your Mac over USB, wireless debugging or plain Wi-Fi.

### Twinglass for Mac 0.1.0

- Hardware-decoded mirroring with mouse, keyboard, clipboard, drag and drop, screenshots and recordings.
- Second screens: independent virtual displays of the same phone, each in its own window.
- Unlock with a saved PIN, protected by Touch ID.
- MCP server with 42 tools for coding agents, working on their own second screen.
- Wi-Fi, no setup: pair a phone with a QR code and mirror over an encrypted link, no developer options.
- Install from the terminal or with Homebrew.

### Phone app 0.7.0

- Wi-Fi mirroring without developer mode (screen capture, hardware H.264, AES-256-GCM).
- Control from the Mac through accessibility; QR pairing; two-way forget.
- Device details in 12 groups, Share to Mac from any app, element access for agents on any display.
