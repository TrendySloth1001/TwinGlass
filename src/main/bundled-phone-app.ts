// The Twinglass phone app that ships inside the Mac app (packaged: Resources/mob-mirror-companion.apk
// plus its Gradle output-metadata as mob-mirror-companion.json; development: the release build).
// Phones get updates from here: over adb in Developer mode, over the Wi-Fi link otherwise, so the
// phone app itself never needs the internet.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

export interface BundledPhoneApp {
  path: string
  version: string
  code: number
}

/** versionCode / versionName out of Gradle's output-metadata.json. */
export function parseOutputMetadata(text: string): { version: string; code: number } | null {
  try {
    const e = (JSON.parse(text) as { elements?: { versionCode?: number; versionName?: string }[] }).elements?.[0]
    return e && typeof e.versionCode === 'number' ? { version: e.versionName ?? String(e.versionCode), code: e.versionCode } : null
  } catch {
    return null
  }
}

/** versionCode from `dumpsys package <pkg>` ("versionCode=10 minSdk=29 targetSdk=35"). */
export function parseVersionCode(dumpsys: string): number | null {
  const m = /versionCode=(\d+)/.exec(dumpsys)
  return m ? Number(m[1]) : null
}

export function bundledPhoneApp(): BundledPhoneApp | null {
  const [apk, meta] = app.isPackaged
    ? [join(process.resourcesPath, 'mob-mirror-companion.apk'), join(process.resourcesPath, 'mob-mirror-companion.json')]
    : [
        join(app.getAppPath(), 'companion/app/build/outputs/apk/release/app-release.apk'),
        join(app.getAppPath(), 'companion/app/build/outputs/apk/release/output-metadata.json'),
      ]
  if (!existsSync(apk)) return null
  const v = existsSync(meta) ? parseOutputMetadata(readFileSync(meta, 'utf8')) : null
  return { path: apk, version: v?.version ?? '?', code: v?.code ?? 0 }
}

/** The phone runs an older phone app than the one bundled here. */
export function phoneAppOutdated(phoneCode: number | null | undefined): boolean {
  const b = bundledPhoneApp()
  return !!b && b.code > 0 && typeof phoneCode === 'number' && phoneCode > 0 && phoneCode < b.code
}
