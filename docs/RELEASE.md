# Releasing Mob Mirror (signed + notarized macOS build)

Local builds are unsigned (`mac.identity: null` in `electron-builder.yml`). This guide covers what a
public release needs: a build that opens without Gatekeeper warnings.

Checked on 2026-11-06 against **electron-builder 26.18.0** (the installed `app-builder-lib` source in
`node_modules`), the 26.18.1 docs, `@electron/osx-sign` 1.3.3 and `@electron/notarize` 2.5.0.
Anything marked **(unverified)** has not been tried end to end, because no release build has been
signed yet.

## 1. What you need from Apple

- A paid **Apple Developer Program** membership.
- A **Developer ID Application** certificate. This is the type for distribution outside the Mac App
  Store. "Apple Distribution" and "Mac App Store" certificates get rejected by notarization. electron-builder looks only for
  `Developer ID Application` on non-MAS targets (`MacTargetHelper.getCertificateTypes`).
- Your 10-character **Team ID**.
- Notarization credentials: either an App Store Connect API key (recommended) or an Apple ID with an
  app-specific password.

## 2. Signing credentials (pick one)

| Option | Env vars |
|---|---|
| Certificate file (CI) | `CSC_LINK` (path, `file://`, https URL or base64 of the `.p12`) and `CSC_KEY_PASSWORD` |
| Login keychain (local) | none, because auto-discovery is on by default. Set `CSC_NAME="Developer ID Application: … (TEAMID)"` if you have several identities |

To skip signing, set `CSC_IDENTITY_AUTO_DISCOVERY=false` or `mac.identity: null`.

## 3. Notarization credentials (pick one)

electron-builder reads these in this order (`MacTargetHelper.getNotarizeOptions`). It uses
`notarytool` and staples the ticket to the `.app` automatically.

| Option | Env vars |
|---|---|
| A. Apple ID | `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` (all three are required, or the build fails) |
| B. API key (recommended) | `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` |
| C. Keychain profile | `APPLE_KEYCHAIN_PROFILE` (and optionally `APPLE_KEYCHAIN`), created with `xcrun notarytool store-credentials` |

> **`APPLE_API_KEY` must be a file path to the `.p8` file.** The 26.18.1 notarization doc says
> "base64-encoded p8 content", but the code passes the value straight to `@electron/notarize`. Its
> type is documented as "File system path to the `.p8` private key". On CI, decode the secret to a
> file and point `APPLE_API_KEY` at it.

If both A and B are set, A wins.

## 4. `electron-builder.yml` changes

```yaml
mac:
  # remove:  identity: null
  hardenedRuntime: true          # already set; it is also the default for mac targets
  notarize: true                 # see note below
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
  icon: build/icon.icns          # optional, see section 6
```

**`mac.notarize` in 26.x** is a boolean:
- Unset: notarizes when credentials (section 3) are present and logs a warning otherwise.
- `false`: always skips.
- `true`: in 26.x it behaves like unset. A merged changeset for **v27**
  (`.changeset/notarize-true-requires-credentials.md`) makes `true` fail the build when credentials
  are missing. Use `true` for release configs and keep local builds on `identity: null`, so the
  config is ready for v27.

The old object form (`notarize: { teamId }`) is gone. The team ID now comes from `APPLE_TEAM_ID`.

## 5. Entitlements (Electron 45)

Create `build/entitlements.mac.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
</dict>
</plist>
```

- **`allow-jit` is required** because V8 needs it.
- **`allow-unsigned-executable-memory` is NOT needed.** The `@electron/notarize` README says it is
  only for Electron ≤ 11 and that for 12+ "this entitlement should not be applied as it increases your app's attack surface".
  The `@electron/osx-sign` default `default.darwin.plist` also omits it. The electron-builder docs
  and its fallback template still list it, and that guidance is outdated.
- **`disable-library-validation` is not needed.** osx-sign re-signs Electron's frameworks with your
  Team ID, and Mob Mirror loads no third-party native modules. electron-builder's *fallback* template
  (used when you set no `entitlements`) adds all three entitlements, which is one reason to ship
  your own file.
- Spawning the system `adb` (for example `/opt/homebrew/bin/adb`) is not restricted by the hardened
  runtime **(unverified on a signed build)**. Add device entitlements only if the app starts using the
  mic, camera or similar.

## 6. extraResources and other files

- `@electron/osx-sign` walks the whole `.app` and signs every **Mach-O** file it finds, `Contents/Resources` included.
  Use `mac.binaries` only for binaries outside the bundle, and `mac.signIgnore` to exclude files.
- `scrcpy-server-v5.0.1` is a Java/dex archive, not Mach-O, so it is not signed on its own. It is
  covered by the bundle seal (`_CodeSignature/CodeResources`). If you edit it after signing,
  verification breaks.
- `dmg.sign` defaults to `false`. Only the `.app` is notarized and stapled, and that is enough for
  Gatekeeper once the app is copied out of the DMG. To staple the DMG as well, run `xcrun notarytool submit … --wait`
  and then `xcrun stapler staple` on it **(optional, unverified)**.

## 7. App icon

Put one of these in `build/` (the `buildResources` dir). It is auto-discovered:
- `icon.icns` (used as is), or
- `icon.png` at **1024×1024** (512×512 minimum), or `icon.svg`. These are converted to icns. SVG
  input comes from the 26.18.1 docs **(unverified on 26.18.0)**.

Without an icon you get the default Electron icon. Right now `build/` doesn't exist, and the app
ships `electron.icns`.

## 8. Build and verify

```bash
export CSC_LINK=… CSC_KEY_PASSWORD=…                         # or rely on the keychain
export APPLE_API_KEY=$PWD/AuthKey_XXXX.p8 APPLE_API_KEY_ID=… APPLE_API_ISSUER=…
npm run build && npx electron-builder --mac

APP="dist/mac-arm64/Mob Mirror.app"
codesign --verify --deep --strict --verbose=2 "$APP"
codesign -d --entitlements - "$APP"                          # expect only allow-jit
spctl --assess --type exec -vv "$APP"                        # expect: source=Notarized Developer ID
xcrun stapler validate "$APP"
```

## Unsigned builds (current state)

The current build carries only the linker's ad-hoc signature (`Signature=adhoc`, `TeamIdentifier=not set`, no
sealed resources). `spctl` rejects it. Since macOS 15, Control-click → Open no longer bypasses
Gatekeeper. After downloading, a user has two ways to open it:
1. Try to open it, then go to **System Settings → Privacy & Security → "Open Anyway"** and confirm
   with your password.
2. Or run `xattr -dr com.apple.quarantine "/Applications/Mob Mirror.app"`.

## Sources

- electron-builder macOS code signing: https://www.electron.build/code-signing-mac (source:
  `website/docs/features/code-signing/code-signing-mac.md` at tag `electron-builder@26.18.1`)
- electron-builder notarization: `website/docs/features/code-signing/notarization.md` at 26.18.1,
  https://github.com/electron-userland/electron-builder/tree/electron-builder%4026.18.1/website/docs
- electron-builder env vars: `website/docs/features/code-signing/code-signing.md` at 26.18.1
- electron-builder icons: `website/docs/features/icons-and-images.md` at 26.18.1
- v27 notarize change: https://github.com/electron-userland/electron-builder/blob/master/.changeset/notarize-true-requires-credentials.md
- Implementation: `node_modules/app-builder-lib/out/mac/MacTargetHelper.js` (26.18.0)
- @electron/notarize entitlements note: https://github.com/electron/notarize#prerequisites
- @electron/osx-sign default entitlements: https://github.com/electron/osx-sign/tree/main/entitlements
- Electron code signing tutorial: https://www.electronjs.org/docs/latest/tutorial/code-signing

Note: electron.build returned 404 or an empty page when fetched on 2026-11-06, so the docs above were
read from the GitHub repo at the `electron-builder@26.18.1` tag.

## Terminal install (install.sh and Homebrew)

`npm run release` builds the phone app, the DMG (with the phone app bundled for *Add phone*), and updates
`packaging/homebrew/Casks/twinglass.rb` (version + SHA-256) and `dist/Twinglass-<version>-arm64.dmg.sha256`.

1. Create the GitHub release `v<version>` on TrendySloth1001/twinglass and attach the DMG and its `.sha256`.
   `install.sh` picks the latest release's `*arm64.dmg` and verifies it against the `.sha256` when present.
2. Copy `packaging/homebrew/Casks/twinglass.rb` to the tap repo TrendySloth1001/homebrew-tap under `Casks/`.

Checked on 2026-11-08:
- `install.sh` piped through bash (file:// DMG, scratch app dir): it installed, left no quarantine flag, and uninstalled.
- The cask passes `brew style` and `brew audit --strict` (Homebrew 7.0.10, which wants `postflight_steps`, not `postflight`) and installs from a local DMG with no quarantine flag.
