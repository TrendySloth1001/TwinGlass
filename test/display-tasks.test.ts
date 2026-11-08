import { describe, expect, it, vi } from 'vitest'
vi.mock('electron', () => ({ ipcMain: { handle: () => {} }, app: { getPath: () => '/tmp' } }))
const { parseDisplayTasks } = await import('../src/main/phone-apps')

// Trimmed from `dumpsys activity activities` on the A024 (Android 17), two second screens open.
const OUT = `Display #440 (activities from top to bottom):
  * Task{a #5650 type=standard A=10165:com.google.android.calculator U=0 visible=true sz=1}
  * Task{c #5648 type=home U=0 visible=true sz=1}
    * Task{d #5649 type=home A=10221:com.nothing.launcher nonResizable U=0 sz=1}
Display #0 (activities from top to bottom):
  * Task{e #1 type=home U=0 visible=true sz=1}
  * Task{f #5645 type=standard A=10366:com.mobmirror.companion U=0 sz=1}
  * Task{g #5612 type=standard A=10290:com.whatsapp U=0 sz=1}
  * Task{h #5596 type=standard I=com.google.android.apps.youtube.music/.activities.InternalMusicActivity U=0 sz=1}
Display #438 (activities from top to bottom):
      * Task{i #5650 type=standard A=10165:com.google.android.calculator U=0 sz=1}
`

describe('apps open per display', () => {
  it("lists one display's standard tasks, front first", () => {
    expect(parseDisplayTasks(OUT, 440)).toEqual(['com.google.android.calculator'])
    expect(parseDisplayTasks(OUT, 0)).toEqual(['com.whatsapp', 'com.google.android.apps.youtube.music'])
    expect(parseDisplayTasks(OUT, 4)).toEqual([])
  })
})

describe('agent screen task placement', () => {
  it("finds an app's task on another display", async () => {
    const { findTaskOutside } = await import('../src/main/agent/controller')
    const dump = `Display #612 (activities from top to bottom):
  * Task{a #6000 type=standard A=10165:com.google.android.calculator U=0 visible=true sz=1}
Display #0 (activities from top to bottom):
  * Task{86df02 #5807 type=standard A=10366:com.mobmirror.companion U=0 visible=true sz=1}
  * Task{x #5596 type=standard I=com.google.android.apps.youtube.music/.activities.InternalMusicActivity U=0 sz=1}
`
    expect(findTaskOutside(dump, 'com.mobmirror.companion', 612)).toBe(5807)
    expect(findTaskOutside(dump, 'com.google.android.apps.youtube.music', 612)).toBe(5596)
    expect(findTaskOutside(dump, 'com.google.android.calculator', 612)).toBeNull() // already there
    expect(findTaskOutside(dump, 'com.whatsapp', 612)).toBeNull()
  })
})
