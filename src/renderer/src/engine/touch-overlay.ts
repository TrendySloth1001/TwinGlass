// Draws a dot where each injected finger is, so the user sees exactly where touches land.
import { videoToClient } from '@shared/input/coords'
import type { Point } from '@shared/input/gestures'
import type { Size } from '@shared/scrcpy/control'

export class TouchOverlay {
  private dots: HTMLDivElement[] = []

  constructor(
    private readonly container: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
  ) {}

  show(points: Point[], size: Size): void {
    const rect = this.canvas.getBoundingClientRect()
    const base = this.container.getBoundingClientRect()
    while (this.dots.length < points.length) {
      const d = document.createElement('div')
      d.className =
        'pointer-events-none absolute size-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/90 bg-brand/40 shadow-[0_0_0_1px_rgb(0_0_0/0.4)] transition-opacity duration-150'
      this.container.append(d)
      this.dots.push(d)
    }
    this.dots.forEach((d, i) => {
      const p = points[i]
      if (!p) {
        d.style.opacity = '0'
        return
      }
      const c = videoToClient(p.x, p.y, rect, size)
      d.style.left = `${c.x - base.left}px`
      d.style.top = `${c.y - base.top}px`
      d.style.opacity = '1'
    })
  }

  clear(): void {
    for (const d of this.dots) d.style.opacity = '0'
  }

  dispose(): void {
    for (const d of this.dots) d.remove()
    this.dots = []
  }
}
