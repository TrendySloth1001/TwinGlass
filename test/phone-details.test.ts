import { describe, expect, it, vi } from 'vitest'
vi.mock('electron', () => ({ ipcMain: { handle: () => {} }, app: { getPath: () => '/tmp', getVersion: () => '0' } }))
const { adbDetailSections, parseGetprop } = await import('../src/main/adb/parse')
const { parseInfoJson } = await import('../src/main/companion-link')

describe('phone details', () => {
  it('parses getprop', () => {
    const m = parseGetprop('[ro.product.model]: [A024]\n[ro.build.version.sdk]: [37]\n[empty]: []\n')
    expect(m.get('ro.product.model')).toBe('A024')
    expect(m.get('ro.build.version.sdk')).toBe('37')
    expect(m.get('empty')).toBe('')
  })
  it('builds adb sections and drops empty rows', () => {
    const props = parseGetprop('[ro.product.model]: [A024]\n[ro.build.version.release]: [17]\n[ro.build.version.sdk]: [37]\n')
    const s = adbDetailSections(props, '  level: 49\n  temperature: 312\n', 'Physical size: 1260x2800', 'Physical density: 480', 'MemTotal:  7864320 kB\nMemAvailable: 3932160 kB\n', 'Filesystem 1K-blocks Used Available Use% Mounted on\n/dev/dm-50 236000000 100000000 136000000 43% /data\n')
    const row = (t: string, l: string): string | undefined => s.find((x) => x.title === t)?.rows.find((r) => r.label === l)?.value
    expect(row('Device', 'Model')).toBe('A024')
    expect(row('Android', 'Version')).toBe('Android 17')
    expect(row('Android', 'API level')).toBe('37')
    expect(row('Memory & storage', 'RAM')).toBe('7.5 GB')
    expect(row('Display', 'Resolution')).toBe('1260 × 2800')
    expect(row('Display', 'Density')).toBe('480 dpi')
    expect(row('Battery', 'Temperature')).toBe('31.2 °C')
    expect(s.find((x) => x.title === 'Device')?.rows.some((r) => r.label === 'Brand')).toBe(false)
  })
  it('validates the phone app JSON', () => {
    expect(parseInfoJson('nope')).toBeNull()
    expect(parseInfoJson('{"sections":[{"title":"Battery","rows":[{"label":"Level","value":"49%"},{"label":5}]},{"title":"","rows":[]}]}')).toEqual([
      { title: 'Battery', rows: [{ label: 'Level', value: '49%' }] },
    ])
  })
})
