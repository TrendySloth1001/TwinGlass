---
name: phone-control
description: Use when asked to do something on the user's Android phone (open an app, tap, type, read the screen, test or debug an app on the device) through Twinglass' mob-mirror MCP tools.
---

# Operating the phone through Twinglass' MCP tools

**Requirements:** "Agent access (MCP)" is on in Twinglass, and the `mob-mirror` server is connected (`/mcp`). The setup is in docs/AGENTS.md.

## Where you act
- By default you work on **your own second screen** of the phone (`screen: "agent"`). It's a separate virtual display that opens by itself on your first action, in a Twinglass window the user can watch. The user keeps using the phone meanwhile.
- Use `screen: "phone"` only when the task needs the phone's own screen: the lock screen, or something the user has open there.
- When you're done, call `agent_screen {action:"close"}`. Its apps move to the phone in the background.

## Loop
1. **Observe.**
   - Use `find_elements` / `get_ui_tree` for anything with text or buttons, and `screenshot` for visuals.
   - Coordinates are in the **screenshot's pixel space** (the size is printed with each screenshot).
2. **Act.**
   - Prefer element tools: `tap_element {text|id|ref}` and `set_text` (any language; replaces a field's content). Use coordinates (`tap`, `swipe`, `scroll`) only when there's no element.
   - For a known sequence, use `run_steps` with `screenshot_after: true`.
3. **Verify.** Use `wait_for {text}` (or `gone: true`) instead of fixed waits. Use `exact: true` for short texts like "12", which otherwise also match the clock.

## Building or matching UI
- Call `screen_map` (with `grid_dp: 8` if you want the grid) instead of estimating sizes from a screenshot. It gives exact dp positions and sizes, insets from the parent, gaps between siblings, text sizes in sp, layout params and colours.
- The "n…" numbers in its JSON match the boxes in its image.
- Use its `summary` (type scale, spacing scale, keylines, repeated items, palette) as the design tokens.
- Values are rounded the way Android rounds them. 18sp is reported as 18, even though the app drew 47 px.

## Testing an app
| Need | Tool |
|---|---|
| Install a build, check its facts | `install_apk`, `app_info` (version, SDKs, permissions) |
| Open a screen, deep links, intent extras, launch time | `start_activity` (`cold: true` = cold start time) |
| Fresh state | `clear_app_data`; `set_permission` (grant, revoke, `reset_all`) |
| What went wrong | `get_crashes`, `logcat {package, level:"W"}` |
| Smoothness, memory, CPU | `app_performance` (`reset: true`, interact, call again) |
| Conditions | `set_device_state` (dark mode, font scale, animations off, density, network, battery). **Always end with `{reset:true}`**: it changes the whole phone |
| Dev server on the Mac | `reverse_port {action:"add", phone_port:8081}` |
| Evidence | `record_screen` start/stop, `screenshot`, `pull_file` |

## Rules
- The phone belongs to the user. Don't send messages, pay, delete, uninstall, clear data or change settings unless the user explicitly asked for that exact thing. Ask when in doubt.
- Some tools may be turned off in Twinglass → Settings → Agents (files, app changes, phone settings, shell). If a tool says it's off, tell the user which switch to turn on instead of working around it.
- **Lock screen:** call `unlock_phone`. It needs the user's Touch ID on the Mac, so tell the user to expect the prompt. Never try to guess or type a PIN yourself.
- **Black screenshots** mean a secure screen (PIN pad, banking app, DRM). Tell the user instead of retrying.
- If element tools say "Agent screen reading is off", the user can switch on "Agents read any screen" in Settings → Agents. Until then, use screenshots and coordinates.
- `launch_app` takes an app name ("WhatsApp") or a package; `list_apps` shows both.
