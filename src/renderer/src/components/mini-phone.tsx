import type { ReactNode } from 'react'
import { FRAME_COLORS, FRAMES, type FrameColor, type FrameStyle } from '@/lib/phone-frames'

/** Miniature of a phone frame for the picker (same proportions as the real one, scaled down). */
export function MiniPhone({ style, color }: { style: FrameStyle; color: FrameColor }): ReactNode {
  const c = FRAME_COLORS[color]
  const screen = (
    <div className="relative h-full w-full overflow-hidden bg-gradient-to-b from-indigo-500/70 via-violet-600/60 to-fuchsia-700/60">
      <div className="absolute inset-x-[18%] top-[22%] h-[5%] rounded-full bg-white/40" />
      <div className="absolute inset-x-[30%] top-[31%] h-[3%] rounded-full bg-white/25" />
      <div className="absolute inset-x-[14%] bottom-[9%] grid grid-cols-4 gap-[6%]">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="aspect-square rounded-full bg-white/30" />
        ))}
      </div>
    </div>
  )
  if (style === 'none') return <div className="h-[var(--mp-h,92px)] w-[var(--mp-w,44px)] overflow-hidden rounded-[3px] shadow-sm">{screen}</div>
  const f = FRAMES[style]
  const k = 0.18 // preview scale for the px parts of the frame
  return (
    <div
      className="relative h-[var(--mp-h,92px)] w-[var(--mp-w,46px)] shadow-md"
      style={{
        padding: Math.max(1, f.rim * k * 2),
        borderRadius: style === 'classic' ? 8 : 10,
        background: `linear-gradient(145deg, ${c.light}, ${c.dark})`,
      }}
    >
      <div
        className="relative flex h-full flex-col bg-black"
        style={{ padding: `${f.top * k}px ${f.side * k}px ${f.bottom * k}px`, borderRadius: style === 'classic' ? 7 : 9 }}
      >
        <div className="relative min-h-0 flex-1 overflow-hidden" style={{ borderRadius: style === 'classic' ? 1 : style === 'minimal' ? 5 : 7 }}>
          {screen}
          {f.punchHole && <div className="absolute top-[2%] left-1/2 size-[4px] -translate-x-1/2 rounded-full bg-black" />}
        </div>
        {style === 'classic' && (
          <>
            <div className="absolute top-[3px] left-1/2 h-[2px] w-3 -translate-x-1/2 rounded-full bg-neutral-700" />
            <div className="absolute bottom-[2px] left-1/2 size-[6px] -translate-x-1/2 rounded-full border border-white/25" />
          </>
        )}
      </div>
      <div className="absolute top-[18%] -right-[1.5px] h-[12%] w-[2px] rounded-r-sm" style={{ background: c.dark }} />
      <div className="absolute top-[34%] -right-[1.5px] h-[7%] w-[2px] rounded-r-sm" style={{ background: c.dark }} />
    </div>
  )
}
