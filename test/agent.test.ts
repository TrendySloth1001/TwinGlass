import { describe, expect, it } from 'vitest'
import { agentSpace, checkPoint, mapPoint } from '../src/main/agent/geometry'
import { escapeInputText, parseUiDump } from '../src/main/agent/ui-tree'

const device = { width: 1260, height: 2800 }

describe('agent coordinate space', () => {
  it('scales the longest side to 1280 and never upscales', () => {
    expect(agentSpace(device)).toEqual({ width: 576, height: 1280 })
    expect(agentSpace({ width: 2800, height: 1260 })).toEqual({ width: 1280, height: 576 })
    expect(agentSpace({ width: 720, height: 1280 })).toEqual({ width: 720, height: 1280 })
  })
  it('maps agent points to video and device space (and clamps)', () => {
    const agent = agentSpace(device)
    expect(mapPoint({ x: 288, y: 640 }, agent, device)).toEqual({ x: 630, y: 1400 })
    expect(mapPoint({ x: 575, y: 1279 }, agent, device)).toEqual({ x: 1258, y: 2798 })
    expect(mapPoint({ x: 9999, y: -5 }, agent, device)).toEqual({ x: 1259, y: 0 })
  })
  it('rejects points outside the screenshot', () => {
    const agent = agentSpace(device)
    expect(checkPoint({ x: 10, y: 10 }, agent)).toBeNull()
    expect(checkPoint({ x: 600, y: 10 }, agent)).toMatch(/outside/)
    expect(checkPoint({ x: Number.NaN, y: 1 }, agent)).toMatch(/numbers/)
  })
})

describe('uiautomator dump parsing', () => {
  const xml = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0">
    <node index="0" text="" resource-id="" class="android.widget.FrameLayout" clickable="false" bounds="[0,0][1260,2800]">
      <node index="0" text="Send &amp; share" resource-id="com.app:id/send" class="android.widget.Button" clickable="true" enabled="true" bounds="[100,200][500,300]" />
      <node index="1" text="" content-desc="Search" resource-id="" class="android.widget.ImageView" clickable="true" bounds="[1100,100][1200,200]" />
      <node index="2" text="" resource-id="com.app:id/q" class="android.widget.EditText" clickable="true" focused="true" bounds="[0,400][1260,520]" />
      <node index="3" text="" resource-id="" class="android.view.View" clickable="false" bounds="[0,0][0,0]" />
    </node></hierarchy>`

  it('keeps actionable/labelled nodes with centres in agent space', () => {
    const nodes = parseUiDump(xml, device, agentSpace(device))
    expect(nodes).toEqual([
      { label: 'Send & share', id: 'send', kind: 'Button', clickable: true, center: [137, 114], bounds: [46, 91, 229, 137] },
      { label: 'Search', kind: 'ImageView', clickable: true, center: [526, 69], bounds: [503, 46, 549, 91] },
      { label: '', id: 'q', kind: 'EditText', clickable: true, center: [288, 210], bounds: [0, 183, 575, 238], flags: 'editable,focused' },
    ])
  })
})

describe('adb input text escaping', () => {
  it('escapes spaces and shell metacharacters', () => {
    expect(escapeInputText('hello world')).toBe('hello%sworld')
    expect(escapeInputText(`it's $5 & (ok)`)).toBe("it\\'s%s\\$5%s\\&%s\\(ok\\)")
  })
})
