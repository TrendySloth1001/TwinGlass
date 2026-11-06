---
name: phone-control
description: Use when asked to do something on the user's Android phone (open an app, tap, type, read the screen, test an app on the device) through the mob-mirror MCP tools.
---

# Operating the phone through Mob Mirror's MCP tools

**Requirements:** "Agent access (MCP)" is on in Mob Mirror, and the `mob-mirror` server is connected (`/mcp`). The setup is in docs/AGENTS.md.

## Loop
1. **Observe.** Call `screenshot`, and also `get_ui_tree` for anything with text or buttons.
   - Coordinates for every touch tool are in the **screenshot's pixel space**. The size is printed with each screenshot (e.g. 576×1280).
   - Prefer a node's `center` from `get_ui_tree` over estimating from the image.
2. **Act.** Use one action at a time: `tap`, `swipe`, `scroll`, `type_text` (tap the field first), `press_key`, or `launch_app`.
3. **Verify.** Call `wait` (500–1500 ms after navigation), then `screenshot` again. Never chain several blind actions.

## Rules
- The phone belongs to the user. Don't send messages, pay, delete, install or change settings unless the user explicitly asked for that exact thing. Ask when in doubt.
- **Lock screen:** call `unlock_phone`. It needs the user's Touch ID on the Mac, so tell the user to expect the prompt. Never try to guess or type a PIN yourself.
- **Black screenshots** mean a secure screen (PIN pad, banking app, DRM). Describe this to the user instead of retrying.
- If `get_ui_tree` fails ("could not get idle state"), the screen is animating. Use the screenshot.
- Use `list_apps` to find a package name before `launch_app`.
