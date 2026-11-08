import { describe, expect, it, vi } from 'vitest'
vi.mock('electron', () => ({ ipcMain: { handle: () => {} }, app: { getPath: () => '/tmp', getVersion: () => '0' }, nativeImage: {} }))
const { parseBroadcastResult, parseServices, nextServices, parseNotifications, AGENT_SERVICE } = await import('../src/main/agent/phone-bridge')
const { parseA11yTree, matchNodes } = await import('../src/main/agent/ui-tree')

describe('phone app bridge', () => {
  it('reads the base64 JSON result of am broadcast', () => {
    const b64 = Buffer.from(JSON.stringify({ ok: true, service: false })).toString('base64')
    expect(parseBroadcastResult(`Broadcasting: Intent { … }\nBroadcast completed: result=0, data="${b64}"\n`)).toEqual({ ok: true, service: false })
    // Old phone app (no AgentReceiver): no data.
    expect(parseBroadcastResult('Broadcast completed: result=0\n')).toBeNull()
  })
  it('adds / removes only our accessibility service', () => {
    const other = 'com.x.reader/.Svc'
    expect(parseServices('null\n')).toEqual([])
    expect(nextServices(parseServices(`${other}\n`), true)).toEqual([other, AGENT_SERVICE])
    expect(nextServices([other, AGENT_SERVICE], true)).toEqual([other, AGENT_SERVICE]) // no duplicate
    expect(nextServices([other, 'com.mobmirror.companion/com.mobmirror.companion.AgentService'], false)).toEqual([other])
  })
})

describe('notifications', () => {
  // Trimmed `dumpsys notification --noredact` (A024, Android 17).
  const OUT = `Current Notification List:
    NotificationRecord(0x06a: pkg=com.google.android.apps.youtube.music user=UserHandle{0} id=2 key=x: Notification(channel=7 flags=NO_CLEAR|ONGOING_EVENT vis=PUBLIC))
            when=1794032933307/1794032933307
                android.title=String (Tera Naam Doon)
                android.text=String (Atif Aslam)
    NotificationRecord(0x030: pkg=com.google.android.gm user=UserHandle{0} id=3 key=y: Notification(channel=a flags=AUTO_CANCEL vis=PRIVATE))
            when=1794033089965/1794033089965
                android.title=String (Report.docx)
                android.text=String (Download complete.)
    NotificationRecord(0x0f6: pkg=com.twitter.android user=UserHandle{0} id=0 key=z: Notification(channel=b flags=AUTO_CANCEL|GROUP_SUMMARY))
            when=1794028173199/1794028173199
                android.title=null
                android.text=null
`
  it('lists title, text, app, time; newest first; skips empty summaries', () => {
    const l = parseNotifications(OUT)
    expect(l.map((n) => n.app)).toEqual(['com.google.android.gm', 'com.google.android.apps.youtube.music'])
    expect(l[0]).toMatchObject({ title: 'Report.docx', text: 'Download complete.', ongoing: false, when: 1794033089965 })
    expect(l[1]!.ongoing).toBe(true)
  })
})

describe('accessibility tree', () => {
  const res = {
    ok: true,
    nodes: [
      { ref: '0.1', text: 'Send', desc: '', id: 'com.whatsapp:id/send', cls: 'ImageButton', pkg: 'com.whatsapp', b: [900, 2200, 1080, 2400], f: 'click' },
      { ref: '0.2', text: '', desc: '', hint: 'Message', id: 'com.whatsapp:id/entry', cls: 'EditText', pkg: 'com.whatsapp', b: [0, 2200, 900, 2400], f: 'click,edit,focused' },
      { ref: '0.3', text: 'off-screen', desc: '', id: '', cls: 'View', pkg: 'x', b: [0, 2500, 100, 2600], f: '' },
    ],
  }
  it('maps display pixels to agent space and keeps refs', () => {
    const n = parseA11yTree(res, { width: 1080, height: 2400 }, { width: 576, height: 1280 })
    expect(n).toHaveLength(2)
    expect(n[0]).toMatchObject({ label: 'Send', id: 'send', ref: '0.1', clickable: true, app: 'com.whatsapp' })
    expect(n[0]!.center).toEqual([528, 1227])
    expect(n[1]).toMatchObject({ hint: 'Message', flags: 'editable,focused' })
  })
  it('matches by text, hint, id and ref', () => {
    const n = parseA11yTree(res, { width: 1080, height: 2400 }, { width: 576, height: 1280 })
    expect(matchNodes(n, { text: 'send' })[0]?.ref).toBe('0.1')
    expect(matchNodes(n, { text: 'message' })[0]?.ref).toBe('0.2')
    expect(matchNodes(n, { id: 'com.whatsapp:id/entry' })[0]?.ref).toBe('0.2')
    expect(matchNodes(n, { id: 'send' })[0]?.ref).toBe('0.1')
    expect(matchNodes(n, { text: 'sen', exact: true })).toHaveLength(0)
    expect(matchNodes(n, { ref: '0.2' })).toHaveLength(1)
  })
})
