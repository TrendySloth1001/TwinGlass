# Product requirements: everything agreed with the user

> **The product is called Twinglass** (renamed from "Mob Mirror" on 2026-11-06).
> - Checks: no app or software found with the name; twinglass.io unregistered; .com registered, maybe parked; GitHub has one unrelated repo.
> - Icon A, "glass panes" (build/icon.svg): a frosted phone pane in front of an outlined screen pane on an indigo-violet squircle. Used for the app icon, a matching menu bar template icon and the companion launcher icon.
> - Internal ids are unchanged (see CLAUDE.md → Naming).

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
- **Home screen: its own design, inspired by an editor's welcome page** (2026-11-06; the user: "take the inspiration only, not exactly the same").
  - Header: app mark, name, tagline, and a live status pill (connected / waiting for Allow / looking / setup needed).
  - Main column:
    - **Your phone** hero card: a mini phone in the chosen finish; facts as chips (maker, Android, battery, links); a big Mirror pill plus USB / Wi-Fi / New window / Add Wi-Fi.
    - **Quick actions** tiles: ⌘K apps, ⇧⌘V clipboard, Pair over Wi-Fi, Shortcuts.
  - Side column:
    - **Recent phones** (status dot, one-click reconnect; `recentDevices` setting).
    - **Guides** accordion (USB, wireless, unlock, mouse & keyboard).
    - An auto-connect switch.
  - Plain background; the editorial serif font, illustration and doodles were removed.
  - **Simplified cards** (user: "make the cards more simple"): one muted facts line instead of chips, plain-row quick actions, flat lists, no shadows or tinted icon boxes, plain status text.
  - The phone section has **no card** (user: "remove card, not required"). **Mirror button:** a simple solid button (play icon, "Mirror", link), per the user.
  - **Recent captures** (newest screenshots and recordings with Quick Look thumbnails; click opens, right-click reveals; both the Twinglass and old Mob Mirror folders).
  - **Only mirroring-relevant content on the home screen** (user: "don't show irrelevant features"). Phone stats (storage, display, IP), the without-mirroring controls and tips were tried and removed, together with their backend.
- (Previous:) **Home screen, editorial layout** (2026-11-06, from the user's reference image).
  - A large serif headline (Fraunces, bundled for offline use) written as a sentence with **live widgets inline**: the phone chip (name and battery; click = mirror), mouse, keyboard, ⌘L.
  - Each state gets its own sentence: phones ready, waiting for "Allow", no phone (USB cable / Wi-Fi pair chip), adb missing.
  - Below it: pill buttons (Mirror, Over USB / Wi-Fi, New window, Connect over Wi-Fi) and quiet text links (Open an app ⌘K, Clipboard history, Pair over Wi-Fi, Settings).
  - **An original hand-drawn illustration** on the right: a laptop mirroring the phone beside it, a cable, a pink cursor tapping. Ink follows the theme.
  - A plain background with faint floating doodles. Stacks on narrow windows.
- (Previous version:) ✅ **Home screen rebuilt for better UX** (2026-11-06).
  - One card per phone:
    - a phone picture in the chosen frame finish
    - name, maker, Android version, battery and charging (refreshed every 30 s), USB / Wi-Fi, and a "Last used" tag
    - actions, all as buttons (no ⋯ menu, per the user): **Mirror** (best link), **Mirror over Wi-Fi / USB** (the other link), **New window**, **Connect over Wi-Fi** (USB-only phones).
  - A shortcut strip: ⌘K Open an app, ⇧⌘V Clipboard, ⌘, Settings, Add a phone over Wi-Fi.
  - Guidance cards for no phone, a phone waiting for "Allow", and missing adb. Responsive down to 520 px.
  - **Background**, kept simple at the user's request: a soft centre glow plus four faint rings drifting outward across the window. Theme-aware and still with Reduce motion (components/stage-backdrop.tsx).
- (Earlier:) **Home screen: keep the existing design, only enhance it** (the user said "the current home screen is best", 2026-11-06).
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

## Second screens (2026-11-07, user: "two instances of the same phone")
- ✅ **Run another app on a separate screen of the same phone while using the phone normally.**
  - How: scrcpy `new_display=1080x2400/420` (a virtual display), `vd_destroy_content=false` (apps move to the phone on close), `display_ime_policy=local` (keyboard on the second screen). The app is opened with START_APP once the screen is up.
  - Each second screen is its own Mac window ("A024 · Second screen"); several at once work.
  - Entry points: **Second screen** on the home screen, ⌘K → "Open a second screen…", the Phone menu (⌥⌘N). The app picker works before mirroring too (apps listed by phone).
  - **Verified on the A024:** Calculator on display 372 and Clock on display 373, while the physical display 0 kept its app; the user went on using WhatsApp throughout.
  - Limits: one app can't be on two screens at once; audio and notifications are shared; some apps refuse non-default displays.
  - **Whole phone on the second screen** (user: "a whole phone, directly; same account but second").
    - Nothing OS's secondary-display launcher is only a wallpaper (no apps; a swipe up does nothing; verified), so Twinglass shows its own **app grid** as that screen's home screen: searchable, all apps, ↵ opens the top match.
    - The grid opens when a whole-phone second screen starts; **Home** on that screen brings it back; an **Apps** button sits on the strip.
    - The home page's **Second screen** opens a whole phone directly; ⌘K → Open a second screen still opens one chosen app.
    - Type-checked; awaiting the user's own try (they were using second screens themselves, e.g. com.sparky.app).
  - **Options visible in every layout** (user: "i am not getting the option"): full view's top bar now has **Second screen** (normal windows) and **Apps** (second-screen windows); the compact strip's ⋯ menu has "Open a second screen" too.
    - Fixed "Could not read the app list": two loads at once (React dev double mount) collided on the lister jar. One listing per phone now; the error shows only when no list loaded.
  - **Real app icons** (user: "use real icons instead of just buttons"):
    - The Twinglass phone app (companion v0.2.0) draws each launcher icon (IconReceiver, DUMP-guarded like LinkReceiver, `<queries>` for launcher apps) and POSTs PNGs to the Mac over the companion link (key-checked).
    - The Mac caches them per phone in userData/app-icons/<device id>/ (package-name and PNG-signature checked). The app grid and ⌘K show them; letter tiles stay as the fallback.
    - Without the phone app the grid offers **Install**, which installs it only on that click (the user had uninstalled it).
    - ✅ Verified on the A024 (user said "you do it": phone app v0.2.0 installed): 85 of 88 apps got real icons in 6 s.
    - When another Twinglass already holds port 47123 (e.g. the installed app beside a dev build), the link falls back to a free port; the phone is told the port on every link.
  - **App switcher on second screens** (user: "no app switch option"): Android's Recents shows "No recent items" on a second screen, so there **Recents** opens Twinglass' own switcher.
    - It shows the apps open on this screen, front first. It also shows the apps open on the phone ("move here"). A click brings the app to this screen.
    - How it works: the display id comes from the server's "New display: … (id=N)" log. The apps come from that display's section of `dumpsys activity activities`.
    - ✅ Verified: display 444 listed Calculator; picking Clock moved it from the phone to the second screen.
- ✅ **Fixed: windows opened for a phone stuck at "Starting mirror…"** in development. StrictMode's double mount ran the mirror hook's cleanup, which cancelled the connect that had just started. Auto-connect is now scheduled and cancelled in cleanup.

## Scope decision (2026-11-06)
- **Removed at the user's request:** "Mac screen on phone" and "phone as second display". That covers the streaming server, the virtual-display and touch-input helpers, the phone viewer page, the companion viewer and its share buttons, the menu and ⌘K actions, and the status pill.
- **Mob Mirror focuses on mirroring and controlling the phone.** The code is in git history (last at commit 5dcf91d) if it's ever wanted back.
- **The companion app stays** (automatic pairing, connection status, Settings → Phone app) as the base for planned features such as notifications.
- The items below about Mac screen, extend, latency and touch → Mac are kept as a record of what was built and measured.

## Desktop integration (asked 2026-11-06: "start building all of the above")
- ✅ **⌘K command palette** (also the search button on the strip and toolbar).
  - Phone apps with real names, from scrcpy-server's `list_apps` mode (about 0.75 s, cached for 5 minutes). ↵ opens the app.
  - Paste a link → **Open on phone**. Any text → **Copy / Paste to phone**.
  - Recent clipboard items and phone actions.
  - Verified: "calc" → Calculator, "whats" → WhatsApp, a link → open, other text → copy; launching Calculator brought it to the front.
- ✅ **Clipboard history** (⇧⌘V): Mac and phone copies, labelled by source. It is in memory only (max 100 items), skips password-manager copies (nspasteboard concealed types), and can be turned off in Settings → Mouse & keyboard. Verified.
- ✅ **Send Mac clipboard to phone** (⇧⌘O): a link opens on the phone; anything else lands in its clipboard.
- ✅ **Menu bar icon:** phones with battery % and charging state, connection type, Mirror / Show mirror, Tile windows, Launch at login, Quit. Toggle it in Settings → General.
- ✅ **Launch at login** (Settings → General, and the menu bar icon).
- ✅ **Tile mirror windows** (Window menu, ⌥⌘T): side by side, equal height, each keeping its shape.
- ✅ **Background errors** are logged and shown as a notification instead of Electron's blocking error dialog.
- ✅ **Palette ranking** is our own (exact > prefix > word > substring > tight fuzzy). Verified Enter targets: calc → Calculator, home → Home button, mac screen → share action, a link → open, other text → copy.
- ✅ **Mac screen on the phone (prototype, 2026-11-06).**
  - How it works: screen → hardware H.264 (WebCodecs, realtime) → a local server (127.0.0.1 with a random token) → `adb reverse` → the phone's Chrome page (WebCodecs decode, full screen).
  - Start it with ⌥⌘P, ⌘K → "Mac screen", or the Phone menu. A status pill with Stop shows while it runs.
  - ✅ **Verified end to end on the A024** (2026-11-06): the live Mac screen showed in the phone's Chrome over `adb reverse`, with 1 viewer. Screen Recording had to be granted for Electron first (System Settings → Privacy & Security → Screen Recording; add it with ⇧⌘G to `node_modules/electron/dist`), then the app restarted.
- ✅ **Latency over USB (Mac → phone Chrome, measured 2026-11-06).** Capture → drawn: p50 **43 ms**, p95 **~53 ms**, at about 58 fps and 1846×1200. Breakdown: encode ~9 ms, link round trip 4 ms, **phone decode ~30 ms** (Chrome's decoder holds about one frame: the biggest cost, and why the companion app uses MediaCodec in low-latency mode).
- ✅ **Phone as a second display (extend), verified.**
  - A native helper (`native/virtual-display`, private `CGVirtualDisplay` as DeskPad and BetterDisplay use) creates a display shaped like the phone, landscape at 2× (1400×630 pt = 2800×1260 px).
  - It is placed **right of the main screen, vertically centred** (public `CGConfigureDisplayOrigin`), so the pointer crosses the middle of the right edge.
  - The phone is held in landscape while it runs, and everything is restored on Stop.
  - Start: ⇧⌥⌘P, or ⌘K → "second display".
- ✅ **Touch → Mac mouse.**
  - `native/input` (public CGEvent API) plus `POST /input` on the share server: tap = click, drag, long press = right click, two fingers = scroll.
  - Needs the macOS **Accessibility** permission for Electron.
  - Built; it is driven by the companion app.
- ✅ **Companion app** (`companion/`, Kotlin, package `com.mobmirror.companion`).
  - Built: Gradle 8.11.1 wrapper with a pinned SHA-256, AGP 8.7.3, minSdk 29, target 35. Commands: `npm run companion:build` / `companion:install`.
  - Installed on the A024; Mob Mirror opens it automatically, with Chrome as the fallback.
  - **Verified:** extend at full 2800×1260 is **p50 40 ms / p95 45 ms** (Chrome: 43 / 53 ms at 1846×1200).
  - **Touch → Mac verified:** a tap at the phone's centre put the Mac pointer at (2499, 583), the second display's centre. Accessibility granted.
  - ✅ **"Connect back to my Mac" from the phone** (2026-11-06).
    - The link service is `127.0.0.1:47123`, reversed to every phone with the app. It pairs automatically: the Mac's secret key reaches only the app, through an adb broadcast to a receiver that requires DUMP.
    - Companion home screen: status dot plus Mac name; **Show Mac screen**, **Use as second display**, **Open viewer**, **Stop sharing**. The viewer offers **Reconnect** when the stream drops.
    - Verified: tapping Show Mac screen on the phone started the share on the Mac (1 viewer), and Stop sharing on the phone stopped it.
  - ✅ **Mac Settings → Phone app:** per phone, installed version and paired state, **Install / Update** (bundled APK) and **Pair**.
- ✅ **Updates: notify-only.**
  - Verified fact: Squirrel.Mac / electron-updater can't auto-install an unsigned app.
  - The app checks GitHub Releases (package.json `mobMirror.updateRepo`) or a JSON feed daily, and offers Download. Settings → Advanced → Check now.
  - Switch to silent updates once the app is signed.
- **Companion Android app (the user plans to build it).** It unlocks what adb can't:
  - notification reply and dismiss (NotificationListenerService)
  - richer file access and resumable transfers
  - a proper Mac-screen viewer with touch-to-Mac input
  - phone status (battery, network) pushed live

  Planned link: a socket through `adb forward/reverse` (USB) or the LAN, sharing a versioned message protocol with this app.
- Next, in order:
  1. Two-way file transfer with progress and **resume**: a custom chunked protocol over `adb exec-in/exec-out` with `dd` offsets, because adb push/pull can't resume.
  2. Phone notifications on the Mac (read via `dumpsys notification`; clicking one opens the app). **Reply/Dismiss need a companion app on the phone.**
  3. Recording upgrades: taps drawn into the video, trim, GIF export.
  4. Keyboard mapping for games.
  5. Webcam mode: the phone camera in a window (scrcpy `video_source=camera`). A system-wide Mac camera needs a signed Camera Extension.
  6. **Mac screen on the phone:**
     - mirror first (capture → hardware H.264 → the phone's browser over `adb reverse`/Wi-Fi; touch controls the Mac with the Accessibility permission)
     - **extend** second (virtual display via the private `CGVirtualDisplay`, as DeskPad and BetterDisplay do; a dummy HDMI plug is the fallback)
  7. App icon and first-run onboarding.
  8. Signed app and auto-update. **This needs the user's Apple Developer account.**
## Agents (MCP)
- ✅ Coding agents (Claude Code and others) can control the phone through the local MCP server. It is off by default and protected by a token.
- On hold: no new agent features unless the user asks.

## Phone app (companion) v0.3.0 and phone details (2026-11-07)
- User: "make the companion app better using native Android components, and show all the API details of the phone, both sides".
- **Phone app:**
  - Rebuilt with Jetpack Compose + Material 3, using Material You colours on Android 12+.
  - Screen: a large top app bar (refresh, copy all), a connection card, a summary (model, Android and API level, chips for RAM, storage, battery and refresh rate), and collapsible detail cards. Long-press a row to copy it.
- **Details:**
  - Read by `DeviceInfo.kt` from Android APIs. No runtime permissions; ACCESS_NETWORK_STATE is install-time.
  - 12 sections: device and SoC, Android (API level, security patch, build, kernel, uptime, fingerprint), CPU, memory and storage, display, battery, cameras, sensors, video codecs, network, features, region.
- **Mac:**
  - The **Phone details** window opens from the home screen (Details), the device ⋯ menu, the strip ⋯ menu and the full-view ⋯ menu.
  - It has a filter, click-to-copy and Copy all. The data is the same list as on the phone, sent by InfoReceiver (DUMP-guarded) to POST /link/info and validated on the Mac.
  - Without the phone app (or with an older one), it falls back to adb (getprop, battery, wm, meminfo, df) and offers Install or Update.
- ✅ Verified on the A024: 12 sections came from phone app 0.3.0, and the Compose UI renders in Material You dark.

## Agents on their own second screen + a much stronger MCP (2026-11-07)
- User: "optimize the app to always use the secondary display of the phone and make the MCP powerful as hell", then "add everything that u would love to have while testing an android app", then "add options to the settings as well".
- ✅ **Agent screen:**
  - Agents act on their own virtual display by default (`screen: "agent"`). It opens by itself without taking focus, in a window titled "A024 · Agent screen".
  - The user's own second screens are never handed to agents. `screen: "phone"` targets the physical screen.
  - Verified: Calculator 7×6=42 via `run_steps` while the user's phone stayed on Instagram; Chrome opened there via `open_url`.
- ✅ **Phone app 0.4.1:**
  - It adds AgentService (accessibility) and AgentReceiver (DUMP-guarded; answers through the `am broadcast` result).
  - Element tools work on the agent screen. Verified: `tap_element` "9", "plus", "3", "equals" gave 12.
  - The user agreed to switch the service on (2026-11-07).
- ✅ **Tools:**
  - agent_screen, find_elements, tap_element, set_text, wait_for, run_steps, open_url (deep links), stop_app
  - get_notifications, logcat, push/pull/list files, install_apk, set_clipboard
  - shell (opt-in), phone_details, app_info, start_activity (verified cold start 228 ms)
  - clear_app_data, uninstall_app, set_permission, get_crashes, app_performance (verified frames, PSS)
  - set_device_state (verified: animations and battery set, then reset restored scale 1.0 and battery 42%; Wi-Fi-off refused on a Wi-Fi-only link)
  - reverse_port, record_screen (verified: saved an .mp4)
- ✅ **Settings → Agents:**
  - Choices: agents work on (second screen / phone), agent screen size (phone / same as phone / tablet), idle close (never / 5 / 15 / 30 min).
  - Switches: "Agents read any screen", files and installs, clearing/uninstalling/permissions, phone settings, shell (off by default).
  - Button: undo agents' phone setting changes.
- Fixed along the way: companion-link fallback ports piled up as adb reverse entries on every restart. Old ports are now removed on link.

## Performance pass (2026-11-08, user: "implement all of em")
- ✅ **adb over the server socket:** shell, push, get-state, forward/killforward, reverse and devices-l. Falls back to the adb program if the socket is refused. The connection check uses the socket too.
- ✅ **Server push over the socket.** The planned "skip the push" was wrong: the server deletes its jar on start (see FACTS), so it is pushed every time, just faster.
- ✅ **Agent screenshots as a scaled JPEG from the window:** 84 → about 57 ms.
- ✅ **Video frames drawn once per screen refresh (newest only), not while hidden.** Recording, screenshots and agent captures flush the newest frame first.
- ✅ **Lazy-loaded dialogs and overlays:** startup bundle 611 → 460 KB.
- ✅ **Home and status-bar timers pause while the window is hidden** (useVisibleInterval).
- ✅ **Phone app release build** 1.8 MB (was 22 MB); `npm run companion:build` builds it, and the Mac installs it.
- Not done, on purpose: removing the video copy from main to the window (not possible with Electron 45 MessagePortMain; negligible cost).

## Wi-Fi latency + screen map (2026-11-08)
- User: "optimize scrcpy for latency in wireless", and "give MCP a precise MAP of the screen… so when it builds UI it does not assume but has proper dimensions".
- ✅ **Latency:** measured instead of guessed (FACTS: Wi-Fi latency).
  - No stream setting measurably beats the current one on the user's link. The Mac pipeline is about 12 ms; the Wi-Fi radio is healthy.
  - Kept: refresh-paced drawing.
  - Added: `videoCodecOptions` support and a repeatable benchmark (test/bench).
  - Remaining delay: the phone's capture and encode, plus Wi-Fi air time. Nothing in Twinglass can tune these further.
- ✅ **screen_map MCP tool** (phone app 0.5.0 `map` op):
  - JSON in dp: boxes, parents, insets, gaps, layout params, text sizes in sp (font scale applied), sampled colours, system bars, keyboard.
  - A design summary, and an annotated image with non-overlapping labels and an optional dp grid.
  - Verified on Settings: 18sp / 14sp, 52 dp rows ×11, keylines 0 / 64.5 dp, two-colour palette.

## Phone app 0.6.0: a usable companion with real foundations (2026-11-08)
- User asks:
  - "build the whole app more better… inspiration from my sparky project" (the phone app was meant)
  - "use normal font only"
  - "make the phone app practically usable… settings, device details, connected to"
  - "add more controllable settings as much as possible"
  - "build the advanced settings as well both the sides"
  - "header section is transparent"
- ✅ **Design:** Sparky's language ported to Compose (ui/Theme.kt, Components.kt, Controls.kt).
  - Black / warm off-white surfaces, red accent for on/live states.
  - Space Grotesk only (the user asked for one normal font; no dot-matrix figures, no mono).
  - Android 16 grouped cells, dot grid, dot meters, spring motion.
  - A solid backdrop under the status and navigation bars. Bar icons follow the app theme.
- ✅ **Screens:**
  - Home: link hero with live ping, mirroring state and link type; phone at a glance; quick actions.
  - Device: searchable details.
  - Settings, plus pushed Connected to and Advanced pages, with a floating pill nav.
- ✅ **Share to Mac** (ShareActivity): text → Mac clipboard; files streamed (up to 2 GB) → ~/Downloads/Twinglass, with a Mac notification. Send clipboard to Mac from Home.
  - Mac endpoints: /link/status (rich), /link/clipboard, /link/file. All key-checked; file names sanitised (verified: "../../etc/evil.txt" → evil.txt in Downloads/Twinglass); notify=0 supported.
- ✅ **Settings (each one honoured):**
  - Appearance: theme, text size, dot grid, reduce motion, haptics.
  - Home: open on, tiles, quick actions, link refresh.
  - Details: units (GB / GiB), copy format (Text / Markdown / JSON).
  - Share: show in share sheets (component switch), close after sending, ask over N MB, notify on Mac, date in file names.
  - What the Mac may use: details, icons, agent requests (component switches enforced by Android); Read any screen.
  - Connection: Connected to, copy diagnostics, forget.
  - Keep screen on; About (licences, reset).
- ✅ **Phone Advanced:** link timeout, agent max elements, layout/text-size info, sensors / codecs in details, icon size cap, debug logging (logcat "Twinglass"), copy diagnostics, Android app info.
- ✅ **Mac Advanced:**
  - Video: bitrate / resolution overrides, decoder hardware / software.
  - Second screens: size (phone / tablet / landscape), keep apps when closing (vd_destroy_content).
  - Connection: reconnect window (30 s / 90 s / 5 min).
  - Dropped files: phone folder.
  - Copy diagnostics.
  - Agents page → Advanced: screenshot size (1024 / 1280 / 1600), JPEG quality, MCP port (server restarts).
- ✅ **Agent fixes found while testing:**
  - device_info's lock check used the wrong line; it now uses parseKeyguardShowing.
  - launch_app on the agent screen moves the app's task there if it was on the phone's screen (cmd activity display move-stack), and refuses while the phone is locked (Android shows no apps on any display then).
- Mistake, fixed at once: a test launch while the phone was locked put the phone app on the user's own screen. It was moved to the agent screen; the cause is fixed above.

## Two ways to connect + landing page + bottom sheets (2026-11-08)
- User: "let's build those both options… keep the user exp ux in mind… a landing page… a bottomsheet popup to ask for additional features… think as product designer".
- ✅ **Phone app:**
  - Landing page on first run ("Your phone, on your Mac."), with a choice between "Wi-Fi, no setup" (recommended) and "Full control" (Developer mode); switchable in Settings → Connection → Connect with.
  - Bottom sheets, one ask at a time when needed: pair (pick a Mac found on the Wi-Fi, then the code), before Android's screen-share prompt, control from Mac (accessibility), notifications, and the Developer-mode upgrade (3-step guide).
  - No-setup Home: hero card with "Mirror to Mac" / "Stop mirroring", plus "Unlock more" cells with ON / SET UP states.
- ✅ **Mac:**
  - "Add phone" bottom sheet: Wi-Fi path first (QR to download the phone app from this Mac over the Wi-Fi, a big 6-digit code with a countdown, auto-confirmation when paired) or Developer mode.
  - Paired no-setup phones listed on Home with live states (offline / ready / sharing / mirroring) and Forget.
  - The empty state leads with "Add phone".
  - A phone's "Mirror to Mac" opens a window by itself; ending it on the phone is a clean stop (no reconnect loop).
- ✅ **Verified:** protocol interop (vitest + JUnit vectors), mDNS advertisement, full Mac flow with a fake phone (pairing, wrong code, encrypted session, auto window, H.264 decoding).
- ⏳ **Real phone flow:** waiting for the user (screen-share consent is the user's own tap).
- ⏳ **Packaged DMG:** bundle the phone APK (extraResources → mob-mirror-companion.apk) so "Get the app" works outside development.
- ⏳ **Next:** the Electron UI update.

## Forgetting is two-way (2026-11-08, user: "when user forgets from any one place must be forgotten from both the devices, make sure of it")
- ✅ **Mac → phone:**
  - Phone connected: the Mac sends "forget" first and the phone drops the pairing at once (any session: presence or mirror).
  - Phone offline: its next connection is answered "unknown" and the phone drops the pairing. The phone app checks on every open (presence connection), so it shows right away.
- ✅ **Phone → Mac:** the phone sends an authenticated "forget" before dropping its secret. If the Mac is unreachable, the request is kept (pending.*) and delivered the next time the app opens and the Mac is reachable; "unknown" also counts as done.
- ✅ Both sides confirm first ("removed on this Mac and on the phone") and report whether the other side was told now or will be later.
- ✅ **Developer mode:** "Forget this Mac" blocks the Mac's automatic re-link over adb until "Link again", so a forget isn't silently undone.
- ✅ **Verified with fake phones:** (1) Mac forget → phone received "forget", gone from the list; (2) phone "forget" → gone on the Mac; (3) offline → next hello answered "unknown".
- 🟡 **Reconnect after a forget is on Home** (2026-11-08, user: "no option to reconnect when devices forget each other on homescreen"): Wi-Fi mode shows FORGOTTEN with the Mac’s name, who forgot whom (or that the Mac hears about it later), and **Pair again** / **Not now**; Developer mode shows **Link again** on the home card. Built; not yet checked on the phone.
- ✅ **Presence:** while the phone app is open in Wi-Fi mode it stays connected, so the Mac shows "Ready" truthfully. It reconnects after drops and closes when the app goes to the background.
- ✅ shadcn alert-dialog added with the pinned CLI; the button override was declined and the CLI's stray `cn` npm dependency removed (ADR-7).

## Updates for both apps (2026-11-09, user: "how can users pull new updates on both the apps think and apply that as well")
- 🟡 **Mac self-update:** checks GitHub Releases (launch + every 6 h), offers Update once per version, installs in place with SHA-256 verification and relaunches; Settings → Advanced → Updates; falls back to the download page when it can't write its folder. Cask `auto_updates true`.
- 🟡 **Phone app from the Mac (no internet on the phone):** the Mac bundles the newest phone app with its versionCode.
  - Developer mode: Mac toast "Phone app update for <model>" → adb install; Settings → Phone app shows Update; the phone's Home "Update available" → POST /link/update → Mac installs and reopens the app.
  - Wi-Fi mode: the phone's hello carries appCode; the Mac answers "update"; Home "Update" → get-update → Mac serves the APK on the LAN (10 min) → browser download → Android installer.

## Link back after a forget (2026-11-09, user: "there is still no way to link back")
- 🟡 Phone Home: **Link now** (not paired / unreachable) and **Link again** (forgotten) ask the Mac over the adb tunnel (POST /link/request, unauthenticated, rate-limited; the key still only travels over adb to the DUMP-protected receiver). The Mac retries phones that answered "blocked" every 3 s, and Settings → Phone app always offers Pair/Relink.

## MCP reliability (2026-11-12, an agent's field report relayed by the user)
- 🟡 Actions wait for the screen to settle (phone app `idle`, per display); element lookups retry for 2.5 s; plain labels press their clickable row; text-less clickable rows are named by their children; `set_text` verifies (clear + type fallback, fails honestly); `scroll` reports movement; `get_ui_tree` hides keyboard / system bars by default; `unlock_phone` handles in-app credential prompts. Unit-tested; phone ops checked on the locked phone only (idle, inner labels). Needs Mac 0.1.2 + phone app 0.8.1 to reach the user's agents.
