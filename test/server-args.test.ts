import { describe, expect, it } from 'vitest'
import { buildServerArgs } from '../src/main/scrcpy/session'

const base = { serial: 's', serverPath: '/x' }

describe('buildServerArgs', () => {
  it('passes stay_awake and max_fps', () => {
    const a = buildServerArgs('1234abcd', { ...base, stayAwake: true, maxFps: 60 })
    expect(a).toContain('stay_awake=true')
    expect(a).toContain('max_fps=60')
  })
  it('only sends clipboard_autosync when turned off (server default is true)', () => {
    expect(buildServerArgs('1', base).some((x) => x.startsWith('clipboard_autosync'))).toBe(false)
    expect(buildServerArgs('1', { ...base, clipboardAutosync: true }).some((x) => x.startsWith('clipboard_autosync'))).toBe(false)
    expect(buildServerArgs('1', { ...base, clipboardAutosync: false })).toContain('clipboard_autosync=false')
  })
})

describe('second screen (virtual display)', () => {
  it('asks for a new display with size/dpi, keeps apps on close, keyboard local', () => {
    const a = buildServerArgs('1', { ...base, newDisplay: { width: 1080, height: 2400, dpi: 420 } })
    expect(a).toContain('new_display=1080x2400/420')
    expect(a).toContain('vd_destroy_content=false')
    expect(a).toContain('display_ime_policy=local')
    expect(buildServerArgs('1', base).some((x) => x.startsWith('new_display'))).toBe(false)
  })
})

describe('second screen display id', () => {
  it('reads the id from the server log', async () => {
    const { parseNewDisplayId } = await import('../src/main/scrcpy/session')
    expect(parseNewDisplayId('[server] INFO: New display: 1080x2400/420 (id=439)\n')).toBe(439)
    expect(parseNewDisplayId('[server] INFO: Device: [Nothing] A024 (Android 17)\n')).toBeNull()
  })
})

describe('video codec options', () => {
  it('formats key:type=value, skips bad keys', () => {
    const a = buildServerArgs('1', { ...base, videoCodecOptions: { 'intra-refresh-period': 30, 'operating-rate': 120.5, 'bad key,x': 1 } })
    expect(a).toContain('video_codec_options=intra-refresh-period:int=30,operating-rate:float=120.5')
    expect(buildServerArgs('1', base).some((x) => x.startsWith('video_codec_options'))).toBe(false)
  })
})
