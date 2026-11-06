# Controlling the phone from coding agents (MCP)

Mob Mirror runs a local **MCP server**. Claude Code, Cursor, VS Code and other MCP clients can use it to see and operate the phone.

## Turn it on
1. In Mob Mirror's sidebar, switch on **Agent access (MCP)**.
2. Click **Copy Claude Code setup** and paste the command into a terminal once:
   ```bash
   claude mcp add --transport http --scope user mob-mirror http://127.0.0.1:38297/mcp --header "Authorization: Bearer <token>"
   ```
3. In Claude Code, run `/mcp` to check that `mob-mirror` is connected. Then ask things like "open WhatsApp on my phone and read the latest message".

Other clients use the same URL and `Authorization` header:
- **Cursor:** `~/.cursor/mcp.json` → `{"mcpServers":{"mob-mirror":{"url":"http://127.0.0.1:38297/mcp","headers":{"Authorization":"Bearer ${env:MOB_MIRROR_TOKEN}"}}}}`
- **VS Code:** `.vscode/mcp.json` → `"servers": {"mob-mirror": {"type":"http","url":…,"headers":{…}}}`

## Tools
| Tool | What it does |
|---|---|
| `list_devices`, `device_info` | Phones, Android version, battery, foreground app, coordinate space |
| `screenshot` | JPEG with the long side at 1280 px. **All coordinates are in this image's pixels.** Uses the live mirror frame (~240 ms) or `adb screencap` (~2 s) |
| `get_ui_tree` | On-screen elements (text, id, type, clickable) with `center` coordinates to tap. Can fail while the screen animates |
| `tap`, `long_press`, `swipe`, `scroll` | Touch input |
| `type_text` | Types into the focused field (non-ASCII via clipboard paste); `submit` presses Enter |
| `press_key` | back, home, recents, enter, delete, volume, power, dpad… |
| `list_apps`, `launch_app` | Installed packages; open an app by package |
| `unlock_phone` | Uses the PIN the user saved in the app. **The user must approve with Touch ID.** The agent never sees the PIN |
| `wait` | Pause, up to 10 s |

## How input is sent
- **With a mirror session open:** input goes through the scrcpy control socket. It's fast, and identical to the user's own mouse.
- **Without one:** it falls back to `adb shell input …`, which is slower and can't type non-ASCII text.

## Security
- **Off by default.** It listens on `127.0.0.1` only, and Host/Origin validation blocks DNS-rebinding from web pages.
- **Every request needs the bearer token,** a random 256-bit value compared in constant time.
  - It's stored in `~/Library/Application Support/mob-mirror/agent.json`, mode 600.
  - The page never sees it: the setup command is copied to the clipboard by the main process.
  - **New token** (↻) revokes old configs.
- **Every agent action shows** as "Agent: …" on the mirror.
- **Agents can't unlock without your fingerprint.**
- **Secure screens are captured black** (FLAG_SECURE): PIN entry, banking apps, DRM video.

## Tips for agents
- Use a loop: **screenshot, act, screenshot**. Prefer `get_ui_tree` centres over guessing coordinates from pixels.
- Tap a text field before calling `type_text`.
- After launching an app or navigating, `wait` 500–1500 ms, then take a screenshot.
