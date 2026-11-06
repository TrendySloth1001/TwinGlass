import { describe, expect, it } from 'vitest'
import { openableUrl, parseAppList, shellQuote } from '../src/main/phone-apps'
import { parseBattery } from '../src/main/adb/parse'

describe('parseAppList (scrcpy-server list_apps, verified output on the A024)', () => {
  const OUT = `[server] INFO: List of apps:
 * Calculator                     com.google.android.calculator
 - Brave                          com.brave.browser
 - CPU X                          com.abs.cpu_z_advance
`
  it('reads label, package and system flag, sorted by label', () => {
    expect(parseAppList(OUT)).toEqual([
      { system: false, label: 'Brave', pkg: 'com.brave.browser' },
      { system: true, label: 'Calculator', pkg: 'com.google.android.calculator' },
      { system: false, label: 'CPU X', pkg: 'com.abs.cpu_z_advance' },
    ])
  })
})

describe('open on phone', () => {
  it('recognises links and bare domains', () => {
    expect(openableUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1')
    expect(openableUrl('example.com/x')).toBe('https://example.com/x')
    expect(openableUrl('tel:+911234')).toBe('tel:+911234')
    expect(openableUrl('hello world')).toBeNull()
    expect(openableUrl('just-text')).toBeNull()
  })
  it('quotes for adb shell so a URL cannot inject commands', () => {
    expect(shellQuote("https://x.com/a'b;rm -rf")).toBe("'https://x.com/a'\\''b;rm -rf'")
  })
})

describe('parseBattery', () => {
  it('reads level and charging', () => {
    expect(parseBattery('Current Battery Service state:\n  AC powered: false\n  USB powered: true\n  level: 87\n')).toEqual({ level: 87, charging: true })
    expect(parseBattery('  AC powered: false\n  USB powered: false\n  level: 40\n')).toEqual({ level: 40, charging: false })
    expect(parseBattery('nothing')).toBeNull()
  })
})
