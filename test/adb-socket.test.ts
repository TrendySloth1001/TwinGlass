import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { encodeRequest, hostCommand, hostQuery, socketPush, socketShell, transportCommand } from '../src/main/adb/adb-socket'

describe('adb socket protocol', () => {
  it('prefixes requests with a 4-digit hex length', () => {
    expect(encodeRequest('host:version').toString()).toBe('000chost:version')
    expect(encodeRequest('shell:é').toString('hex')).toBe(Buffer.from('0008shell:é').toString('hex'))
  })
})

// Real adb server + phone: MOB_DEVICE=<serial> npm test
const serial = process.env.MOB_DEVICE
describe.skipIf(!serial)('adb socket against a real phone', () => {
  const adb = (...a: string[]): string => execFileSync('adb', ['-s', serial!, ...a], { encoding: 'utf8' })
  it('shell output matches the adb program', async () => {
    for (const cmd of ['getprop ro.build.version.sdk', 'wm size', 'echo héllo ✓']) expect(await socketShell(serial!, cmd, 5000)).toBe(adb('shell', cmd))
    // stderr comes in the same stream (runLoose returned stdout + stderr too).
    expect(await socketShell(serial!, 'echo "a b"; echo err 1>&2', 5000)).toBe('a b\nerr\n')
  })
  it('get-state and devices-l', async () => {
    expect(await hostQuery(`host-serial:${serial}:get-state`)).toBe('device')
    expect(await hostQuery('host:devices-l')).toContain(serial!)
  })
  it('pushes a file byte-exact', async () => {
    const remote = '/data/local/tmp/tg-socket-push.bin'
    await socketPush(serial!, 'resources/scrcpy-server-v5.0.1', remote)
    const sum = (await socketShell(serial!, `sha256sum ${remote}`, 5000)).split(/\s/)[0]
    const local = execFileSync('shasum', ['-a', '256', 'resources/scrcpy-server-v5.0.1'], { encoding: 'utf8' }).split(/\s/)[0]
    expect(sum).toBe(local)
    await socketShell(serial!, `rm ${remote}`, 5000)
  })
  it('forward / reverse', async () => {
    await hostCommand(`host-serial:${serial}:forward:tcp:47999;localabstract:tg-test`)
    expect(execFileSync('adb', ['forward', '--list'], { encoding: 'utf8' })).toContain('tcp:47999')
    await hostCommand(`host-serial:${serial}:killforward:tcp:47999`)
    expect(execFileSync('adb', ['forward', '--list'], { encoding: 'utf8' })).not.toContain('tcp:47999')
    await transportCommand(serial!, 'reverse:forward:tcp:47998;tcp:47998')
    expect(await transportCommand(serial!, 'reverse:list-forward')).toContain('tcp:47998')
    await transportCommand(serial!, 'reverse:killforward:tcp:47998')
    expect(await transportCommand(serial!, 'reverse:list-forward')).not.toContain('tcp:47998')
  })
  it('fails cleanly on an unknown phone', async () => {
    await expect(socketShell('nope-123', 'true', 3000)).rejects.toThrow(/not found|no devices/i)
  })
})
