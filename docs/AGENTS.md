# Controlling the phone from coding agents (MCP)

Twinglass runs a local **MCP server**. Claude Code, Cursor, VS Code and other MCP clients can use it to see and operate the phone.

## Turn it on
1. In Twinglass → Settings → Agents, switch on **Agent access (MCP)**.
2. Click **Copy Claude Code setup** and paste the command into a terminal once:
   ```bash
   claude mcp add --transport http --scope user mob-mirror http://127.0.0.1:38297/mcp --header "Authorization: Bearer <token>"
   ```
3. In Claude Code, run `/mcp` to check that `mob-mirror` is connected. Then ask things like "open WhatsApp on my phone and read the latest message".

Other clients use the same URL and `Authorization` header:
- **Cursor:** `~/.cursor/mcp.json` → `{"mcpServers":{"mob-mirror":{"url":"http://127.0.0.1:38297/mcp","headers":{"Authorization":"Bearer ${env:MOB_MIRROR_TOKEN}"}}}}`
- **VS Code:** `.vscode/mcp.json` → `"servers": {"mob-mirror": {"type":"http","url":…,"headers":{…}}}`

## Where agents work
- **Their own second screen (default).** On the first action Twinglass opens a virtual display of the phone, the **agent screen**. It shows in a window that appears without taking focus, so the user can watch. The user keeps using the phone; nothing the agent does shows on the physical screen.
  - Apps opened there run there.
  - `agent_screen {action:"close"}` ends it (apps move to the phone in the background). It also closes after an idle time (Settings → Agents).
- **The phone's screen:** pass `screen: "phone"` to a tool, or change the default in Settings → Agents.

## Tools
Every touch / read tool takes optional `device` and `screen` ("agent" | "phone").

| Group | Tools |
|---|---|
| Phones | `list_devices`, `device_info` (locked?, app in front, apps on this screen, allowed tools), `phone_details` (SoC, Android build, memory, display, battery, cameras, sensors, codecs…) |
| Agent screen | `agent_screen` open / status / close |
| See | `screenshot` (JPEG, long side 1280 px; **coordinates are in this image's pixels**), `get_ui_tree`, `find_elements` |
| Layout map | `screen_map`: every view in dp (position, size, parent, insets, gaps), layout width/height (match_parent / wrap_content / dp), text size in sp, sampled colours, system bar and keyboard heights, a design summary (type scale, spacing, keylines, repeated items, palette), and an annotated image (numbered boxes with dp sizes, optional dp grid) |
| Act by element | `tap_element`, `set_text` (any language, replaces the field), `wait_for` (appears / gone) |
| Act by coordinates | `tap`, `long_press`, `swipe`, `scroll`, `type_text`, `press_key` |
| Batches | `run_steps`: up to 50 actions in one call, stops at the first failure, optional screenshot at the end |
| Recorded tests | `list_tests`, `run_test`: replay a test the user recorded in Twinglass (Tests view); steps find elements by text or id and wait for the screen to settle |
| Design check | `compare_design`: a Figma frame vs the screen (missing/extra texts; position, width, font size and colour off, in dp/sp). Needs the user's Figma token, added in Twinglass |
| Apps | `list_apps` (names + packages), `launch_app` (name or package), `open_url` (web, mailto, tel, geo, market, app deep links), `stop_app` |
| App testing | `install_apk`, `app_info`, `start_activity` (component, action, data, extras, cold start time), `clear_app_data`, `uninstall_app`, `set_permission`, `get_crashes`, `logcat`, `app_performance` (jank %, frame-time percentiles, PSS, CPU) |
| Conditions | `set_device_state`: dark mode, font scale, animations, density, Wi-Fi, mobile data, airplane mode, fake battery. `reset:true` restores everything it changed |
| Dev servers | `reverse_port` (phone localhost → Mac localhost) |
| Files | `push_file`, `pull_file` (to ~/Downloads/Twinglass), `list_files` |
| Other | `get_notifications`, `set_clipboard`, `record_screen` (~/Movies/Twinglass), `unlock_phone` (Touch ID), `shell` (opt-in), `wait` |

## Reading the screen
- **"Agents read any screen" on** (Settings → Agents): the Twinglass phone app's accessibility service lists elements on any display, the agent screen included.
  - Element refs let `tap_element` / `set_text` act through accessibility actions.
  - **Reliability (2026-11-12, from an agent's field report):** every action (`tap`, `tap_element`, `swipe`, `scroll`, `press_key`, `set_text`, `type_text` with submit) returns only after the screen settles: the phone app's `idle` waits until no window on that display changed for 300 ms (at most 2.5 s; the result says "screen settled" or "still changing"). `tap_element` and `set_text` look for up to 2.5 s before giving up; a plain label presses the clickable row around it; clickable rows without text are labelled with their children's text. `set_text` reads the field back, falls back to clear-and-type, and fails with what the field shows. `scroll` reports whether the content moved (and scrolls the biggest scrollable directly if the drag did nothing). `get_ui_tree` leaves out the keyboard and status/navigation bars unless `system: true` (`keyboardOpen` tells). `unlock_phone` also answers an app's PIN / fingerprint prompt on the phone's screen (Android's BiometricPrompt "Use PIN", app locks); a prompt on the agent screen can't be answered.
  - Requests travel over adb only (`am broadcast` to a receiver that requires the DUMP permission). The answer comes back as the broadcast result.
- **Off:** `get_ui_tree` uses `uiautomator dump`, which only sees the phone's own screen. On the agent screen, agents then use screenshots and coordinates.

## Settings → Agents
- **Agents work on:** their own second screen, or the phone's screen.
- **Agent screen size:** phone 1080×2400, same as the phone, or tablet 1600×2560.
- **Close the agent screen when idle:** never, or after 5, 15 or 30 minutes.
- **What agents may do:**
  - files and installs (on)
  - clearing, uninstalling and permissions (on)
  - phone settings (on)
  - shell commands (**off**)
- **Undo agents' phone setting changes:** puts back everything changed by `set_device_state`.

## How input is sent
- **Agent screen, or an open mirror:** the scrcpy control socket. It's fast, and identical to the user's own mouse.
- **Phone screen without a mirror:** `adb shell input …`, which is slower and can't type non-ASCII text (use `set_text`).

## Security
- **Off by default.** It listens on `127.0.0.1` only, and Host/Origin validation blocks DNS-rebinding from web pages.
- **Every request needs the bearer token,** a random 256-bit value compared in constant time.
  - It's stored in `~/Library/Application Support/mob-mirror/agent.json`, mode 600.
  - The page never sees it: the setup command is copied to the clipboard by the main process.
  - **New token** (↻) revokes old configs.
- **Every agent action shows** as "Agent: …" on the mirror.
- **Agents can't unlock without your fingerprint.**
- **Turning Wi-Fi off or airplane mode on is refused** while the phone is connected over Wi-Fi only (it would cut the link).
- **Twinglass' own phone app** can't be cleared or uninstalled through the tools.
- **Secure screens are captured black** (FLAG_SECURE): PIN entry, banking apps, DRM video.

## Tips for agents
- Use a loop: **screenshot, act, screenshot**. Prefer `get_ui_tree` centres over guessing coordinates from pixels.
- Tap a text field before calling `type_text`.
- After launching an app or navigating, `wait` 500–1500 ms, then take a screenshot.
