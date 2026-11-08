// Parsers for the app-testing tools (pure, unit-tested): package facts, frame/memory/CPU stats.

export interface PackageFacts {
  package: string
  versionName: string | null
  versionCode: number | null
  minSdk: number | null
  targetSdk: number | null
  firstInstall: string | null
  lastUpdate: string | null
  installer: string | null
  debuggable: boolean
  granted: string[]
  denied: string[]
}

/** `dumpsys package <pkg>` → the facts a tester wants. */
export function parsePackageDump(pkg: string, out: string): PackageFacts | null {
  if (!out.includes(`Package [${pkg}]`)) return null
  const one = (re: RegExp): string | null => re.exec(out)?.[1] ?? null
  const num = (re: RegExp): number | null => {
    const v = one(re)
    return v === null ? null : Number(v)
  }
  const granted: string[] = []
  const denied: string[] = []
  // Runtime permissions (the ones a user can toggle) carry granted=true/false.
  for (const m of out.matchAll(/^\s+([\w.]+): granted=(true|false)/gm)) {
    const list = m[2] === 'true' ? granted : denied
    if (!granted.includes(m[1]!) && !denied.includes(m[1]!)) list.push(m[1]!)
  }
  return {
    package: pkg,
    versionName: one(/versionName=([^\n]+)/)?.trim() ?? null,
    versionCode: num(/versionCode=(\d+)/),
    minSdk: num(/minSdk=(\d+)/),
    targetSdk: num(/targetSdk=(\d+)/),
    firstInstall: one(/firstInstallTime=([^\n]+)/)?.trim() ?? null,
    lastUpdate: one(/lastUpdateTime=([^\n]+)/)?.trim() ?? null,
    installer: one(/installerPackageName=(\S+)/),
    debuggable: /pkgFlags=\[[^\]]*\bDEBUGGABLE\b/.test(out),
    granted,
    denied,
  }
}

export interface FrameStats {
  frames: number
  janky: number
  jankyPercent: number
  p50: number | null
  p90: number | null
  p95: number | null
  p99: number | null
}

/** `dumpsys gfxinfo <pkg>` summary (frames since the app started or the last reset). */
export function parseGfxinfo(out: string): FrameStats | null {
  const frames = /Total frames rendered: (\d+)/.exec(out)
  if (!frames) return null
  const janky = /Janky frames: (\d+) \(([\d.]+)%\)/.exec(out)
  const pct = (p: number): number | null => {
    const m = new RegExp(`^${p}th percentile: (\\d+)ms`, 'm').exec(out)
    return m ? Number(m[1]) : null
  }
  return {
    frames: Number(frames[1]),
    janky: janky ? Number(janky[1]) : 0,
    jankyPercent: janky ? Number(janky[2]) : 0,
    p50: pct(50),
    p90: pct(90),
    p95: pct(95),
    p99: pct(99),
  }
}

/** Total PSS in KB from `dumpsys meminfo <pkg>` (old and new layouts). */
export function parseMeminfoPss(out: string): number | null {
  const m = /TOTAL PSS:\s+([\d,]+)/.exec(out) ?? /^\s*TOTAL\s+([\d,]+)/m.exec(out)
  return m ? Number(m[1]!.replace(/,/g, '')) : null
}

/** This app's CPU share from `dumpsys cpuinfo` ("12% 1234/com.x: 8% user + 4% kernel"). */
export function parseCpuinfo(pkg: string, out: string): number | null {
  const esc = pkg.replace(/\./g, '\\.')
  const m = new RegExp(`^\\s*([\\d.]+)% \\d+/${esc}(?::|\\s)`, 'm').exec(out)
  return m ? Number(m[1]) : null
}

/** `am start -W` → launch time in ms (TotalTime, else WaitTime). */
export function parseLaunchTime(out: string): number | null {
  const m = /TotalTime: (\d+)/.exec(out) ?? /WaitTime: (\d+)/.exec(out)
  return m ? Number(m[1]) : null
}

/** Any URI a tester may open: web, mail, tel, geo, market and app deep links (myapp://…). */
export function validUri(u: string): string | null {
  const t = u.trim()
  if (!t || /\s/.test(t) || t.length > 4096) return null
  if (/^intent:/i.test(t)) return null
  if (/^[a-z][\w+.-]*:/i.test(t)) return t
  if (/^(www\.)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(t)) return `https://${t}`
  return null
}
