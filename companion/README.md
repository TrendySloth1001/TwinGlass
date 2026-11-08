# Twinglass phone app

The Android half of [Twinglass](../README.md). On its own it mirrors the phone to your Mac over Wi-Fi with **no developer options**; next to Developer mode it unlocks the Mac app's extras (real app icons, rich device details, agents that read and press any screen).

- **Package** `com.mobmirror.companion` · **version** 0.7.0 · **Android 10+** (minSdk 29, targetSdk 35)
- **Kotlin + Jetpack Compose + Material 3**, release build 2.9 MB (R8 + resource shrinking)
- **No accounts, no internet use**: it only talks to your paired Mac on your network or over adb

## Screens

| Screen | What's on it |
|---|---|
| **Landing** (first run) | "Your phone, on your Mac." and the choice: *Wi-Fi, no setup* (recommended) or *Full control* (Developer mode). Switchable later in Settings. |
| **Home** | Status card (full potential / developer mode on / Wi-Fi mode, with Dev options · Debugging · Linked checks and one next step), the Mac you're paired with and **Mirror to Mac**, "Unlock more", this phone at a glance (battery, memory, storage, display). |
| **Device** | Every detail in 12 groups, searchable; long-press copies (text, Markdown or JSON). |
| **Settings** | Appearance, Home, Device details, Share to Mac, What the Mac may use, Connection, Screen, About. |
| **Advanced** | Link timeout, agent limits, what details and icons the Mac gets, debug logging, diagnostics. |
| **Connected to** | The Mac's name and macOS/Twinglass versions, how the phone is linked, response time, what the Mac is doing with this phone (mirroring, second screens, agents), forget. |

Permissions and extras are asked **one at a time in bottom sheets, only when they're needed**: pairing (scan the Mac's QR, or pick the Mac and type the code), the explanation before Android's screen-sharing prompt, control from the Mac, the mirroring notification, and a 3-step Developer-mode guide.

## Wi-Fi, no setup

1. **Find**: the Mac advertises `_twinglass._tcp` over mDNS; the app lists it.
2. **Pair**: scan the QR in the Mac's *Add phone* sheet (Google's code scanner, no camera permission) — or pick the Mac and type the 6-digit code. P-256 ECDH, HKDF with the code, HMAC confirmation both ways.
3. **Mirror**: *Mirror to Mac* → Android's consent → a foreground service captures the screen (MediaProjection), encodes H.264 in hardware (realtime priority, low-latency mode, rotation-aware), and sends it in scrcpy's stream framing over AES-256-GCM. The Mac opens a window by itself.
4. **Control**: the Mac's control messages become accessibility gestures and actions — taps, long-presses, swipes (sent when the finger lifts), wheel scrolls, Back / Home / Recents / lock / volume, typing into the focused field, clipboard with paste, opening apps.

Forgetting works both ways: forget here and the Mac drops this phone (queued until it's reachable if needed); forget on the Mac and this app drops the Mac as soon as it hears from it.

## With Developer mode

Twinglass on the Mac talks to the app through adb. These broadcast receivers require the `DUMP` permission, which only the adb shell holds, so other apps on the phone can't call them:

| Receiver | Used for |
|---|---|
| `LinkReceiver` | The Mac hands over its link key (blocked after you forget the Mac, until *Link again*) |
| `InfoReceiver` | Device details for the Mac's Phone details window |
| `IconReceiver` | Real app icons for the Mac's app grid and ⌘K |
| `AgentReceiver` + `AgentService` | UI trees, element presses and `screen_map` data on **any display**, including the agents' own second screen (`uiautomator` only sees the main display) |

Each of the first three, and agent requests, can be switched off in *Settings → What the Mac may use*; Android then refuses them.

## Permissions

| Permission | Why |
|---|---|
| `INTERNET`, `ACCESS_NETWORK_STATE` | The link to your Mac; connection type in device details |
| `CHANGE_WIFI_MULTICAST_STATE` | Finding your Mac on the Wi-Fi (mDNS) |
| `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PROJECTION` | Screen sharing runs as a foreground service (required since Android 14) |
| `POST_NOTIFICATIONS` | The single "Mirroring to Mac" notification with its Stop button (asked in a sheet, optional) |
| Accessibility service *Twinglass control* | Control from the Mac in Wi-Fi mode; element access for agents. Off until you turn it on |

## Build and test

```bash
./gradlew assembleRelease          # app/build/outputs/apk/release/app-release.apk (signed with the debug key so it updates in place)
./gradlew testReleaseUnitTest      # JVM tests: link crypto against the Mac's fixed vectors
adb install -r app/build/outputs/apk/release/app-release.apk
```

From the repo root: `npm run companion:build` / `npm run companion:install`. Without adb, the Mac's *Add phone* sheet serves this APK over your Wi-Fi (scan the QR with the phone's camera).

## Code map

```
MainActivity.kt          navigation, state, Android hooks (consent, permissions), presence link
Screens.kt               Home / Device / Settings / Advanced / Connected to
DirectUi.kt              landing, Wi-Fi home, bottom sheets, QR + code pairing, status card
direct/DirectCrypto.kt   P-256, HKDF, HMAC, AES-GCM framing (mirrors src/main/direct/protocol.ts)
direct/DirectLink.kt     discovery, pairing, encrypted sessions, two-way forget
direct/MirrorService.kt  capture → encoder → link; rotation; keyframe requests
direct/DirectInput.kt    Mac control messages → accessibility gestures / actions
AgentService.kt          accessibility: trees, actions, gestures on any display
DeviceInfo.kt            the 12 detail groups and the home snapshot
ShareActivity.kt         "Send to Mac" from any app's share sheet
ui/                      design system: Theme, Components, Controls, Sheet
```

## Design

Shares the visual language of Sparky: monochrome surfaces (true black / warm off-white), one red accent for on / active / live, Space Grotesk throughout, Android 16-style grouped cells, dot-grid texture and dot meters, spring motion. Light, dark or system; text size, reduce motion and haptics are user settings.
