---
name: android-device
description: Use when you need a real Android phone for testing (running the app, the integration test, or diagnosing adb, USB or Wi-Fi connection problems).
---

# Real-device testing and adb troubleshooting

## Find a device
```bash
adb devices -l          # state must be "device"
adb mdns services       # wireless phones advertising _adb-tls-connect / _adb-tls-pairing
```
- One phone can appear twice: once as `ip:port` and once as `adb-<serial>-<rand>._adb-tls-connect._tcp`. The app merges these by `ro.serialno`.
- Either serial works for `MOB_DEVICE`.

## Run
```bash
MOB_DEVICE=<serial> npx vitest run test/integration --silent=false   # handshake + first keyframe
npm run dev                                                          # the app
```

## Connection problems
| Symptom | Fix |
|---|---|
| `unauthorized` | Accept the RSA prompt on the phone. If nothing appears, revoke USB debugging authorizations and replug. |
| `offline` (Wi-Fi) | Phone left the network or wireless debugging turned off. Re-enable it and run `adb connect ip:port` (the port is random; check the Wireless debugging screen). |
| Never paired (Android 11+) | Wireless debugging → "Pair with pairing code", then `adb pair ip:pairport CODE`, then `adb connect ip:connectport`. |
| Android ≤10 over Wi-Fi | USB first: `adb tcpip 5555`, unplug, `adb connect ip:5555` (unencrypted). |
| INJECT_EVENTS permission error | Xiaomi and some others: enable "USB debugging (Security settings)" and reboot. |
| adb server weirdness | `adb kill-server && adb start-server`; `adb server-status` shows the version and mDNS backend. |

## Notes
- Keep platform-tools current (`brew upgrade android-platform-tools`). 37.0.1+ uses only the libadbmdns backend.
- Never run destructive adb commands (uninstall, `rm` outside `/data/local/tmp`, factory reset) on the user's phone without asking.
